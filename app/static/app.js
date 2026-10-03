const state = { token: localStorage.getItem("token"), user: null };

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const brl = (v) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (d) => d.split("-").reverse().join("/");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const LABELS = {
  economico: "Econômico", intermediario: "Intermediário", suv: "SUV", executivo: "Executivo", utilitario: "Utilitário",
  manual: "Manual", automatico: "Automático",
  available: "Disponível", maintenance: "Manutenção", inactive: "Inativo",
  reserved: "Reservada", active: "Em andamento", completed: "Concluída", cancelled: "Cancelada",
  customer: "Cliente", admin: "Admin",
};
const label = (k) => LABELS[k] ?? k;

function toast(msg, error = false) {
  const el = $("#toast");
  el.textContent = msg;
  el.className = "toast" + (error ? " error" : "");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.add("hidden"), 3500);
}

async function api(path, { method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && state.token) logout();
    const detail = Array.isArray(data.detail) ? data.detail.map((d) => d.msg).join("; ") : data.detail;
    throw new Error(detail || `Erro ${res.status}`);
  }
  return data;
}

function formData(form) {
  const out = {};
  for (const [k, v] of new FormData(form)) if (v !== "") out[k] = v;
  return out;
}

function show(view) {
  $$(".view").forEach((v) => v.classList.add("hidden"));
  $(`#view-${view}`).classList.remove("hidden");
  $$("#nav button").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  ({ vehicles: loadVehicles, rentals: loadMyRentals, profile: loadProfile, admin: loadAdmin }[view] || (() => {}))();
}

function renderSession() {
  const logged = !!state.user;
  $$(".auth-only").forEach((el) => el.classList.toggle("hidden", !logged));
  $$(".admin-only").forEach((el) => el.classList.toggle("hidden", state.user?.role !== "admin"));
  $("#btn-login").classList.toggle("hidden", logged);
  $("#who").textContent = logged ? state.user.name : "";
}

async function loadMe() {
  if (!state.token) return renderSession();
  try {
    state.user = await api("/api/auth/me");
  } catch {
    state.user = null;
  }
  renderSession();
}

function logout() {
  state.token = null;
  state.user = null;
  localStorage.removeItem("token");
  renderSession();
  show("vehicles");
}

async function login(email, password) {
  const { access_token } = await api("/api/auth/login", { method: "POST", body: { email, password } });
  state.token = access_token;
  localStorage.setItem("token", access_token);
  await loadMe();
  toast(`Bem-vindo, ${state.user.name}!`);
  show("vehicles");
}

/* ---------- Veículos (cliente) ---------- */

async function loadVehicles() {
  const params = new URLSearchParams(formData($("#form-search")));
  try {
    const [vehicles, rules] = await Promise.all([api(`/api/vehicles?${params}`), api("/api/pricing-rules")]);
    $("#discounts").textContent = rules.length
      ? "Descontos por duração: " + rules.map((r) => `${r.min_days}+ dias: ${r.discount_percent}%`).join(" · ")
      : "";
    $("#vehicle-list").innerHTML = vehicles.length
      ? vehicles.map((v) => `
        <div class="card vehicle">
          <div class="title">${esc(v.brand)} ${esc(v.model)}</div>
          <div class="muted">${v.year} · ${esc(v.color || "")}</div>
          <div><span class="tag">${label(v.category)}</span> <span class="tag">${label(v.transmission)}</span>
            <span class="tag">${v.seats} lugares</span> <span class="tag">${esc(v.fuel)}</span></div>
          <div class="price">${brl(v.daily_rate)} <small>/dia</small></div>
          <button class="btn" data-reserve="${v.id}">Reservar</button>
        </div>`).join("")
      : '<p class="muted">Nenhum veículo disponível para esse filtro.</p>';
  } catch (e) {
    toast(e.message, true);
  }
}

async function openQuote(vehicleId) {
  if (!state.user) {
    toast("Entre na sua conta para reservar");
    return show("auth");
  }
  const { start_date, end_date } = formData($("#form-search"));
  if (!start_date || !end_date) return toast("Escolha as datas de retirada e devolução", true);
  try {
    const q = await api("/api/rentals/quote", { method: "POST", body: { vehicle_id: vehicleId, start_date, end_date } });
    $("#quote-body").innerHTML = `
      <h3>Confirmar reserva</h3>
      <div class="quote-line"><span>Período</span><span>${fmtDate(q.start_date)} → ${fmtDate(q.end_date)}</span></div>
      <div class="quote-line"><span>${q.days} diária(s) × ${brl(q.daily_rate)}</span><span>${brl(q.subtotal)}</span></div>
      ${q.discount_percent ? `<div class="quote-line"><span>Desconto (${q.discount_percent}%)</span><span>− ${brl(q.subtotal - q.total)}</span></div>` : ""}
      <div class="quote-line quote-total"><span>Total</span><span>${brl(q.total)}</span></div>
      ${q.available ? "" : '<p class="status cancelled">Veículo indisponível nesse período.</p>'}
      <div class="actions" style="margin-top:14px">
        <button class="btn" value="ok" ${q.available ? "" : "disabled"}>Confirmar</button>
        <button class="btn ghost" value="cancel">Voltar</button>
      </div>`;
    const dlg = $("#dlg-quote");
    dlg.onclose = async () => {
      if (dlg.returnValue !== "ok") return;
      try {
        await api("/api/rentals", { method: "POST", body: { vehicle_id: vehicleId, start_date, end_date } });
        toast("Reserva criada!");
        show("rentals");
      } catch (e) {
        toast(e.message, true);
      }
    };
    dlg.showModal();
  } catch (e) {
    toast(e.message, true);
  }
}

/* ---------- Minhas reservas ---------- */

function rentalRows(rentals, actions) {
  return rentals.map((r) => `
    <tr>
      <td>#${r.id}</td>
      <td>${esc(r.vehicle.brand)} ${esc(r.vehicle.model)} <span class="muted">${esc(r.vehicle.plate)}</span></td>
      ${actions.admin ? `<td>${esc(r.user.name)}<br><span class="muted">${esc(r.user.email)}</span></td>` : ""}
      <td>${fmtDate(r.start_date)} → ${fmtDate(r.end_date)}</td>
      <td class="num">${r.days}</td>
      <td class="num">${brl(r.total)}${r.discount_percent ? ` <span class="muted">(−${r.discount_percent}%)</span>` : ""}</td>
      <td><span class="status ${r.status}">${label(r.status)}</span></td>
      <td>${actions.render(r)}</td>
    </tr>`).join("");
}

async function loadMyRentals() {
  try {
    const rentals = await api("/api/rentals/mine");
    $("#my-rentals").innerHTML = rentals.length
      ? `<tr><th>#</th><th>Veículo</th><th>Período</th><th class="num">Dias</th><th class="num">Total</th><th>Status</th><th></th></tr>` +
        rentalRows(rentals, { render: (r) => (r.status === "reserved" ? `<button class="btn small danger" data-cancel="${r.id}">Cancelar</button>` : "") })
      : '<tr><td class="muted">Você ainda não tem reservas.</td></tr>';
  } catch (e) {
    toast(e.message, true);
  }
}

/* ---------- Perfil ---------- */

function loadProfile() {
  const f = $("#form-profile");
  f.name.value = state.user.name;
  f.phone.value = state.user.phone || "";
  f.driver_license.value = state.user.driver_license || "";
  f.password.value = "";
}

/* ---------- Administração ---------- */

async function loadAdmin() {
  try {
    const s = await api("/api/admin/stats");
    $("#stats").innerHTML = [
      ["Usuários", s.users], ["Veículos", `${s.vehicles_available}/${s.vehicles}`],
      ["Reservas", s.rentals_reserved], ["Em andamento", s.rentals_active], ["Receita concluída", brl(s.revenue_completed)],
    ].map(([k, v]) => `<div class="stat"><span class="muted">${k}</span><b>${v}</b></div>`).join("");
  } catch (e) {
    return toast(e.message, true);
  }
  loadAdminVehicles();
  loadAdminRentals();
  loadAdminUsers();
  loadAdminRules();
}

let adminVehicles = [];

async function loadAdminVehicles() {
  adminVehicles = await api("/api/vehicles?include_unavailable=true");
  $("#admin-vehicles").innerHTML =
    `<tr><th>Placa</th><th>Veículo</th><th>Categoria</th><th class="num">Diária</th><th>Status</th><th></th></tr>` +
    adminVehicles.map((v) => `
      <tr>
        <td>${esc(v.plate)}</td>
        <td>${esc(v.brand)} ${esc(v.model)} <span class="muted">${v.year}</span></td>
        <td>${label(v.category)}</td>
        <td class="num">${brl(v.daily_rate)}</td>
        <td><span class="status ${v.status}">${label(v.status)}</span></td>
        <td><button class="btn small ghost" data-edit-vehicle="${v.id}">Editar</button>
            <button class="btn small danger" data-delete-vehicle="${v.id}">Excluir</button></td>
      </tr>`).join("");
}

function resetVehicleForm() {
  const f = $("#form-vehicle");
  f.reset();
  f.id.value = "";
  f.plate.disabled = false;
  $("#vehicle-form-title").textContent = "Novo veículo";
}

function editVehicle(id) {
  const v = adminVehicles.find((x) => x.id === id);
  const f = $("#form-vehicle");
  for (const k of ["id", "plate", "brand", "model", "year", "category", "color", "seats", "transmission", "fuel", "daily_rate", "status"]) {
    f[k].value = v[k] ?? "";
  }
  f.plate.disabled = true;
  $("#vehicle-form-title").textContent = `Editar ${v.plate}`;
  f.scrollIntoView({ behavior: "smooth" });
}

async function loadAdminRentals() {
  const rentals = await api("/api/admin/rentals");
  const next = { reserved: [["active", "Retirar"], ["cancelled", "Cancelar"]], active: [["completed", "Devolver"]] };
  $("#admin-rentals").innerHTML = rentals.length
    ? `<tr><th>#</th><th>Veículo</th><th>Cliente</th><th>Período</th><th class="num">Dias</th><th class="num">Total</th><th>Status</th><th></th></tr>` +
      rentalRows(rentals, {
        admin: true,
        render: (r) => (next[r.status] || [])
          .map(([s, txt]) => `<button class="btn small ${s === "cancelled" ? "danger" : "ghost"}" data-rental="${r.id}" data-status="${s}">${txt}</button>`)
          .join(""),
      })
    : '<tr><td class="muted">Nenhuma locação.</td></tr>';
}

async function loadAdminUsers() {
  const users = await api("/api/admin/users");
  $("#admin-users").innerHTML =
    `<tr><th>Nome</th><th>E-mail</th><th>CPF</th><th>CNH</th><th>Papel</th><th>Status</th><th></th></tr>` +
    users.map((u) => {
      const self = u.id === state.user.id;
      return `
      <tr>
        <td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${esc(u.cpf || "—")}</td><td>${esc(u.driver_license || "—")}</td>
        <td>${label(u.role)}</td>
        <td><span class="status ${u.active ? "active" : "inactive"}">${u.active ? "Ativo" : "Desativado"}</span></td>
        <td>${self ? '<span class="muted">você</span>' : `
          <button class="btn small ghost" data-user="${u.id}" data-role="${u.role === "admin" ? "customer" : "admin"}">${u.role === "admin" ? "Tornar cliente" : "Tornar admin"}</button>
          <button class="btn small ${u.active ? "danger" : "ghost"}" data-user="${u.id}" data-active="${!u.active}">${u.active ? "Desativar" : "Reativar"}</button>`}
        </td>
      </tr>`;
    }).join("");
}

async function loadAdminRules() {
  const rules = await api("/api/pricing-rules");
  $("#admin-rules").innerHTML = rules.length
    ? `<tr><th>A partir de</th><th>Desconto</th><th></th></tr>` +
      rules.map((r) => `<tr><td>${r.min_days} dias</td><td>${r.discount_percent}%</td>
        <td><button class="btn small danger" data-delete-rule="${r.id}">Remover</button></td></tr>`).join("")
    : '<tr><td class="muted">Sem faixas de desconto: vale a diária cheia.</td></tr>';
}

/* ---------- Eventos ---------- */

$("#nav").addEventListener("click", (e) => e.target.dataset.view && show(e.target.dataset.view));
$("#btn-login").addEventListener("click", () => show("auth"));
$("#btn-logout").addEventListener("click", logout);

$("#form-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  const { email, password } = formData(e.target);
  try {
    await login(email, password);
    e.target.reset();
  } catch (err) {
    toast(err.message, true);
  }
});

$("#form-register").addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = formData(e.target);
  try {
    await api("/api/auth/register", { method: "POST", body: data });
    await login(data.email, data.password);
    e.target.reset();
  } catch (err) {
    toast(err.message, true);
  }
});

$("#form-search").addEventListener("submit", (e) => {
  e.preventDefault();
  loadVehicles();
});

$("#vehicle-list").addEventListener("click", (e) => e.target.dataset.reserve && openQuote(Number(e.target.dataset.reserve)));

$("#my-rentals").addEventListener("click", async (e) => {
  const id = e.target.dataset.cancel;
  if (!id || !confirm("Cancelar esta reserva?")) return;
  try {
    await api(`/api/rentals/${id}/cancel`, { method: "POST" });
    toast("Reserva cancelada");
    loadMyRentals();
  } catch (err) {
    toast(err.message, true);
  }
});

$("#form-profile").addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = formData(e.target);
  data.phone ??= null;
  data.driver_license ??= null;
  try {
    state.user = await api("/api/auth/me", { method: "PATCH", body: data });
    renderSession();
    toast("Perfil atualizado");
  } catch (err) {
    toast(err.message, true);
  }
});

$("#admin-tabs").addEventListener("click", (e) => {
  const tab = e.target.dataset.tab;
  if (!tab) return;
  $$("#admin-tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  $$("#view-admin .tab").forEach((t) => t.classList.toggle("hidden", t.id !== tab));
});

$("#form-vehicle").addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = formData(e.target);
  const id = data.id;
  delete data.id;
  try {
    if (id) {
      delete data.plate;
      await api(`/api/vehicles/${id}`, { method: "PATCH", body: data });
      toast("Veículo atualizado");
    } else {
      await api("/api/vehicles", { method: "POST", body: data });
      toast("Veículo cadastrado");
    }
    resetVehicleForm();
    loadAdmin();
  } catch (err) {
    toast(err.message, true);
  }
});
$("#vehicle-reset").addEventListener("click", resetVehicleForm);

$("#admin-vehicles").addEventListener("click", async (e) => {
  const { editVehicle: editId, deleteVehicle: delId } = e.target.dataset;
  if (editId) return editVehicle(Number(editId));
  if (!delId || !confirm("Excluir este veículo?")) return;
  try {
    await api(`/api/vehicles/${delId}`, { method: "DELETE" });
    toast("Veículo excluído");
    loadAdmin();
  } catch (err) {
    toast(err.message, true);
  }
});

$("#admin-rentals").addEventListener("click", async (e) => {
  const { rental, status } = e.target.dataset;
  if (!rental) return;
  try {
    await api(`/api/admin/rentals/${rental}/status`, { method: "POST", body: { status } });
    toast("Locação atualizada");
    loadAdmin();
  } catch (err) {
    toast(err.message, true);
  }
});

$("#admin-users").addEventListener("click", async (e) => {
  const { user, role, active } = e.target.dataset;
  if (!user) return;
  const body = role ? { role } : { active: active === "true" };
  try {
    await api(`/api/admin/users/${user}`, { method: "PATCH", body });
    toast("Usuário atualizado");
    loadAdminUsers();
  } catch (err) {
    toast(err.message, true);
  }
});

$("#form-rule").addEventListener("submit", async (e) => {
  e.preventDefault();
  const { min_days, discount_percent } = formData(e.target);
  try {
    await api("/api/pricing-rules", { method: "PUT", body: { min_days: Number(min_days), discount_percent: Number(discount_percent) } });
    e.target.reset();
    loadAdminRules();
  } catch (err) {
    toast(err.message, true);
  }
});

$("#admin-rules").addEventListener("click", async (e) => {
  const id = e.target.dataset.deleteRule;
  if (!id) return;
  try {
    await api(`/api/pricing-rules/${id}`, { method: "DELETE" });
    loadAdminRules();
  } catch (err) {
    toast(err.message, true);
  }
});

const today = new Date().toISOString().slice(0, 10);
$("#form-search").start_date.min = today;
$("#form-search").end_date.min = today;

loadMe().then(() => show("vehicles"));
