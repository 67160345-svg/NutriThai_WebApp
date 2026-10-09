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
from uuid import UUID, uuid5
from zoneinfo import ZoneInfo
from urllib.parse import urlparse, urlencode
import jwt
from fastapi import Depends, FastAPI, File, Header, HTTPException, Query, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from jwt import PyJWKClient
from jwt.exceptions import PyJWKClientError, PyJWTError
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

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


class ServingBasis(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False, str_strip_whitespace=True)
    serving_size: float = Field(default=1, ge=0.001, le=10000)
    serving_unit: Literal["portion", "g", "ml"] = "portion"
    serving_label: str = Field(default="หน่วยเดิม (ไม่ระบุขนาด)", min_length=1, max_length=100)
    portion_grams: float | None = Field(default=None, ge=0.001, le=10000)


class CustomFoodRequest(ServingBasis):
    name: str = Field(min_length=1, max_length=200)
    category: Literal["food", "drink", "dessert"] = "food"
    calories: float = Field(ge=0, le=10000)
    protein: float = Field(default=0, ge=0, le=1000)
    carbs: float = Field(default=0, ge=0, le=1000)
    fat: float = Field(default=0, ge=0, le=1000)
    sugar: float = Field(default=0, ge=0, le=1000)
    fiber: float = Field(default=0, ge=0, le=1000)


class FoodLogRequest(ServingBasis):
    custom_food_id: UUID | None = None
    source: Literal["catalog", "ai", "custom"] = "ai"
    category: Literal["food", "drink", "dessert"] = "food"
    quantity: float | None = Field(default=None, gt=0, le=1000000)
    quantity_unit: Literal["portion", "g", "ml"] | None = None
    replace_food: bool = False

    @model_validator(mode="after")
    def check_log(self):
        if self.food_id is not None and self.custom_food_id is not None:
            raise ValueError("เลือกอาหารจากแหล่งเดียวเท่านั้น")
        if (self.quantity is None) != (self.quantity_unit is None):
            raise ValueError("ต้องระบุปริมาณและหน่วยคู่กัน")
        if self.meal_date > datetime.now(ZoneInfo("Asia/Bangkok")).date():
            raise ValueError("ไม่สามารถบันทึกวันที่ในอนาคต")
        return self

    food_id: int | None = Field(default=None, ge=1)
    food_name: str = Field(min_length=1, max_length=200)
    food_name_th: str | None = Field(default=None, max_length=200)
    meal_type: Literal["breakfast", "lunch", "dinner", "snack"]
    servings: float = Field(ge=0.001, le=100)
    calories_per_serving: float = Field(ge=0, le=10000)
    protein_per_serving: float = Field(default=0, ge=0, le=1000)
    carbs_per_serving: float = Field(default=0, ge=0, le=1000)
    fat_per_serving: float = Field(default=0, ge=0, le=1000)
    sugar_per_serving: float = Field(default=0, ge=0, le=1000)
    fiber_per_serving: float = Field(default=0, ge=0, le=1000)
    meal_date: date
    logged_at: datetime


class ServingsRequest(BaseModel):
    servings: float = Field(ge=0.001, le=100)


class FoodPreferenceRequest(BaseModel):
    food_id: int | None = Field(default=None, ge=1)
    custom_food_id: UUID | None = None
    preference: Literal["like", "not_interested", "avoid"]

    @model_validator(mode="after")
    def one_food(self):
        if (self.food_id is None) == (self.custom_food_id is None):
            raise ValueError("เลือกอาหารจากแหล่งเดียว")
        return self


class WeightRequest(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    measured_on: date
    weight_kg: float = Field(ge=20, le=500)

    @model_validator(mode="after")
    def not_future(self):
        if self.measured_on > datetime.now(ZoneInfo("Asia/Bangkok")).date():
            raise ValueError("ไม่สามารถบันทึกน้ำหนักในอนาคต")
        return self


class BatchLogRequest(BaseModel):
    request_id: UUID
    items: list[FoodLogRequest] = Field(min_length=1, max_length=30)


class CopyMealRequest(BaseModel):
    request_id: UUID
    log_ids: list[UUID] = Field(min_length=1, max_length=30)
    meal_date: date
    meal_type: Literal["breakfast", "lunch", "dinner", "snack"]

    @model_validator(mode="after")
    def valid_copy(self):
        if len(set(self.log_ids)) != len(self.log_ids):
            raise ValueError("รายการซ้ำ")
        if self.meal_date > datetime.now(ZoneInfo("Asia/Bangkok")).date():
            raise ValueError("ไม่สามารถบันทึกวันที่ในอนาคต")
        return self


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
    body: dict | list | None = None,
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
    return "id,food_id,custom_food_id,source,category,food_name,food_name_th,meal_type,servings,serving_size,serving_unit,serving_label,portion_grams,calories_per_serving,protein_per_serving,carbs_per_serving,fat_per_serving,sugar_per_serving,fiber_per_serving,meal_date,logged_at"


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
    try:
        _supabase_request("/auth/v1/logout", "POST", token=user.access_token)
    except HTTPException as error:
        if not (
            error.status_code in {400, 401, 403}
            and "session from session_id claim in jwt does not exist" in str(error.detail).casefold()
        ):
            raise
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
    limit: int | None = Query(default=None, ge=1, le=50),
):
    if search is not None and search.strip():
        try:
            return _supabase_request(
                "/rest/v1/rpc/search_foods", "POST",
                body={"search_query": search.strip(), "result_limit": limit if limit is not None else 8, "category_filter": category},
            )
        except HTTPException as error:
            if error.status_code == 404:
                raise HTTPException(status_code=503, detail="ระบบค้นหาอาหารยังไม่พร้อม กรุณาให้ผู้ดูแลติดตั้ง migration สำหรับ search_foods") from error
            raise
    # No-search callers still receive the whole catalog, unless they explicitly
    # request a limit. Category applies to both search and browse.
    query = {"select": "*", "order": "name,id"}
    if category:
        query["category"] = f"eq.{category}"
    if limit is not None:
        query["limit"] = str(limit)
        return _supabase_request("/rest/v1/foods", "GET", query=query)
    return _read_all("/rest/v1/foods", query=query)


def _read_all(path: str, token: str | None = None, query: dict | None = None):
    rows = []
    while True:
        page = _supabase_request(path, "GET", token=token, query={
            **(query or {}), "limit": "1000", "offset": str(len(rows)),
        })
        rows.extend(page)
        if len(page) < 1000:
            return rows


@app.get("/api/v1/custom-foods", tags=["Personal foods"])
def get_custom_foods(user: AuthenticatedUser = Depends(require_authenticated_user)):
    return _read_all("/rest/v1/custom_foods", user.access_token,
                     {"select": "*", "user_id": f"eq.{user.id}", "order": "name,id"})


@app.post("/api/v1/custom-foods", status_code=201, tags=["Personal foods"])
def create_custom_food(request: CustomFoodRequest, user: AuthenticatedUser = Depends(require_authenticated_user)):
    row = {**request.model_dump(), "user_id": user.id}
    result = _supabase_request("/rest/v1/custom_foods", "POST", row, user.access_token,
                               {"select": "*"}, {"Prefer": "return=representation"})
    return result[0]


@app.get("/api/v1/food-logs", tags=["Food logs"])
def get_food_logs(user: AuthenticatedUser = Depends(require_authenticated_user)):
    return _read_all(
        "/rest/v1/food_logs",
        token=user.access_token,
        query={
            "select": _food_log_select(),
            "user_id": f"eq.{user.id}",
            "order": "meal_date.desc,logged_at.desc,id",
        },
    )


@app.post("/api/v1/food-logs", status_code=201, tags=["Food logs"])
def create_food_log(
    request: FoodLogRequest,
    user: AuthenticatedUser = Depends(require_authenticated_user),
):
    row = _build_log_row(request, user)
    result = _supabase_request("/rest/v1/food_logs", "POST", row, user.access_token,
                               {"select": _food_log_select()}, {"Prefer": "return=representation"})
    return result[0]


def _insert_batch(rows: list[dict], request_id: UUID, user: AuthenticatedUser):
    # Stable, per-account IDs make a retry safe after a lost HTTP response.
    ids = [str(uuid5(request_id, f"{user.id}:{i}")) for i in range(len(rows))]
    for row, row_id in zip(rows, ids):
        row["id"] = row_id
    _supabase_request("/rest/v1/food_logs", "POST", rows, user.access_token,
                      {"on_conflict": "id"}, {"Prefer": "resolution=ignore-duplicates,return=minimal"})
    saved = _supabase_request("/rest/v1/food_logs", "GET", token=user.access_token,
        query={"id": f"in.({','.join(ids)})", "user_id": f"eq.{user.id}", "select": _food_log_select()})
    by_id = {row["id"]: row for row in saved}
    if any(row_id not in by_id for row_id in ids):
        raise HTTPException(status_code=409, detail="ตรวจผลการบันทึกไม่ครบ กรุณาลองบันทึกชุดเดิมอีกครั้ง")
    return [by_id[row_id] for row_id in ids]


@app.post("/api/v1/food-logs/batch", status_code=201, tags=["Food logs"])
def create_food_log_batch(request: BatchLogRequest, user: AuthenticatedUser = Depends(require_authenticated_user)):
    # All validation/lookups happen before the single atomic PostgREST insert.
    rows = [_build_log_row(item, user) for item in request.items]
    return _insert_batch(rows, request.request_id, user)


@app.post("/api/v1/food-logs/copy", status_code=201, tags=["Food logs"])
def copy_food_logs(request: CopyMealRequest, user: AuthenticatedUser = Depends(require_authenticated_user)):
    ids = [str(value) for value in request.log_ids]
    found = _supabase_request("/rest/v1/food_logs", "GET", token=user.access_token,
        query={"id": f"in.({','.join(ids)})", "user_id": f"eq.{user.id}", "select": _food_log_select()})
    by_id = {row["id"]: row for row in found}
    if any(value not in by_id for value in ids):
        raise HTTPException(status_code=404, detail="ไม่พบรายการต้นฉบับหรือไม่มีสิทธิ์คัดลอก")
    rows = []
    for value in ids:
        old = by_id[value]
        item = FoodLogRequest.model_validate({**old, "meal_date": request.meal_date,
            "meal_type": request.meal_type, "logged_at": f"{request.meal_date}T12:00:00+07:00"})
        rows.append(_build_log_row(item, user, old))
    return _insert_batch(rows, request.request_id, user)


@app.get("/api/v1/food-preferences", tags=["Preferences"])
def get_food_preferences(user: AuthenticatedUser = Depends(require_authenticated_user)):
    return _read_all("/rest/v1/food_preferences", user.access_token,
        {"select": "food_key,preference", "user_id": f"eq.{user.id}", "order": "food_key"})


@app.put("/api/v1/food-preferences", tags=["Preferences"])
def save_food_preference(request: FoodPreferenceRequest, user: AuthenticatedUser = Depends(require_authenticated_user)):
    if request.custom_food_id:
        found = _supabase_request("/rest/v1/custom_foods", "GET", token=user.access_token,
            query={"id": f"eq.{request.custom_food_id}", "user_id": f"eq.{user.id}", "select": "id"})
        if not found:
            raise HTTPException(status_code=404, detail="ไม่พบอาหารส่วนตัว")
    row = {**request.model_dump(mode="json"), "user_id": user.id}
    return _supabase_request("/rest/v1/food_preferences", "POST", row, user.access_token,
        {"on_conflict": "user_id,food_key", "select": "food_key,preference"},
        {"Prefer": "resolution=merge-duplicates,return=representation"})[0]


@app.delete("/api/v1/food-preferences/{food_key}", tags=["Preferences"])
def delete_food_preference(food_key: str, user: AuthenticatedUser = Depends(require_authenticated_user)):
    _supabase_request("/rest/v1/food_preferences", "DELETE", token=user.access_token,
        query={"food_key": f"eq.{food_key}", "user_id": f"eq.{user.id}"})
    return {"status": "ok"}


@app.get("/api/v1/weight-logs", tags=["Weight"])
def get_weight_logs(user: AuthenticatedUser = Depends(require_authenticated_user)):
    return _read_all("/rest/v1/weight_logs", user.access_token,
        {"select": "measured_on,weight_kg", "user_id": f"eq.{user.id}", "order": "measured_on"})


@app.put("/api/v1/weight-logs", tags=["Weight"])
def save_weight_log(request: WeightRequest, user: AuthenticatedUser = Depends(require_authenticated_user)):
    row = {**request.model_dump(mode="json"), "user_id": user.id}
    return _supabase_request("/rest/v1/weight_logs", "POST", row, user.access_token,
        {"on_conflict": "user_id,measured_on", "select": "measured_on,weight_kg"},
        {"Prefer": "resolution=merge-duplicates,return=representation"})[0]


@app.delete("/api/v1/weight-logs/{measured_on}", tags=["Weight"])
def delete_weight_log(measured_on: date, user: AuthenticatedUser = Depends(require_authenticated_user)):
    _supabase_request("/rest/v1/weight_logs", "DELETE", token=user.access_token,
        query={"measured_on": f"eq.{measured_on.isoformat()}", "user_id": f"eq.{user.id}"})
    return {"status": "ok"}


BASIS_KEYS = ("serving_size", "serving_unit", "serving_label", "portion_grams")
NUTRIENTS = ("calories", "protein", "carbs", "fat", "sugar", "fiber")


def _build_log_row(request: FoodLogRequest, user: AuthenticatedUser, existing: dict | None = None):
    row = request.model_dump(mode="json", exclude={"quantity", "quantity_unit", "replace_food"})
    if existing is not None and not request.replace_food:
        # Keep historical nutrition and food identity when only meal/date/amount changes.
        row = {k: v for k, v in existing.items() if k not in {"id", "created_at"}}
        row.update(meal_type=request.meal_type, meal_date=request.meal_date.isoformat(),
                   logged_at=request.logged_at.isoformat(), servings=request.servings)
    else:
        food = None
        if request.food_id is not None:
            table, food_id, source = "foods", request.food_id, "catalog"
            query = {"select": "*", "id": f"eq.{food_id}", "limit": "1"}
        elif request.custom_food_id is not None:
            table, food_id, source = "custom_foods", request.custom_food_id, "custom"
            query = {"select": "*", "id": f"eq.{food_id}", "user_id": f"eq.{user.id}", "limit": "1"}
        else:
            source = request.source
            if source == "catalog":
                raise HTTPException(status_code=422, detail="อาหารจาก catalog ต้องมี food_id")
            table = None
        if table:
            foods = _supabase_request(f"/rest/v1/{table}", "GET", token=user.access_token, query=query)
            if not foods:
                raise HTTPException(status_code=404, detail="ไม่พบอาหารหรือไม่มีสิทธิ์เข้าถึง")
            food = foods[0]
            row.update(food_name=food.get("english_name") or food["name"],
                       food_name_th=food.get("name_th") or food["name"], category=food.get("category", "food"))
            for nutrient in NUTRIENTS:
                row[f"{nutrient}_per_serving"] = food.get(nutrient, 0)
            defaults = ServingBasis().model_dump()
            for key in BASIS_KEYS:
                row[key] = food.get(key, defaults[key])
        row["source"] = source
    row["user_id"] = user.id
    if request.quantity is not None:
        basis = ServingBasis.model_validate(row)
        if request.quantity_unit == basis.serving_unit:
            servings = request.quantity / basis.serving_size
        elif request.quantity_unit == "g" and basis.serving_unit == "portion" and basis.portion_grams:
            servings = request.quantity / (basis.portion_grams * basis.serving_size)
        else:
            raise HTTPException(status_code=422, detail="ไม่มีข้อมูลสำหรับแปลงหน่วยนี้")
        if not math.isfinite(servings) or not 0.001 <= servings <= 100:
            raise HTTPException(status_code=422, detail="ปริมาณต้องเทียบเท่า 0.001–100 หน่วยข้อมูล")
        row["servings"] = round(servings, 6)
    return row


@app.put("/api/v1/food-logs/{log_id}", tags=["Food logs"])
def update_food_log(log_id: str, request: FoodLogRequest,
                    user: AuthenticatedUser = Depends(require_authenticated_user)):
    query = {"id": f"eq.{log_id}", "user_id": f"eq.{user.id}", "select": _food_log_select()}
    existing = _supabase_request("/rest/v1/food_logs", "GET", token=user.access_token, query=query)
    if not existing:
        raise HTTPException(status_code=404, detail="ไม่พบรายการอาหารหรือไม่มีสิทธิ์แก้ไข")
    row = _build_log_row(request, user, existing[0])
    result = _supabase_request("/rest/v1/food_logs", "PATCH", row, user.access_token, query,
                               {"Prefer": "return=representation"})
    if not result:
        raise HTTPException(status_code=404, detail="ไม่พบรายการอาหารหรือไม่มีสิทธิ์แก้ไข")
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
