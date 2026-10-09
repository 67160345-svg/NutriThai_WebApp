"""Read-only Supabase checks; never prints credentials or response bodies."""
import argparse
import json
import os
from pathlib import Path
import re
import urllib.request
import urllib.error


def load_env(path):
    """Load simple KEY=value settings without evaluating shell expressions."""
    for line in Path(path).read_text(encoding="utf-8-sig").splitlines():
        match = re.match(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$", line)
        if match:
            name, value = match.groups()
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                value = value[1:-1]
            os.environ.setdefault(name, value)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path, help="Optional .env; terminal settings take precedence")
    args = parser.parse_args(argv)
    if args.env_file:
        try:
            load_env(args.env_file)
        except (OSError, UnicodeError):
            print("NOT RUN: cannot read environment file.")
            return 1
    url = os.getenv("SUPABASE_URL", "").rstrip("/")
    key = os.getenv("SUPABASE_PUBLISHABLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
    if not url or not key:
        print("NOT RUN: set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY, or use --env-file.")
        return 1
    failed = False

    def request(label, path, body=None, private=False):
        nonlocal failed
        req = urllib.request.Request(url + path, headers={"apikey": key, "Content-Type": "application/json"},
            data=json.dumps(body).encode() if body is not None else None,
            method="POST" if body is not None else "GET")
        try:
            with urllib.request.urlopen(req, timeout=20) as response:
                rows = json.load(response)
            print(f"PASS {label}: API request succeeded")
            return rows
        except urllib.error.HTTPError as error:
            # Allow only the machine error code; never echo server messages.
            try:
                code = json.loads(error.read()).get("code", "")
            except (ValueError, AttributeError):
                code = ""
            code = code if isinstance(code, str) and re.fullmatch(r"(?:[0-9A-Z]{5}|PGRST[0-9]{3})", code) else "unknown"
            if private and error.code in (401, 403) and code == "42501":
                print(f"UNVERIFIED {label}: anonymous access denied; authenticated checks required")
            else:
                failed = True
                print(f"FAIL {label}: HTTP {error.code}, code {code}")
        except (urllib.error.URLError, TimeoutError, ValueError):
            failed = True
            print(f"FAIL {label}: network or invalid response")
        return None

    request("foods catalog", "/rest/v1/foods?select=id&limit=1")
    for column in ("name_th", "serving_size", "serving_unit", "serving_label", "portion_grams"):
        request(f"foods.{column}", f"/rest/v1/foods?select={column}&limit=0")
    request("custom_foods columns", "/rest/v1/custom_foods?select=id,user_id,serving_size,serving_unit,serving_label,portion_grams&limit=0", private=True)
    request("food_logs columns", "/rest/v1/food_logs?select=id,custom_food_id,category,serving_size,serving_unit,serving_label,portion_grams&limit=0", private=True)
    results = {}
    for term, category, limit in [("ข้าว", "food", 8), ("Abalone", None, 8), ("milk", None, 8), ("MILK", None, 8), ("milk", "drink", 3), ("  ", None, 8), ("nutrithai_no_match_6db8d701", None, 8), ("%", None, 8), ("_", None, 8)]:
        label = f"search {term!r}, category={category}, limit={limit}"
        rows = request(label, "/rest/v1/rpc/search_foods", {"search_query": term, "result_limit": limit, "category_filter": category})
        if rows is None:
            continue
        valid = isinstance(rows, list) and len(rows) <= limit
        if valid:
            valid = all(isinstance(row, dict) and (category is None or row.get("category") == category)
                and term.strip().casefold() in " ".join(str(row.get(k) or "") for k in ("name", "english_name", "name_th")).casefold() for row in rows)
        if not term.strip() or term == "nutrithai_no_match_6db8d701":
            valid = valid and rows == []
        if not valid:
            failed = True
            print(f"FAIL {label}: result validation")
        else:
            results[(term, category)] = rows
            print(f"PASS result validation: {len(rows)} rows (zero does not verify matching catalog data)")
    if ("milk", None) in results and ("MILK", None) in results:
        if results[("milk", None)] != results[("MILK", None)]:
            failed = True
            print("FAIL case-insensitive search comparison")
        else:
            print("PASS case-insensitive search comparison")
    print("Read-only checks finished. No changes made. SQL indexes/policies and two-account flows still require separate verification.")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
