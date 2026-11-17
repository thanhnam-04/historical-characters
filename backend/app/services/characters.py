"""Local GLB library. Only self-contained glTF 2.0 files are accepted."""

import json
import struct

from app.core.errors import AppError
from app.database import new_id, now

MAX_BYTES = 100 * 1024 * 1024
BUILTIN = {
    "id": "default",
    "name": "Long Vân",
    "url": "/dragon/assets/dragon.glb",
    "bytes": 0,
    "builtin": True,
}


def validate_glb(path):
    raw = path.read_bytes()
    if len(raw) < 28 or struct.unpack_from("<4sII", raw) != (b"glTF", 2, len(raw)):
        raise AppError(400, "File không phải GLB 2.0 hợp lệ.")
    offset, document = 12, None
    try:
        while offset < len(raw):
            size, kind = struct.unpack_from("<II", raw, offset)
            offset += 8
            if size % 4 or offset + size > len(raw):
                raise ValueError()
            if document is None:
                if kind != 0x4E4F534A or size > 8 * 1024 * 1024:
                    raise ValueError()
                document = json.loads(raw[offset : offset + size])
            offset += size
        if (
            offset != len(raw)
            or not isinstance(document, dict)
            or document.get("asset", {}).get("version") != "2.0"
        ):
            raise ValueError()
        if (
            not document.get("meshes")
            or not document.get("scenes")
            or len(document.get("nodes", [])) > 20000
        ):
            raise ValueError()
        for resource in document.get("buffers", []) + document.get("images", []):
            if resource.get("uri"):
                raise AppError(
                    400, "Hãy xuất GLB có texture và dữ liệu nhúng, không tham chiếu file ngoài."
                )
        unsupported = {
            "KHR_draco_mesh_compression",
            "EXT_meshopt_compression",
            "KHR_texture_basisu",
        }
        if unsupported.intersection(document.get("extensionsUsed", [])):
            raise AppError(400, "Hãy xuất GLB không nén Draco, Meshopt hoặc KTX2.")
    except (ValueError, TypeError, KeyError, AttributeError, struct.error):
        raise AppError(400, "Cấu trúc GLB chưa hợp lệ hoặc không có mesh/scene.") from None


class CharacterService:
    def __init__(self, db):
        self.db = db
        self.directory = db.path.parent / "models"

    def get(self, character_id):
        if character_id == "default":
            return dict(BUILTIN)
        row = self.db.one("SELECT * FROM characters WHERE id=?", character_id)
        if not row:
            raise AppError(404, "Không tìm thấy nhân vật.")
        return {**row, "url": f"/api/characters/{row['id']}/model", "builtin": False}

    def active(self):
        row = self.db.one("SELECT value FROM settings WHERE key='active_character'")
        return self.get(row["value"] if row else "default")

    def list(self):
        rows = self.db.all("SELECT id FROM characters ORDER BY created_at DESC")
        return {
            "items": [dict(BUILTIN), *[self.get(row["id"]) for row in rows]],
            "activeId": self.active()["id"],
        }

    async def upload(self, request, actor):
        self.directory.mkdir(parents=True, exist_ok=True)
        character_id = new_id()
        temporary = self.directory / (character_id + ".part")
        destination = self.directory / (character_id + ".glb")
        name = request.query_params.get("name", "Nhân vật mới").strip()[:80] or "Nhân vật mới"
        size = 0
        try:
            with temporary.open("wb") as output:
                async for chunk in request.stream():
                    size += len(chunk)
                    if size > MAX_BYTES:
                        raise AppError(413, "Mô hình tối đa 100 MB.")
                    output.write(chunk)
            validate_glb(temporary)
            temporary.replace(destination)
            try:
                self.db.execute(
                    "INSERT INTO characters VALUES(?,?,?,?)", character_id, name, size, now()
                )
            except BaseException:
                destination.unlink(missing_ok=True)
                raise
        finally:
            temporary.unlink(missing_ok=True)
        self.db.audit(actor["id"], "character.upload", character_id, name=name)
        return self.get(character_id)

    def activate(self, character_id, actor):
        self.get(character_id)
        self.db.execute(
            "INSERT INTO settings VALUES('active_character',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
            character_id,
            now(),
        )
        self.db.audit(actor["id"], "character.activate", character_id)

    def delete(self, character_id, actor):
        if character_id == "default" or character_id == self.active()["id"]:
            raise AppError(
                400, "Chọn nhân vật khác trước khi xóa; nhân vật mặc định luôn được giữ."
            )
        self.get(character_id)
        self.db.execute("DELETE FROM characters WHERE id=?", character_id)
        (self.directory / (character_id + ".glb")).unlink(missing_ok=True)
        self.db.audit(actor["id"], "character.delete", character_id)
