import uuid
from datetime import datetime, timezone
from enum import Enum

from sqlalchemy import Boolean, DateTime, Enum as SAEnum, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.session import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class UserRole(str, Enum):
    ADMIN = "ADMIN"
    AMBULANCE = "AMBULANCE"
    HOSPITAL = "HOSPITAL"
    POLICE = "POLICE"
    RESCUE = "RESCUE"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4
    )
    full_name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(Text)
    role: Mapped[UserRole] = mapped_column(SAEnum(UserRole), index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # Explicit dashboard grants. ``None`` means "the default for this role".
    # Admins may be granted more than one dashboard; other roles are limited to
    # their own dashboard by ``app.core.dashboards.allowed_dashboards``.
    dashboard_access: Mapped[list | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )

    @property
    def dashboards(self) -> list[str]:
        from app.core.dashboards import allowed_dashboards

        return allowed_dashboards(self)

    @property
    def default_dashboard(self) -> str:
        return self.dashboards[0]
