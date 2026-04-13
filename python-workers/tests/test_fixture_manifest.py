from __future__ import annotations

from pathlib import Path


FIXTURE_ROOT = Path(__file__).resolve().parent.parent / "fixtures" / "html"
CANONICAL_SHAPES = {
    "zillow": {"condo", "sfh", "townhome", "new_construction"},
    "redfin": {"condo", "sfh", "townhome", "new_construction"},
    "realtor": {"condo", "sfh", "townhome", "new_construction"},
}


def test_parser_fixture_inventory_covers_canonical_shapes() -> None:
    for portal, required_shapes in CANONICAL_SHAPES.items():
        portal_dir = FIXTURE_ROOT / portal
        fixture_names = {path.stem for path in portal_dir.glob("*.html")}

        assert fixture_names, f"expected fixtures for {portal}"

        missing = {
            shape
            for shape in required_shapes
            if not any(shape in fixture_name for fixture_name in fixture_names)
        }
        assert not missing, f"{portal} fixtures missing canonical shapes: {sorted(missing)}"
