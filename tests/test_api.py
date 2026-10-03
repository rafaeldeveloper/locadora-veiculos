from datetime import date, timedelta

VEHICLE = {
    "plate": "ABC-1D23",
    "brand": "Fiat",
    "model": "Mobi",
    "year": 2024,
    "category": "economico",
    "daily_rate": "100.00",
}


def day(n):
    return (date.today() + timedelta(days=n)).isoformat()


def create_vehicle(client, admin, **extra):
    r = client.post("/api/vehicles", json={**VEHICLE, **extra}, headers=admin)
    assert r.status_code == 201, r.text
    return r.json()


def test_register_login_and_me(client, customer):
    r = client.get("/api/auth/me", headers=customer)
    assert r.status_code == 200
    assert r.json()["role"] == "customer"


def test_duplicate_email_rejected(client, customer):
    r = client.post("/api/auth/register", json={"name": "Outra", "email": "MARIA@test.com", "password": "senha123"})
    assert r.status_code == 409


def test_wrong_password(client, customer):
    r = client.post("/api/auth/login", json={"email": "maria@test.com", "password": "errada"})
    assert r.status_code == 401


def test_customer_cannot_manage_vehicles(client, customer):
    assert client.post("/api/vehicles", json=VEHICLE, headers=customer).status_code == 403
    assert client.post("/api/vehicles", json=VEHICLE).status_code == 401


def test_admin_vehicle_crud(client, admin):
    v = create_vehicle(client, admin)
    assert v["plate"] == "ABC1D23"
    assert v["daily_rate"] == "100.00"

    r = client.patch(f"/api/vehicles/{v['id']}", json={"daily_rate": "129.90", "status": "maintenance"}, headers=admin)
    assert r.json()["daily_rate"] == "129.90"

    assert client.get("/api/vehicles").json() == []
    assert len(client.get("/api/vehicles?include_unavailable=true").json()) == 1

    assert client.delete(f"/api/vehicles/{v['id']}", headers=admin).status_code == 204


def test_duplicate_plate(client, admin):
    create_vehicle(client, admin)
    r = client.post("/api/vehicles", json={**VEHICLE, "plate": "abc1d23"}, headers=admin)
    assert r.status_code == 409


def test_quote_applies_best_discount(client, admin):
    v = create_vehicle(client, admin)
    client.put("/api/pricing-rules", json={"min_days": 7, "discount_percent": 10}, headers=admin)
    client.put("/api/pricing-rules", json={"min_days": 30, "discount_percent": 25}, headers=admin)

    q = client.post("/api/rentals/quote", json={"vehicle_id": v["id"], "start_date": day(1), "end_date": day(4)}).json()
    assert (q["days"], q["discount_percent"], q["total"]) == (3, 0, "300.00")

    q = client.post("/api/rentals/quote", json={"vehicle_id": v["id"], "start_date": day(1), "end_date": day(11)}).json()
    assert (q["days"], q["discount_percent"], q["total"]) == (10, 10, "900.00")


def test_rental_flow_and_overlap(client, admin, customer):
    v = create_vehicle(client, admin)
    body = {"vehicle_id": v["id"], "start_date": day(1), "end_date": day(4)}

    r = client.post("/api/rentals", json=body, headers=customer)
    assert r.status_code == 201, r.text
    rental = r.json()
    assert rental["total"] == "300.00"

    overlap = {**body, "start_date": day(3), "end_date": day(6)}
    assert client.post("/api/rentals", json=overlap, headers=customer).status_code == 409

    back_to_back = {**body, "start_date": day(4), "end_date": day(6)}
    assert client.post("/api/rentals", json=back_to_back, headers=customer).status_code == 201

    available = client.get(f"/api/vehicles?start_date={day(2)}&end_date={day(3)}").json()
    assert available == []

    rid = rental["id"]
    assert client.post(f"/api/admin/rentals/{rid}/status", json={"status": "completed"}, headers=admin).status_code == 409
    assert client.post(f"/api/admin/rentals/{rid}/status", json={"status": "active"}, headers=admin).json()["status"] == "active"
    assert client.post(f"/api/rentals/{rid}/cancel", headers=customer).status_code == 409
    assert client.post(f"/api/admin/rentals/{rid}/status", json={"status": "completed"}, headers=admin).status_code == 200

    stats = client.get("/api/admin/stats", headers=admin).json()
    assert stats["revenue_completed"] == "300.00"
    assert client.delete(f"/api/vehicles/{v['id']}", headers=admin).status_code == 409


def test_cancel_frees_vehicle(client, admin, customer):
    v = create_vehicle(client, admin)
    body = {"vehicle_id": v["id"], "start_date": day(1), "end_date": day(3)}
    rid = client.post("/api/rentals", json=body, headers=customer).json()["id"]
    assert client.post(f"/api/rentals/{rid}/cancel", headers=customer).json()["status"] == "cancelled"
    assert client.post("/api/rentals", json=body, headers=customer).status_code == 201


def test_rental_requires_license_and_valid_dates(client, admin):
    v = create_vehicle(client, admin)
    client.post("/api/auth/register", json={"name": "Joao", "email": "joao@test.com", "password": "senha123"})
    from tests.conftest import auth_header

    joao = auth_header(client, "joao@test.com", "senha123")
    body = {"vehicle_id": v["id"], "start_date": day(1), "end_date": day(3)}
    assert client.post("/api/rentals", json=body, headers=joao).status_code == 422

    client.patch("/api/auth/me", json={"driver_license": "999"}, headers=joao)
    assert client.post("/api/rentals", json={**body, "end_date": day(1)}, headers=joao).status_code == 422
    assert client.post("/api/rentals", json={**body, "start_date": day(-1)}, headers=joao).status_code == 422


def test_other_user_cannot_cancel(client, admin, customer):
    v = create_vehicle(client, admin)
    rid = client.post(
        "/api/rentals", json={"vehicle_id": v["id"], "start_date": day(1), "end_date": day(2)}, headers=customer
    ).json()["id"]
    client.post("/api/auth/register", json={"name": "Ze", "email": "ze@test.com", "password": "senha123"})
    from tests.conftest import auth_header

    ze = auth_header(client, "ze@test.com", "senha123")
    assert client.post(f"/api/rentals/{rid}/cancel", headers=ze).status_code == 404


def test_admin_manages_users(client, admin, customer):
    users = client.get("/api/admin/users", headers=admin).json()
    maria = next(u for u in users if u["email"] == "maria@test.com")
    me = next(u for u in users if u["role"] == "admin")

    assert client.patch(f"/api/admin/users/{me['id']}", json={"active": False}, headers=admin).status_code == 409
    assert client.patch(f"/api/admin/users/{maria['id']}", json={"role": "admin"}, headers=admin).json()["role"] == "admin"
    assert client.get("/api/admin/stats", headers=customer).status_code == 200

    client.patch(f"/api/admin/users/{maria['id']}", json={"active": False}, headers=admin)
    assert client.get("/api/auth/me", headers=customer).status_code == 401
    assert client.get("/api/admin/users", headers=customer).status_code == 401
