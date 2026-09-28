"""Drop-in wrapper around ``ort.InferenceSession`` that delegates failures to a coordinator.

The wrapper exposes the public surface of ``InferenceSession`` used in the
analyzer (``run``, ``get_providers``, ``get_inputs``, ``get_outputs``) so each
detector / classifier / SAM session-owner can hold one of these instead of a
raw session and not care about provider state.

Path normalization mitigation for the macOS Bug A failure:
``Path(model_path).resolve()`` is applied here once, before the session is
constructed, so all five session sites get the absolute-path mitigation for
free.
"""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from .provider_coordinator import ProviderCoordinator


class ResilientOnnxSession:
    """Thin pass-through to ``onnxruntime.InferenceSession`` with rebuild support.

    The coordinator is the only thing that calls ``_rebuild`` — the wrapper
    looks the session up via the coordinator after a recreate, so the detectors
    don't need to know anything about provider state.
    """

    def __init__(
        self,
        kind: str,
        model_path: Path | str,
        coord: "ProviderCoordinator",
    ) -> None:
        # Normalize to an absolute path before handing it to ONNX Runtime. This
        # is the macOS Bug A mitigation — CoreML's graph-optimization path can
        # lose the model directory when it receives a relative path, leading to
        # ``Initializer ... model_path must not be empty``.
        self._kind = str(kind)
        self._path = Path(model_path).resolve()
        self._coord = coord
        self._session: Any = None
        self._build()
        # Register with the coordinator so a single recreate_all() call walks
        # every ONNX session in the run — wrapper sessions AND classifier
        # sessions owned by pipeline.py.
        coord._register_session(self)

    def _build(self) -> None:
        import onnxruntime as ort  # imported lazily so test environments without ORT can import this module

        providers = self._coord.providers_for(self._kind)
        # Warning logs on a Chinese Windows install are encoded in the ANSI
        # code page. ONNX Runtime then fails to decode them as UTF-8 and treats
        # that as an execution-provider failure, which permanently replaces
        # DirectML with CPU. Keep error-level logs, and refuse that fallback so
        # a single bad status cannot pin the session off the GPU.
        options = ort.SessionOptions()
        options.log_severity_level = 3
        self._session = ort.InferenceSession(
            str(self._path),
            sess_options=options,
            providers=providers,
        )
        if hasattr(self._session, "disable_fallback"):
            self._session.disable_fallback()

    def _rebuild(self) -> None:
        """Drop the current session and build a new one using the coordinator's
        current provider list. Called by the wrapper's ``recreate_sessions``
        path. Releasing the old session first matters for DML/CoreML, which
        hold device memory only as long as the C++ session object lives.

        The old session is restored if the build fails so that subsequent
        ``run()`` calls surface the original ONNX error rather than an
        uninformative ``AttributeError: 'NoneType' object has no attribute 'run'``.
        """
        old = self._session
        self._session = None  # Release so DML/CoreML can free device memory
        try:
            self._build()
        except Exception:
            self._session = old  # Restore: keeps run() errors meaningful
            raise

    # ---- pass-through API mirroring ort.InferenceSession ----

    def run(self, output_names, input_feed, run_options=None):
        from .provider_coordinator import is_session_dead

        try:
            return self._session.run(output_names, input_feed, run_options)
        except Exception as exc:
            normalized = _normalize_provider_error(exc)
            # One fresh session on the same provider. A DirectML device that
            # just reported a localized status often accepts the next session;
            # rebuilding here keeps the run on GPU instead of letting the image
            # loop demote to CPU.
            if (
                is_session_dead(normalized)
                and self._coord.effective_use_gpu
                and not getattr(self, "_retrying", False)
            ):
                self._retrying = True
                try:
                    self._rebuild()
                    return self._session.run(output_names, input_feed, run_options)
                except Exception:
                    raise normalized from exc
                finally:
                    self._retrying = False
            if normalized is not exc:
                raise normalized from exc
            raise

    def get_providers(self) -> list[str]:
        return list(self._session.get_providers())

    def get_inputs(self):
        return self._session.get_inputs()

    def get_outputs(self):
        return self._session.get_outputs()


def _normalize_provider_error(exc: BaseException) -> BaseException:
    """Turn a non-UTF-8 provider status into ``OrtProviderStatusError``.

    ``EPFail`` is raised inside ONNX Runtime before this wrapper sees it. On
    zh-TW Windows its message is often the codec error itself, so the device
    HRESULT never reaches ``is_session_dead``.
    """
    from .provider_coordinator import (
        OrtProviderStatusError,
        status_text_from_unicode_error,
    )

    if isinstance(exc, OrtProviderStatusError):
        return exc
    if isinstance(exc, UnicodeDecodeError):
        return OrtProviderStatusError(status_text_from_unicode_error(exc))
    if type(exc).__name__ == "EPFail":
        msg = str(exc)
        if "utf-8" in msg and "codec" in msg:
            return OrtProviderStatusError(msg)
    return exc


__all__ = ["ResilientOnnxSession"]
