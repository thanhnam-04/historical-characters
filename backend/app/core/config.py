import os
import secrets
from dataclasses import dataclass
from pathlib import Path

from dotenv import dotenv_values

BACKEND_ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class Settings:
    database_path: Path
    app_secret: str
    public_origin: str = "http://127.0.0.1:8767"
    openrouter_api_key: str = ""
    frontend_dist: Path = BACKEND_ROOT.parent / "frontend" / "dist"

    @classmethod
    def load(cls):
        env_path = BACKEND_ROOT / ".env"
        if not env_path.exists() and not os.environ.get("APP_SECRET"):
            if (BACKEND_ROOT / "data" / "app.sqlite3").exists():
                raise RuntimeError("Restore backend/.env before opening an existing database.")
            env_path.write_text(f"APP_SECRET={secrets.token_hex(48)}\n", encoding="utf-8")
        values = {**dotenv_values(env_path), **os.environ}
        secret = values.get("APP_SECRET", "")
        if len(secret) < 32:
            raise RuntimeError("APP_SECRET must contain at least 32 characters.")
        path = Path(values.get("DATABASE_PATH", str(BACKEND_ROOT / "data" / "app.sqlite3")))
        if not path.is_absolute():
            path = BACKEND_ROOT / path
        return cls(
            path,
            secret,
            values.get("PUBLIC_ORIGIN", cls.public_origin),
            values.get("OPENROUTER_API_KEY", ""),
        )
