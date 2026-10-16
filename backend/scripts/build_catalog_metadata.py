"""Build reviewed catalog metadata from explicit portions in the original CSV.

No network calls or credentials. The original nutrition values are never rewritten.
Thai names require every comma-separated phrase to have a reviewed translation.
"""
import csv
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
NUTRIENTS = ("calories", "protein", "carbs", "fat", "sugar", "fiber")
SOURCE = ROOT / "supabase/fndds_foods_curated.csv"
GLOSSARY = ROOT / "supabase/data/food-thai-glossary.json"
MIGRATION = ROOT / "supabase/migrations/20261016_verified_catalog_metadata.sql"


def split_portion(name):
    if not name.endswith(")"):
        raise ValueError(f"No explicit portion: {name}")
    depth = 0
    for i in range(len(name) - 1, -1, -1):
        if name[i] == ")":
            depth += 1
        elif name[i] == "(":
            depth -= 1
            if depth == 0:
                match = re.fullmatch(r"(.+), ([0-9]+(?:\.[0-9]+)?) g", name[i + 1:-1])
                if not match:
                    break
                grams = Decimal(match[2])
                if not 0 < grams <= 10000:
                    raise ValueError(f"Invalid weight: {name}")
                return name[:i].strip(), match[1], grams
    raise ValueError(f"Ambiguous portion: {name}")


def thai_name(base, glossary):
    # Exact overrides resolve context-dependent phrases before composition.
    exact = glossary.get(base)
    if exact:
        return exact
    parts = base.split(", ")
    if not all(p in glossary for p in parts):
        return None
    translated = [glossary[p] for p in parts]
    if parts[0] == "Milk" and "whole" in parts:
        translated[parts.index("whole")] = "เต็มมันเนย"
    if parts[0] == "Egg" and "whole" in parts:
        translated[parts.index("whole")] = "ทั้งฟอง"
    if parts[0] == "Rice" and len(parts) > 1 and parts[1] == "brown":
        translated[:2] = ["ข้าวกล้อง"]
    if parts[0] == "Rice" and len(parts) > 1 and parts[1] == "white":
        translated[:2] = ["ข้าวขาว"]
    value = " ".join(translated)
    return value if len(value) <= 200 else None


def portion_label(description, grams):
    # One reference portion always means the ENTIRE explicitly named portion,
    # including source portions such as 1/2 duck or 10 sticks. Never divide it
    # by an inferred item count or treat a USDA cup as 240 ml.
    units = {
        "1 cup": "ถ้วยตวง", "1 cup, cooked": "ถ้วยตวง (สุก)",
        "1 cup, cooked, diced": "ถ้วยตวง (สุก หั่นเต๋า)",
        "1 cup, diced": "ถ้วยตวง (หั่นเต๋า)",
        "1 cup, chopped": "ถ้วยตวง (สับ)",
        "1 tablespoon": "ช้อนโต๊ะ", "1 teaspoon": "ช้อนชา",
        "1 fl oz": "ฟลูอิดออนซ์ตามต้นฉบับ", "1 slice": "แผ่น",
        "1 piece": "ชิ้น", "1 egg": "ฟอง", "1 egg white": "ส่วนไข่ขาวจากไข่หนึ่งฟอง",
        "1 banana": "ผล", "1 sandwich": "แซนด์วิช", "1 bar": "แท่ง",
        "1 cracker": "แครกเกอร์หนึ่งชิ้น", "1 chip": "แผ่น",
        "1 roll": "ชิ้น", "1 patty": "ชิ้น", "1 small": "ชิ้นขนาดเล็ก",
        "1 small/regular fillet": "ชิ้นปลาแล่ขนาดเล็กหรือปกติ",
        "1 miniature": "ชิ้นขนาดจิ๋ว", "1 miniature/bite size": "ชิ้นขนาดพอดีคำ",
    }
    return f"{units.get(description, 'หน่วยอ้างอิงตามต้นฉบับ')} ({grams:g} กรัม)"


def signature(row):
    fields = [row["food_code"], row["name"], row.get("english_name") or "", row["category"]]
    fields += [f"{Decimal(str(row[n])):.2f}" for n in NUTRIENTS]
    return hashlib.md5(chr(31).join(fields).encode()).hexdigest()


def quote(value):
    return "null" if value is None else "'" + str(value).replace("'", "''") + "'"


def main():
    glossary = json.loads(GLOSSARY.read_text(encoding="utf-8"))
    rows = list(csv.DictReader(SOURCE.open(encoding="utf-8-sig", newline="")))
    assert len({r["food_code"] for r in rows}) == len(rows)
    enriched, pending = [], []
    values = []
    for r in rows:
        base, description, grams = split_portion(r["name"])
        translated = thai_name(base, glossary)
        label = portion_label(description, grams)
        assert len(label) <= 100
        item = {**r, "name_th": translated, "serving_size": 1,
                "serving_unit": "portion", "serving_label": label,
                "portion_grams": float(grams), "source_portion": description,
                "source_file": "supabase/fndds_foods_curated.csv",
                "source_dataset": "USDA FNDDS 2021-2023 (project curated copy)",
                "source_signature": signature(r)}
        enriched.append(item)
        if not translated:
            pending.append({"food_code": r["food_code"], "name": base,
                            "missing_phrases": [p for p in base.split(", ") if p not in glossary]})
        values.append("(" + ",".join([quote(r["food_code"]), quote(signature(r)),
                                      str(grams), quote(label), quote(translated)]) + ")")

    fingerprint_sql = "md5(concat_ws(chr(31), f.food_code, f.name, coalesce(f.english_name,''), f.category, "
    fingerprint_sql += ", ".join(f"to_char(f.{n}, 'FM999999990.00')" for n in NUTRIENTS) + "))"
    sql = """-- Generated by backend/scripts/build_catalog_metadata.py; do not edit by hand.
-- Source: the project's original fndds_foods_curated.csv, explicit gram portions.
-- USDA upstream files were not downloadable during this review. No claim of
-- independent row-by-row USDA validation is made. Never infer ml from grams.
-- Nutrition and historical food_logs snapshots are intentionally untouched.
begin;
create temporary table _catalog_metadata_20261016 (
 food_code text primary key, source_signature text not null,
 portion_grams numeric not null, serving_label text not null, name_th text
) on commit drop;
insert into _catalog_metadata_20261016 values
""" + ",\n".join(values) + ";\n"
    sql += f"""
-- Abort the entire transaction if source identity or nutrition has drifted.
do $$
begin
 if exists (
  select 1 from _catalog_metadata_20261016 s
  left join public.foods f on f.food_code=s.food_code
  where f.id is null or {fingerprint_sql} <> s.source_signature
 ) then raise exception 'Catalog differs from reviewed source; no metadata applied'; end if;
 if exists (
  select 1 from _catalog_metadata_20261016 s join public.foods f using(food_code)
  where not (
   (f.serving_size=1 and f.serving_unit='portion' and f.portion_grams is null
     and f.serving_label='หน่วยเดิม (ไม่ระบุขนาด)')
   or (f.serving_size=1 and f.serving_unit='portion' and f.portion_grams=s.portion_grams
     and f.serving_label=s.serving_label)
  )
 ) then raise exception 'Existing serving metadata needs review; no metadata applied'; end if;
end;
$$;
with updated as (
 update public.foods f set
  name_th=coalesce(nullif(btrim(f.name_th),''),s.name_th),
  serving_size=1, serving_unit='portion',
  serving_label=s.serving_label, portion_grams=s.portion_grams
 from _catalog_metadata_20261016 s where f.food_code=s.food_code
 returning f.food_code,f.name_th,f.portion_grams
)
select count(*) as portions_updated, count(name_th) as thai_names_available,
       count(portion_grams) as explicit_weights_available from updated;
notify pgrst, 'reload schema';
commit;
"""
    MIGRATION.write_text(sql, encoding="utf-8")
    (ROOT / "supabase/data/catalog-metadata-reviewed.json").write_text(
        json.dumps(enriched, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (ROOT / "supabase/data/catalog-thai-pending.json").write_text(
        json.dumps(pending, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"portions": len(rows), "thai_names": len(rows)-len(pending),
                      "pending_translation": len(pending), "sql_bytes": len(sql.encode())}))


if __name__ == "__main__":
    main()
