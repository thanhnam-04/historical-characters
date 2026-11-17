"""The only module that sends the provider API key to OpenRouter."""

import httpx

from app.core.errors import AppError

ERRORS = {
    400: "Model không chấp nhận yêu cầu. Admin cần kiểm tra model hoặc mã giọng.",
    401: "API key OpenRouter không hợp lệ. Liên hệ quản trị viên.",
    402: "OpenRouter yêu cầu kiểm tra số dư hoặc hạn mức tài khoản.",
    403: "OpenRouter từ chối yêu cầu với model này.",
    404: "Model hiện không có sẵn. Admin cần chọn model khác.",
    429: "Model đang giới hạn lượt dùng. Hãy thử lại sau.",
}


class OpenRouter:
    def __init__(self, client: httpx.AsyncClient, configuration):
        self.client, self.configuration = client, configuration

    def headers(self):
        key = self.configuration.api_key()
        if not key:
            raise AppError(503, "Admin chưa kết nối OpenRouter.")
        return {"Authorization": "Bearer " + key, "X-OpenRouter-Title": "Historical Characters"}

    @staticmethod
    def check(response):
        if not response.is_success:
            raise AppError(
                429 if response.status_code == 429 else 502,
                ERRORS.get(response.status_code, "Dịch vụ AI đang gặp sự cố. Hãy thử lại sau."),
            )

    async def connection(self):
        response = await self.client.get("/key", headers=self.headers())
        self.check(response)
        return {
            "ok": True,
            "message": "OpenRouter đã xác thực API key. Sẵn sàng thử chat và giọng đọc.",
        }

    async def models(self, include_paid=False):
        import asyncio

        responses = await asyncio.gather(
            self.client.get("/models"), self.client.get("/models?output_modalities=speech")
        )
        merged = {}
        for response in responses:
            self.check(response)
            items = response.json().get("data")
            if not isinstance(items, list):
                raise AppError(502, "Danh sách model chưa hợp lệ.")
            for item in items:
                if isinstance(item, dict) and isinstance(item.get("id"), str):
                    merged[item["id"]] = item
        result = []
        for item in merged.values():
            free = item["id"] == "openrouter/free" or item["id"].endswith(":free")
            if not include_paid and self.configuration.get().freeOnly and not free:
                continue
            voices = item.get("supported_voices") or []
            if not isinstance(voices, list):
                voices = []
            result.append(
                {
                    "id": item["id"],
                    "name": item.get("name", item["id"]),
                    "output": item.get("architecture", {}).get("output_modalities", ["text"]),
                    "voices": [voice for voice in voices if isinstance(voice, str)],
                    "expires": item.get("expiration_date"),
                    "free": free,
                }
            )
        return result

    async def chat(self, config, messages):
        payload = {
            "model": config.chatModel,
            "messages": [{"role": "system", "content": config.systemPrompt}, *messages],
            "max_tokens": config.maxTokens,
            "stream": True,
        }
        if config.chatModel == "openrouter/free":
            payload["reasoning"] = {"effort": "minimal"}
        request = self.client.build_request(
            "POST", "/chat/completions", headers=self.headers(), json=payload
        )
        response = await self.client.send(request, stream=True)
        try:
            self.check(response)
        except BaseException:
            await response.aclose()
            raise
        return response

    async def speech(self, config, text):
        payload = {"model": config.ttsModel, "input": text, "response_format": "mp3"}
        if config.ttsVoice:
            payload["voice"] = config.ttsVoice
        response = await self.client.post("/audio/speech", headers=self.headers(), json=payload)
        self.check(response)
        if not 20 < len(response.content) <= 15 * 1024 * 1024:
            raise AppError(502, "Âm thanh trả về không hợp lệ.")
        return response.content, response.headers.get("content-type", "audio/mpeg")
