// Versão demo: reproduz a API do backend dentro do navegador, com os dados no localStorage.
const LocalApi = (() => {
  const KEY = "locadora-demo-db";
  const CATEGORIES = ["economico", "intermediario", "suv", "executivo", "utilitario"];
  const VEHICLE_STATUS = ["available", "maintenance", "inactive"];
  const TRANSITIONS = { reserved: ["active", "cancelled"], active: ["completed"], completed: [], cancelled: [] };

  class HttpError extends Error {
    constructor(status, detail, errors) {
      super(detail);
      this.status = status;
      this.errors = errors;
    }
  }

  const { rules, digits } = Validation;
  const fieldError = (status, field, message) => new HttpError(status, message, { [field]: message });
  const blank = (v) => v === undefined || v === null || String(v).trim() === "";

  // Valida só os campos presentes (ou obrigatórios) e lança 422 com o mapa de erros.
  function check(body, spec, partial = false) {
    const errors = {};
    for (const [field, names] of Object.entries(spec)) {
      const required = names.includes("required");
      const value = body[field];
      if (blank(value)) {
        if (required && (!partial || field in body)) errors[field] = "Campo obrigatório";
        continue;
      }
      for (const name of names.filter((n) => n !== "required")) {
        const message = rules[name](String(value));
        if (message) {
          errors[field] = message;
          break;
        }
      }
    }
    if (Object.keys(errors).length) throw new HttpError(422, "Verifique os campos destacados", errors);
  }

  async function hash(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  const reais = (cents) => (cents / 100).toFixed(2);
  const toCents = (v) => Math.round(Number(v) * 100);
  const today = () => new Date().toISOString().slice(0, 10);
  const parseDay = (s) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  const nowIso = () => new Date().toISOString();

  async function seed() {
    const db = { seq: 1, users: [], vehicles: [], rules: [], rentals: [], sessions: {} };
    const id = () => db.seq++;
    db.users.push({
      id: id(), name: "Administrador", email: "admin@locadora.com", password_hash: await hash("admin123"),
      phone: null, cpf: null, driver_license: null, role: "admin", active: true, created_at: nowIso(),
    });
    [
      ["RIO2A19", "Fiat", "Mobi", 2024, "economico", "Branco", 5, "manual", "flex", 119.9],
      ["SPX3B21", "Renault", "Kwid", 2023, "economico", "Prata", 5, "manual", "flex", 109.9],
      ["BRA4C55", "Chevrolet", "Onix Plus", 2024, "intermediario", "Cinza", 5, "automatico", "flex", 169.9],
      ["MGS5D67", "Hyundai", "HB20S", 2024, "intermediario", "Preto", 5, "automatico", "flex", 159.9],
      ["PRN6E88", "Jeep", "Compass", 2024, "suv", "Preto", 5, "automatico", "flex", 289.9],
      ["SCX7F10", "Toyota", "Corolla Cross", 2025, "suv", "Branco", 5, "automatico", "hibrido", 319.9],
      ["CWB8G32", "BMW", "320i", 2024, "executivo", "Azul", 5, "automatico", "gasolina", 549.9],
      ["FLN9H43", "Fiat", "Strada", 2024, "utilitario", "Vermelho", 2, "manual", "flex", 189.9],
    ].forEach(([plate, brand, model, year, category, color, seats, transmission, fuel, rate]) =>
      db.vehicles.push({
        id: id(), plate, brand, model, year, category, color, seats, transmission, fuel,
        daily_rate_cents: toCents(rate), status: "available", created_at: nowIso(),
      }));
    [[7, 10], [15, 15], [30, 25]].forEach(([min_days, discount_percent]) => db.rules.push({ id: id(), min_days, discount_percent }));
    return db;
  }

  async function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    const db = await seed();
    save(db);
    return db;
  }

  function save(db) {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch {}
  }

  const userOut = ({ password_hash, ...u }) => u;
  const vehicleOut = ({ daily_rate_cents, created_at, ...v }) => ({ ...v, daily_rate: reais(daily_rate_cents) });
  const ruleOut = (r) => ({ ...r });

  function rentalOut(db, r) {
    const u = db.users.find((x) => x.id === r.user_id);
    const v = db.vehicles.find((x) => x.id === r.vehicle_id);
    return {
      id: r.id, start_date: r.start_date, end_date: r.end_date, days: r.days,
      daily_rate: reais(r.daily_rate_cents), discount_percent: r.discount_percent, total: reais(r.total_cents),
      status: r.status, created_at: r.created_at,
      user: { id: u.id, name: u.name, email: u.email },
      vehicle: { id: v.id, plate: v.plate, brand: v.brand, model: v.model },
    };
  }

  function currentUser(db, token) {
    const user = db.users.find((u) => u.id === db.sessions[token]);
    if (!token || !user || !user.active) throw new HttpError(401, "Token inválido ou usuário inativo");
    return user;
  }

  function requireAdmin(db, token) {
    const user = currentUser(db, token);
    if (user.role !== "admin") throw new HttpError(403, "Acesso restrito a administradores");
    return user;
  }

  function findVehicle(db, id) {
    const v = db.vehicles.find((x) => x.id === Number(id));
    if (!v) throw new HttpError(404, "Veículo não encontrado");
    return v;
  }

  function rentalDays(start, end) {
    if (!start || !end) throw new HttpError(422, "Informe retirada e devolução");
    const days = (parseDay(end) - parseDay(start)) / 86400000;
    if (days < 1) throw fieldError(422, "end_date", "A devolução deve ser depois da retirada");
    return days;
  }

  function quote(db, vehicle, start, end) {
    const days = rentalDays(start, end);
    const rule = db.rules.filter((r) => r.min_days <= days).sort((a, b) => b.min_days - a.min_days)[0];
    const discount = rule ? rule.discount_percent : 0;
    const subtotal = vehicle.daily_rate_cents * days;
    return { days, daily_rate_cents: vehicle.daily_rate_cents, subtotal, discount, total: subtotal - Math.floor((subtotal * discount) / 100) };
  }

  const isAvailable = (db, vehicleId, start, end) =>
    !db.rentals.some((r) => r.vehicle_id === vehicleId && ["reserved", "active"].includes(r.status) && r.start_date < end && r.end_date > start);

  function validateVehicle(data, partial) {
    check(data, {
      plate: partial ? [] : ["required", "plate"], brand: ["required"], model: ["required"],
      year: ["required", "year"], daily_rate: ["required", "money"],
    }, partial);
    if ((!partial || "category" in data) && !CATEGORIES.includes(data.category)) throw fieldError(422, "category", "Opção inválida");
    if ("status" in data && !VEHICLE_STATUS.includes(data.status)) throw fieldError(422, "status", "Opção inválida");
  }

  function normalizeVehicle(data) {
    const out = { ...data };
    if ("plate" in out) out.plate = String(out.plate).replace(/[-\s]/g, "").toUpperCase();
    for (const k of ["brand", "model", "color"]) if (typeof out[k] === "string") out[k] = out[k].trim();
    for (const k of ["year", "seats"]) if (k in out) out[k] = Number(out[k]);
    return out;
  }

  const routes = [
    ["POST", /^\/api\/auth\/register$/, async (db, { body }) => {
      check(body, {
        name: ["required", "fullname"], email: ["required", "email"], password: ["required", "password"],
        cpf: ["required", "cpf"], phone: ["required", "phone"], driver_license: ["cnh"],
      });
      const email = String(body.email).trim().toLowerCase();
      const cpf = digits(body.cpf);
      if (db.users.some((u) => u.email === email)) throw fieldError(409, "email", "Já existe uma conta com este e-mail");
      if (db.users.some((u) => u.cpf === cpf)) throw fieldError(409, "cpf", "Já existe uma conta com este CPF");
      const user = {
        id: db.seq++, name: body.name.trim().replace(/\s+/g, " "), email, password_hash: await hash(body.password),
        phone: digits(body.phone), cpf, driver_license: blank(body.driver_license) ? null : digits(body.driver_license),
        role: "customer", active: true, created_at: nowIso(),
      };
      db.users.push(user);
      return [201, userOut(user)];
    }],
    ["POST", /^\/api\/auth\/login$/, async (db, { body }) => {
      const user = db.users.find((u) => u.email === String(body.email || "").trim().toLowerCase());
      if (!user || user.password_hash !== (await hash(body.password || ""))) throw new HttpError(401, "E-mail ou senha inválidos");
      if (!user.active) throw new HttpError(403, "Usuário desativado");
      const token = crypto.randomUUID();
      db.sessions[token] = user.id;
      return [200, { access_token: token, token_type: "bearer" }];
    }],
    ["GET", /^\/api\/auth\/me$/, async (db, { token }) => [200, userOut(currentUser(db, token))]],
    ["PATCH", /^\/api\/auth\/me$/, async (db, { token, body }) => {
      const user = currentUser(db, token);
      check(body, { name: ["fullname"], phone: ["phone"], driver_license: ["cnh"], password: ["password"] });
      if (!blank(body.name)) user.name = body.name.trim().replace(/\s+/g, " ");
      if ("phone" in body) user.phone = blank(body.phone) ? null : digits(body.phone);
      if ("driver_license" in body) user.driver_license = blank(body.driver_license) ? null : digits(body.driver_license);
      if (!blank(body.password)) user.password_hash = await hash(body.password);
      return [200, userOut(user)];
    }],

    ["GET", /^\/api\/vehicles$/, async (db, { query }) => {
      let list = db.vehicles.slice();
      if (query.get("category")) list = list.filter((v) => v.category === query.get("category"));
      if (query.get("include_unavailable") !== "true") list = list.filter((v) => v.status === "available");
      const start = query.get("start_date");
      const end = query.get("end_date");
      if (start && end) {
        rentalDays(start, end);
        list = list.filter((v) => isAvailable(db, v.id, start, end));
      }
      list.sort((a, b) => a.daily_rate_cents - b.daily_rate_cents || a.brand.localeCompare(b.brand));
      return [200, list.map(vehicleOut)];
    }],
    ["GET", /^\/api\/vehicles\/(\d+)$/, async (db, { params }) => [200, vehicleOut(findVehicle(db, params[0]))]],
    ["POST", /^\/api\/vehicles$/, async (db, { token, body }) => {
      requireAdmin(db, token);
      const data = normalizeVehicle(body);
      validateVehicle(data, false);
      if (db.vehicles.some((v) => v.plate === data.plate)) throw fieldError(409, "plate", "Placa já cadastrada");
      const { daily_rate, ...rest } = data;
      const vehicle = {
        seats: 5, transmission: "manual", fuel: "flex", status: "available", color: null,
        ...rest, id: db.seq++, daily_rate_cents: toCents(daily_rate), created_at: nowIso(),
      };
      db.vehicles.push(vehicle);
      return [201, vehicleOut(vehicle)];
    }],
    ["PATCH", /^\/api\/vehicles\/(\d+)$/, async (db, { token, body, params }) => {
      requireAdmin(db, token);
      const vehicle = findVehicle(db, params[0]);
      const { plate, daily_rate, ...data } = normalizeVehicle(body);
      validateVehicle({ ...data, ...(daily_rate !== undefined && { daily_rate }) }, true);
      for (const [k, v] of Object.entries(data)) if (!blank(v) || k === "color") vehicle[k] = blank(v) ? null : v;
      if (daily_rate !== undefined) vehicle.daily_rate_cents = toCents(daily_rate);
      return [200, vehicleOut(vehicle)];
    }],
    ["DELETE", /^\/api\/vehicles\/(\d+)$/, async (db, { token, params }) => {
      requireAdmin(db, token);
      const vehicle = findVehicle(db, params[0]);
      if (db.rentals.some((r) => r.vehicle_id === vehicle.id)) {
        throw new HttpError(409, "Veículo possui locações no histórico; altere o status para 'inactive' em vez de excluir");
      }
      db.vehicles = db.vehicles.filter((v) => v.id !== vehicle.id);
      return [204, null];
    }],

    ["GET", /^\/api\/pricing-rules$/, async (db) => [200, db.rules.slice().sort((a, b) => a.min_days - b.min_days).map(ruleOut)]],
    ["PUT", /^\/api\/pricing-rules$/, async (db, { token, body }) => {
      requireAdmin(db, token);
      const min_days = Number(body.min_days);
      const discount_percent = Number(body.discount_percent);
      if (!(min_days >= 2 && min_days <= 365)) throw new HttpError(422, "Dias mínimos entre 2 e 365");
      if (!(discount_percent >= 1 && discount_percent <= 90)) throw new HttpError(422, "Desconto entre 1% e 90%");
      let rule = db.rules.find((r) => r.min_days === min_days);
      if (!rule) db.rules.push((rule = { id: db.seq++, min_days }));
      rule.discount_percent = discount_percent;
      return [200, ruleOut(rule)];
    }],
    ["DELETE", /^\/api\/pricing-rules\/(\d+)$/, async (db, { token, params }) => {
      requireAdmin(db, token);
      if (!db.rules.some((r) => r.id === Number(params[0]))) throw new HttpError(404, "Regra não encontrada");
      db.rules = db.rules.filter((r) => r.id !== Number(params[0]));
      return [204, null];
    }],

    ["POST", /^\/api\/rentals\/quote$/, async (db, { body }) => {
      const vehicle = findVehicle(db, body.vehicle_id);
      const q = quote(db, vehicle, body.start_date, body.end_date);
      return [200, {
        vehicle_id: vehicle.id, start_date: body.start_date, end_date: body.end_date, days: q.days,
        daily_rate: reais(q.daily_rate_cents), subtotal: reais(q.subtotal), discount_percent: q.discount, total: reais(q.total),
        available: vehicle.status === "available" && isAvailable(db, vehicle.id, body.start_date, body.end_date),
      }];
    }],
    ["POST", /^\/api\/rentals$/, async (db, { token, body }) => {
      const user = currentUser(db, token);
      if (body.start_date < today()) throw fieldError(422, "start_date", "A retirada não pode ser no passado");
      if (!user.driver_license) throw fieldError(422, "driver_license", "Cadastre sua CNH para reservar");
      const vehicle = findVehicle(db, body.vehicle_id);
      if (vehicle.status !== "available") throw new HttpError(409, "Veículo indisponível para locação");
      const q = quote(db, vehicle, body.start_date, body.end_date);
      if (!isAvailable(db, vehicle.id, body.start_date, body.end_date)) throw new HttpError(409, "Veículo já reservado neste período");
      const rental = {
        id: db.seq++, user_id: user.id, vehicle_id: vehicle.id, start_date: body.start_date, end_date: body.end_date,
        days: q.days, daily_rate_cents: q.daily_rate_cents, discount_percent: q.discount, total_cents: q.total,
        status: "reserved", created_at: nowIso(),
      };
      db.rentals.push(rental);
      return [201, rentalOut(db, rental)];
    }],
    ["GET", /^\/api\/rentals\/mine$/, async (db, { token }) => {
      const user = currentUser(db, token);
      const list = db.rentals.filter((r) => r.user_id === user.id).sort((a, b) => b.start_date.localeCompare(a.start_date));
      return [200, list.map((r) => rentalOut(db, r))];
    }],
    ["POST", /^\/api\/rentals\/(\d+)\/cancel$/, async (db, { token, params }) => {
      const user = currentUser(db, token);
      const rental = db.rentals.find((r) => r.id === Number(params[0]));
      if (!rental || (rental.user_id !== user.id && user.role !== "admin")) throw new HttpError(404, "Locação não encontrada");
      if (rental.status !== "reserved") throw new HttpError(409, "Só reservas ainda não retiradas podem ser canceladas");
      rental.status = "cancelled";
      return [200, rentalOut(db, rental)];
    }],

    ["GET", /^\/api\/admin\/users$/, async (db, { token }) => {
      requireAdmin(db, token);
      return [200, db.users.slice().sort((a, b) => a.name.localeCompare(b.name)).map(userOut)];
    }],
    ["PATCH", /^\/api\/admin\/users\/(\d+)$/, async (db, { token, body, params }) => {
      const admin = requireAdmin(db, token);
      const user = db.users.find((u) => u.id === Number(params[0]));
      if (!user) throw new HttpError(404, "Usuário não encontrado");
      if (user.id === admin.id) throw new HttpError(409, "Você não pode alterar o próprio papel ou status");
      if ("role" in body) {
        if (!["customer", "admin"].includes(body.role)) throw new HttpError(422, "Papel inválido");
        user.role = body.role;
      }
      if ("active" in body) user.active = !!body.active;
      return [200, userOut(user)];
    }],
    ["GET", /^\/api\/admin\/rentals$/, async (db, { token, query }) => {
      requireAdmin(db, token);
      let list = db.rentals.slice();
      if (query.get("status")) list = list.filter((r) => r.status === query.get("status"));
      list.sort((a, b) => b.start_date.localeCompare(a.start_date));
      return [200, list.map((r) => rentalOut(db, r))];
    }],
    ["POST", /^\/api\/admin\/rentals\/(\d+)\/status$/, async (db, { token, body, params }) => {
      requireAdmin(db, token);
      const rental = db.rentals.find((r) => r.id === Number(params[0]));
      if (!rental) throw new HttpError(404, "Locação não encontrada");
      if (!TRANSITIONS[rental.status].includes(body.status)) throw new HttpError(409, `Transição inválida: ${rental.status} → ${body.status}`);
      rental.status = body.status;
      return [200, rentalOut(db, rental)];
    }],
    ["GET", /^\/api\/admin\/stats$/, async (db, { token }) => {
      requireAdmin(db, token);
      const count = (list, fn) => list.filter(fn).length;
      return [200, {
        users: db.users.length,
        vehicles: db.vehicles.length,
        vehicles_available: count(db.vehicles, (v) => v.status === "available"),
        rentals_reserved: count(db.rentals, (r) => r.status === "reserved"),
        rentals_active: count(db.rentals, (r) => r.status === "active"),
        revenue_completed: reais(db.rentals.filter((r) => r.status === "completed").reduce((s, r) => s + r.total_cents, 0)),
      }];
    }],
  ];

  async function handle(method, url, body, token) {
    const [path, qs] = url.split("?");
    const db = await load();
    for (const [m, re, fn] of routes) {
      const match = path.match(re);
      if (m !== method || !match) continue;
      try {
        const [status, data] = await fn(db, { token, body: body || {}, params: match.slice(1), query: new URLSearchParams(qs) });
        save(db);
        return { status, data };
      } catch (e) {
        if (e instanceof HttpError) return { status: e.status, data: { detail: e.message, errors: e.errors } };
        throw e;
      }
    }
    return { status: 404, data: { detail: "Rota não encontrada" } };
  }

  function reset() {
    try {
      localStorage.removeItem(KEY);
      localStorage.removeItem("token");
    } catch {}
  }

  return { handle, reset };
})();
