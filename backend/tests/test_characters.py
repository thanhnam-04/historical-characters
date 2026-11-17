import json
import struct

import pytest
from test_api import new_user


def glb(document=None):
    document = document or {
        "asset": {"version": "2.0"},
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0}],
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0}}]}],
    }
    content = json.dumps(document).encode()
    content += b" " * (-len(content) % 4)
    return (
        struct.pack("<4sII", b"glTF", 2, 20 + len(content))
        + struct.pack("<II", len(content), 0x4E4F534A)
        + content
    )


def test_library_upload_preview_activate_restore_delete(admin):
    app, client, _ = admin
    initial = client.get("/api/admin/characters").json()
    assert initial["activeId"] == "default"
    response = client.post("/api/admin/characters?name=Nhân%20vật", content=glb())
    assert response.status_code == 201, response.text
    item = response.json()
    assert item["name"] == "Nhân vật"
    assert client.get(item["url"]).content == glb()
    assert client.patch("/api/admin/characters/active", json={"id": item["id"]}).status_code == 200
    assert client.get("/api/character").json()["id"] == item["id"]
    assert client.delete("/api/admin/characters/" + item["id"]).status_code == 400
    assert client.delete("/api/admin/characters/default").status_code == 400
    client.patch("/api/admin/characters/active", json={"id": "default"})
    assert client.delete("/api/admin/characters/" + item["id"]).status_code == 200
    assert client.get(item["url"]).status_code == 404
    assert not list(app.state.services.characters.directory.glob("*"))


def test_only_admin_can_manage_characters_and_csrf_is_required(admin):
    app, client, _ = admin
    member, _ = new_user(app)
    for method, path in [
        ("get", "/api/admin/characters"),
        ("post", "/api/admin/characters"),
        ("patch", "/api/admin/characters/active"),
        ("delete", "/api/admin/characters/default"),
    ]:
        assert (
            member.request(method, path, content=glb() if method == "post" else None).status_code
            == 403
        )
    assert member.get("/api/character").status_code == 200
    assert (
        client.post(
            "/api/admin/characters", content=glb(), headers={"X-CSRF-Token": "wrong"}
        ).status_code
        == 403
    )


@pytest.mark.parametrize(
    "content", [b"not a model", b"glTF" + bytes(40), glb({"asset": {"version": "2.0"}})]
)
def test_malformed_glb_is_rejected_and_temporary_files_are_removed(admin, content):
    app, client, _ = admin
    assert client.post("/api/admin/characters", content=content).status_code == 400
    assert not list(app.state.services.characters.directory.glob("*"))


@pytest.mark.parametrize(
    "change",
    [
        {"buffers": [{"uri": "https://example.com/data.bin"}]},
        {"images": [{"uri": "file:///secret.png"}]},
        {"extensionsUsed": ["KHR_draco_mesh_compression"]},
    ],
)
def test_external_resources_and_unsupported_compression_are_rejected(admin, change):
    _, client, _ = admin
    document = {"asset": {"version": "2.0"}, "scenes": [{}], "meshes": [{}], **change}
    assert client.post("/api/admin/characters", content=glb(document)).status_code == 400


def test_upload_limit_and_invalid_selection(admin, monkeypatch):
    app, client, _ = admin
    monkeypatch.setattr("app.services.characters.MAX_BYTES", 30)
    assert client.post("/api/admin/characters", content=glb()).status_code == 413
    assert not list(app.state.services.characters.directory.glob("*"))
    assert client.patch("/api/admin/characters/active", json={"id": "missing"}).status_code == 404
