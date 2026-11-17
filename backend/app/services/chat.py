"""Streaming, cancellation and usage bookkeeping are independent of HTTP routes."""

import asyncio
import json
import re

import anyio
from fastapi.responses import Response, StreamingResponse

from app.core.errors import AppError
from app.repositories.conversations import ConversationRepository


def event(name, payload):
    return f"event: {name}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


class ChatService:
    def __init__(self, db, configuration, usage, provider):
        self.db, self.configuration, self.usage, self.provider = db, configuration, usage, provider
        self.conversations = ConversationRepository(db)

    async def reply(self, user, conversation, text):
        text = text.strip()
        if not text:
            raise AppError(400, "Tin nhắn không được để trống.")
        if conversation["deleted_at"]:
            raise AppError(400, "Khôi phục hội thoại trước khi gửi tin nhắn.")
        config = self.configuration.get()
        self.provider.headers()
        self.configuration.model_allowed(config.chatModel)
        self.usage.rate("send:" + user["id"], 15, 60)
        job = self.usage.reserve(user, "chat", config.chatModel)
        try:
            sent = self.conversations.append(conversation["id"], "user", text)
            messages = list(
                reversed(
                    self.db.all(
                        "SELECT role,content FROM messages WHERE conversation_id=? ORDER BY rowid DESC LIMIT 24",
                        conversation["id"],
                    )
                )
            )
            upstream = await self.provider.chat(config, messages)
        except BaseException:
            self.usage.finish(job, "error")
            raise

        async def generate():
            reply, status, saved = "", "success", None
            try:
                yield event("meta", {"userMessageId": sent["id"]})
                if "application/json" in upstream.headers.get("content-type", ""):
                    payload = json.loads(await upstream.aread())
                    reply = (payload.get("choices") or [{}])[0].get("message", {}).get(
                        "content"
                    ) or ""
                    yield event("delta", {"text": reply})
                else:
                    async for line in upstream.aiter_lines():
                        if not line.startswith("data:") or line[5:].strip() in ("", "[DONE]"):
                            continue
                        payload = json.loads(line[5:])
                        if payload.get("error"):
                            raise AppError(502, "Model gặp lỗi trong lúc tạo câu trả lời.")
                        text = (payload.get("choices") or [{}])[0].get("delta", {}).get("content")
                        if isinstance(text, str) and text:
                            reply += text
                            if len(reply) > 18000:
                                raise AppError(502, "Câu trả lời vượt giới hạn độ dài.")
                            yield event("delta", {"text": text})
                if not reply.strip():
                    raise AppError(502, "Model chưa trả lời bằng chữ. Hãy thử model khác.")
            except asyncio.CancelledError:
                status = "cancelled"
                raise
            except Exception as error:
                status = "error"
                yield event(
                    "error",
                    {
                        "error": error.message
                        if isinstance(error, AppError)
                        else "Kết nối AI bị gián đoạn. Hãy thử lại."
                    },
                )
            finally:
                with anyio.CancelScope(shield=True):
                    try:
                        if reply.strip():
                            saved = self.conversations.append(
                                conversation["id"],
                                "assistant",
                                reply,
                                config.chatModel,
                                "complete" if status == "success" else "interrupted",
                            )
                    finally:
                        self.usage.finish(job, status, len(reply))
                        await upstream.aclose()
            yield event("done", {"message": saved, "used": self.usage.used(user["id"])})

        return StreamingResponse(
            generate(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache, no-transform"},
        )

    async def speak(self, user, payload):
        config = self.configuration.get()
        if not config.ttsEnabled or config.ttsEngine != "openrouter":
            raise AppError(400, "Giọng đọc OpenRouter đang tắt.")
        self.provider.headers()
        self.configuration.model_allowed(config.ttsModel)
        text = "Xin chào! Mình là Long Vân, người bạn rồng của bạn. Hôm nay bạn muốn kể cho mình nghe điều gì?"
        if not payload.sample:
            row = self.db.one(
                "SELECT m.content FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE m.id=? AND c.user_id=? AND m.role='assistant' AND c.deleted_at IS NULL",
                payload.messageId,
                user["id"],
            )
            if not row:
                raise AppError(404, "Không tìm thấy câu trả lời để đọc.")
            text = row["content"]
        text = re.sub(r"```[\s\S]*?```", " ", text)
        text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)
        text = re.sub(r"[#*`_>]", "", text)[:5000]
        self.usage.rate("speech:" + user["id"], 10, 60)
        job = self.usage.reserve(user, "tts", config.ttsModel)
        try:
            audio, media_type = await self.provider.speech(config, text)
            self.usage.finish(job, "success", len(text))
            return Response(audio, media_type=media_type, headers={"Cache-Control": "no-store"})
        except BaseException:
            self.usage.finish(job, "error")
            raise
