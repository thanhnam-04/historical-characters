import json

from app.core.errors import AppError
from app.database import Database, new_id, now


class ConversationRepository:
    def __init__(self, db: Database):
        self.db = db

    def owned(self, conversation_id, user, admin=False):
        row = self.db.one("SELECT * FROM conversations WHERE id=?", conversation_id)
        if not row or (not admin and row["user_id"] != user["id"]):
            raise AppError(404, "Không tìm thấy cuộc trò chuyện.")
        return row

    def list(self, user_id, archived, offset):
        condition = "IS NOT NULL" if archived else "IS NULL"
        rows = self.db.all(
            f"SELECT * FROM conversations WHERE user_id=? AND deleted_at {condition} ORDER BY updated_at DESC,id LIMIT 51 OFFSET ?",
            user_id,
            offset,
        )
        return {"items": rows[:50], "hasMore": len(rows) > 50, "nextOffset": offset + 50}

    def create(self, user_id, title):
        conversation_id, timestamp = new_id(), now()
        self.db.execute(
            "INSERT INTO conversations VALUES(?,?,?,?,?,NULL)",
            conversation_id,
            user_id,
            title.strip() or "Cuộc trò chuyện mới",
            timestamp,
            timestamp,
        )
        return self.db.one("SELECT * FROM conversations WHERE id=?", conversation_id)

    def history(self, conversation_id, before=None):
        cursor = 9_007_199_254_740_991
        if before:
            row = self.db.one(
                "SELECT rowid sequence FROM messages WHERE id=? AND conversation_id=?",
                before,
                conversation_id,
            )
            if not row:
                raise AppError(400, "Mốc tải tin nhắn không hợp lệ.")
            cursor = row["sequence"]
        rows = self.db.all(
            "SELECT * FROM messages WHERE conversation_id=? AND rowid<? ORDER BY rowid DESC LIMIT 101",
            conversation_id,
            cursor,
        )
        messages = list(reversed(rows[:100]))
        return {
            "messages": messages,
            "hasMore": len(rows) > 100,
            "before": messages[0]["id"] if messages else None,
        }

    def append(self, conversation_id, role, content, model=None, status="complete"):
        message = {
            "id": new_id(),
            "conversation_id": conversation_id,
            "role": role,
            "content": content,
            "created_at": now(),
            "model": model,
            "status": status,
        }
        with self.db.transaction() as connection:
            connection.execute(
                "INSERT INTO messages(id,conversation_id,role,content,created_at,model,status) VALUES(:id,:conversation_id,:role,:content,:created_at,:model,:status)",
                message,
            )
            connection.execute(
                "UPDATE conversations SET updated_at=? WHERE id=?",
                (message["created_at"], conversation_id),
            )
            if role == "user":
                connection.execute(
                    "UPDATE conversations SET title=? WHERE id=? AND title='Cuộc trò chuyện mới'",
                    (content[:65], conversation_id),
                )
        return message

    def export(self, conversation):
        yield '{"conversation":' + json.dumps(conversation, ensure_ascii=False) + ',"messages":['
        cursor, comma = 0, ""
        while True:
            rows = self.db.all(
                "SELECT rowid sequence,* FROM messages WHERE conversation_id=? AND rowid>? ORDER BY rowid LIMIT 500",
                conversation["id"],
                cursor,
            )
            if not rows:
                break
            for row in rows:
                cursor = row.pop("sequence")
                yield comma + json.dumps(row, ensure_ascii=False)
                comma = ","
        yield "]}"
