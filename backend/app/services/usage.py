from datetime import datetime, timedelta, timezone

from app.core.errors import AppError
from app.database import new_id, now


class UsageService:
    def __init__(self, db):
        self.db = db

    @staticmethod
    def day_key(user_id):
        day = datetime.now(timezone(timedelta(hours=7))).date().isoformat()
        return f"daily:{user_id}:{day}"

    def used(self, user_id):
        row = self.db.one("SELECT count FROM limits WHERE key=?", self.day_key(user_id))
        return row["count"] if row else 0

    def rate(self, key, maximum, seconds):
        with self.db.transaction() as connection:
            row = connection.execute("SELECT * FROM limits WHERE key=?", (key,)).fetchone()
            count = row["count"] + 1 if row and row["expires_at"] > now() else 1
            expires = (
                row["expires_at"] if row and row["expires_at"] > now() else now() + seconds * 1000
            )
            connection.execute(
                "INSERT INTO limits VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET count=excluded.count,expires_at=excluded.expires_at",
                (key, count, expires),
            )
        if count > maximum:
            raise AppError(429, "Bạn thao tác quá nhanh. Hãy đợi một lúc rồi thử lại.")

    def reserve(self, user, kind, model):
        job, day = new_id(), self.day_key(user["id"])
        with self.db.transaction() as connection:
            lock = connection.execute(
                "SELECT * FROM locks WHERE user_id=?", (user["id"],)
            ).fetchone()
            if lock and lock["expires_at"] > now():
                raise AppError(
                    409, "Đang có một yêu cầu AI khác. Đợi xong hoặc bấm dừng trước khi gửi tiếp."
                )
            quota = connection.execute("SELECT count FROM limits WHERE key=?", (day,)).fetchone()
            count = quota["count"] if quota else 0
            if count >= user["quota"]:
                raise AppError(429, "Bạn đã dùng hết hạn mức AI hôm nay.")
            connection.execute(
                "INSERT INTO limits VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET count=excluded.count",
                (day, count + 1, now() + 172800000),
            )
            connection.execute(
                "INSERT INTO locks VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET request_id=excluded.request_id,expires_at=excluded.expires_at",
                (user["id"], job, now() + 120000),
            )
            connection.execute(
                "INSERT INTO usage VALUES(?,?,?,?,'pending',0,?)",
                (job, user["id"], kind, model, now()),
            )
        return {"id": job, "day": day, "user_id": user["id"]}

    def finish(self, job, status, units=0):
        with self.db.transaction() as connection:
            connection.execute(
                "UPDATE usage SET status=?,units=? WHERE id=?", (status, units, job["id"])
            )
            connection.execute(
                "DELETE FROM locks WHERE user_id=? AND request_id=?", (job["user_id"], job["id"])
            )
            if status == "error":
                connection.execute(
                    "UPDATE limits SET count=MAX(0,count-1) WHERE key=?", (job["day"],)
                )

    def in_flight(self, user_id):
        return bool(
            self.db.one("SELECT 1 FROM locks WHERE user_id=? AND expires_at>?", user_id, now())
        )
