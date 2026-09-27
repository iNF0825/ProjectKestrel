# Bundled bird-catalog data sources

The catalog file ``birds_global.csv`` is built from the following
authoritative sources. Attribution required by license / convention is
listed below.

## IOC World Bird List (v15.1)

Frank Gill, David Donsker & Pamela Rasmussen (Eds). 2025. *IOC World Bird List* (v15.1). doi:10.14344/IOC.ML.15.1. https://www.worldbirdnames.org/

Licensed under [Creative Commons Attribution 3.0 Unported](https://creativecommons.org/licenses/by/3.0/).
Common names, scientific binomials, taxonomic order/family/genus, and breeding-range biogeographic codes are derived from this source.

## IBP-AOS Alpha Codes

Pyle, P. and DeSante, D.F. *Four-letter (English Name) and Six-letter (Scientific Name) Alpha Codes for North American Birds.* The Institute for Bird Populations. https://www.birdpop.org/

Per the 66th AOS Supplement (2025). 4-letter codes are reproduced as
factual abbreviations; full attribution is preserved here in lieu of a
publicly documented license.

## ProjectKestrel additions

* Hand-curated AOS-to-IOC name overrides for model species whose
  preferred English name differs between authorities (see
  ``tools/build_bird_catalog.py``, ``AOS_TO_IOC_OVERRIDES``).
* Family display names (``family_common``) preserve the existing ``analyzer/models/scispecies_dispname.csv`` mapping where present and fall back to IOC's *Family (English)* otherwise.

## Traditional Chinese display names

``zh_hant_names.csv`` is a display-only table keyed by scientific name. It does
not replace the English names stored on photos, scene tags, or XMP.

* **Taiwan conventional names** come from the 2026 TWBF Checklist of the Birds
  of Taiwan (中華民國野鳥學會, revised 2026-08-20), which follows the 2025
  eBird/Clements taxonomy. https://www.bird.org.tw/basicpage/87
  When a scientific name matches, that Chinese name is the one shown.
* **All other species** use the ``Chinese (Traditional)`` column of the IOC
  World Bird List Multilingual Version (v15.1), same CC-BY 3.0 license as the
  English catalog. The name before a bracketed alternate (``〔…〕``) is kept.
  If that cell is empty, the simplified Chinese cell is converted with
  OpenCC ``s2twp``. Species with no Chinese name in either source stay English.
