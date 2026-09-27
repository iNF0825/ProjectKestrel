"""Build the Traditional Chinese display-name table for the bird catalog.

The committed output is ``analyzer/models/birds/zh_hant_names.csv``. Runtime
only reads that file. English names in ``birds_global.csv`` stay the storage
keys.

Priority for one scientific name:

  1. Taiwan conventional name from the TWBF checklist (species known from
     Taiwan). The 2026 list follows the eBird/Clements taxonomy and is the
     name Taiwan birders use.
  2. Otherwise the IOC Multilingual ``Chinese (Traditional)`` name, using the
     text before an alternate-name bracket (``〔`` / ``（``). When that cell
     is empty, the simplified Chinese cell is converted with OpenCC ``s2twp``.

Inputs are downloaded out of band (same approach as ``build_bird_catalog.py``):

  * IOC Multilingual v15.1 xlsx — CC-BY 3.0, https://www.worldbirdnames.org/
  * 2026 TWBF Checklist xlsx — https://www.bird.org.tw/basicpage/87
"""

from __future__ import annotations

import argparse
import csv
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
CATALOG_CSV = REPO_ROOT / "analyzer" / "models" / "birds" / "birds_global.csv"
OUT_CSV = REPO_ROOT / "analyzer" / "models" / "birds" / "zh_hant_names.csv"

_ALT_SPLIT = re.compile(r"[〔（(\[]")


def primary_traditional(text: str) -> str:
    """Keep the head name and drop bracketed alternates."""
    text = (text or "").strip()
    if not text:
        return ""
    return _ALT_SPLIT.split(text, maxsplit=1)[0].strip()


def choose_display_name(ioc_traditional: str, ioc_simplified: str, taiwan: str,
                        opencc=None) -> str:
    """Taiwan conventional name wins; otherwise IOC traditional, else OpenCC."""
    tw = (taiwan or "").strip()
    if tw:
        return tw
    trad = primary_traditional(ioc_traditional)
    if trad:
        return trad
    simp = (ioc_simplified or "").strip()
    if simp and opencc is not None:
        return opencc.convert(simp).strip()
    return simp


def _load_catalog_scientific_names(path: Path) -> set[str]:
    names: set[str] = set()
    with open(path, encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            sci = (row.get("scientific_name") or "").strip()
            if sci:
                names.add(sci)
    return names


def _cell(row, index: int) -> str:
    if index >= len(row) or row[index] is None:
        return ""
    return str(row[index]).strip()


def load_ioc_names(path: Path) -> dict[str, tuple[str, str]]:
    """Map scientific name -> (traditional, simplified) from the IOC workbook."""
    import openpyxl
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb[wb.sheetnames[0]]
    out: dict[str, tuple[str, str]] = {}
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if i == 0:
            continue
        sci = _cell(row, 3)
        if not sci or " " not in sci:
            continue
        # Species rows are binomials. Subspecies rows are not in our catalog.
        if len(sci.split()) != 2:
            continue
        out[sci] = (_cell(row, 7), _cell(row, 6))
    wb.close()
    return out


def load_twbf_names(path: Path) -> dict[str, str]:
    """Map scientific binomial -> Taiwan Chinese name.

    The main sheet wins over the appendices. Subspecies rows share a binomial;
    the first Chinese name for that binomial is kept.
    """
    import openpyxl
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    out: dict[str, str] = {}
    # Main list first, then appendices, so an accepted name is not replaced.
    for sheet_name in wb.sheetnames:
        if sheet_name.startswith("2026List") or sheet_name.endswith("地區名錄"):
            continue
        ws = wb[sheet_name]
        header_seen = False
        name_col = sci_col = None
        for row in ws.iter_rows(values_only=True):
            cells = [_cell(row, i) for i in range(min(6, len(row)))]
            if not header_seen:
                if "中文名" in cells and "學名" in cells:
                    name_col = cells.index("中文名")
                    sci_col = cells.index("學名")
                    header_seen = True
                continue
            if name_col is None or sci_col is None:
                break
            sci = _cell(row, sci_col)
            zh = _cell(row, name_col)
            if not sci or not zh or " " not in sci:
                continue
            sci = " ".join(sci.split()[:2])
            if sci not in out:
                out[sci] = zh
    wb.close()
    return out


def build(ioc_path: Path, twbf_path: Path, catalog_path: Path, out_path: Path) -> dict[str, int]:
    from opencc import OpenCC
    converter = OpenCC("s2twp")
    catalog = _load_catalog_scientific_names(catalog_path)
    ioc = load_ioc_names(ioc_path)
    twbf = load_twbf_names(twbf_path)

    rows: list[tuple[str, str]] = []
    from_taiwan = 0
    from_ioc = 0
    for sci in sorted(catalog):
        trad, simp = ioc.get(sci, ("", ""))
        taiwan = twbf.get(sci, "")
        name = choose_display_name(trad, simp, taiwan, converter)
        if not name:
            continue
        rows.append((sci, name))
        if taiwan:
            from_taiwan += 1
        else:
            from_ioc += 1

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["scientific_name", "name_zh"])
        writer.writerows(rows)
    return {
        "catalog": len(catalog),
        "named": len(rows),
        "taiwan": from_taiwan,
        "ioc": from_ioc,
        "unnamed": len(catalog) - len(rows),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ioc", type=Path, required=True, help="IOC Multilingual v15.1 xlsx")
    parser.add_argument("--twbf", type=Path, required=True, help="TWBF checklist xlsx")
    parser.add_argument("--catalog", type=Path, default=CATALOG_CSV)
    parser.add_argument("--out", type=Path, default=OUT_CSV)
    args = parser.parse_args()
    stats = build(args.ioc, args.twbf, args.catalog, args.out)
    print(
        f"Wrote {args.out} — {stats['named']} names "
        f"({stats['taiwan']} Taiwan, {stats['ioc']} IOC), "
        f"{stats['unnamed']} catalog species left unnamed"
    )


if __name__ == "__main__":
    main()
