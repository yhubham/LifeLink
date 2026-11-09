import base64
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from pwdlib import PasswordHash

from app.core.config import settings

_password_hash = PasswordHash.recommended()


def hash_password(password: str) -> str:
    return _password_hash.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return _password_hash.verify(password, password_hash)


def create_access_token(
    subject: str, role: str, expires_minutes: int | None = None
) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=expires_minutes or settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = {"sub": subject, "role": role, "exp": expire}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    payload = jwt.decode(
        token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM]
    )
    # Ticket tokens are signed with the same secret but are only valid for
    # their public ticket/media endpoints. They must never authenticate staff.
    if payload.get("scope") == "ticket":
        raise ValueError("Ticket tokens cannot be used as access tokens")
    return payload


# --- Public ticket access -------------------------------------------------
# The reporter receives a high-entropy token and a short PIN once. Only their
# hashes are stored. The token authorizes media uploads; the PIN can be
# exchanged for a short-lived signed ticket token on any device.


def new_ticket_token() -> str:
    return secrets.token_urlsafe(32)


def new_ticket_pin() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_token(token: str) -> str:
    """Keyed hash so a database leak alone cannot replay access tokens."""
    return hmac.new(
        settings.JWT_SECRET.encode(), token.encode(), hashlib.sha256
    ).hexdigest()


def verify_token(token: str, stored_hash: str | None) -> bool:
    if not token or not stored_hash:
        return False
    return hmac.compare_digest(hash_token(token), stored_hash)


def hash_pin(pin: str) -> str:
    return _password_hash.hash(pin)


def verify_pin(pin: str, stored_hash: str | None) -> bool:
    if not pin or not stored_hash:
        return False
    try:
        return _password_hash.verify(pin, stored_hash)
    except Exception:  # noqa: BLE001 - malformed hash
        return False


def create_ticket_token(
    incident_id: str,
    public_code: str,
    expires_minutes: int | None = None,
) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=expires_minutes or settings.TICKET_TOKEN_EXPIRE_MINUTES
    )
    payload = {
        "sub": incident_id,
        "code": public_code,
        "scope": "ticket",
        "exp": expire,
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_ticket_token(token: str) -> dict:
    payload = jwt.decode(
        token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM]
    )
    if payload.get("scope") != "ticket":
        raise ValueError("Not a ticket token")
    return payload


# --- TURN credentials -----------------------------------------------------


def turn_ice_servers(user_id: str) -> list[dict]:
    """Build the ICE server list for a browser.

    With ``TURN_SECRET`` configured, credentials follow the coturn REST API
    convention (``expiry:user`` + HMAC-SHA1) so no static TURN password is
    shipped to the client.
    """
    servers: list[dict] = [
        {"urls": [url.strip() for url in settings.STUN_URLS.split(",") if url.strip()]}
    ]
    turn_urls = [url.strip() for url in settings.TURN_URLS.split(",") if url.strip()]
    if not turn_urls:
        return servers
    if settings.TURN_SECRET:
        expiry = int(datetime.now(timezone.utc).timestamp()) + settings.TURN_TTL_SECONDS
        username = f"{expiry}:{user_id}"
        digest = hmac.new(
            settings.TURN_SECRET.encode(), username.encode(), hashlib.sha1
        ).digest()
        credential = base64.b64encode(digest).decode()
        servers.append(
            {"urls": turn_urls, "username": username, "credential": credential}
        )
    elif settings.TURN_USERNAME and settings.TURN_CREDENTIAL:
        servers.append(
            {
                "urls": turn_urls,
                "username": settings.TURN_USERNAME,
                "credential": settings.TURN_CREDENTIAL,
            }
        )
    return servers

