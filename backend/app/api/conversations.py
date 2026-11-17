from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse

from app.api.dependencies import require_user, services
from app.core.errors import AppError
from app.database import now
from app.schemas import ChatMessage, ConversationCreate, ConversationUpdate, SpeechRequest

router = APIRouter(tags=["Conversations"])


@router.get("/conversations")
def conversations(
    request: Request,
    archived: bool = False,
    offset: int = Query(0, ge=0),
    user=Depends(require_user),
):
    return services(request).conversations.list(user["id"], archived, offset)


@router.post("/conversations", status_code=201)
def create(payload: ConversationCreate, request: Request, user=Depends(require_user)):
    app = services(request)
    app.usage.rate("conversation:" + user["id"], 30, 60)
    return {"conversation": app.conversations.create(user["id"], payload.title)}


@router.get("/conversations/{conversation_id}")
def detail(
    conversation_id: str, request: Request, before: str | None = None, user=Depends(require_user)
):
    app = services(request)
    conversation = app.conversations.owned(conversation_id, user)
    return {
        "conversation": conversation,
        **app.conversations.history(conversation_id, before),
        "inFlight": app.usage.in_flight(user["id"]),
    }


@router.patch("/conversations/{conversation_id}")
def update(
    conversation_id: str, payload: ConversationUpdate, request: Request, user=Depends(require_user)
):
    app = services(request)
    app.conversations.owned(conversation_id, user)
    if payload.archived is not None:
        app.db.execute(
            "UPDATE conversations SET deleted_at=?,updated_at=? WHERE id=?",
            now() if payload.archived else None,
            now(),
            conversation_id,
        )
    elif payload.title and payload.title.strip():
        app.db.execute(
            "UPDATE conversations SET title=?,updated_at=? WHERE id=?",
            payload.title.strip(),
            now(),
            conversation_id,
        )
    else:
        raise AppError(400, "Tên hội thoại không được để trống.")
    return {"ok": True}


@router.delete("/conversations/{conversation_id}")
def archive(conversation_id: str, request: Request, user=Depends(require_user)):
    app = services(request)
    app.conversations.owned(conversation_id, user)
    app.db.execute(
        "UPDATE conversations SET deleted_at=?,updated_at=? WHERE id=?",
        now(),
        now(),
        conversation_id,
    )
    return {"ok": True}


@router.get("/conversations/{conversation_id}/export")
def export(conversation_id: str, request: Request, user=Depends(require_user)):
    app = services(request)
    conversation = app.conversations.owned(conversation_id, user)
    return StreamingResponse(
        app.conversations.export(conversation),
        media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="long-van-conversation.json"'},
    )


@router.post("/conversations/{conversation_id}/messages")
async def send(
    conversation_id: str, payload: ChatMessage, request: Request, user=Depends(require_user)
):
    app = services(request)
    return await app.chat.reply(
        user, app.conversations.owned(conversation_id, user), payload.content
    )


@router.post("/tts")
async def speak(payload: SpeechRequest, request: Request, user=Depends(require_user)):
    return await services(request).chat.speak(user, payload)
