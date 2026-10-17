"""Read-only verification of separated catalog names; never prints credentials."""
import argparse
import json
import os
from pathlib import Path
import urllib.request

from build_catalog_metadata import ROOT, split_portion
from verify_supabase import load_env


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--before", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    load_env(ROOT / ".env")
    url = os.environ["SUPABASE_URL"].rstrip("/")
    key = os.environ.get("SUPABASE_PUBLISHABLE_KEY") or os.environ["SUPABASE_ANON_KEY"]

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
    before = json.loads(args.before.read_text(encoding="utf-8"))
    assert len(rows) == len(before) == 4580
    for old, new in zip(before, rows):
        base, _, _ = split_portion(old["name"])
        assert new["name"] == new["english_name"] == base
        assert new["original_name"] == old["name"]
        assert new["name"] + " (" + new["source_portion"] + ")" == old["name"]
        for column, value in old.items():
            if column not in {"name", "english_name"}:
                assert new[column] == value, (old["id"], column)
    searches = {}
    for term in ("Milk", "นม", "ข้าว", "%", "_"):
        found = request("/rest/v1/rpc/search_foods", {
            "search_query": term, "result_limit": 8, "category_filter": None})
        assert all("source_portion" in row for row in found)
        if term in ("Milk", "นม", "ข้าว"):
            assert len(found) > 0
        searches[term] = len(found)
    report = {"date_bangkok": "2026-10-17", "rows": len(rows), "separated_names": len(rows),
        "all_ids_nutrition_thai_names_and_serving_metadata_unchanged": True,
        "original_names_preserved": True, "search_counts": searches,
        "examples": [{column: row[column] for column in ("name", "source_portion", "calories", "protein")} for row in rows[:3]]}
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=True))


if __name__ == "__main__":
    main()
