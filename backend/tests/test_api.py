import io
import json
import time
import urllib.error

import jwt
from fastapi import HTTPException
from fastapi.testclient import TestClient
from jwt import PyJWK
from jwt.algorithms import RSAAlgorithm

import main

client = TestClient(main.app)


def test_health_endpoint_reports_ready():
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_scan_requires_bearer_token():
    response = client.post("/api/v1/foods/scan-image")

    assert response.status_code == 401


def test_authenticated_user_reads_http_only_access_cookie(monkeypatch):
    from cryptography.hazmat.primitives.asymmetric import rsa

    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_jwk = PyJWK.from_json(RSAAlgorithm.to_jwk(private_key.public_key()))

    class FakeJwks:
        def get_signing_key_from_jwt(self, _token):
            return public_jwk

    monkeypatch.setattr(main, "SUPABASE_URL", "https://project.supabase.co")
    monkeypatch.setattr(main, "JWKS_CLIENT", FakeJwks())
    token = jwt.encode(
        {
            "sub": "user-1",
            "iss": "https://project.supabase.co/auth/v1",
            "aud": "authenticated",
            "email": "person@example.com",
            "exp": int(time.time()) + 60,
        },
        private_key,
        algorithm="RS256",
    )
    client.cookies.set("nutrithai_access", token)
    try:
        response = client.get("/api/v1/auth/session")
    finally:
        client.cookies.clear()

    assert response.status_code == 200
    assert response.json()["id"] == "user-1"
    assert response.json()["email"] == "person@example.com"


def test_current_user_endpoint_returns_only_authenticated_user():
    user = main.AuthenticatedUser("user-1", "signed-access-token", "person", "person@example.com")
    main.app.dependency_overrides[main.require_authenticated_user] = lambda: user
    try:
        response = client.get("/api/v1/users/me")
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {
        "id": "user-1",
        "email": "person@example.com",
        "username": "person",
    }


def test_health_calculations_are_authoritative_on_backend():
    standard_profile = main.calculate_health_metrics("male", 70, 175, 25, "sedentary", "maintain")
    assert standard_profile == {
        "bmr": 1674,
        "tdee": 2009,
        "calorieGoal": 2009,
        "proteinGoal": 126,
        "carbsGoal": 251,
        "fatGoal": 56,
    }

    result = main.calculate_health_metrics("female", 45, 150, 80, "sedentary", "lose_weight")

    assert result == {
        "bmr": 827,
        "tdee": 992,
        "calorieGoal": 1200,
        "proteinGoal": 75,
        "carbsGoal": 150,
        "fatGoal": 33,
    }


def test_mutations_reject_untrusted_browser_origins():
    response = client.post(
        "/api/v1/auth/login",
        headers={"Origin": "https://attacker.example"},
        json={"email": "person@example.com", "password": "long-password"},
    )

    assert response.status_code == 403


def test_login_is_proxied_by_backend(monkeypatch):
    captured = {}

    def fake_auth_request(path, body, method="POST", token=None):
        captured.update(path=path, body=body, method=method)
        return {
            "access_token": "access",
            "refresh_token": "refresh",
            "expires_in": 3600,
            "user": {
                "id": "user-123",
                "email": "person@example.com",
                "user_metadata": {"username": "person"},
            },
        }

    monkeypatch.setattr(main, "_auth_request", fake_auth_request)
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "person@example.com", "password": "long-password"},
    )

    assert response.status_code == 200
    assert captured["path"] == "/auth/v1/token?grant_type=password"
    assert response.json()["user"]["username"] == "person"
    assert "access" not in response.text
    assert all("httponly" in cookie.lower() for cookie in response.headers.get_list("set-cookie"))
    client.cookies.clear()


def test_signup_without_email_confirmation_returns_no_session(monkeypatch):
    captured = {}
    monkeypatch.setattr(
        main,
        "_auth_request",
        lambda path, body, method="POST", token=None: captured.update(path=path, body=body) or {
            "id": "user-1",
            "email": body["email"],
            "user_metadata": body["data"],
        },
    )
    response = client.post(
        "/api/v1/auth/signup",
        json={"email": "new@example.com", "password": "long-password", "username": " new-user "},
    )

    assert response.status_code == 201
    assert response.json()["authenticated"] is False
    assert captured["body"]["data"]["username"] == "new-user"


def test_refresh_session_requires_and_exchanges_refresh_token(monkeypatch):
    captured = {}
    monkeypatch.setattr(
        main,
        "_auth_request",
        lambda path, body, method="POST", token=None: captured.update(path=path, body=body) or {
            "access_token": "new-access",
            "refresh_token": "new-refresh",
            "user": {"id": "user-1", "email": "new@example.com"},
        },
    )
    missing = client.post("/api/v1/auth/refresh")
    client.cookies.set("nutrithai_refresh", "old-refresh")
    refreshed = client.post("/api/v1/auth/refresh")

    assert missing.status_code == 204
    assert missing.content == b""
    assert refreshed.status_code == 200
    assert captured == {
        "path": "/auth/v1/token?grant_type=refresh_token",
        "body": {"refresh_token": "old-refresh"},
    }
    assert refreshed.json() == {"status": "ok"}
    assert captured["body"] == {"refresh_token": "old-refresh"}
    assert "new-access" in refreshed.headers.get("set-cookie", "")
    client.cookies.clear()


def test_auth_callback_exchange_sets_http_only_cookies(monkeypatch):
    from cryptography.hazmat.primitives.asymmetric import rsa

    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_jwk = PyJWK.from_json(RSAAlgorithm.to_jwk(private_key.public_key()))

    class FakeJwks:
        def get_signing_key_from_jwt(self, _token):
            return public_jwk

    monkeypatch.setattr(main, "SUPABASE_URL", "https://project.supabase.co")
    monkeypatch.setattr(main, "JWKS_CLIENT", FakeJwks())
    token = jwt.encode(
        {
            "sub": "user-123",
            "iss": "https://project.supabase.co/auth/v1",
            "aud": "authenticated",
            "exp": int(time.time()) + 60,
        },
        private_key,
        algorithm="RS256",
    )

    response = client.post(
        "/api/v1/auth/callback",
        json={"access_token": token, "refresh_token": "refresh-secret", "expires_in": 3600},
    )

    assert response.status_code == 200
    assert token not in response.text
    assert len(response.headers.get_list("set-cookie")) == 2
    assert all("httponly" in cookie.lower() for cookie in response.headers.get_list("set-cookie"))
    client.cookies.clear()


def test_password_reset_allows_only_configured_frontend_origin(monkeypatch):
    monkeypatch.setattr(main, "allowed_origins", ["http://localhost:8443"])
    calls = []
    monkeypatch.setattr(main, "_auth_request", lambda *args: calls.append(args))

    rejected = client.post(
        "/api/v1/auth/password-reset",
        json={"email": "person@example.com", "redirect_to": "https://attacker.example"},
    )
    accepted = client.post(
        "/api/v1/auth/password-reset",
        json={"email": "person@example.com", "redirect_to": "http://localhost:8443"},
    )

    assert rejected.status_code == 400
    assert accepted.status_code == 200
    assert len(calls) == 1
    assert "/auth/v1/recover?" in calls[0][0]


def test_password_update_and_logout_use_authenticated_token(monkeypatch):
    user = main.AuthenticatedUser("user-1", "signed-access-token", "person", "person@example.com")
    main.app.dependency_overrides[main.require_authenticated_user] = lambda: user
    calls = []
    monkeypatch.setattr(main, "_auth_request", lambda *args: calls.append(args))
    monkeypatch.setattr(main, "_supabase_request", lambda *args, **kwargs: calls.append((args, kwargs)))
    try:
        invalid = client.put("/api/v1/auth/password", json={"password": "short"})
        updated = client.put("/api/v1/auth/password", json={"password": "long-password"})
        logged_out = client.post("/api/v1/auth/logout")
        session = client.get("/api/v1/auth/session")
    finally:
        main.app.dependency_overrides.clear()

    assert invalid.status_code == 422
    assert updated.status_code == 200
    assert logged_out.status_code == 200
    assert session.json()["id"] == "user-1"
    assert calls[0][0] == "/auth/v1/user"
    assert calls[0][3] == "signed-access-token"
    assert calls[1][0][0] == "/auth/v1/logout"


def test_logout_clears_cookies_when_supabase_session_is_already_missing(monkeypatch):
    user = main.AuthenticatedUser("user-1", "signed-access-token", "person", "person@example.com")
    main.app.dependency_overrides[main.require_authenticated_user] = lambda: user

    def missing_session(*_args, **_kwargs):
        raise HTTPException(
            status_code=403,
            detail="Session from session_id claim in JWT does not exist",
        )

    monkeypatch.setattr(main, "_supabase_request", missing_session)
    try:
        response = client.post("/api/v1/auth/logout")
    finally:
        main.app.dependency_overrides.clear()
        client.cookies.clear()

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert all("max-age=0" in cookie.lower() for cookie in response.headers.get_list("set-cookie"))


def test_logout_does_not_hide_unrelated_supabase_errors(monkeypatch):
    user = main.AuthenticatedUser("user-1", "signed-access-token", "person", "person@example.com")
    main.app.dependency_overrides[main.require_authenticated_user] = lambda: user

    def upstream_failure(*_args, **_kwargs):
        raise HTTPException(status_code=502, detail="Supabase unavailable")

    monkeypatch.setattr(main, "_supabase_request", upstream_failure)
    try:
        response = client.post("/api/v1/auth/logout")
    finally:
        main.app.dependency_overrides.clear()
        client.cookies.clear()

    assert response.status_code == 502
    assert response.json()["detail"] == "Supabase unavailable"


def test_supabase_request_maps_success_errors_and_connection_failures(monkeypatch):
    monkeypatch.setattr(main, "SUPABASE_URL", "https://project.supabase.co")
    monkeypatch.setattr(main, "SUPABASE_PUBLISHABLE_KEY", "public-key")

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def read(self):
            return b'{"ok":true}'

    monkeypatch.setattr(main.urllib.request, "urlopen", lambda *_args, **_kwargs: FakeResponse())
    assert main._supabase_request("/rest/v1/test", "GET") == {"ok": True}

    monkeypatch.setattr(
        main.urllib.request,
        "urlopen",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            urllib.error.HTTPError("https://project.supabase.co", 400, "Bad Request", {}, io.BytesIO(b'{"message":"bad input"}'))
        ),
    )
    try:
        main._supabase_request("/rest/v1/test", "GET")
    except HTTPException as error:
        assert error.status_code == 400
        assert error.detail == "bad input"
    else:
        raise AssertionError("Supabase client errors must be surfaced")

    monkeypatch.setattr(
        main.urllib.request,
        "urlopen",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(urllib.error.URLError("offline")),
    )
    try:
        main._supabase_request("/rest/v1/test", "GET")
    except HTTPException as error:
        assert error.status_code == 502
    else:
        raise AssertionError("Supabase connectivity failures must be reported")


def test_supabase_request_requires_backend_configuration(monkeypatch):
    monkeypatch.setattr(main, "SUPABASE_URL", "")
    try:
        main._supabase_request("/rest/v1/test", "GET")
    except HTTPException as error:
        assert error.status_code == 503
    else:
        raise AssertionError("missing Supabase configuration must be reported")


def test_food_catalog_endpoint_pages_through_the_full_table(monkeypatch):
    pages = []

    def fake_request(_path, _method, body=None, token=None, query=None, extra_headers=None):
        pages.append(query["offset"])
        return [{"id": int(query["offset"]) + index} for index in range(1000 if len(pages) == 1 else 1)]

    monkeypatch.setattr(main, "_supabase_request", fake_request)
    response = client.get("/api/v1/foods")

    assert response.status_code == 200
    assert len(response.json()) == 1001
    assert pages == ["0", "1000"]


def test_food_search_uses_supabase_search_function_and_limits_results(monkeypatch):
    calls = []

    def fake_request(*args, **kwargs):
        calls.append((args, kwargs))
        return [{"id": 42, "name": "ข้าวผัด", "english_name": "Fried rice"}]

    monkeypatch.setattr(main, "_supabase_request", fake_request)
    response = client.get("/api/v1/foods", params={"search": " ข้าวผัด ", "category": "food", "limit": 8})

    assert response.status_code == 200
    assert response.json()[0]["id"] == 42
    assert calls == [
        (
            ("/rest/v1/rpc/search_foods", "POST"),
            {
                "body": {
                    "search_query": "ข้าวผัด",
                    "result_limit": 8,
                    "category_filter": "food",
                }
            },
        )
    ]


def test_food_search_rejects_invalid_category_and_limit():
    invalid_category = client.get("/api/v1/foods", params={"search": "rice", "category": "unknown"})
    invalid_limit = client.get("/api/v1/foods", params={"search": "rice", "limit": 51})

    assert invalid_category.status_code == 422
    assert invalid_limit.status_code == 422


def test_profile_read_and_food_log_read_are_user_scoped(monkeypatch):
    user = main.AuthenticatedUser("user-1", "signed-access-token", "person", "person@example.com")
    main.app.dependency_overrides[main.require_authenticated_user] = lambda: user
    calls = []

    def fake_request(*args, **kwargs):
        calls.append((args, kwargs))
        if args[0] == "/rest/v1/profiles":
            return []
        return [{"id": "log-1"}]

    monkeypatch.setattr(main, "_supabase_request", fake_request)
    try:
        profile = client.get("/api/v1/profile")
        logs = client.get("/api/v1/food-logs")
    finally:
        main.app.dependency_overrides.clear()

    assert profile.status_code == 200 and profile.json() is None
    assert logs.json() == [{"id": "log-1"}]
    assert calls[0][1]["query"]["id"] == "eq.user-1"
    assert calls[1][1]["query"]["user_id"] == "eq.user-1"
    assert calls[0][1]["token"] == "signed-access-token"


def test_food_log_serving_update_and_delete_return_not_found_when_row_missing(monkeypatch):
    user = main.AuthenticatedUser("user-1", "signed-access-token", "person", "person@example.com")
    main.app.dependency_overrides[main.require_authenticated_user] = lambda: user
    monkeypatch.setattr(main, "_supabase_request", lambda *args, **kwargs: [])
    try:
        updated = client.patch("/api/v1/food-logs/log-1/servings", json={"servings": 2})
        deleted = client.delete("/api/v1/food-logs/log-1")
    finally:
        main.app.dependency_overrides.clear()

    assert updated.status_code == 404
    assert deleted.status_code == 404


def test_profile_api_uses_authenticated_user_jwt_and_owner(monkeypatch):
    user = main.AuthenticatedUser("user-123", "user-jwt", "my-name", "person@example.com")
    main.app.dependency_overrides[main.require_authenticated_user] = lambda: user
    calls = []

    def fake_request(*args, **kwargs):
        calls.append((args, kwargs))
        return [{
            "username": "my-name",
            "gender": "female",
            "weight_kg": 60,
            "height_cm": 165,
            "age": 30,
            "activity_level": "moderate",
            "goal": "maintain",
        }]

    monkeypatch.setattr(main, "_supabase_request", fake_request)
    try:
        response = client.put(
            "/api/v1/profile",
            json={
                "gender": "female",
                "weight_kg": 60,
                "height_cm": 165,
                "age": 30,
                "activity_level": "moderate",
                "goal": "maintain",
            },
        )
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 200
    args = calls[0][0]
    assert args[2]["id"] == "user-123"
    assert args[2]["username"] == "my-name"
    assert args[3] == "user-jwt"


def test_current_user_put_alias_updates_only_authenticated_users_profile(monkeypatch):
    user = main.AuthenticatedUser("user-123", "user-jwt", "my-name", "person@example.com")
    main.app.dependency_overrides[main.require_authenticated_user] = lambda: user
    captured = {}

    def fake_request(_path, _method, body, token, query, headers):
        captured.update(body=body, token=token, query=query)
        return [body]

    monkeypatch.setattr(main, "_supabase_request", fake_request)
    try:
        response = client.put(
            "/api/v1/users/me",
            json={
                "gender": "female",
                "weight_kg": 60,
                "height_cm": 165,
                "age": 30,
                "activity_level": "moderate",
                "goal": "maintain",
            },
        )
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 200
    assert captured["body"]["id"] == "user-123"
    assert captured["body"]["username"] == "my-name"
    assert captured["token"] == "user-jwt"
    assert captured["query"] == {"on_conflict": "id"}


def test_food_log_creation_ignores_client_owner_id(monkeypatch):
    user = main.AuthenticatedUser("owner-id", "user-jwt", "person", "person@example.com")
    main.app.dependency_overrides[main.require_authenticated_user] = lambda: user
    captured = {}

    def fake_request(_path, _method, body, token, query, headers):
        captured.update(body=body, token=token, query=query, headers=headers)
        return [{"id": "saved-id", **body}]

    def fake_food_request(path, method, body=None, token=None, query=None, extra_headers=None):
        if path.endswith("/foods"):
            return [{
                "id": 2,
                "name": "ข้าว",
                "english_name": "Rice",
                "calories": 120,
                "protein": 3,
                "carbs": 28,
                "fat": 1,
                "sugar": 0,
                "fiber": 1,
            }]
        return fake_request(path, method, body, token, query, extra_headers)

    monkeypatch.setattr(main, "_supabase_request", fake_food_request)
    try:
        response = client.post(
            "/api/v1/food-logs",
            json={
                "user_id": "attacker-id",
                "food_id": 2,
                "food_name": "Rice",
                "meal_type": "lunch",
                "servings": 1,
                "calories_per_serving": 120,
                "meal_date": "2026-10-02",
                "logged_at": "2026-10-02T12:00:00+07:00",
            },
        )
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 201
    assert captured["body"]["user_id"] == "owner-id"
    assert captured["token"] == "user-jwt"
    assert captured["body"]["source"] == "catalog"
    assert captured["body"]["calories_per_serving"] == 120
    assert captured["body"]["food_name_th"] == "ข้าว"


def test_food_log_creation_validates_serving_limit():
    user = main.AuthenticatedUser("owner-id", "user-jwt", "person", "person@example.com")
    main.app.dependency_overrides[main.require_authenticated_user] = lambda: user
    try:
        response = client.post(
            "/api/v1/food-logs",
            json={
                "food_name": "Rice",
                "meal_type": "lunch",
                "servings": 101,
                "calories_per_serving": 120,
                "meal_date": "2026-10-02",
                "logged_at": "2026-10-02T12:00:00+07:00",
            },
        )
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 422


def test_user_rate_limiter_allows_configured_requests_then_returns_retry_time():
    limiter = main.UserRateLimiter(max_requests=2, window_seconds=60)

    assert limiter.consume("user-a", now=100) == 0
    assert limiter.consume("user-a", now=101) == 0
    assert limiter.consume("user-a", now=102) == 58
    assert limiter.consume("user-a", now=160) == 0
    assert limiter.consume("user-b", now=160) == 0


def test_scan_rate_limit_returns_429_and_retry_after(monkeypatch):
    monkeypatch.setattr(main, "GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(main.GEMINI_RATE_LIMITER, "consume", lambda _user_id: 23.2)
    main.app.dependency_overrides[main.require_authenticated_user] = lambda: main.AuthenticatedUser(
        "user-id", "test-token", "test-user", "test@example.com"
    )
    try:
        response = client.post(
            "/api/v1/foods/scan-image",
            headers={"Authorization": "Bearer test-token"},
            files={"file": ("food.jpg", b"\xff\xd8\xffjpeg", "image/jpeg")},
        )
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 429
    assert response.headers["retry-after"] == "24"


def test_bearer_token_is_verified_against_supabase_claims(monkeypatch):
    from cryptography.hazmat.primitives.asymmetric import rsa

    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_jwk = PyJWK.from_json(RSAAlgorithm.to_jwk(private_key.public_key()))

    class FakeJwks:
        def get_signing_key_from_jwt(self, _token):
            return public_jwk

    monkeypatch.setattr(main, "SUPABASE_URL", "https://project.supabase.co")
    monkeypatch.setattr(main, "JWKS_CLIENT", FakeJwks())
    token = jwt.encode(
        {
            "sub": "user-123",
            "iss": "https://project.supabase.co/auth/v1",
            "aud": "authenticated",
            "exp": int(time.time()) + 60,
        },
        private_key,
        algorithm="RS256",
    )

    assert main.require_supabase_user(f"Bearer {token}") == "user-123"


def test_bearer_token_rejects_wrong_issuer(monkeypatch):
    from cryptography.hazmat.primitives.asymmetric import rsa

    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_jwk = PyJWK.from_json(RSAAlgorithm.to_jwk(private_key.public_key()))

    class FakeJwks:
        def get_signing_key_from_jwt(self, _token):
            return public_jwk

    monkeypatch.setattr(main, "SUPABASE_URL", "https://project.supabase.co")
    monkeypatch.setattr(main, "JWKS_CLIENT", FakeJwks())
    token = jwt.encode(
        {
            "sub": "user-123",
            "iss": "https://attacker.invalid/auth/v1",
            "aud": "authenticated",
            "exp": int(time.time()) + 60,
        },
        private_key,
        algorithm="RS256",
    )

    try:
        main.require_supabase_user(f"Bearer {token}")
    except HTTPException as error:
        assert error.status_code == 401
    else:
        raise AssertionError("wrong issuer must be rejected")


def test_image_signature_validation_rejects_mismatched_content():
    assert main.has_valid_image_signature("image/png", b"\x89PNG\r\n\x1a\nimage")
    assert not main.has_valid_image_signature("image/png", b"\xff\xd8\xffjpeg")
    assert not main.has_valid_image_signature("text/plain", b"hello")


def test_scan_requires_supabase_configuration(monkeypatch):
    monkeypatch.setattr(main, "SUPABASE_URL", "")
    monkeypatch.setattr(main, "JWKS_CLIENT", None)
    try:
        main.require_supabase_user("Bearer token")
    except HTTPException as error:
        assert error.status_code == 503
    else:
        raise AssertionError("missing Supabase settings must be reported")


def test_scan_rejects_unsupported_content_type(monkeypatch):
    monkeypatch.setattr(main, "SUPABASE_URL", "https://project.supabase.co")
    monkeypatch.setattr(main, "JWKS_CLIENT", object())
    monkeypatch.setattr(main, "GEMINI_API_KEY", "test-key")
    main.app.dependency_overrides[main.require_authenticated_user] = lambda: main.AuthenticatedUser(
        "user-id", "test-token", "test-user", "test@example.com"
    )
    try:
        response = client.post(
            "/api/v1/foods/scan-image",
            headers={"Authorization": "Bearer test-token"},
            files={"file": ("food.txt", b"not an image", "text/plain")},
        )
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 415


def test_scan_rejects_oversized_image(monkeypatch):
    monkeypatch.setattr(main, "SUPABASE_URL", "https://project.supabase.co")
    monkeypatch.setattr(main, "JWKS_CLIENT", object())
    monkeypatch.setattr(main, "GEMINI_API_KEY", "test-key")
    main.app.dependency_overrides[main.require_authenticated_user] = lambda: main.AuthenticatedUser(
        "user-id", "test-token", "test-user", "test@example.com"
    )
    try:
        response = client.post(
            "/api/v1/foods/scan-image",
            headers={"Authorization": "Bearer test-token"},
            files={"file": ("food.jpg", b"\xff\xd8\xff" + b"x" * (main.MAX_IMAGE_BYTES + 1), "image/jpeg")},
        )
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 413


def test_scan_validates_image_signature_before_calling_gemini(monkeypatch):
    monkeypatch.setattr(main, "SUPABASE_URL", "https://project.supabase.co")
    monkeypatch.setattr(main, "JWKS_CLIENT", object())
    monkeypatch.setattr(main, "GEMINI_API_KEY", "test-key")
    main.app.dependency_overrides[main.require_authenticated_user] = lambda: main.AuthenticatedUser(
        "user-id", "test-token", "test-user", "test@example.com"
    )
    try:
        response = client.post(
            "/api/v1/foods/scan-image",
            headers={"Authorization": "Bearer test-token"},
            files={"file": ("fake.jpg", b"not a jpeg", "image/jpeg")},
        )
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 415


def test_scan_returns_validated_gemini_food(monkeypatch):
    monkeypatch.setattr(main, "SUPABASE_URL", "https://project.supabase.co")
    monkeypatch.setattr(main, "JWKS_CLIENT", object())
    monkeypatch.setattr(main, "GEMINI_API_KEY", "test-key")
    main.app.dependency_overrides[main.require_authenticated_user] = lambda: main.AuthenticatedUser(
        "user-id", "test-token", "test-user", "test@example.com"
    )

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def read(self):
            result = {
                "candidates": [{
                    "content": {"parts": [{
                        "text": json.dumps({
                            "name": "ข้าวผัด",
                            "calories": 420,
                            "protein": 18,
                            "carbs": 58,
                            "fat": 12,
                            "confidence": 92,
                            "advice": "ลดน้ำมัน",
                        })
                    }]}
                }]
            }
            return json.dumps(result).encode()

    monkeypatch.setattr(main.urllib.request, "urlopen", lambda *_args, **_kwargs: FakeResponse())
    try:
        response = client.post(
            "/api/v1/foods/scan-image",
            headers={"Authorization": "Bearer test-token"},
            files={"file": ("food.jpg", b"\xff\xd8\xffjpeg", "image/jpeg")},
        )
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["detected_item"]["calories"] == 420
    assert response.json()["confidence"] == 92


def test_scan_reports_upstream_failure(monkeypatch):
    monkeypatch.setattr(main, "SUPABASE_URL", "https://project.supabase.co")
    monkeypatch.setattr(main, "JWKS_CLIENT", object())
    monkeypatch.setattr(main, "GEMINI_API_KEY", "test-key")
    main.app.dependency_overrides[main.require_authenticated_user] = lambda: main.AuthenticatedUser(
        "user-id", "test-token", "test-user", "test@example.com"
    )

    def fail_request(*_args, **_kwargs):
        raise urllib.error.URLError("upstream unavailable")

    monkeypatch.setattr(main.urllib.request, "urlopen", fail_request)
    try:
        response = client.post(
            "/api/v1/foods/scan-image",
            headers={"Authorization": "Bearer test-token"},
            files={"file": ("food.jpg", b"\xff\xd8\xffjpeg", "image/jpeg")},
        )
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 502


def test_detected_food_rejects_out_of_range_nutrition():
    try:
        main.DetectedFood.model_validate({
            "name": "invalid",
            "calories": -1,
            "protein": 0,
            "carbs": 0,
            "fat": 0,
            "confidence": 50,
        })
    except ValueError:
        pass
    else:
        raise AssertionError("negative calories must be rejected")
