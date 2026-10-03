from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

Role = Literal["customer", "admin"]
Category = Literal["economico", "intermediario", "suv", "executivo", "utilitario"]
Transmission = Literal["manual", "automatico"]
Fuel = Literal["flex", "gasolina", "etanol", "diesel", "eletrico", "hibrido"]
VehicleStatus = Literal["available", "maintenance", "inactive"]
RentalStatus = Literal["reserved", "active", "completed", "cancelled"]


def cents_to_reais(value):
    return (Decimal(value) / 100).quantize(Decimal("0.01")) if isinstance(value, int) else value


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=6, max_length=72)
    phone: str | None = Field(default=None, max_length=30)
    cpf: str | None = Field(default=None, pattern=r"^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$")
    driver_license: str | None = Field(default=None, max_length=20)


class UserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    phone: str | None = Field(default=None, max_length=30)
    driver_license: str | None = Field(default=None, max_length=20)
    password: str | None = Field(default=None, min_length=6, max_length=72)


class AdminUserUpdate(BaseModel):
    role: Role | None = None
    active: bool | None = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    phone: str | None
    cpf: str | None
    driver_license: str | None
    role: Role
    active: bool
    created_at: datetime


class VehicleBase(BaseModel):
    plate: str = Field(min_length=7, max_length=8)
    brand: str = Field(min_length=1, max_length=60)
    model: str = Field(min_length=1, max_length=60)
    year: int = Field(ge=1980, le=2100)
    category: Category
    color: str | None = Field(default=None, max_length=30)
    seats: int = Field(default=5, ge=1, le=20)
    transmission: Transmission = "manual"
    fuel: Fuel = "flex"
    daily_rate: Decimal = Field(gt=0, max_digits=10, decimal_places=2)
    status: VehicleStatus = "available"

    @field_validator("plate")
    @classmethod
    def normalize_plate(cls, v: str) -> str:
        return v.replace("-", "").upper()


class VehicleCreate(VehicleBase):
    pass


class VehicleUpdate(BaseModel):
    brand: str | None = Field(default=None, min_length=1, max_length=60)
    model: str | None = Field(default=None, min_length=1, max_length=60)
    year: int | None = Field(default=None, ge=1980, le=2100)
    category: Category | None = None
    color: str | None = Field(default=None, max_length=30)
    seats: int | None = Field(default=None, ge=1, le=20)
    transmission: Transmission | None = None
    fuel: Fuel | None = None
    daily_rate: Decimal | None = Field(default=None, gt=0, max_digits=10, decimal_places=2)
    status: VehicleStatus | None = None


class VehicleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    plate: str
    brand: str
    model: str
    year: int
    category: Category
    color: str | None
    seats: int
    transmission: Transmission
    fuel: Fuel
    daily_rate: Decimal = Field(validation_alias="daily_rate_cents")
    status: VehicleStatus

    @field_validator("daily_rate", mode="before")
    @classmethod
    def convert_cents(cls, v):
        return cents_to_reais(v)


class PricingRuleIn(BaseModel):
    min_days: int = Field(ge=2, le=365)
    discount_percent: int = Field(ge=1, le=90)


class PricingRuleOut(PricingRuleIn):
    model_config = ConfigDict(from_attributes=True)

    id: int


class QuoteIn(BaseModel):
    vehicle_id: int
    start_date: date
    end_date: date


class QuoteOut(BaseModel):
    vehicle_id: int
    start_date: date
    end_date: date
    days: int
    daily_rate: Decimal
    subtotal: Decimal
    discount_percent: int
    total: Decimal
    available: bool


class RentalCreate(QuoteIn):
    pass


class RentalUser(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str


class RentalVehicle(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    plate: str
    brand: str
    model: str


class RentalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    start_date: date
    end_date: date
    days: int
    daily_rate: Decimal = Field(validation_alias="daily_rate_cents")
    discount_percent: int
    total: Decimal = Field(validation_alias="total_cents")
    status: RentalStatus
    created_at: datetime
    user: RentalUser
    vehicle: RentalVehicle

    @field_validator("daily_rate", "total", mode="before")
    @classmethod
    def convert_cents(cls, v):
        return cents_to_reais(v)


class RentalStatusUpdate(BaseModel):
    status: RentalStatus


class StatsOut(BaseModel):
    users: int
    vehicles: int
    vehicles_available: int
    rentals_reserved: int
    rentals_active: int
    revenue_completed: Decimal
