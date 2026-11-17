import json

from app.core.errors import AppError
from app.core.security import decrypt_key, encrypt_key
from app.database import now
from app.schemas import AIConfig


class ConfigurationService:
    def __init__(self, db, settings):
        self.db, self.settings = db, settings

    def value(self, key):
        row = self.db.one("SELECT value FROM settings WHERE key=?", key)
        return row["value"] if row else None

    def get(self) -> AIConfig:
        return AIConfig.model_validate(json.loads(self.value("config") or "{}"))

    def api_key(self):
        encrypted = self.value("openrouter_key")
        return (
            decrypt_key(encrypted, self.settings.app_secret)
            if encrypted
            else self.settings.openrouter_api_key
        )

    def ready(self):
        return bool(self.value("openrouter_key") or self.settings.openrouter_api_key)

    def public(self):
        config = self.get()
        return {
            **config.model_dump(
                include={"appName", "welcome", "chatModel", "ttsModel", "ttsEngine", "ttsEnabled"}
            ),
            "ready": self.ready(),
        }

    def model_allowed(self, model):
        if not model:
            raise AppError(400, "Chưa chọn model AI.")
        if self.get().freeOnly and model != "openrouter/free" and not model.endswith(":free"):
            raise AppError(400, "Chế độ hiện tại chỉ cho phép model miễn phí.")

    def update(self, actor_id, payload):
        config = AIConfig.model_validate({**self.get().model_dump(), **payload.config})
        for model in [config.chatModel] + (
            [config.ttsModel] if config.ttsEnabled and config.ttsEngine == "openrouter" else []
        ):
            if config.freeOnly and model != "openrouter/free" and not model.endswith(":free"):
                raise AppError(400, "Chế độ hiện tại chỉ cho phép model miễn phí.")
        key = (payload.apiKey or "").strip()
        if key and (not key.startswith("sk-or-") or payload.clearKey):
            raise AppError(400, "Key chưa hợp lệ hoặc đang chọn cả thay key và xóa key.")
        with self.db.transaction() as connection:
            connection.execute(
                "INSERT INTO settings VALUES('config',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
                (config.model_dump_json(), now()),
            )
            if key:
                connection.execute(
                    "INSERT INTO settings VALUES('openrouter_key',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
                    (encrypt_key(key, self.settings.app_secret), now()),
                )
            if payload.clearKey:
                connection.execute("DELETE FROM settings WHERE key='openrouter_key'")
        self.db.audit(
            actor_id,
            "config.update",
            fields=list(payload.config),
            keyChanged=bool(key or payload.clearKey),
        )
