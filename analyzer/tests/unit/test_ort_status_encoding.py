"""GPU status text that is CP950 must not surface as a UTF-8 decode error."""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from kestrel_analyzer.ml.provider_coordinator import (
    FailureAction,
    OrtProviderStatusError,
    ProviderCoordinator,
    ResilienceConfig,
    is_session_dead,
    status_text_from_unicode_error,
)
from kestrel_analyzer.ml.resilient_session import ResilientOnnxSession

pytestmark = pytest.mark.unit


def _cp950_status_error() -> UnicodeDecodeError:
    raw = b"ONNXRuntimeError HRESULT 887A0005 " + "裝置已移除".encode("cp950")
    try:
        raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        return exc
    raise AssertionError("expected a UTF-8 decode failure")


class TestStatusTextRecovery:
    def test_recovers_hresult_and_traditional_chinese(self):
        text = status_text_from_unicode_error(_cp950_status_error())
        assert "887A0005" in text
        assert "裝置已移除" in text

    def test_recovered_bytes_count_as_a_dead_session(self):
        assert is_session_dead(_cp950_status_error()) is True

    def test_unrelated_decode_error_is_not_a_dead_session(self):
        try:
            b"\xa4".decode("utf-8")
        except UnicodeDecodeError as exc:
            assert is_session_dead(exc) is False

    def test_provider_status_error_demotes_gpu(self):
        coord = ProviderCoordinator(
            user_gpu_enabled=True,
            cfg=ResilienceConfig(),
        )
        action = coord.on_run_failure(OrtProviderStatusError("裝置已移除"))
        assert action is FailureAction.RECREATE_AND_RETRY
        assert coord.providers_for("detector") == ["CPUExecutionProvider"]

    def test_session_run_raises_readable_status(self):
        sess = ResilientOnnxSession.__new__(ResilientOnnxSession)
        sess._coord = ProviderCoordinator(user_gpu_enabled=False)

        class _Boom:
            def run(self, output_names, input_feed, run_options=None):
                _cp950_status_error().object.decode("utf-8")

        sess._session = _Boom()
        with pytest.raises(OrtProviderStatusError) as caught:
            sess.run(None, {})
        assert "887A0005" in str(caught.value)
        assert is_session_dead(caught.value) is True

    def test_garbled_epfail_rebuilds_gpu_session_once(self):
        class EPFail(Exception):
            pass

        sess = ResilientOnnxSession.__new__(ResilientOnnxSession)
        sess._coord = ProviderCoordinator(user_gpu_enabled=True)
        sess._kind = "detector"
        sess._path = Path("unused.onnx")
        calls = {"n": 0}

        class _Boom:
            def run(self, output_names, input_feed, run_options=None):
                calls["n"] += 1
                if calls["n"] == 1:
                    raise EPFail(
                        "'utf-8' codec can't decode byte 0xb1 in position 185: invalid start byte"
                    )
                return ["ok"]

        sess._session = _Boom()
        sess._rebuild = lambda: None
        assert sess.run(None, {}) == ["ok"]
        assert calls["n"] == 2
        assert sess._coord.effective_use_gpu is True

    def test_value_error_is_not_retried(self):
        sess = ResilientOnnxSession.__new__(ResilientOnnxSession)
        sess._coord = ProviderCoordinator(user_gpu_enabled=True)

        class _Boom:
            def run(self, output_names, input_feed, run_options=None):
                raise ValueError("bad input")

        sess._session = _Boom()
        with pytest.raises(ValueError, match="bad input"):
            sess.run(None, {})
