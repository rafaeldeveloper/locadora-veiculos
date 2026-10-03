"""Popula o banco com veículos e regras de desconto de exemplo."""

from decimal import Decimal

from sqlalchemy import select

from app.database import Base, SessionLocal, engine
from app.main import ensure_admin
from app.models import PricingRule, Vehicle
from app.services import to_cents

VEHICLES = [
    ("RIO2A19", "Fiat", "Mobi", 2024, "economico", "Branco", 5, "manual", "flex", "119.90"),
    ("SPX3B21", "Renault", "Kwid", 2023, "economico", "Prata", 5, "manual", "flex", "109.90"),
    ("BRA4C55", "Chevrolet", "Onix Plus", 2024, "intermediario", "Cinza", 5, "automatico", "flex", "169.90"),
    ("MGS5D67", "Hyundai", "HB20S", 2024, "intermediario", "Preto", 5, "automatico", "flex", "159.90"),
    ("PRN6E88", "Jeep", "Compass", 2024, "suv", "Preto", 5, "automatico", "flex", "289.90"),
    ("SCX7F10", "Toyota", "Corolla Cross", 2025, "suv", "Branco", 5, "automatico", "hibrido", "319.90"),
    ("CWB8G32", "BMW", "320i", 2024, "executivo", "Azul", 5, "automatico", "gasolina", "549.90"),
    ("FLN9H43", "Fiat", "Strada", 2024, "utilitario", "Vermelho", 2, "manual", "flex", "189.90"),
]

RULES = [(7, 10), (15, 15), (30, 25)]


def main() -> None:
    Base.metadata.create_all(engine)
    ensure_admin()
    with SessionLocal() as db:
        for plate, brand, model, year, category, color, seats, transmission, fuel, rate in VEHICLES:
            if db.scalar(select(Vehicle).where(Vehicle.plate == plate)):
                continue
            db.add(
                Vehicle(
                    plate=plate, brand=brand, model=model, year=year, category=category, color=color,
                    seats=seats, transmission=transmission, fuel=fuel, daily_rate_cents=to_cents(Decimal(rate)),
                )
            )
        for min_days, discount in RULES:
            if not db.scalar(select(PricingRule).where(PricingRule.min_days == min_days)):
                db.add(PricingRule(min_days=min_days, discount_percent=discount))
        db.commit()
    print("Dados de exemplo carregados.")


if __name__ == "__main__":
    main()
