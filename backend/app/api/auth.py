from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.api.dependencies import check_origin, services, session_user
from app.core.errors import AppError
from app.core.security import digest
from app.repositories.users import public_user
from app.schemas import Login, Registration, ResetPassword

router = APIRouter(prefix="/auth", tags=["Authentication"])


def login_response(request, user):
    session_token, csrf = services(request).users.session(user["id"])
    response = JSONResponse({"user": public_user(user), "csrf": csrf})
    response.set_cookie(
        "longvan_session",
        session_token,
        max_age=604800,
        httponly=True,
        samesite="lax",
        secure=request.url.scheme == "https",
    )
    return response


def rate_auth(request, email=""):
    app = services(request)
    app.usage.rate("auth-ip:" + digest(request.client.host if request.client else "local"), 40, 900)
    if email:
        app.usage.rate("auth-email:" + digest(email.strip().lower()), 15, 900)


@router.get("/status")
def status(request: Request):
    app = services(request)
    return {
        "mode": "password",
        "setupRequired": not bool(app.db.one("SELECT slot FROM bootstrap WHERE slot=1")),
        "registrationOpen": app.configuration.get().registrationOpen,
    }


@router.post("/setup")
async def setup(payload: Registration, request: Request):
    check_origin(request)
    if request.url.hostname not in ("localhost", "127.0.0.1", "::1"):
        raise AppError(403, "Khởi tạo admin qua kết nối localhost trước khi công khai website.")
    rate_auth(request)
    return login_response(request, await services(request).auth.register(payload, bootstrap=True))


@router.post("/register")
async def register(payload: Registration, request: Request):
    check_origin(request)
    rate_auth(request, payload.email)
    return login_response(request, await services(request).auth.register(payload))


@router.post("/login")
async def login(payload: Login, request: Request):
    check_origin(request)
    rate_auth(request, payload.email)
    return login_response(request, await services(request).auth.login(payload))


@router.post("/reset")
async def reset(payload: ResetPassword, request: Request):
    check_origin(request)
    rate_auth(request)
    await services(request).auth.reset(payload)
    return {"ok": True}


@router.post("/logout")
def logout(request: Request):
    check_origin(request)
    user = session_user(request)
    if user:
        services(request).db.execute("DELETE FROM sessions WHERE token_hash=?", user["token_hash"])
    response = JSONResponse({"ok": True, "redirect": "/login"})
    response.delete_cookie("longvan_session", path="/")
    return response
