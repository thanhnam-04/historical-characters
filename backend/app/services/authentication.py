from starlette.concurrency import run_in_threadpool

from app.core.errors import AppError
from app.core.security import digest, password_hash, verify_password
from app.database import now
from app.repositories.users import UserRepository


class AuthenticationService:
    def __init__(self, db, settings, config, usage):
        self.db, self.settings, self.config, self.usage = db, settings, config, usage
        self.users = UserRepository(db)

    async def register(self, payload, bootstrap=False):
        initialized = self.db.one("SELECT slot FROM bootstrap WHERE slot=1")
        if bootstrap and initialized:
            raise AppError(409, "Hệ thống đã có quản trị viên.")
        if not bootstrap and not initialized:
            raise AppError(409, "Admin cần khởi tạo hệ thống trước.")
        config = self.config.get()
        if not bootstrap and not config.registrationOpen:
            raise AppError(403, "Trang đang tạm đóng đăng ký.")
        hashed = await run_in_threadpool(password_hash, payload.password, self.settings.app_secret)
        user = self.users.create(
            payload.name,
            payload.email,
            "admin" if bootstrap else "user",
            config.dailyQuota,
            hashed,
            bootstrap,
        )
        self.db.audit(user["id"], "admin.bootstrap" if bootstrap else "auth.register", user["id"])
        return user

    async def login(self, payload):
        user = self.db.one("SELECT * FROM users WHERE email=?", payload.email.strip().lower())
        stored = user["password_hash"] if user else "pbkdf2$100000$" + "0" * 64 + "$" + "0" * 64
        valid = await run_in_threadpool(
            verify_password, payload.password, stored, self.settings.app_secret
        )
        if not user or not valid:
            raise AppError(401, "Email hoặc mật khẩu chưa đúng.")
        if user["status"] != "active":
            raise AppError(403, "Tài khoản đang bị khóa. Liên hệ admin.")
        self.db.execute("UPDATE users SET last_login=? WHERE id=?", now(), user["id"])
        return self.users.get(user["id"])

    async def reset(self, payload):
        token_hash = digest(payload.token)
        if not self.db.one(
            "SELECT 1 FROM resets WHERE token_hash=? AND expires_at>?", token_hash, now()
        ):
            raise AppError(400, "Link đặt mật khẩu không hợp lệ hoặc đã hết hạn.")
        hashed = await run_in_threadpool(password_hash, payload.password, self.settings.app_secret)
        with self.db.transaction() as connection:
            row = connection.execute(
                "SELECT * FROM resets WHERE token_hash=? AND expires_at>?", (token_hash, now())
            ).fetchone()
            if not row:
                raise AppError(400, "Link đặt mật khẩu đã được dùng hoặc đã hết hạn.")
            user_id = row["user_id"]
            connection.execute("UPDATE users SET password_hash=? WHERE id=?", (hashed, user_id))
            connection.execute("DELETE FROM resets WHERE user_id=?", (user_id,))
            connection.execute("DELETE FROM sessions WHERE user_id=?", (user_id,))
        self.db.audit(user_id, "auth.password_reset", user_id)

    async def change_password(self, user, payload):
        valid = await run_in_threadpool(
            verify_password,
            payload.currentPassword,
            user["password_hash"],
            self.settings.app_secret,
        )
        if not valid:
            raise AppError(400, "Mật khẩu hiện tại chưa đúng.")
        hashed = await run_in_threadpool(password_hash, payload.password, self.settings.app_secret)
        with self.db.transaction() as connection:
            connection.execute("UPDATE users SET password_hash=? WHERE id=?", (hashed, user["id"]))
            connection.execute("DELETE FROM sessions WHERE user_id=?", (user["id"],))
        self.db.audit(user["id"], "auth.password_change", user["id"])
