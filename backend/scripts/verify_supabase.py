"""Read-only checks against the configured Supabase project; never prints keys."""
import json
import os
import sys
import urllib.request
import urllib.error

url = os.getenv('SUPABASE_URL', '').rstrip('/')
key = os.getenv('SUPABASE_PUBLISHABLE_KEY') or os.getenv('SUPABASE_ANON_KEY')
if not url or not key:
    sys.exit('NOT RUN: set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in this terminal first.')

def request(path, body=None):
    req = urllib.request.Request(url + path, headers={'apikey': key, 'Content-Type': 'application/json'},
        data=json.dumps(body).encode() if body is not None else None,
        method='POST' if body is not None else 'GET')
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        sys.exit(f'FAIL: Supabase HTTP {error.code}; verify schema, migration and API grants. No changes made.')
    except (urllib.error.URLError, TimeoutError):
        sys.exit('FAIL: cannot reach Supabase. No changes made.')

request('/rest/v1/foods?select=id,name_th,serving_size,serving_unit,serving_label,portion_grams&limit=1')
for term, category in [('ข้าว','food'), ('Abalone',None), ('milk','drink')]:
    rows = request('/rest/v1/rpc/search_foods', {'search_query':term,'result_limit':8,'category_filter':category})
    assert isinstance(rows,list) and len(rows)<=8
    assert category is None or all(row['category']==category for row in rows)
    for row in rows:
        assert term.casefold() in ' '.join(str(row.get(k) or '') for k in ['name','english_name','name_th']).casefold()
    print(f'PASS search {term}: {len(rows)} results (0 may mean catalog has no matching names)')
assert request('/rest/v1/rpc/search_foods', {'search_query':'  ','result_limit':8}) == []
print('PASS public catalog columns and search RPC. Run supabase/verify_steps_1_4.sql for indexes/policies, then two-account UI checks for private data.')
