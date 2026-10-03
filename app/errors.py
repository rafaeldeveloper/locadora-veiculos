from fastapi import HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

MESSAGES = {
    "missing": "Campo obrigatório",
    "string_type": "Campo obrigatório",
    "string_too_short": "Campo obrigatório",
    "string_too_long": "Use no máximo {max_length} caracteres",
    "greater_than": "Deve ser maior que {gt}",
    "greater_than_equal": "Deve ser no mínimo {ge}",
    "less_than_equal": "Deve ser no máximo {le}",
    "int_parsing": "Informe um número inteiro",
    "int_from_float": "Informe um número inteiro",
    "decimal_parsing": "Informe um valor numérico",
    "decimal_max_places": "Use no máximo {decimal_places} casas decimais",
    "decimal_max_digits": "Valor muito alto",
    "literal_error": "Opção inválida",
    "date_parsing": "Data inválida",
    "date_from_datetime_parsing": "Data inválida",
    "bool_parsing": "Valor inválido",
}


class FieldError(HTTPException):
    def __init__(self, status_code: int, field: str, message: str):
        super().__init__(status_code, message)
        self.field = field


def translate(error: dict) -> str:
    if error["type"] == "value_error":
        return str(error["ctx"]["error"])
    template = MESSAGES.get(error["type"])
    if template is None:
        return "Valor inválido"
    return template.format(**error.get("ctx", {}))


async def validation_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    errors: dict[str, str] = {}
    for error in exc.errors():
        loc = [str(part) for part in error["loc"] if part not in ("body", "query", "path")]
        errors.setdefault(".".join(loc) or "_", translate(error))
    return JSONResponse(status_code=422, content={"detail": "Verifique os campos destacados", "errors": errors})


async def field_error_handler(_: Request, exc: FieldError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail, "errors": {exc.field: exc.detail}})
