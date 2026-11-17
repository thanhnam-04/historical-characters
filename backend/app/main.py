import logging
from contextlib import asynccontextmanager
from types import SimpleNamespace

import httpx
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError

from app.api import admin, auth, characters, conversations, profile
from app.core.config import Settings
from app.core.errors import AppError
from app.database import Database
from app.repositories.conversations import ConversationRepository
from app.repositories.users import UserRepository
from app.services.authentication import AuthenticationService
from app.services.characters import CharacterService
from app.services.chat import ChatService
from app.services.configuration import ConfigurationService
from app.services.openrouter import OpenRouter
from app.services.usage import UsageService


def create_app(settings: Settings | None = None, transport=None):
    settings = settings or Settings.load()
    db = Database(settings.database_path)
    db.initialize()
    configuration = ConfigurationService(db, settings)
    usage = UsageService(db)
    client = httpx.AsyncClient(
        base_url="https://openrouter.ai/api/v1",
        timeout=httpx.Timeout(90, connect=15),
        transport=transport,
    )
    provider = OpenRouter(client, configuration)

    @asynccontextmanager
    async def lifespan(app):
        yield
        await client.aclose()

    application = FastAPI(title="Historical Characters API", version="3.0.0", lifespan=lifespan)
    application.state.services = SimpleNamespace(
        settings=settings,
        characters=CharacterService(db),
        db=db,
        configuration=configuration,
        usage=usage,
        users=UserRepository(db),
        conversations=ConversationRepository(db),
        auth=AuthenticationService(db, settings, configuration, usage),
        provider=provider,
        chat=ChatService(db, configuration, usage, provider),
    )

    @application.exception_handler(AppError)
    async def application_error(request, error):
        return JSONResponse({"error": error.message}, status_code=error.status)

    @application.exception_handler(RequestValidationError)
    @application.exception_handler(ValidationError)
    async def validation_error(request, error):
        # Do not echo submitted passwords or provider keys in validation errors.
        messages = [item["msg"].removeprefix("Value error, ") for item in error.errors()]
        return JSONResponse(
            {"error": "Dữ liệu chưa hợp lệ: " + "; ".join(messages)}, status_code=400
        )

    @application.exception_handler(httpx.HTTPError)
    async def provider_error(request, error):
        return JSONResponse(
            {"error": "Chưa kết nối được dịch vụ AI. Hãy thử lại sau."}, status_code=502
        )

    @application.exception_handler(Exception)
    async def unknown_error(request, error):
        logging.getLogger("longvan").error("Unhandled application error: %s", type(error).__name__)
        return JSONResponse(
            {"error": "Máy chủ gặp sự cố. Hãy thử lại hoặc liên hệ admin."}, status_code=500
        )

    @application.middleware("http")
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        if request.url.path.startswith("/api/"):
            response.headers.setdefault("Cache-Control", "no-store")
        return response

    @application.get("/api/health")
    def health():
        return {"ok": True, "service": "historical-characters", "version": "3.0.0", "backend": "python"}

    for router in (
        auth.router,
        profile.router,
        conversations.router,
        admin.router,
        characters.router,
    ):
        application.include_router(router, prefix="/api")

    dist = settings.frontend_dist
    if dist.exists():
        application.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")
        application.mount("/dragon", StaticFiles(directory=dist / "dragon"), name="dragon")

        @application.get("/favicon.svg", include_in_schema=False)
        def favicon():
            return FileResponse(dist / "favicon.svg")

        @application.get("/{path:path}", include_in_schema=False)
        def frontend(path: str):
            if path.startswith("api/"):
                raise AppError(404, "Không tìm thấy API.")
            return FileResponse(dist / "index.html")

    return application
