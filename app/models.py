from datetime import date, datetime, timezone

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(100))
    phone: Mapped[str | None] = mapped_column(String(30))
    cpf: Mapped[str | None] = mapped_column(String(14), unique=True)
    driver_license: Mapped[str | None] = mapped_column(String(20))
    role: Mapped[str] = mapped_column(String(20), default="customer")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    rentals: Mapped[list["Rental"]] = relationship(back_populates="user")


class Vehicle(Base):
    __tablename__ = "vehicles"

    id: Mapped[int] = mapped_column(primary_key=True)
    plate: Mapped[str] = mapped_column(String(10), unique=True, index=True)
    brand: Mapped[str] = mapped_column(String(60))
    model: Mapped[str] = mapped_column(String(60))
    year: Mapped[int] = mapped_column(Integer)
    category: Mapped[str] = mapped_column(String(20))
    color: Mapped[str | None] = mapped_column(String(30))
    seats: Mapped[int] = mapped_column(Integer, default=5)
    transmission: Mapped[str] = mapped_column(String(20), default="manual")
    fuel: Mapped[str] = mapped_column(String(20), default="flex")
    daily_rate_cents: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default="available")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    rentals: Mapped[list["Rental"]] = relationship(back_populates="vehicle")


class PricingRule(Base):
    __tablename__ = "pricing_rules"

    id: Mapped[int] = mapped_column(primary_key=True)
    min_days: Mapped[int] = mapped_column(Integer, unique=True)
    discount_percent: Mapped[int] = mapped_column(Integer)


class Rental(Base):
    __tablename__ = "rentals"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    vehicle_id: Mapped[int] = mapped_column(ForeignKey("vehicles.id"), index=True)
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    days: Mapped[int] = mapped_column(Integer)
    daily_rate_cents: Mapped[int] = mapped_column(Integer)
    discount_percent: Mapped[int] = mapped_column(Integer, default=0)
    total_cents: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default="reserved")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    user: Mapped[User] = relationship(back_populates="rentals")
    vehicle: Mapped[Vehicle] = relationship(back_populates="rentals")
