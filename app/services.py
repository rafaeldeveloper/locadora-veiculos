from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import PricingRule, Rental, Vehicle

BLOCKING_STATUSES = ("reserved", "active")


@dataclass
class Quote:
    days: int
    daily_rate_cents: int
    subtotal_cents: int
    discount_percent: int
    total_cents: int


def to_cents(value: Decimal) -> int:
    return int((value * 100).quantize(Decimal("1")))


def rental_days(start: date, end: date) -> int:
    days = (end - start).days
    if days < 1:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "A devolução deve ser depois da retirada")
    return days


def calculate_quote(db: Session, vehicle: Vehicle, start: date, end: date) -> Quote:
    days = rental_days(start, end)
    discount = db.scalar(
        select(PricingRule.discount_percent)
        .where(PricingRule.min_days <= days)
        .order_by(PricingRule.min_days.desc())
        .limit(1)
    ) or 0
    subtotal = vehicle.daily_rate_cents * days
    total = subtotal - subtotal * discount // 100
    return Quote(days, vehicle.daily_rate_cents, subtotal, discount, total)


def is_available(db: Session, vehicle_id: int, start: date, end: date) -> bool:
    conflict = db.scalar(
        select(Rental.id)
        .where(
            Rental.vehicle_id == vehicle_id,
            Rental.status.in_(BLOCKING_STATUSES),
            Rental.start_date < end,
            Rental.end_date > start,
        )
        .limit(1)
    )
    return conflict is None
