from fastapi import APIRouter, Depends, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.api.dependencies import require_admin, require_user, services

router = APIRouter(tags=["3D characters"])


class Selection(BaseModel):
    id: str = Field(max_length=36)


@router.get("/character")
def active_character(request: Request, user=Depends(require_user)):
    return services(request).characters.active()


@router.get("/characters/{character_id}/model")
def model(character_id: str, request: Request, user=Depends(require_user)):
    library = services(request).characters
    library.get(character_id)
    if character_id == "default":
        return FileResponse(
            services(request).settings.frontend_dist / "dragon/assets/dragon.glb",
            media_type="model/gltf-binary",
        )
    return FileResponse(
        library.directory / (character_id + ".glb"),
        media_type="model/gltf-binary",
        headers={"Cache-Control": "private, max-age=86400"},
    )


@router.get("/admin/characters")
def library(request: Request, user=Depends(require_admin)):
    return services(request).characters.list()


@router.post("/admin/characters", status_code=201)
async def upload(request: Request, user=Depends(require_admin)):
    services(request).usage.rate("model-upload:" + user["id"], 10, 3600)
    return await services(request).characters.upload(request, user)


@router.patch("/admin/characters/active")
def activate(payload: Selection, request: Request, user=Depends(require_admin)):
    services(request).characters.activate(payload.id, user)
    return {"ok": True}


@router.delete("/admin/characters/{character_id}")
def delete(character_id: str, request: Request, user=Depends(require_admin)):
    services(request).characters.delete(character_id, user)
    return {"ok": True}
