from datetime import date, timedelta
from uuid import uuid4
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
import main

client = TestClient(main.app)
USER = main.AuthenticatedUser('11111111-1111-1111-1111-111111111111', 'token-a', 'user-a', 'a@example.com')

@pytest.fixture(autouse=True)
def authenticated():
    main.app.dependency_overrides[main.require_authenticated_user] = lambda: USER
    yield
    main.app.dependency_overrides.clear()

def item(**changes):
    return dict(food_name='Snapshot', source='custom', meal_type='lunch', servings=1,
        calories_per_serving=130, protein_per_serving=3, carbs_per_serving=28, fat_per_serving=1,
        meal_date='2026-01-01', logged_at='2026-01-01T12:00:00+07:00', **changes)

def test_batch_atomic_payload_owner_and_retry_ids(monkeypatch):
    saved = {}
    writes = []
    def request(path, method, body=None, token=None, query=None, extra_headers=None):
        assert token == USER.access_token
        if method == 'POST':
            assert isinstance(body, list)
            writes.append(body)
            for row in body: saved.setdefault(row['id'], row)
        else:
            assert query['user_id'] == f'eq.{USER.id}'
            return list(saved.values())
    monkeypatch.setattr(main, '_supabase_request', request)
    payload = {'request_id': str(uuid4()), 'items': [item(user_id='forged'), item()]}
    first = client.post('/api/v1/food-logs/batch', json=payload)
    second = client.post('/api/v1/food-logs/batch', json=payload)
    assert first.status_code == second.status_code == 201
    assert first.json() == second.json()
    assert len(saved) == 2
    assert all(row['user_id'] == USER.id for row in first.json())

def test_batch_validates_every_item_before_any_write(monkeypatch):
    calls = []
    def request(path, method, *args, **kwargs):
        calls.append(method)
        return []
    monkeypatch.setattr(main, '_supabase_request', request)
    result = client.post('/api/v1/food-logs/batch', json={'request_id': str(uuid4()), 'items': [item(), item(food_id=999)]})
    assert result.status_code == 404
    assert 'POST' not in calls
    for rows in ([], [item()] * 31, [{**item(), 'servings': 0}]):
        assert client.post('/api/v1/food-logs/batch', json={'request_id': str(uuid4()), 'items': rows}).status_code == 422

def test_batch_reports_uncertain_result_for_retry(monkeypatch):
    monkeypatch.setattr(main, '_supabase_request', lambda *a, **kw: [])
    assert client.post('/api/v1/food-logs/batch', json={'request_id': str(uuid4()), 'items': [item()]}).status_code == 409

def test_copy_preserves_snapshot_not_current_catalog(monkeypatch):
    source_id = str(uuid4())
    old = {**item(), 'id': source_id, 'food_id': 1, 'serving_size': 100, 'serving_unit': 'g', 'serving_label': 'กรัม'}
    saved = []
    def request(path, method, body=None, token=None, query=None, extra_headers=None):
        assert path == '/rest/v1/food_logs' and token == USER.access_token
        if method == 'POST': saved.extend(body)
        else:
            assert query['user_id'] == f'eq.{USER.id}'
            return saved or [old]
    monkeypatch.setattr(main, '_supabase_request', request)
    response = client.post('/api/v1/food-logs/copy', json={'request_id': str(uuid4()), 'log_ids': [source_id], 'meal_date': '2026-01-02', 'meal_type': 'dinner'})
    assert response.status_code == 201
    row = response.json()[0]
    assert row['calories_per_serving'] == 130 and row['serving_size'] == 100
    assert row['meal_type'] == 'dinner' and row['meal_date'] == '2026-01-02' and row['id'] != source_id

def test_copy_rejects_other_owner_and_duplicate_ids(monkeypatch):
    monkeypatch.setattr(main, '_supabase_request', lambda *a, **kw: [])
    uid = str(uuid4())
    payload = {'request_id': str(uuid4()), 'log_ids': [uid], 'meal_date': '2026-01-02', 'meal_type': 'dinner'}
    assert client.post('/api/v1/food-logs/copy', json=payload).status_code == 404
    assert client.post('/api/v1/food-logs/copy', json={**payload, 'log_ids': [uid, uid]}).status_code == 422
    assert client.post('/api/v1/food-logs/copy', json={**payload, 'meal_date': str(date.today() + timedelta(days=2))}).status_code == 422

def test_preferences_and_weights_are_owner_scoped(monkeypatch):
    calls = []
    def request(path, method, body=None, token=None, query=None, extra_headers=None):
        calls.append((path, method, body, token, query))
        return [body] if body else []
    monkeypatch.setattr(main, '_supabase_request', request)
    assert client.put('/api/v1/food-preferences', json={'food_id': 1, 'preference': 'avoid', 'user_id': 'forged'}).status_code == 200
    assert calls[-1][2]['user_id'] == USER.id
    assert client.put('/api/v1/weight-logs', json={'measured_on': '2026-01-01', 'weight_kg': 70, 'user_id': 'forged'}).status_code == 200
    assert calls[-1][2]['user_id'] == USER.id
    for path in ('food-preferences', 'weight-logs'):
        assert client.get(f'/api/v1/{path}').status_code == 200
        assert calls[-1][4]['user_id'] == f'eq.{USER.id}'
    for path in ('food-preferences/catalog:1', 'weight-logs/2026-01-01'):
        assert client.delete(f'/api/v1/{path}').status_code == 200
        assert calls[-1][4]['user_id'] == f'eq.{USER.id}'
    assert all(call[3] == USER.access_token for call in calls)

def test_preference_requires_one_reference_and_own_custom_food(monkeypatch):
    monkeypatch.setattr(main, '_supabase_request', lambda *a, **kw: [])
    uid = str(uuid4())
    assert client.put('/api/v1/food-preferences', json={'preference': 'like'}).status_code == 422
    assert client.put('/api/v1/food-preferences', json={'preference': 'like', 'food_id': 1, 'custom_food_id': uid}).status_code == 422
    assert client.put('/api/v1/food-preferences', json={'preference': 'like', 'custom_food_id': uid}).status_code == 404

def test_weight_validation_and_upsert_key(monkeypatch):
    calls = []
    def request(*args, **kwargs): calls.append((args, kwargs)); return [args[2]]
    monkeypatch.setattr(main, '_supabase_request', request)
    for kg in (0, 19, 501, 'NaN'):
        assert client.put('/api/v1/weight-logs', json={'measured_on': '2026-01-01', 'weight_kg': kg}).status_code == 422
    assert client.put('/api/v1/weight-logs', json={'measured_on': str(date.today() + timedelta(days=2)), 'weight_kg': 70}).status_code == 422
    assert not calls
    assert client.put('/api/v1/weight-logs', json={'measured_on': '2026-01-01', 'weight_kg': 70.15}).status_code == 200
    assert calls[0][0][4]['on_conflict'] == 'user_id,measured_on'

def test_new_endpoints_require_session(monkeypatch):
    main.app.dependency_overrides.clear()
    monkeypatch.setattr(main, '_supabase_request', lambda *a, **kw: pytest.fail('Unexpected database access'))
    assert client.get('/api/v1/food-preferences').status_code == 401
    assert client.get('/api/v1/weight-logs').status_code == 401
    assert client.post('/api/v1/food-logs/batch', json={'request_id': str(uuid4()), 'items': [item()]}).status_code == 401
