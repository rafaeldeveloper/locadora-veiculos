# Locadora de Veículos

Sistema de aluguel de veículos com API REST (FastAPI + SQLite) e interface web.

## Funcionalidades

- **Usuários**: cadastro (nome, e-mail, senha, CPF, telefone, CNH), login com JWT e edição do próprio perfil.
- **Administradores**: papel `admin` com acesso ao painel. O primeiro admin é criado na inicialização a partir das variáveis `ADMIN_*`; outros usuários podem ser promovidos pelo painel. Admins também desativam contas.
- **Veículos**: cadastro com placa, marca, modelo, ano, categoria, cor, lugares, câmbio, combustível, diária e status (`available`, `maintenance`, `inactive`).
- **Valores**: diária por veículo e faixas de desconto por duração (ex.: 7+ dias = 10%). Vale a maior faixa atingida. Valores guardados em centavos para não haver erro de arredondamento.
- **Locações**: orçamento, reserva com checagem de conflito de datas, cancelamento pelo cliente e ciclo `reserved → active → completed` (retirada e devolução) controlado pelo admin. A diária e o desconto ficam congelados na reserva.
- **Painel admin**: indicadores (usuários, frota, reservas, receita), gestão de veículos, usuários, locações e descontos.

## Como rodar

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # ajuste SECRET_KEY e ADMIN_PASSWORD
python seed.py                # opcional: 8 veículos e 3 faixas de desconto de exemplo
uvicorn app.main:app --reload
```

- Interface: http://localhost:8000
- Documentação da API (Swagger): http://localhost:8000/docs

Sem `.env`, o admin padrão é `admin@locadora.com` / `admin123`. Troque antes de usar fora da sua máquina.

## Testes

```bash
pip install -r requirements-dev.txt
pytest
```

## Endpoints

| Método | Rota | Acesso |
|---|---|---|
| POST | `/api/auth/register` | público |
| POST | `/api/auth/login` | público |
| GET/PATCH | `/api/auth/me` | autenticado |
| GET | `/api/vehicles?category=&start_date=&end_date=` | público |
| GET | `/api/vehicles/{id}` | público |
| POST/PATCH/DELETE | `/api/vehicles[/{id}]` | admin |
| GET | `/api/pricing-rules` | público |
| PUT/DELETE | `/api/pricing-rules[/{id}]` | admin |
| POST | `/api/rentals/quote` | público |
| POST | `/api/rentals` | autenticado (exige CNH) |
| GET | `/api/rentals/mine` | autenticado |
| POST | `/api/rentals/{id}/cancel` | dono da reserva ou admin |
| GET | `/api/admin/users` | admin |
| PATCH | `/api/admin/users/{id}` | admin |
| GET | `/api/admin/rentals?status=` | admin |
| POST | `/api/admin/rentals/{id}/status` | admin |
| GET | `/api/admin/stats` | admin |

## Estrutura

```
app/
  main.py          # app, rotas e criação do admin inicial
  models.py        # User, Vehicle, PricingRule, Rental
  schemas.py       # validação de entrada/saída
  services.py      # cálculo de preço e disponibilidade
  routers/         # auth, vehicles, pricing, rentals, admin
  static/          # interface web (HTML/CSS/JS puro)
seed.py            # dados de exemplo
tests/             # testes da API
```
