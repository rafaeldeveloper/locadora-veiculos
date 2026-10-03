from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_admin
from app.errors import FieldError
from app.models import Rental, Vehicle
from app.schemas import Category, VehicleCreate, VehicleOut, VehicleUpdate
from app.services import is_available, rental_days, to_cents

router = APIRouter(prefix="/api/vehicles", tags=["vehicles"])


def get_vehicle_or_404(db: Session, vehicle_id: int) -> Vehicle:
    vehicle = db.get(Vehicle, vehicle_id)
    if vehicle is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Veículo não encontrado")
    return vehicle


@router.get("", response_model=list[VehicleOut])
def list_vehicles(
    category: Category | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    include_unavailable: bool = Query(False, description="Inclui veículos em manutenção/inativos"),
    db: Session = Depends(get_db),
):
    query = select(Vehicle).order_by(Vehicle.daily_rate_cents, Vehicle.brand, Vehicle.model)
    if category:
        query = query.where(Vehicle.category == category)
    if not include_unavailable:
        query = query.where(Vehicle.status == "available")
    vehicles = list(db.scalars(query))
    if start_date and end_date:
        rental_days(start_date, end_date)
        vehicles = [v for v in vehicles if is_available(db, v.id, start_date, end_date)]
    return vehicles


@router.get("/{vehicle_id}", response_model=VehicleOut)
def get_vehicle(vehicle_id: int, db: Session = Depends(get_db)):
    return get_vehicle_or_404(db, vehicle_id)


@router.post("", response_model=VehicleOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_admin)])
def create_vehicle(data: VehicleCreate, db: Session = Depends(get_db)):
    if db.scalar(select(Vehicle).where(Vehicle.plate == data.plate)):
        raise FieldError(status.HTTP_409_CONFLICT, "plate", "Placa já cadastrada")
    values = data.model_dump(exclude={"daily_rate"})
    vehicle = Vehicle(**values, daily_rate_cents=to_cents(data.daily_rate))
    db.add(vehicle)
    db.commit()
    return vehicle


@router.patch("/{vehicle_id}", response_model=VehicleOut, dependencies=[Depends(require_admin)])
def update_vehicle(vehicle_id: int, data: VehicleUpdate, db: Session = Depends(get_db)):
    vehicle = get_vehicle_or_404(db, vehicle_id)
    changes = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None or k == "color"}
    if "daily_rate" in changes:
        vehicle.daily_rate_cents = to_cents(changes.pop("daily_rate"))
    for field, value in changes.items():
        setattr(vehicle, field, value)
    db.commit()
    return vehicle


@router.delete("/{vehicle_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_admin)])
def delete_vehicle(vehicle_id: int, db: Session = Depends(get_db)):
    vehicle = get_vehicle_or_404(db, vehicle_id)
    if db.scalar(select(Rental.id).where(Rental.vehicle_id == vehicle_id).limit(1)):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Veículo possui locações no histórico; altere o status para 'inactive' em vez de excluir",
        )
    db.delete(vehicle)
    db.commit()
