"""Read-only verification of the reviewed catalog against the hosted API."""
import argparse
import json
import os
from pathlib import Path
import urllib.request

from build_catalog_metadata import ROOT, signature
from verify_supabase import load_env


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path, default=ROOT / ".env")
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    load_env(args.env_file)
    url = os.environ["SUPABASE_URL"].rstrip("/")
    key = os.getenv("SUPABASE_PUBLISHABLE_KEY") or os.environ["SUPABASE_ANON_KEY"]

    def request(path, body=None):
        req = urllib.request.Request(url + path,
            headers={"apikey": key, "Content-Type": "application/json"},
            data=json.dumps(body).encode() if body is not None else None)
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.load(response)

    rows = []
    for offset in range(0, 100000, 1000):
        batch = request(f"/rest/v1/foods?select=*&order=id&limit=1000&offset={offset}")
        rows.extend(batch)
        if len(batch) < 1000:
            break
    reviewed = json.loads((ROOT / "supabase/data/catalog-metadata-reviewed.json").read_text(encoding="utf-8"))
    before = json.loads((ROOT / "supabase/data/catalog-before-2026-10-16.json").read_text(encoding="utf-8"))
    by_code = {r["food_code"]: r for r in rows}
    before_by_code = {r["food_code"]: r for r in before}
    assert len(by_code) == len(rows) == len(reviewed) == len(before), "Catalog row count changed"
    for source in reviewed:
        current = by_code[source["food_code"]]
        old = before_by_code[source["food_code"]]
        assert signature(current) == source["source_signature"] == signature(old), "Nutrition or identity changed"
        assert current["id"] == old["id"], "Food ID changed"
        for column in ("serving_size", "serving_unit", "serving_label", "portion_grams"):
            assert current[column] == source[column], f"Incorrect {column} for {source['food_code']}"
        assert current["name_th"] == (old["name_th"] or source["name_th"]), "Incorrect Thai name"

    searches = {}
    for term, category in [("ข้าว", "food"), ("นม", "drink"), ("ไข่", "food"), ("กล้วย", "food")]:
        found = request("/rest/v1/rpc/search_foods", {
            "search_query": term, "result_limit": 8, "category_filter": category})
        assert 0 < len(found) <= 8, "Thai search returned no results"
        assert all(r["category"] == category and term in (r["name_th"] or "") for r in found)
        searches[term] = len(found)
    milk = by_code["FNDDS-2021-2023-11111000"]
    assert abs(milk["calories"] * 122 / milk["portion_grams"] - 74.4) < 1e-9
    report = {
        "project_url": url, "date_bangkok": "2026-10-16",
        "catalog_rows": len(rows), "thai_names": sum(bool(r["name_th"]) for r in rows),
        "explicit_portion_weights": sum(r["portion_grams"] is not None for r in rows),
        "pending_thai_translation": sum(not r["name_th"] for r in rows),
        "all_food_ids_unchanged": True, "all_nutrition_and_english_names_unchanged": True,
        "all_serving_metadata_matches_reviewed_source": True,
        "thai_search_result_counts": searches,
        "conversion_example": {"food": milk["name_th"], "grams": 122, "calories": 74.4},
        "upstream_usda_files_independently_downloaded": False,
        "source": "supabase/fndds_foods_curated.csv (explicit named portions)",
    }
    if args.report:
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
