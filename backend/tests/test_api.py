import asyncio
import json

import pytest
from conftest import ORIGIN, PASSWORD, TEST_KEY, configure, setup
from fastapi.testclient import TestClient

from app.core.security import decrypt_key


def new_user(app, email="member@example.com"):
    client = TestClient(app, base_url=ORIGIN, headers={"Origin": ORIGIN})
    response = client.post(
        "/api/auth/register", json={"name": "Người dùng", "email": email, "password": PASSWORD}
    )
    assert response.status_code == 200, response.text
    client.headers["X-CSRF-Token"] = response.json()["csrf"]
    return client, response.json()["user"]


def conversation(client):
    response = client.post("/api/conversations", json={})
    assert response.status_code == 201, response.text
    return response.json()["conversation"]["id"]


def test_bootstrap_login_logout(system):
    _, client, _ = system
    assert client.get("/api/auth/status").json()["setupRequired"]
    setup(client)
    assert not client.get("/api/auth/status").json()["setupRequired"]
    assert (
        client.post(
            "/api/auth/setup", json={"name": "X", "email": "x@example.com", "password": PASSWORD}
        ).status_code
        == 409
    )
    assert client.get("/api/me").json()["user"]["role"] == "admin"
    assert "HttpOnly" in client.cookies.get("longvan_session", "") or client.cookies.get(
        "longvan_session"
    )
    assert client.post("/api/auth/logout").status_code == 200
    assert client.get("/api/me").status_code == 401
    assert (
        client.post(
            "/api/auth/login", json={"email": "admin@example.com", "password": "wrong"}
        ).status_code
        == 401
    )
    response = client.post(
        "/api/auth/login", json={"email": "ADMIN@example.com", "password": PASSWORD}
    )
    assert response.status_code == 200
    assert "HttpOnly" in response.headers["set-cookie"]
    assert "samesite=lax" in response.headers["set-cookie"].lower()


def test_csrf_origin_roles_and_ownership(admin):
    app, client, _ = admin
    user_client, _ = new_user(app)
    assert user_client.get("/api/admin/overview").status_code == 403
    owned = conversation(client)
    assert user_client.get(f"/api/conversations/{owned}").status_code == 404
    assert (
        user_client.patch(f"/api/conversations/{owned}", json={"title": "stolen"}).status_code
        == 404
    )
    assert user_client.get(f"/api/conversations/{owned}/export").status_code == 404
    assert (
        client.post("/api/conversations", json={}, headers={"X-CSRF-Token": "wrong"}).status_code
        == 403
    )
    assert (
        client.post(
            "/api/conversations", json={}, headers={"Origin": "https://evil.example"}
        ).status_code
        == 403
    )
    own_id = client.get("/api/me").json()["user"]["id"]
    assert client.patch(f"/api/admin/users/{own_id}", json={"role": "user"}).status_code == 400


def test_registration_validation_and_closed_registration(admin):
    _, client, _ = admin
    for payload in [
        {"name": "  ", "email": "a@example.com"},
        {"name": "Test", "email": "not-email"},
    ]:
        assert (
            client.post("/api/auth/register", json={**payload, "password": PASSWORD}).status_code
            == 400
        )
        assert client.post("/api/admin/users", json=payload).status_code == 400
    configure(client, registrationOpen=False)
    assert (
        client.post(
            "/api/auth/register", json={"name": "A", "email": "a@example.com", "password": PASSWORD}
        ).status_code
        == 403
    )


def test_admin_invite_reset_single_use_and_revoke(admin):
    app, client, _ = admin
    response = client.post(
        "/api/admin/users", json={"name": "Khách mời", "email": "invite@example.com"}
    )
    assert response.status_code == 201
    token = response.json()["resetPath"].split("reset=")[1]
    guest = TestClient(app, base_url=ORIGIN, headers={"Origin": ORIGIN})
    payload = {"token": token, "password": PASSWORD}
    assert guest.post("/api/auth/reset", json=payload).status_code == 200
    assert guest.post("/api/auth/reset", json=payload).status_code == 400
    assert (
        guest.post(
            "/api/auth/login", json={"email": "invite@example.com", "password": PASSWORD}
        ).status_code
        == 200
    )
    user_id = response.json()["user"]["id"]
    assert client.post(f"/api/admin/users/{user_id}/sessions").status_code == 200
    assert guest.get("/api/me").status_code == 401


def test_password_change_and_profile(admin):
    app, client, _ = admin
    user_client, user = new_user(app)
    assert (
        user_client.patch("/api/profile", json={"name": "  Tên mới  "}).json()["user"]["name"]
        == "Tên mới"
    )
    assert (
        user_client.post(
            "/api/profile/password", json={"currentPassword": "wrong", "password": PASSWORD + "x"}
        ).status_code
        == 400
    )
    response = user_client.post(
        "/api/profile/password", json={"currentPassword": PASSWORD, "password": PASSWORD + "x"}
    )
    assert response.status_code == 200
    assert user_client.get("/api/me").status_code == 200
    assert (
        client.patch(f"/api/admin/users/{user['id']}", json={"status": "suspended"}).status_code
        == 200
    )
    assert user_client.get("/api/me").status_code == 401
    assert (
        user_client.post(
            "/api/auth/login", json={"email": user["email"], "password": PASSWORD + "x"}
        ).status_code
        == 403
    )


def test_config_encryption_public_fields_models_and_provider_errors(admin):
    app, client, provider = admin
    configure(client)
    stored = app.state.services.configuration.value("openrouter_key")
    assert TEST_KEY not in stored
    assert decrypt_key(stored, app.state.services.settings.app_secret) == TEST_KEY
    assert TEST_KEY not in client.get("/api/admin/config").text
    public = client.get("/api/me").json()["config"]
    assert "systemPrompt" not in public and "apiKey" not in public
    assert client.get("/api/admin/connection").status_code == 200
    models = client.get("/api/admin/models").json()["items"]
    assert len(models) == 2 and all(m["id"].endswith(":free") for m in models)
    assert (
        client.patch("/api/admin/config", json={"config": {"chatModel": "paid/model"}}).status_code
        == 400
    )
    assert (
        client.patch("/api/admin/config", json={"config": {"maxTokens": 9000}}).status_code == 400
    )
    provider.status = 401
    error = client.get("/api/admin/connection")
    assert error.status_code == 502 and TEST_KEY not in error.text


def test_streaming_chat_persists_vietnamese_and_counts_usage(admin):
    app, client, provider = admin
    configure(client)
    cid = conversation(client)
    response = client.post(f"/api/conversations/{cid}/messages", json={"content": "Chào rồng"})
    assert response.status_code == 200
    assert "event: delta" in response.text and "Tiếng Việt rõ ràng." in response.text
    assert "event: done" in response.text
    detail = client.get(f"/api/conversations/{cid}").json()
    assert [m["role"] for m in detail["messages"]] == ["user", "assistant"]
    assert detail["conversation"]["title"] == "Chào rồng"
    assert not detail["inFlight"]
    assert client.get("/api/usage").json()["used"] == 1
    payload = json.loads(provider.requests[-1].content)
    assert payload["reasoning"] == {"effort": "minimal"}
    assert payload["messages"][-1]["content"] == "Chào rồng"


@pytest.mark.parametrize("failure", ["upstream", "empty"])
def test_failed_chat_refunds_quota_and_unlocks(admin, failure):
    app, client, provider = admin
    configure(client)
    cid = conversation(client)
    if failure == "upstream":
        provider.status = 429
    else:
        provider.empty = True
    response = client.post(f"/api/conversations/{cid}/messages", json={"content": "Xin chào"})
    assert response.status_code == (429 if failure == "upstream" else 200)
    assert TEST_KEY not in response.text
    assert client.get("/api/usage").json()["used"] == 0
    assert not app.state.services.usage.in_flight(client.get("/api/me").json()["user"]["id"])
    if failure == "empty":
        assert "event: error" in response.text


def test_quota_locking_and_zero_quota(admin):
    app, client, _ = admin
    configure(client)
    member, user = new_user(app)
    cid = conversation(member)
    assert client.patch(f"/api/admin/users/{user['id']}", json={"quota": 1}).status_code == 200
    assert (
        member.post(f"/api/conversations/{cid}/messages", json={"content": "Một"}).status_code
        == 200
    )
    assert (
        member.post(f"/api/conversations/{cid}/messages", json={"content": "Hai"}).status_code
        == 429
    )
    client.patch(f"/api/admin/users/{user['id']}", json={"quota": 0})
    assert member.post("/api/tts", json={"sample": True}).status_code == 429


def test_speech_ownership_and_engine_settings(admin):
    app, client, _ = admin
    configure(client)
    cid = conversation(client)
    client.post(f"/api/conversations/{cid}/messages", json={"content": "Chào"})
    messages = client.get(f"/api/conversations/{cid}").json()["messages"]
    response = client.post("/api/tts", json={"messageId": messages[1]["id"]})
    assert response.status_code == 200 and response.content.startswith(b"ID3")
    assert client.post("/api/tts", json={"messageId": messages[0]["id"]}).status_code == 404
    member, _ = new_user(app)
    assert member.post("/api/tts", json={"messageId": messages[1]["id"]}).status_code == 404
    assert client.post("/api/tts", json={"sample": True}).status_code == 200
    configure(client, ttsEngine="browser")
    assert client.post("/api/tts", json={"sample": True}).status_code == 400


def test_archive_restore_rename_and_export(admin):
    _, client, _ = admin
    configure(client)
    cid = conversation(client)
    assert (
        client.patch(f"/api/conversations/{cid}", json={"title": "Tên câu chuyện"}).status_code
        == 200
    )
    assert client.delete(f"/api/conversations/{cid}").status_code == 200
    assert not client.get("/api/conversations").json()["items"]
    assert client.get("/api/conversations?archived=true").json()["items"][0]["id"] == cid
    assert (
        client.post(
            f"/api/conversations/{cid}/messages", json={"content": "Không thể gửi"}
        ).status_code
        == 400
    )
    assert client.patch(f"/api/conversations/{cid}", json={"archived": False}).status_code == 200
    exported = client.get(f"/api/conversations/{cid}/export")
    assert (
        exported.status_code == 200 and exported.json()["conversation"]["title"] == "Tên câu chuyện"
    )


def test_history_pagination_export_and_admin_review(admin):
    app, client, _ = admin
    cid = conversation(client)
    repo = app.state.services.conversations
    for index in range(205):
        repo.append(cid, "assistant", f"Tin thứ {index}")
    latest = client.get(f"/api/conversations/{cid}").json()
    assert latest["hasMore"] and len(latest["messages"]) == 100
    assert latest["messages"][0]["content"] == "Tin thứ 105"
    older = client.get(f"/api/conversations/{cid}?before={latest['before']}").json()
    assert older["messages"][0]["content"] == "Tin thứ 5"
    assert len(client.get(f"/api/conversations/{cid}/export").json()["messages"]) == 205
    review = client.get(f"/api/admin/conversations/{cid}").json()
    assert len(review["messages"]) == 100
    assert any(
        a["action"] == "conversation.admin_read"
        for a in client.get("/api/admin/audit").json()["items"]
    )
    assert client.get(f"/api/conversations/{cid}?before=invalid").status_code == 400


def test_admin_lists_search_and_pagination(admin):
    app, client, _ = admin
    for index in range(54):
        app.state.services.users.create(f"Member {index}", f"test{index}@example.com", "user", 60)
    assert len(client.get("/api/admin/users").json()["items"]) == 51
    assert len(client.get("/api/admin/users?offset=50").json()["items"]) == 5
    assert len(client.get("/api/admin/users?q=test12").json()["items"]) == 1
    assert client.get("/api/admin/overview").json()["stats"]["users"] == 55


def test_stream_cancellation_preserves_partial_and_releases_lock(admin):
    app, client, _ = admin
    configure(client)
    service = app.state.services
    user = service.db.one("SELECT * FROM users LIMIT 1")
    cid = conversation(client)

    async def simulate():
        response = await service.chat.reply(
            user, service.conversations.owned(cid, user), "Xin chào"
        )
        iterator = response.body_iterator
        assert "event: meta" in await iterator.__anext__()
        assert "event: delta" in await iterator.__anext__()
        task = asyncio.current_task()
        # A disconnected streaming consumer injects CancelledError into the generator.
        with pytest.raises(asyncio.CancelledError):
            await iterator.athrow(asyncio.CancelledError())
        assert not task.cancelled()

    asyncio.run(simulate())
    rows = service.conversations.history(cid)["messages"]
    assert rows[-1]["role"] == "assistant" and rows[-1]["status"] == "interrupted"
    assert rows[-1]["content"] == "Xin chào "
    assert not service.usage.in_flight(user["id"])
