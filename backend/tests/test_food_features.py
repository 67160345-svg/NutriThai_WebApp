from datetime import date, timedelta
import pytest
from fastapi.testclient import TestClient
from fastapi import HTTPException
import main

client = TestClient(main.app)
USER = main.AuthenticatedUser('11111111-1111-1111-1111-111111111111', 'token-a', 'user-a', 'a@example.com')
CUSTOM_ID = '22222222-2222-2222-2222-222222222222'

@pytest.fixture(autouse=True)
def authenticated():
    main.app.dependency_overrides[main.require_authenticated_user] = lambda: USER
    yield
    main.app.dependency_overrides.clear()

def payload(**changes):
    return dict(food_name='Rice', food_name_th='ข้าว', source='custom', meal_type='lunch', servings=1,
                calories_per_serving=130, protein_per_serving=3, carbs_per_serving=28,
                meal_date='2026-01-01', logged_at='2026-01-01T12:00:00+07:00', **changes)

def catalog(**changes):
    return dict(id=1, name='ข้าว', english_name='Rice', category='food', calories=130, protein=3,
                carbs=28, fat=1, sugar=0, fiber=1, serving_size=100, serving_unit='g', serving_label='กรัม', **changes)

def test_custom_food_is_private_and_validates_input(monkeypatch):
    calls=[]
    def request(path, method, body=None, token=None, query=None, extra_headers=None):
        calls.append((path, method, body, token, query))
        return [{'id':CUSTOM_ID, **(body or {})}]
    monkeypatch.setattr(main, '_supabase_request', request)
    result=client.post('/api/v1/custom-foods', json=dict(name='นม', category='drink', calories=60,
        serving_size=100, serving_unit='ml', serving_label='มิลลิลิตร', user_id='wrong-user'))
    assert result.status_code==201
    assert result.json()['user_id']==USER.id
    assert calls[-1][3]==USER.access_token
    client.get('/api/v1/custom-foods')
    assert calls[-1][4]['user_id']==f'eq.{USER.id}'
    assert client.post('/api/v1/custom-foods', json={'name':'   ', 'calories':10}).status_code==422
    assert client.post('/api/v1/custom-foods', json={'name':'x', 'calories':-1}).status_code==422

@pytest.mark.parametrize('quantity,unit,expected', [(150,'g',1.5),(50,'g',0.5)])
def test_catalog_uses_authoritative_units_and_nutrition(monkeypatch,quantity,unit,expected):
    saved={}
    def request(path, method, body=None, token=None, query=None, extra_headers=None):
        if path.endswith('/foods'): return [catalog()]
        saved.update(body); return [{'id':'log', **body}]
    monkeypatch.setattr(main, '_supabase_request', request)
    response=client.post('/api/v1/food-logs', json=payload(food_id=1,quantity=quantity,quantity_unit=unit,
        serving_size=1,serving_unit='portion'))
    assert response.status_code==201
    assert saved['servings']==expected
    assert saved['serving_size']==100 and saved['calories_per_serving']==130
    assert saved['source']=='catalog'

def test_portion_weight_conversion_and_unsupported_units(monkeypatch):
    monkeypatch.setattr(main, '_supabase_request', lambda *args,**kwargs:[{'id':'log',**args[2]}])
    p=payload(serving_size=1,serving_unit='portion',serving_label='จาน',portion_grams=250,quantity=125,quantity_unit='g')
    result=client.post('/api/v1/food-logs',json=p)
    assert result.status_code==201 and result.json()['servings']==0.5
    p['portion_grams']=None
    assert client.post('/api/v1/food-logs',json=p).status_code==422
    p.update(serving_unit='ml')
    assert client.post('/api/v1/food-logs',json=p).status_code==422

def test_custom_reference_is_owner_scoped(monkeypatch):
    calls=[]
    def request(path, method, body=None, token=None, query=None, extra_headers=None):
        calls.append((path,query)); return []
    monkeypatch.setattr(main,'_supabase_request',request)
    response=client.post('/api/v1/food-logs',json=payload(custom_food_id=CUSTOM_ID))
    assert response.status_code==404
    assert calls[0][1]['user_id']==f'eq.{USER.id}'

def test_reusable_custom_food_keeps_source(monkeypatch):
    food={**catalog(),'id':CUSTOM_ID, 'serving_unit':'ml', 'category':'drink'}
    def request(path, method, body=None, token=None, query=None, extra_headers=None):
        if path.endswith('/custom_foods'): return [food]
        return [{'id':'log',**body}]
    monkeypatch.setattr(main,'_supabase_request',request)
    response=client.post('/api/v1/food-logs',json=payload(custom_food_id=CUSTOM_ID,quantity=200,quantity_unit='ml'))
    assert response.status_code==201
    assert response.json()['source']=='custom' and response.json()['servings']==2
    assert response.json()['category']=='drink'

def test_update_meal_date_and_amount_preserves_snapshot(monkeypatch):
    old={**payload(), 'id':'log-1', 'user_id':USER.id,'food_id':1, 'calories_per_serving':99,
         'serving_size':100,'serving_unit':'g','serving_label':'กรัม','portion_grams':None}
    calls=[]
    def request(path, method, body=None, token=None, query=None, extra_headers=None):
        calls.append((path,method,body,query))
        if method=='GET': return [old]
        return [{'id':'log-1', **body}]
    monkeypatch.setattr(main,'_supabase_request',request)
    changed={**payload(food_id=1,quantity=250,quantity_unit='g'),'meal_type':'dinner','meal_date':'2026-01-02','calories_per_serving':999}
    result=client.put('/api/v1/food-logs/log-1',json=changed)
    assert result.status_code==200
    assert result.json()['calories_per_serving']==99
    assert result.json()['servings']==2.5 and result.json()['meal_date']=='2026-01-02'
    assert result.json()['meal_type']=='dinner'
    assert all(call[3]['user_id']==f'eq.{USER.id}' for call in calls)

def test_update_replaces_food_and_returns_new_snapshot(monkeypatch):
    def request(path, method, body=None, token=None, query=None, extra_headers=None):
        if path.endswith('/foods'): return [catalog()]
        if method=='GET': return [{'id':'old'}]
        return [{'id':'old',**body}]
    monkeypatch.setattr(main,'_supabase_request',request)
    result=client.put('/api/v1/food-logs/old',json=payload(food_id=1,replace_food=True,quantity=200,quantity_unit='g'))
    assert result.status_code==200
    assert result.json()['food_name_th']=='ข้าว' and result.json()['servings']==2

def test_manual_correction_detaches_catalog_reference(monkeypatch):
    def request(path,method,body=None,**kwargs):
        return [{'id':'old','food_id':1}] if method=='GET' else [{'id':'old',**body}]
    # Positional arguments are used for patch.
    monkeypatch.setattr(main,'_supabase_request',lambda path,method,body=None,*a,**k:
                        [{'id':'old','food_id':1}] if method=='GET' else [{'id':'old',**body}])
    result=client.put('/api/v1/food-logs/old',json=payload(replace_food=True))
    assert result.status_code==200 and result.json()['food_id'] is None and result.json()['source']=='custom'

def test_update_missing_log_and_invalid_dates(monkeypatch):
    monkeypatch.setattr(main,'_supabase_request',lambda *a,**k:[])
    assert client.put('/api/v1/food-logs/missing',json=payload()).status_code==404
    p=payload();p['meal_date']=(date.today()+timedelta(days=2)).isoformat()
    assert client.post('/api/v1/food-logs',json=p).status_code==422
    assert client.post('/api/v1/food-logs',json=payload(quantity=100)).status_code==422
    assert client.post('/api/v1/food-logs',json=payload(food_id=1,custom_food_id=CUSTOM_ID)).status_code==422

def test_search_migration_failure_is_actionable(monkeypatch):
    def fail(*a,**k): raise HTTPException(status_code=404,detail='RPC missing')
    monkeypatch.setattr(main,'_supabase_request',fail)
    result=client.get('/api/v1/foods?search=rice')
    assert result.status_code==503 and 'migration' in result.json()['detail']

def test_browse_honors_category_and_explicit_limit(monkeypatch):
    calls=[]
    monkeypatch.setattr(main,'_supabase_request',lambda *a,**k: calls.append(k['query']) or [])
    assert client.get('/api/v1/foods?category=drink&limit=4').status_code==200
    assert calls[0]['category']=='eq.drink' and calls[0]['limit']=='4'
