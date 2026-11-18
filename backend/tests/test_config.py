from app.core.config import Settings


def test_plain_postgres_urls_are_rewritten_to_psycopg():
    normalize = Settings._normalize_database_url

    assert (
        normalize("postgresql://user:pass@host.example/db")
        == "postgresql+psycopg://user:pass@host.example/db"
    )
    assert (
        normalize("postgres://user:pass@host.example/db")
        == "postgresql+psycopg://user:pass@host.example/db"
    )
    assert (
        normalize("postgresql+psycopg://user:pass@host.example/db")
        == "postgresql+psycopg://user:pass@host.example/db"
    )
    assert normalize("sqlite:///:memory:") == "sqlite:///:memory:"


def test_database_url_is_stripped():
    assert (
        Settings._normalize_database_url("  postgresql://user:pass@host/db  ")
        == "postgresql+psycopg://user:pass@host/db"
    )
