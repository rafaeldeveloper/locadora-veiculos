from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_admin
from app.models import Rental, User, Vehicle
from app.schemas import (
    AdminUserUpdate,
    RentalOut,
    RentalStatus,
    RentalStatusUpdate,
    StatsOut,
    UserOut,
    cents_to_reais,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])

ALLOWED_TRANSITIONS = {
    "reserved": {"active", "cancelled"},
    "active": {"completed"},
    "completed": set(),
    "cancelled": set(),
}


@router.get("/users", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return list(db.scalars(select(User).order_by(User.name)))


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    data: AdminUserUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Usuário não encontrado")
    if user.id == admin.id:
        raise HTTPException(status.HTTP_409_CONFLICT, "Você não pode alterar o próprio papel ou status")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    db.commit()
    return user


@router.get("/rentals", response_model=list[RentalOut])
def list_rentals(
    status_filter: RentalStatus | None = Query(None, alias="status"),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    query = select(Rental).order_by(Rental.start_date.desc())
    if status_filter:
        query = query.where(Rental.status == status_filter)
    return list(db.scalars(query))


@router.post("/rentals/{rental_id}/status", response_model=RentalOut)
def change_rental_status(
    rental_id: int,
    data: RentalStatusUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    rental = db.get(Rental, rental_id)
    if rental is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Locação não encontrada")
    if data.status not in ALLOWED_TRANSITIONS[rental.status]:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Transição inválida: {rental.status} → {data.status}")
    rental.status = data.status
    db.commit()
    return rental


@router.get("/stats", response_model=StatsOut)
def stats(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    def count(model, *where):
        return db.scalar(select(func.count()).select_from(model).where(*where))

    revenue = db.scalar(select(func.coalesce(func.sum(Rental.total_cents), 0)).where(Rental.status == "completed"))
    return StatsOut(
        users=count(User),
        vehicles=count(Vehicle),
        vehicles_available=count(Vehicle, Vehicle.status == "available"),
        rentals_reserved=count(Rental, Rental.status == "reserved"),
        rentals_active=count(Rental, Rental.status == "active"),
        revenue_completed=cents_to_reais(int(revenue)),
    )
