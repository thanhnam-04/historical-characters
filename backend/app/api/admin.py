from fastapi import APIRouter, Depends, Query, Request

from app.api.dependencies import require_admin, services
from app.database import now
from app.repositories.users import public_user
from app.schemas import ConfigUpdate, UserCreate, UserUpdate

router = APIRouter(prefix="/admin", tags=["Administration"])


@router.get("/overview")
def overview(request: Request, user=Depends(require_admin)):
    app = services(request)
    db, start = app.db, now() - 86400000

    def count(sql, *args):
        return db.one(sql, *args)["n"]

    return {
        "stats": {
            "users": count("SELECT COUNT(*) n FROM users"),
            "activeUsers": count("SELECT COUNT(*) n FROM users WHERE status='active'"),
            "conversations": count("SELECT COUNT(*) n FROM conversations WHERE deleted_at IS NULL"),
            "messages": count("SELECT COUNT(*) n FROM messages"),
            "requestsToday": count("SELECT COUNT(*) n FROM usage WHERE created_at>?", start),
            "errorsToday": count(
                "SELECT COUNT(*) n FROM usage WHERE created_at>? AND status='error'", start
            ),
        },
        "daily": db.all(
            "SELECT date(created_at/1000,'unixepoch','+7 hours') day,COUNT(*) total,SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) errors FROM usage WHERE created_at>? GROUP BY day ORDER BY day",
            now() - 7 * 86400000,
        ),
        "recent": db.all(
            "SELECT a.*,u.name actor_name FROM audit a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT 8"
        ),
        "ready": app.configuration.ready(),
    }


@router.get("/users")
def users(request: Request, q: str = "", offset: int = Query(0, ge=0), user=Depends(require_admin)):
    return services(request).users.list(q, offset)


@router.post("/users", status_code=201)
def create_user(payload: UserCreate, request: Request, user=Depends(require_admin)):
    app = services(request)
    created = app.users.create(
        payload.name, payload.email, payload.role, app.configuration.get().dailyQuota
    )
    app.db.audit(user["id"], "user.create", created["id"], role=payload.role)
    return {"user": public_user(created), "resetPath": app.users.reset_link(created["id"])}


@router.patch("/users/{user_id}")
def update_user(user_id: str, payload: UserUpdate, request: Request, user=Depends(require_admin)):
    services(request).users.update(user, user_id, payload)
    return {"ok": True}


@router.post("/users/{user_id}/reset")
def reset_link(user_id: str, request: Request, user=Depends(require_admin)):
    app = services(request)
    app.users.get(user_id)
    link = app.users.reset_link(user_id)
    app.db.audit(user["id"], "user.reset_link", user_id)
    return {"resetPath": link, "expiresIn": 3600}


@router.post("/users/{user_id}/sessions")
def revoke(user_id: str, request: Request, user=Depends(require_admin)):
    app = services(request)
    app.users.get(user_id)
    app.db.execute("DELETE FROM sessions WHERE user_id=?", user_id)
    app.db.audit(user["id"], "user.revoke_sessions", user_id)
    return {"ok": True}


@router.get("/config")
def configuration(request: Request, user=Depends(require_admin)):
    config = services(request).configuration
    source = (
        "database"
        if config.value("openrouter_key")
        else "environment"
        if config.settings.openrouter_api_key
        else "none"
    )
    return {
        "config": config.get().model_dump(),
        "keyConfigured": config.ready(),
        "keySource": source,
        "mode": "password",
    }


@router.patch("/config")
def save_configuration(payload: ConfigUpdate, request: Request, user=Depends(require_admin)):
    app = services(request)
    app.configuration.update(user["id"], payload)
    return {"ok": True, "keyConfigured": app.configuration.ready()}


@router.get("/connection")
async def connection(request: Request, user=Depends(require_admin)):
    return await services(request).provider.connection()


@router.get("/models")
async def models(request: Request, include_paid: bool = False, user=Depends(require_admin)):
    return {"items": await services(request).provider.models(include_paid=include_paid)}


@router.get("/conversations")
def conversations(
    request: Request, q: str = "", offset: int = Query(0, ge=0), user=Depends(require_admin)
):
    pattern = "%" + q[:100] + "%"
    rows = services(request).db.all(
        "SELECT c.*,u.email,u.name,(SELECT COUNT(*) FROM messages m WHERE m.conversation_id=c.id) message_count FROM conversations c JOIN users u ON u.id=c.user_id WHERE c.title LIKE ? OR u.email LIKE ? ORDER BY c.updated_at DESC,c.id LIMIT 51 OFFSET ?",
        pattern,
        pattern,
        offset,
    )
    return {"items": rows[:50], "hasMore": len(rows) > 50, "nextOffset": offset + 50}


@router.get("/conversations/{conversation_id}")
def review(
    conversation_id: str, request: Request, before: str | None = None, user=Depends(require_admin)
):
    app = services(request)
    conversation = app.conversations.owned(conversation_id, user, admin=True)
    app.db.audit(user["id"], "conversation.admin_read", conversation_id)
    return {"conversation": conversation, **app.conversations.history(conversation_id, before)}


@router.get("/audit")
def audit(request: Request, offset: int = Query(0, ge=0), user=Depends(require_admin)):
    rows = services(request).db.all(
        "SELECT a.*,u.name actor_name,u.email actor_email FROM audit a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC,a.id LIMIT 51 OFFSET ?",
        offset,
    )
    return {"items": rows[:50], "hasMore": len(rows) > 50, "nextOffset": offset + 50}
