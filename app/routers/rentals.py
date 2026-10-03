from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Rental, User
from app.routers.vehicles import get_vehicle_or_404
from app.schemas import QuoteIn, QuoteOut, RentalCreate, RentalOut, cents_to_reais
from app.services import calculate_quote, is_available

router = APIRouter(prefix="/api/rentals", tags=["rentals"])


@router.post("/quote", response_model=QuoteOut)
def quote(data: QuoteIn, db: Session = Depends(get_db)):
    vehicle = get_vehicle_or_404(db, data.vehicle_id)
    q = calculate_quote(db, vehicle, data.start_date, data.end_date)
    return QuoteOut(
        vehicle_id=vehicle.id,
        start_date=data.start_date,
        end_date=data.end_date,
        days=q.days,
        daily_rate=cents_to_reais(q.daily_rate_cents),
        subtotal=cents_to_reais(q.subtotal_cents),
        discount_percent=q.discount_percent,
        total=cents_to_reais(q.total_cents),
        available=vehicle.status == "available"
        and is_available(db, vehicle.id, data.start_date, data.end_date),
    )


@router.post("", response_model=RentalOut, status_code=status.HTTP_201_CREATED)
def create_rental(data: RentalCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if data.start_date < date.today():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "A retirada não pode ser no passado")
    if not user.driver_license:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Cadastre sua CNH no perfil antes de reservar")
    vehicle = get_vehicle_or_404(db, data.vehicle_id)
    if vehicle.status != "available":
        raise HTTPException(status.HTTP_409_CONFLICT, "Veículo indisponível para locação")
    q = calculate_quote(db, vehicle, data.start_date, data.end_date)
    if not is_available(db, vehicle.id, data.start_date, data.end_date):
        raise HTTPException(status.HTTP_409_CONFLICT, "Veículo já reservado neste período")
    rental = Rental(
        user_id=user.id,
        vehicle_id=vehicle.id,
        start_date=data.start_date,
        end_date=data.end_date,
        days=q.days,
        daily_rate_cents=q.daily_rate_cents,
        discount_percent=q.discount_percent,
        total_cents=q.total_cents,
    )
    db.add(rental)
    db.commit()
    db.refresh(rental)
    return rental


@router.get("/mine", response_model=list[RentalOut])
def my_rentals(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return list(db.scalars(select(Rental).where(Rental.user_id == user.id).order_by(Rental.start_date.desc())))


@router.post("/{rental_id}/cancel", response_model=RentalOut)
def cancel_rental(rental_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rental = db.get(Rental, rental_id)
    if rental is None or (rental.user_id != user.id and user.role != "admin"):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Locação não encontrada")
    if rental.status != "reserved":
        raise HTTPException(status.HTTP_409_CONFLICT, "Só reservas ainda não retiradas podem ser canceladas")
    rental.status = "cancelled"
    db.commit()
    return rental
