import sqlite3

from app.core.errors import AppError
from app.core.security import digest, token
from app.database import Database, new_id, now


def public_user(user):
    return {
        "id": user["id"],
        "email": user["email"],
        "name": user["name"],
        "role": user["role"],
        "status": user["status"],
        "quota": user["quota"],
        "createdAt": user["created_at"],
        "lastLogin": user["last_login"],
    }


class UserRepository:
    def __init__(self, db: Database):
        self.db = db

    def get(self, user_id):
        user = self.db.one("SELECT * FROM users WHERE id=?", user_id)
        if not user:
            raise AppError(404, "Không tìm thấy tài khoản.")
        return user

    def create(self, name, email, role, quota, password_hash=None, bootstrap=False):
        user_id = new_id()
        try:
            with self.db.transaction() as connection:
                connection.execute(
                    "INSERT INTO users(id,email,name,role,status,password_hash,quota,created_at,last_login) VALUES(?,?,?,?,'active',?,?,?,?)",
                    (
                        user_id,
                        email.lower().strip(),
                        name.strip(),
                        role,
                        password_hash,
                        quota,
                        now(),
                        now(),
                    ),
                )
                if bootstrap:
                    connection.execute("INSERT INTO bootstrap VALUES(1,?)", (user_id,))
        except sqlite3.IntegrityError:
            raise AppError(409, "Email đã tồn tại hoặc hệ thống đã có admin gốc.") from None
        return self.get(user_id)

    def session(self, user_id):
        session_token, csrf = token(), token()
        self.db.execute(
            "INSERT INTO sessions VALUES(?,?,?,?)",
            digest(session_token),
            user_id,
            csrf,
            now() + 604_800_000,
        )
        return session_token, csrf

    def reset_link(self, user_id):
        value = token()
        with self.db.transaction() as connection:
            connection.execute("DELETE FROM resets WHERE user_id=?", (user_id,))
            connection.execute(
                "INSERT INTO resets VALUES(?,?,?)", (digest(value), user_id, now() + 3_600_000)
            )
        return "/login?reset=" + value

    def list(self, query, offset):
        pattern = "%" + query[:100] + "%"
        rows = self.db.all(
            "SELECT u.*,(SELECT COUNT(*) FROM conversations c WHERE c.user_id=u.id AND c.deleted_at IS NULL) conversations FROM users u WHERE email LIKE ? OR name LIKE ? ORDER BY created_at DESC,id LIMIT 51 OFFSET ?",
            pattern,
            pattern,
            offset,
        )
        owner = self.db.one("SELECT user_id FROM bootstrap WHERE slot=1")
        return {
            "items": [{**public_user(row), "conversations": row["conversations"]} for row in rows],
            "ownerId": owner["user_id"] if owner else None,
        }

    def update(self, actor, target_id, data):
        target = self.get(target_id)
        owner = self.db.one("SELECT user_id FROM bootstrap WHERE slot=1")
        role = data.role or target["role"]
        status = data.status or target["status"]
        quota = target["quota"] if data.quota is None else data.quota
        if target_id in (actor["id"], owner["user_id"] if owner else None) and (
            role != "admin" or status != "active"
        ):
            raise AppError(400, "Không thể tự khóa/hạ quyền hoặc khóa/hạ quyền admin gốc.")
        with self.db.transaction() as connection:
            connection.execute(
                "UPDATE users SET role=?,status=?,quota=? WHERE id=?",
                (role, status, quota, target_id),
            )
            if status == "suspended":
                connection.execute("DELETE FROM sessions WHERE user_id=?", (target_id,))
        self.db.audit(actor["id"], "user.update", target_id, role=role, status=status, quota=quota)
