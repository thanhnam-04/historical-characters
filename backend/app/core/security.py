"""Keep legacy passwords, sessions and encrypted keys readable during migration."""

import hashlib
import hmac
import secrets

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def token() -> str:
    return secrets.token_hex(32)


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def password_hash(password: str, secret: str, iterations: int = 600_000) -> str:
    salt = secrets.token_hex(32)
    peppered = hmac.new(secret.encode(), password.encode(), hashlib.sha256).hexdigest()
    result = hashlib.pbkdf2_hmac("sha256", peppered.encode(), bytes.fromhex(salt), iterations)
    return f"pbkdf2${iterations}${salt}${result.hex()}"


def verify_password(password: str, stored: str | None, secret: str) -> bool:
    try:
        algorithm, count, salt, expected = (stored or "").split("$")
        iterations = int(count)
        if algorithm != "pbkdf2" or iterations not in (100_000, 600_000):
            return False
        peppered = hmac.new(secret.encode(), password.encode(), hashlib.sha256).hexdigest()
        actual = hashlib.pbkdf2_hmac(
            "sha256", peppered.encode(), bytes.fromhex(salt), iterations
        ).hex()
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def _cipher(secret: str) -> AESGCM:
    return AESGCM(hashlib.sha256(("long-van-api-key:" + secret).encode()).digest())


def encrypt_key(value: str, secret: str) -> str:
    nonce = secrets.token_bytes(12)
    return nonce.hex() + "." + _cipher(secret).encrypt(nonce, value.encode(), None).hex()


def decrypt_key(value: str, secret: str) -> str:
    nonce, payload = value.split(".", 1)
    return _cipher(secret).decrypt(bytes.fromhex(nonce), bytes.fromhex(payload), None).decode()
