import base64
import json
import math
import os
import threading
import time
import urllib.error
import urllib.request
from collections import OrderedDict, deque
from dataclasses import dataclass
from datetime import date, datetime
from typing import Literal
from urllib.parse import urlparse, urlencode
import jwt
from fastapi import Depends, FastAPI, File, Header, HTTPException, Query, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from jwt import PyJWKClient
from jwt.exceptions import PyJWKClientError, PyJWTError
from pydantic import BaseModel, ConfigDict, Field, ValidationError

app = FastAPI(
    title="NutriThai AI API",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)
AUTH_COOKIE_SECURE = os.getenv("AUTH_COOKIE_SECURE", "true").lower() == "true"
AUTH_COOKIE_PATH = "/api/v1"

allowed_origins = [
    origin.strip()
    for origin in os.getenv(
        "FRONTEND_ORIGINS",
        "http://localhost:8443,http://127.0.0.1:8443,http://localhost:3000",
    ).split(",")
    if origin.strip()
]
if "*" in allowed_origins:
    raise RuntimeError("FRONTEND_ORIGINS must not allow wildcard origins")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.middleware("http")
async def reject_untrusted_mutation_origins(request: Request, call_next):
    origin = request.headers.get("origin")
    if request.method in {"POST", "PUT", "PATCH", "DELETE"} and origin:
        if origin not in allowed_origins:
            return JSONResponse(status_code=403, content={"detail": "ไม่อนุญาตคำขอจากเว็บไซต์นี้"})
    return await call_next(request)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_PUBLISHABLE_KEY = os.getenv(
    "SUPABASE_PUBLISHABLE_KEY",
    os.getenv("SUPABASE_ANON_KEY", ""),
)
MAX_IMAGE_BYTES = 5 * 1024 * 1024
ALLOWED_IMAGE_TYPES = {
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/webp": (b"RIFF",),
}
JWKS_CLIENT = (
    PyJWKClient(f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json", cache_keys=True)
    if SUPABASE_URL
    else None
)
GEMINI_RATE_LIMIT_REQUESTS = int(os.getenv("GEMINI_RATE_LIMIT_REQUESTS", "10"))
GEMINI_RATE_LIMIT_WINDOW_SECONDS = int(os.getenv("GEMINI_RATE_LIMIT_WINDOW_SECONDS", "3600"))
if GEMINI_RATE_LIMIT_REQUESTS < 1 or GEMINI_RATE_LIMIT_WINDOW_SECONDS < 1:
    raise RuntimeError("Gemini rate-limit settings must be positive integers")


class UserRateLimiter:
    def __init__(self, max_requests: int, window_seconds: int, max_users: int = 10000):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.max_users = max_users
        self._requests: OrderedDict[str, deque[float]] = OrderedDict()
        self._lock = threading.Lock()

    def consume(self, user_id: str, now: float | None = None) -> float:
        current_time = time.monotonic() if now is None else now
        with self._lock:
            requests = self._requests.get(user_id)
            if requests is None:
                if len(self._requests) >= self.max_users:
                    oldest_user, oldest_requests = next(iter(self._requests.items()))
                    if oldest_requests and current_time - oldest_requests[-1] < self.window_seconds:
                        return self.window_seconds
                    self._requests.pop(oldest_user)
                requests = deque()
                self._requests[user_id] = requests
            self._requests.move_to_end(user_id)

            while requests and current_time - requests[0] >= self.window_seconds:
                requests.popleft()
            if len(requests) >= self.max_requests:
                return max(1.0, self.window_seconds - (current_time - requests[0]))

            requests.append(current_time)
            return 0


GEMINI_RATE_LIMITER = UserRateLimiter(
    GEMINI_RATE_LIMIT_REQUESTS,
    GEMINI_RATE_LIMIT_WINDOW_SECONDS,
)


class DetectedFood(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str = Field(min_length=1, max_length=120)
    calories: float = Field(ge=0, le=10000)
    protein: float = Field(ge=0, le=1000)
    carbs: float = Field(ge=0, le=1000)
    fat: float = Field(ge=0, le=1000)
    confidence: float = Field(ge=0, le=100)
    advice: str = Field(default="ควรตรวจสอบปริมาณอาหารอีกครั้งเพื่อความแม่นยำ", max_length=500)


@dataclass(frozen=True)
class AuthenticatedUser:
    id: str
    access_token: str
    username: str
    email: str | None


class AuthRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=8, max_length=128)


class SignUpRequest(AuthRequest):
    username: str = Field(min_length=3, max_length=50)


class PasswordResetRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    redirect_to: str = Field(min_length=1, max_length=500)


class AuthCallbackRequest(BaseModel):
    access_token: str = Field(min_length=1, max_length=8192)
    refresh_token: str = Field(min_length=1, max_length=2048)
    expires_in: int | None = Field(default=None, ge=60, le=86400)


class ProfileRequest(BaseModel):
    gender: Literal["male", "female"]
    weight_kg: float = Field(ge=20, le=500)
    height_cm: float = Field(ge=100, le=250)
    age: int = Field(ge=10, le=120)
    activity_level: Literal["sedentary", "light", "moderate", "active"]
    goal: Literal["lose_weight", "maintain", "gain_muscle"]


class FoodLogRequest(BaseModel):
    food_id: int | None = Field(default=None, ge=1)
    food_name: str = Field(min_length=1, max_length=200)
    food_name_th: str | None = Field(default=None, max_length=200)
    meal_type: Literal["breakfast", "lunch", "dinner", "snack"]
    servings: float = Field(gt=0, le=100)
    calories_per_serving: float = Field(ge=0, le=10000)
    protein_per_serving: float = Field(default=0, ge=0, le=1000)
    carbs_per_serving: float = Field(default=0, ge=0, le=1000)
    fat_per_serving: float = Field(default=0, ge=0, le=1000)
    sugar_per_serving: float = Field(default=0, ge=0, le=1000)
    fiber_per_serving: float = Field(default=0, ge=0, le=1000)
    meal_date: date
    logged_at: datetime


class ServingsRequest(BaseModel):
    servings: float = Field(gt=0, le=100)


def _authenticated_user(authorization: str | None) -> AuthenticatedUser:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="กรุณาเข้าสู่ระบบ")

    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="กรุณาเข้าสู่ระบบ")
    if not SUPABASE_URL or JWKS_CLIENT is None:
        raise HTTPException(status_code=503, detail="ยังไม่ได้ตั้งค่า SUPABASE_URL ใน backend")
    try:
        signing_key = JWKS_CLIENT.get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256", "RS256"],
            audience="authenticated",
            issuer=f"{SUPABASE_URL}/auth/v1",
            options={"require": ["exp", "sub", "iss", "aud"]},
        )
    except PyJWKClientError as exc:
        raise HTTPException(status_code=503, detail="ตรวจสอบกุญแจยืนยันตัวตนไม่สำเร็จ") from exc
    except PyJWTError as exc:
        raise HTTPException(status_code=401, detail="session หมดอายุหรือไม่ถูกต้อง") from exc
    metadata = claims.get("user_metadata") or {}
    username = metadata.get("username") or claims.get("email", "").split("@")[0] or "User"
    return AuthenticatedUser(
        id=str(claims["sub"]),
        access_token=token,
        username=str(username),
        email=claims.get("email"),
    )


def require_supabase_user(authorization: str | None = Header(default=None)) -> str:
    return _authenticated_user(authorization).id


def require_authenticated_user(
    request: Request,
    authorization: str | None = Header(default=None),
) -> AuthenticatedUser:
    bearer = authorization
    if not bearer:
        access_token = request.cookies.get("nutrithai_access")
        bearer = f"Bearer {access_token}" if access_token else None
    return _authenticated_user(bearer)


def _supabase_request(
    path: str,
    method: str,
    body: dict | None = None,
    token: str | None = None,
    query: dict | None = None,
    extra_headers: dict | None = None,
):
    if not SUPABASE_URL or not SUPABASE_PUBLISHABLE_KEY:
        raise HTTPException(status_code=503, detail="ยังไม่ได้ตั้งค่า Supabase สำหรับ backend")
    url = f"{SUPABASE_URL}{path}"
    if query:
        url = f"{url}?{urlencode(query)}"
    headers = {
        "apikey": SUPABASE_PUBLISHABLE_KEY,
        "Content-Type": "application/json",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if extra_headers:
        headers.update(extra_headers)
    request = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8") if body is not None else None,
        headers=headers,
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            content = response.read()
            return json.loads(content.decode("utf-8")) if content else None
    except urllib.error.HTTPError as exc:
        response_body = exc.read()
        try:
            error = json.loads(response_body.decode("utf-8"))
            detail = error.get("msg") or error.get("message") or error.get("error_description") or error.get("error")
        except (UnicodeDecodeError, json.JSONDecodeError):
            detail = None
        if exc.code == 404:
            raise HTTPException(status_code=404, detail=detail or "ไม่พบข้อมูล") from exc
        if exc.code in (400, 401, 403, 409, 422):
            raise HTTPException(status_code=exc.code, detail=detail or "คำขอ Supabase ไม่สำเร็จ") from exc
        raise HTTPException(status_code=502, detail=detail or "เชื่อมต่อ Supabase ไม่สำเร็จ") from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise HTTPException(status_code=502, detail="ไม่สามารถเชื่อมต่อ Supabase ได้") from exc


def _auth_request(path: str, body: dict, method: str = "POST", token: str | None = None):
    return _supabase_request(path, method, body, token)


def _profile_from_row(row: dict):
    metrics = calculate_health_metrics(
        row["gender"],
        float(row["weight_kg"]),
        float(row["height_cm"]),
        int(row["age"]),
        row["activity_level"],
        row["goal"],
    )
    return {
        "username": row["username"],
        "gender": row["gender"],
        "weight_kg": row["weight_kg"],
        "height_cm": row["height_cm"],
        "age": row["age"],
        "activity_level": row["activity_level"],
        "goal": row["goal"],
        **metrics,
    }


def calculate_health_metrics(gender: str, weight: float, height: float, age: int, activity_level: str, goal: str):
    activity_multipliers = {
        "sedentary": 1.2,
        "light": 1.375,
        "moderate": 1.55,
        "active": 1.725,
    }
    bmr = (10 * weight + 6.25 * height - 5 * age + (5 if gender == "male" else -161))
    tdee = bmr * activity_multipliers[activity_level]
    target_calories = (
        max(1200, tdee - 500) if goal == "lose_weight"
        else tdee + 300 if goal == "gain_muscle"
        else tdee
    )
    javascript_round = lambda value: math.floor(value + 0.5)
    return {
        "bmr": javascript_round(bmr),
        "tdee": javascript_round(tdee),
        "calorieGoal": javascript_round(target_calories),
        "proteinGoal": javascript_round(target_calories * 0.25 / 4),
        "carbsGoal": max(javascript_round(target_calories * 0.5 / 4), 50),
        "fatGoal": javascript_round(target_calories * 0.25 / 9),
    }


def _food_log_select():
    return "id,food_id,source,food_name,food_name_th,meal_type,servings,calories_per_serving,protein_per_serving,carbs_per_serving,fat_per_serving,sugar_per_serving,fiber_per_serving,meal_date,logged_at"


def has_valid_image_signature(content_type: str, image: bytes) -> bool:
    signatures = ALLOWED_IMAGE_TYPES.get(content_type)
    if not signatures:
        return False
    if content_type == "image/webp":
        return len(image) >= 12 and image.startswith(b"RIFF") and image[8:12] == b"WEBP"
    return any(image.startswith(signature) for signature in signatures)


@app.get("/health")
def health():
    return {"status": "ok"}


def _set_auth_cookies(response: Response, session: dict):
    refresh_age = 60 * 60 * 24 * 30
    access_age = int(session.get("expires_in") or 3600)
    for name, value, max_age in (
        ("nutrithai_access", session["access_token"], access_age),
        ("nutrithai_refresh", session["refresh_token"], refresh_age),
    ):
        response.set_cookie(
            name,
            value,
            max_age=max_age,
            httponly=True,
            secure=AUTH_COOKIE_SECURE,
            samesite="lax",
            path=AUTH_COOKIE_PATH,
        )


def _clear_auth_cookies(response: Response):
    for name in ("nutrithai_access", "nutrithai_refresh"):
        response.delete_cookie(name, path=AUTH_COOKIE_PATH, httponly=True, secure=AUTH_COOKIE_SECURE, samesite="lax")


@app.post("/api/v1/auth/signup", status_code=201, tags=["Authentication"])
def sign_up(request: SignUpRequest, response: Response):
    result = _auth_request(
        "/auth/v1/signup",
        {
            "email": request.email,
            "password": request.password,
            "data": {"username": request.username.strip()},
        },
    )
    user = result.get("user") or result
    session = _auth_session(result)
    if session:
        _set_auth_cookies(response, session)
    return {
        "user": {
            "id": user.get("id"),
            "email": user.get("email"),
            "username": (user.get("user_metadata") or {}).get("username", request.username.strip()),
        },
        "authenticated": session is not None,
    }


def _auth_session(result: dict):
    if not result.get("access_token") or not result.get("refresh_token"):
        return None
    user = result.get("user") or {}
    metadata = user.get("user_metadata") or {}
    return {
        "access_token": result["access_token"],
        "refresh_token": result["refresh_token"],
        "expires_in": result.get("expires_in"),
        "user": {
            "id": user.get("id"),
            "email": user.get("email"),
            "username": metadata.get("username") or (user.get("email") or "User").split("@")[0],
        },
    }


@app.post("/api/v1/auth/login", tags=["Authentication"])
def sign_in(request: AuthRequest, response: Response):
    result = _auth_request(
        "/auth/v1/token?grant_type=password",
        {"email": request.email, "password": request.password},
    )
    session = _auth_session(result)
    if not session:
        raise HTTPException(status_code=502, detail="Supabase ไม่ได้คืน session สำหรับการเข้าสู่ระบบ")
    _set_auth_cookies(response, session)
    return {"user": session["user"]}


@app.post("/api/v1/auth/refresh", tags=["Authentication"])
def refresh_session(request: Request, response: Response):
    refresh_token = request.cookies.get("nutrithai_refresh")
    if not refresh_token:
        return Response(status_code=204)
    try:
        result = _auth_request(
            "/auth/v1/token?grant_type=refresh_token",
            {"refresh_token": refresh_token},
        )
    except HTTPException as error:
        if error.status_code == 401:
            _clear_auth_cookies(response)
        raise
    session = _auth_session(result)
    if not session:
        raise HTTPException(status_code=502, detail="Supabase ไม่ได้คืน session หลังต่ออายุ")
    _set_auth_cookies(response, session)
    return {"status": "ok"}


@app.post("/api/v1/auth/callback", tags=["Authentication"])
def accept_auth_callback(request: AuthCallbackRequest, response: Response):
    _authenticated_user(f"Bearer {request.access_token}")
    _set_auth_cookies(
        response,
        {
            "access_token": request.access_token,
            "refresh_token": request.refresh_token,
            "expires_in": request.expires_in,
        },
    )
    return {"status": "ok"}


@app.post("/api/v1/auth/password-reset", tags=["Authentication"])
def request_password_reset(request: PasswordResetRequest):
    redirect_origin = urlparse(request.redirect_to)
    allowed = {(urlparse(origin).scheme, urlparse(origin).netloc) for origin in allowed_origins}
    if (redirect_origin.scheme, redirect_origin.netloc) not in allowed:
        raise HTTPException(status_code=400, detail="URL สำหรับรีเซ็ตรหัสผ่านไม่ได้รับอนุญาต")
    _auth_request(
        f"/auth/v1/recover?{urlencode({'redirect_to': request.redirect_to})}",
        {"email": request.email},
    )
    return {"status": "ok"}


@app.put("/api/v1/auth/password", tags=["Authentication"])
def update_password(
    request: dict,
    user: AuthenticatedUser = Depends(require_authenticated_user),
):
    password = request.get("password")
    if not isinstance(password, str) or len(password) < 8 or len(password) > 128:
        raise HTTPException(status_code=422, detail="รหัสผ่านต้องมีความยาว 8 ถึง 128 ตัวอักษร")
    _auth_request("/auth/v1/user", {"password": password}, "PUT", user.access_token)
    return {"status": "ok"}


@app.post("/api/v1/auth/logout", tags=["Authentication"])
def sign_out(response: Response, user: AuthenticatedUser = Depends(require_authenticated_user)):
    _supabase_request("/auth/v1/logout", "POST", token=user.access_token)
    _clear_auth_cookies(response)
    return {"status": "ok"}


@app.get("/api/v1/auth/session", tags=["Authentication"])
@app.get("/api/v1/users/me", tags=["User Management"])
def get_auth_session(user: AuthenticatedUser = Depends(require_authenticated_user)):
    return {"id": user.id, "email": user.email, "username": user.username}


@app.get("/api/v1/profile", tags=["Profile"])
def get_profile(user: AuthenticatedUser = Depends(require_authenticated_user)):
    result = _supabase_request(
        "/rest/v1/profiles",
        "GET",
        token=user.access_token,
        query={
            "select": "username,gender,weight_kg,height_cm,age,activity_level,goal",
            "id": f"eq.{user.id}",
            "limit": "1",
        },
    )
    return _profile_from_row(result[0]) if result else None


@app.put("/api/v1/profile", tags=["Profile"])
@app.put("/api/v1/users/me", tags=["User Management"])
def save_profile(
    request: ProfileRequest,
    user: AuthenticatedUser = Depends(require_authenticated_user),
):
    row = {
        "id": user.id,
        "username": user.username[:50],
        **request.model_dump(),
    }
    result = _supabase_request(
        "/rest/v1/profiles",
        "POST",
        row,
        user.access_token,
        {"on_conflict": "id"},
        {"Prefer": "resolution=merge-duplicates,return=representation"},
    )
    return _profile_from_row(result[0]) if result else _profile_from_row(row)


@app.get("/api/v1/foods", tags=["Foods"])
def get_foods(
    search: str | None = Query(default=None, max_length=100),
    category: Literal["food", "drink", "dessert"] | None = None,
    limit: int = Query(default=8, ge=1, le=50),
):
    if search is not None and search.strip():
        return _supabase_request(
            "/rest/v1/rpc/search_foods",
            "POST",
            body={
                "search_query": search.strip(),
                "result_limit": limit,
                "category_filter": category,
            },
        )

    foods = []
    offset = 0
    while True:
        page = _supabase_request(
            "/rest/v1/foods",
            "GET",
            query={
                "select": "id,name,english_name,category,calories,protein,carbs,fat,sugar,fiber",
                "order": "name",
                "limit": "1000",
                "offset": str(offset),
            },
        )
        foods.extend(page)
        if len(page) < 1000:
            return foods
        offset += 1000


@app.get("/api/v1/food-logs", tags=["Food logs"])
def get_food_logs(user: AuthenticatedUser = Depends(require_authenticated_user)):
    return _supabase_request(
        "/rest/v1/food_logs",
        "GET",
        token=user.access_token,
        query={
            "select": _food_log_select(),
            "user_id": f"eq.{user.id}",
            "order": "meal_date.desc,logged_at.desc",
        },
    )


@app.post("/api/v1/food-logs", status_code=201, tags=["Food logs"])
def create_food_log(
    request: FoodLogRequest,
    user: AuthenticatedUser = Depends(require_authenticated_user),
):
    row = request.model_dump(mode="json")
    if request.food_id is not None:
        food_rows = _supabase_request(
            "/rest/v1/foods",
            "GET",
            token=user.access_token,
            query={
                "select": "id,name,english_name,calories,protein,carbs,fat,sugar,fiber",
                "id": f"eq.{request.food_id}",
                "limit": "1",
            },
        )
        if not food_rows:
            raise HTTPException(status_code=404, detail="ไม่พบอาหารใน catalog")
        food = food_rows[0]
        row.update({
            "food_name": food["english_name"] or food["name"],
            "food_name_th": food["name"],
            "calories_per_serving": food["calories"],
            "protein_per_serving": food["protein"],
            "carbs_per_serving": food["carbs"],
            "fat_per_serving": food["fat"],
            "sugar_per_serving": food["sugar"],
            "fiber_per_serving": food["fiber"],
        })
    row["user_id"] = user.id
    row["source"] = "catalog" if request.food_id is not None else "ai"
    result = _supabase_request(
        "/rest/v1/food_logs",
        "POST",
        row,
        user.access_token,
        {"select": _food_log_select()},
        {"Prefer": "return=representation"},
    )
    return result[0]


@app.patch("/api/v1/food-logs/{log_id}/servings", tags=["Food logs"])
def change_food_log_servings(
    log_id: str,
    request: ServingsRequest,
    user: AuthenticatedUser = Depends(require_authenticated_user),
):
    result = _supabase_request(
        f"/rest/v1/food_logs",
        "PATCH",
        {"servings": request.servings},
        user.access_token,
        {"id": f"eq.{log_id}", "user_id": f"eq.{user.id}", "select": "id"},
        {"Prefer": "return=representation"},
    )
    if not result:
        raise HTTPException(status_code=404, detail="ไม่พบรายการอาหารหรือไม่มีสิทธิ์แก้ไข")
    return {"status": "ok"}


@app.delete("/api/v1/food-logs/{log_id}", tags=["Food logs"])
def remove_food_log(log_id: str, user: AuthenticatedUser = Depends(require_authenticated_user)):
    result = _supabase_request(
        "/rest/v1/food_logs",
        "DELETE",
        token=user.access_token,
        query={"id": f"eq.{log_id}", "user_id": f"eq.{user.id}", "select": "id"},
        extra_headers={"Prefer": "return=representation"},
    )
    if not result:
        raise HTTPException(status_code=404, detail="ไม่พบรายการอาหารหรือไม่มีสิทธิ์ลบ")
    return {"status": "ok"}


@app.post("/api/v1/foods/scan-image", tags=["AI Scan"])
async def scan_food_image(
    file: UploadFile = File(...),
    user: AuthenticatedUser = Depends(require_authenticated_user),
):
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=503, detail="ยังไม่ได้ตั้งค่า GEMINI_API_KEY ใน backend")
    retry_after = GEMINI_RATE_LIMITER.consume(user.id)
    if retry_after:
        raise HTTPException(
            status_code=429,
            detail="ถึงขีดจำกัดการวิเคราะห์รูปชั่วคราว กรุณาลองใหม่ภายหลัง",
            headers={"Retry-After": str(int(retry_after + 0.999))},
        )
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=415, detail="รองรับเฉพาะไฟล์ JPEG, PNG และ WebP")

    image_bytes = await file.read(MAX_IMAGE_BYTES + 1)
    if not image_bytes:
        raise HTTPException(status_code=400, detail="ไฟล์รูปอาหารว่างเปล่า")
    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="รูปอาหารต้องมีขนาดไม่เกิน 5 MB")
    if not has_valid_image_signature(file.content_type, image_bytes):
        raise HTTPException(status_code=415, detail="เนื้อหาไฟล์ไม่ตรงกับชนิดรูปภาพที่รองรับ")

    prompt = """วิเคราะห์รูปอาหารนี้และตอบเป็น JSON เท่านั้น ห้ามใส่ markdown โดยใช้รูปแบบ:
{"name":"ชื่ออาหารภาษาไทย","calories":0,"protein":0,"carbs":0,"fat":0,"confidence":0,"advice":"คำแนะนำสั้น ๆ ภาษาไทย"}
ประเมินโภชนาการต่อหนึ่งจานหรือหนึ่งหน่วยที่เห็นในภาพ ค่าตัวเลขเป็นตัวเลขเท่านั้น และ confidence อยู่ระหว่าง 0 ถึง 100"""
    request_body = {
        "contents": [{"parts": [
            {"text": prompt},
            {
                "inline_data": {
                    "mime_type": file.content_type,
                    "data": base64.b64encode(image_bytes).decode("ascii"),
                }
            },
        ]}],
        "generationConfig": {"temperature": 0.2, "responseMimeType": "application/json"},
    }
    request = urllib.request.Request(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"
        f"?key={GEMINI_API_KEY}",
        data=json.dumps(request_body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            result = json.loads(response.read().decode("utf-8"))
        text = result["candidates"][0]["content"]["parts"][0]["text"]
        detected = DetectedFood.model_validate_json(text)
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as exc:
        raise HTTPException(status_code=502, detail="Gemini วิเคราะห์รูปไม่สำเร็จ") from exc
    except (KeyError, IndexError, json.JSONDecodeError, ValidationError) as exc:
        raise HTTPException(status_code=502, detail="Gemini ส่งผลลัพธ์ที่ไม่ถูกต้อง") from exc

    return {
        "status": "success",
        "detected_item": {
            "food_id": None,
            "name": detected.name,
            "calories": detected.calories,
            "protein": detected.protein,
            "carbs": detected.carbs,
            "fat": detected.fat,
        },
        "confidence": detected.confidence,
        "ai_advice": detected.advice,
    }
