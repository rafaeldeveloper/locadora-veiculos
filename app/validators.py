import re
from datetime import date
from functools import wraps

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$")
NAME_RE = re.compile(r"^[^\W\d_][^\W\d_'.-]*(?:[ '-][^\W\d_][^\W\d_'.-]*)+$")
PLATE_RE = re.compile(r"^[A-Z]{3}\d[A-Z0-9]\d{2}$")


def skip_none(func):
    @wraps(func)
    def wrapper(value):
        return None if value is None else func(value)

    return wrapper


def only_digits(value: str) -> str:
    return re.sub(r"\D", "", value)


def cpf_is_valid(cpf: str) -> bool:
    if len(cpf) != 11 or cpf == cpf[0] * 11:
        return False
    for size in (9, 10):
        total = sum(int(cpf[i]) * (size + 1 - i) for i in range(size))
        if (total * 10) % 11 % 10 != int(cpf[size]):
            return False
    return True


@skip_none
def full_name(value: str) -> str:
    value = " ".join(value.split())
    if len(value) > 120:
        raise ValueError("Use no máximo 120 caracteres")
    if not NAME_RE.match(value):
        raise ValueError("Informe nome e sobrenome, só com letras")
    return value


@skip_none
def email(value: str) -> str:
    value = value.strip().lower()
    if len(value) > 160 or not EMAIL_RE.match(value):
        raise ValueError("E-mail inválido")
    return value


@skip_none
def password(value: str) -> str:
    if len(value) < 8:
        raise ValueError("A senha precisa de ao menos 8 caracteres")
    if len(value.encode()) > 72:
        raise ValueError("A senha pode ter no máximo 72 caracteres")
    if not re.search(r"[A-Za-z]", value) or not re.search(r"\d", value):
        raise ValueError("A senha precisa ter letras e números")
    return value


@skip_none
def cpf(value: str) -> str:
    digits = only_digits(value)
    if not cpf_is_valid(digits):
        raise ValueError("CPF inválido")
    return digits


@skip_none
def phone(value: str) -> str:
    digits = only_digits(value)
    if len(digits) not in (10, 11) or digits[0] == "0":
        raise ValueError("Telefone inválido: informe DDD e número")
    if len(digits) == 11 and digits[2] != "9":
        raise ValueError("Celular deve começar com 9 depois do DDD")
    return digits


@skip_none
def driver_license(value: str) -> str:
    digits = only_digits(value)
    if len(digits) != 11 or digits == digits[0] * 11:
        raise ValueError("A CNH tem 11 dígitos")
    return digits


@skip_none
def plate(value: str) -> str:
    value = value.replace("-", "").replace(" ", "").upper()
    if not PLATE_RE.match(value):
        raise ValueError("Placa inválida: use ABC-1234 ou ABC1D23")
    return value


@skip_none
def vehicle_year(value: int) -> int:
    if not 1980 <= value <= date.today().year + 1:
        raise ValueError(f"Ano deve estar entre 1980 e {date.today().year + 1}")
    return value
