"""Compatibility checks use fixed fake secrets, never a user's credentials."""

import hashlib
import hmac

from app.core.security import decrypt_key, encrypt_key, password_hash, verify_password


def test_legacy_password_format_is_still_supported():
    secret, password, salt = "old-secret-for-tests", "Mật-khẩu-123456", "12" * 32
    pepper = hmac.new(secret.encode(), password.encode(), hashlib.sha256).hexdigest()
    result = hashlib.pbkdf2_hmac("sha256", pepper.encode(), bytes.fromhex(salt), 100000).hex()
    legacy = f"pbkdf2$100000${salt}${result}"
    assert verify_password(password, legacy, secret)
    assert not verify_password("wrong", legacy, secret)
    assert not verify_password(password, legacy, "different-secret")


def test_new_password_and_encrypted_key_round_trip():
    stored = password_hash("long-password-for-tests", "secret")
    assert stored.startswith("pbkdf2$600000$")
    assert verify_password("long-password-for-tests", stored, "secret")
    for malformed in [None, "", "invalid", "pbkdf2$-1$12$00"]:
        assert not verify_password("password", malformed, "secret")
    encrypted = encrypt_key("sk-or-test", "test-secret")
    assert encrypted != "sk-or-test"
    assert decrypt_key(encrypted, "test-secret") == "sk-or-test"
