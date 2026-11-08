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


settings = Settings()
