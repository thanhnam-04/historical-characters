from fastapi import APIRouter, Depends, Request

from app.api.auth import login_response
from app.api.dependencies import require_user, services
from app.core.errors import AppError
from app.repositories.users import public_user
from app.schemas import ChangePassword, ProfileUpdate

router = APIRouter(tags=["Profile"])


@router.get("/me")
def me(request: Request, user=Depends(require_user)):
    app = services(request)
    return {
        "user": public_user(user),
        "csrf": user["csrf"],
        "mode": "password",
        "config": app.configuration.public(),
        "used": app.usage.used(user["id"]),
    }


@router.patch("/profile")
def update_profile(payload: ProfileUpdate, request: Request, user=Depends(require_user)):
    name = payload.name.strip()
    if not name:
        raise AppError(400, "Tên không được để trống.")
    app = services(request)
    app.db.execute("UPDATE users SET name=? WHERE id=?", name, user["id"])
    return {"user": public_user(app.users.get(user["id"]))}


@router.post("/profile/password")
async def change_password(payload: ChangePassword, request: Request, user=Depends(require_user)):
    await services(request).auth.change_password(user, payload)
    return login_response(request, user)


@router.get("/usage")
def usage(request: Request, user=Depends(require_user)):
    app = services(request)
    return {
        "used": app.usage.used(user["id"]),
        "quota": user["quota"],
        "items": app.db.all(
            "SELECT kind,model,status,units,created_at FROM usage WHERE user_id=? ORDER BY created_at DESC LIMIT 50",
            user["id"],
        ),
    }
