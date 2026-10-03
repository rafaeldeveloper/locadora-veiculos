import os

from dotenv import load_dotenv

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY", "troque-esta-chave-em-producao")
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./locadora.db")
ACCESS_TOKEN_MINUTES = int(os.getenv("ACCESS_TOKEN_MINUTES", "120"))
ADMIN_NAME = os.getenv("ADMIN_NAME", "Administrador")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@locadora.com")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")
