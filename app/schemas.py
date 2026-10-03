from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app import validators

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
    email: str
    password: str = Field(min_length=1)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.strip().lower()


def blank_to_none(v):
    return None if isinstance(v, str) and not v.strip() else v


class UserCreate(BaseModel):
    name: str
    email: str
    password: str
    cpf: str
    phone: str
    driver_license: str | None = None

    _blank = field_validator("driver_license", mode="before")(blank_to_none)
    _name = field_validator("name")(validators.full_name)
    _email = field_validator("email")(validators.email)
    _password = field_validator("password")(validators.password)
    _cpf = field_validator("cpf")(validators.cpf)
    _phone = field_validator("phone")(validators.phone)
    _cnh = field_validator("driver_license")(validators.driver_license)


class UserUpdate(BaseModel):
    name: str | None = None
    phone: str | None = None
    driver_license: str | None = None
    password: str | None = None

    _blank = field_validator("phone", "driver_license", "password", mode="before")(blank_to_none)
    _name = field_validator("name")(validators.full_name)
    _password = field_validator("password")(validators.password)
    _phone = field_validator("phone")(validators.phone)
    _cnh = field_validator("driver_license")(validators.driver_license)


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
    plate: str
    brand: str = Field(min_length=1, max_length=60)
    model: str = Field(min_length=1, max_length=60)
    year: int
    category: Category
    color: str | None = Field(default=None, max_length=30)
    seats: int = Field(default=5, ge=1, le=20)
    transmission: Transmission = "manual"
    fuel: Fuel = "flex"
    daily_rate: Decimal = Field(gt=0, max_digits=10, decimal_places=2)
    status: VehicleStatus = "available"

    _strip = field_validator("brand", "model", mode="before")(lambda v: v.strip() if isinstance(v, str) else v)
    _color = field_validator("color", mode="before")(lambda v: v.strip() or None if isinstance(v, str) else v)
    _plate = field_validator("plate")(validators.plate)
    _year = field_validator("year")(validators.vehicle_year)


class VehicleCreate(VehicleBase):
    pass


class VehicleUpdate(BaseModel):
    brand: str | None = Field(default=None, min_length=1, max_length=60)
    model: str | None = Field(default=None, min_length=1, max_length=60)
    year: int | None = None
    category: Category | None = None
    color: str | None = Field(default=None, max_length=30)
    seats: int | None = Field(default=None, ge=1, le=20)
    transmission: Transmission | None = None
    fuel: Fuel | None = None
    daily_rate: Decimal | None = Field(default=None, gt=0, max_digits=10, decimal_places=2)
    status: VehicleStatus | None = None

    _strip = field_validator("brand", "model", mode="before")(lambda v: v.strip() if isinstance(v, str) else v)
    _color = field_validator("color", mode="before")(lambda v: v.strip() or None if isinstance(v, str) else v)
    _year = field_validator("year")(validators.vehicle_year)


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
