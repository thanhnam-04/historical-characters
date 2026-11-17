"""Isolated SQLite databases and a fake OpenRouter; tests never spend credits."""

import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app

PASSWORD = "Test-password-123!"
ORIGIN = "http://localhost"
TEST_KEY = "sk-or-v1-test-only-not-a-real-key"


class ProviderStub:
    status = 200
    empty = False
    requests = None

    def __init__(self):
        self.requests = []

    async def __call__(self, request):
        self.requests.append(request)
        assert request.url.host == "openrouter.ai"
        assert request.url.path.startswith("/api/v1/")
        if self.status != 200:
            return httpx.Response(self.status, json={"error": {"message": TEST_KEY}})
        if request.url.path.endswith("/key"):
            return httpx.Response(200, json={"data": {"label": "test"}})
        if request.url.path.endswith("/models"):
            return httpx.Response(
                200,
                json={
                    "data": [
                        {"id": "demo/text:free", "name": "Free text"},
                        {"id": "demo/paid", "name": "Paid text"},
                        {"id": "demo/voice:free", "architecture": {"output_modalities": ["audio"]}},
                    ]
                },
            )
        if request.url.path.endswith("/audio/speech"):
            return httpx.Response(
                200, content=b"ID3" + bytes(100), headers={"content-type": "audio/mpeg"}
            )
        payload = json.loads(request.content)
        assert payload["stream"] is True
        pieces = [] if self.empty else ["Xin chào ", "bạn! Tiếng Việt rõ ràng."]
        sse = "".join(
            "data: "
            + json.dumps({"choices": [{"delta": {"content": text}}]}, ensure_ascii=False)
            + "\n\n"
            for text in pieces
        )
        return httpx.Response(
            200, text=sse + "data: [DONE]\n\n", headers={"content-type": "text/event-stream"}
        )


@pytest.fixture
def system(tmp_path):
    provider = ProviderStub()
    settings = Settings(
        tmp_path / "test.sqlite3", "test-secret-" * 8, ORIGIN, frontend_dist=tmp_path / "no-build"
    )
    app = create_app(settings, httpx.MockTransport(provider))
    with TestClient(app, base_url=ORIGIN, headers={"Origin": ORIGIN}) as client:
        yield app, client, provider


def setup(client):
    response = client.post(
        "/api/auth/setup",
        json={"name": "Admin thử nghiệm", "email": "admin@example.com", "password": PASSWORD},
    )
    assert response.status_code == 200, response.text
    client.headers["X-CSRF-Token"] = response.json()["csrf"]
    return response.json()["user"]


def configure(client, **config):
    response = client.patch("/api/admin/config", json={"apiKey": TEST_KEY, "config": config})
    assert response.status_code == 200, response.text


@pytest.fixture
def admin(system):
    setup(system[1])
    return system
