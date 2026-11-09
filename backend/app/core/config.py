from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    APP_NAME: str = "LifeLink"
    DEBUG: bool = True

    DATABASE_URL: str = (
        "postgresql+psycopg://lifelink_user:lifelink_dev_password"
        "@localhost:5433/lifelink"
    )

    JWT_SECRET: str = "dev-secret-change-me"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    FRONTEND_URL: str = "http://localhost:5173"

    # --- Public hospital discovery (OpenStreetMap / Overpass) -------------
    OVERPASS_API_URL: str = "https://overpass-api.de/api/interpreter"
    OVERPASS_TIMEOUT_SECONDS: float = 12.0
    OVERPASS_CACHE_SECONDS: int = 120
    HOSPITAL_DISCOVERY_RADIUS_M: int = 8000
    HOSPITAL_DISCOVERY_LIMIT: int = 25

    # --- Secure tickets / media -------------------------------------------
    TICKET_TOKEN_EXPIRE_MINUTES: int = 60 * 24
    MEDIA_STORAGE_DIR: str = "storage/incidents"
    MEDIA_MAX_BYTES: int = 10 * 1024 * 1024
    MEDIA_ALLOWED_TYPES: str = "image/jpeg,image/png,image/webp"

    # --- WebRTC voice ------------------------------------------------------
    STUN_URLS: str = "stun:stun.l.google.com:19302"
    # Static TURN fallback (leave blank when using TURN_SECRET).
    TURN_URLS: str = ""
    TURN_USERNAME: str = ""
    TURN_CREDENTIAL: str = ""
    # coturn REST API shared secret. When set, short-lived credentials are
    # minted per user instead of exposing a static TURN password.
    TURN_SECRET: str = ""
    TURN_TTL_SECONDS: int = 3600


settings = Settings()
