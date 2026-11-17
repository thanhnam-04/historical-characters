import asyncio
from types import SimpleNamespace

import httpx

from app.services.openrouter import OpenRouter


def test_catalog_merges_tts_voices_and_can_show_paid_choices_without_enabling_them():
    configuration = SimpleNamespace(get=lambda: SimpleNamespace(freeOnly=True))

    def handle(request):
        if request.url.params.get("output_modalities") == "speech":
            return httpx.Response(
                200,
                json={
                    "data": [
                        {
                            "id": "voice/free:free",
                            "architecture": {"output_modalities": ["speech"]},
                            "supported_voices": ["Nadine"],
                        },
                        {
                            "id": "voice/paid",
                            "architecture": {"output_modalities": ["speech"]},
                            "supported_voices": ["Sulafat", {"bad": "value"}],
                        },
                    ]
                },
            )
        return httpx.Response(
            200, json={"data": [{"id": "openrouter/free"}, {"id": "openai/gpt-test"}]}
        )

    async def run():
        async with httpx.AsyncClient(
            base_url="https://openrouter.ai/api/v1", transport=httpx.MockTransport(handle)
        ) as client:
            provider = OpenRouter(client, configuration)
            free = await provider.models()
            assert {item["id"] for item in free} == {"openrouter/free", "voice/free:free"}
            all_models = await provider.models(include_paid=True)
            assert len(all_models) == 4
            assert next(item for item in all_models if item["id"] == "voice/paid")["voices"] == [
                "Sulafat"
            ]
            assert configuration.get().freeOnly is True

    asyncio.run(run())
