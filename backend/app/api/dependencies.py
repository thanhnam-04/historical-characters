import hmac

from fastapi import Request

from app.core.errors import AppError
from app.core.security import digest
from app.database import now


def services(request: Request):
    return request.app.state.services


def check_origin(request: Request):
    origin = request.headers.get("origin", "").rstrip("/")
    allowed = {
        services(request).settings.public_origin.rstrip("/"),
        str(request.base_url).rstrip("/"),
    }
    if not origin or origin not in allowed:
        raise AppError(403, "Yêu cầu không cùng nguồn với trang web.")


def session_user(request: Request):
    value = request.cookies.get("longvan_session", "")
    if not value:
        return None
    return services(request).db.one(
        "SELECT u.*,s.csrf,s.token_hash FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?",
        digest(value),
        now(),
    )


def require_user(request: Request):
    user = session_user(request)
    if not user:
        raise AppError(401, "Vui lòng đăng nhập để tiếp tục.")
    if user["status"] != "active":
        raise AppError(403, "Tài khoản đang bị khóa. Liên hệ admin.")
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        check_origin(request)
        if not hmac.compare_digest(request.headers.get("x-csrf-token", ""), user["csrf"]):
            raise AppError(403, "Phiên làm việc đã thay đổi. Tải lại trang rồi thử lại.")
    return user


def require_admin(request: Request):
    user = require_user(request)
    if user["role"] != "admin":
        raise AppError(403, "Bạn không có quyền quản trị.")
    return user
