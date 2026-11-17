"""Request validation. API field names stay compatible with the React client."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class UserIdentity(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    email: str = Field(max_length=254)

    @field_validator("email")
    @classmethod
    def email_address(cls, value):
        import re

        value = value.strip().lower()
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
            raise ValueError("Email không hợp lệ.")
        return value

    @field_validator("name")
    @classmethod
    def display_name(cls, value):
        if not value.strip():
            raise ValueError("Tên không được để trống.")
        return value.strip()


class Registration(UserIdentity):
    password: str = Field(min_length=12, max_length=128)


class Login(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(max_length=128)


class ResetPassword(BaseModel):
    token: str = Field(max_length=128)
    password: str = Field(min_length=12, max_length=128)


class ChangePassword(BaseModel):
    currentPassword: str = Field(max_length=128)
    password: str = Field(min_length=12, max_length=128)


class ProfileUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class ConversationCreate(BaseModel):
    title: str = Field(default="Cuộc trò chuyện mới", max_length=100)


class ConversationUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=100)
    archived: bool | None = None


class ChatMessage(BaseModel):
    content: str = Field(min_length=1, max_length=4000)


class SpeechRequest(BaseModel):
    messageId: str | None = None
    sample: bool = False


class UserCreate(UserIdentity):
    role: Literal["admin", "user"] = "user"


class UserUpdate(BaseModel):
    role: Literal["admin", "user"] | None = None
    status: Literal["active", "suspended"] | None = None
    quota: int | None = Field(default=None, ge=0, le=10000)


class AIConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    appName: str = Field(default="Historical Characters", min_length=1, max_length=80)
    welcome: str = Field(default="Mình nghe đây. Bạn muốn kể chuyện gì hôm nay?", max_length=400)
    chatModel: str = Field(default="openrouter/free", min_length=1, max_length=160)
    ttsModel: str = Field(default="fish-audio/s2.1-pro-free:free", max_length=160)
    ttsVoice: str = Field(default="", max_length=160)
    ttsEngine: Literal["openrouter", "browser", "off"] = "openrouter"
    systemPrompt: str = Field(
        default="Bạn là Long Vân, người bạn rồng thân thiện. Trả lời tiếng Việt rõ ràng, ấm áp, thường từ 2 đến 5 câu. Không giả vờ là người thật hoặc đã làm thao tác ngoài cuộc trò chuyện. Hạn chế Markdown vì câu trả lời có thể được đọc thành tiếng.",
        min_length=1,
        max_length=6000,
    )
    dailyQuota: int = Field(default=60, ge=1, le=10000)
    registrationOpen: bool = True
    ttsEnabled: bool = True
    freeOnly: bool = True
    maxTokens: int = Field(default=700, ge=50, le=2000)


class ConfigUpdate(BaseModel):
    config: dict = Field(default_factory=dict)
    apiKey: str | None = Field(default=None, max_length=512)
    clearKey: bool = False
