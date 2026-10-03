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

function toast(msg, type = "info") {
  const el = $("#toast");
  el.textContent = msg;
  el.className = "toast " + (type === true ? "error" : type);
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.add("hidden"), 3500);
}

async function api(path, { method = "GET", body } = {}) {
  const res = await LocalApi.handle(method, path, body, state.token);
  if (res.status === 204) return null;
  const data = res.data;
  if (res.status >= 400) {
    if (res.status === 401 && state.token && !path.startsWith("/api/auth/login")) logout();
    const err = new Error(typeof data.detail === "string" ? data.detail : `Erro ${res.status}`);
    err.status = res.status;
    err.errors = data.errors || {};
    throw err;
  }
  return data;
}

function formData(form) {
  const out = {};
  for (const [k, v] of new FormData(form)) if (v !== "") out[k] = v;
  return out;
}

/* ---------- Validação de formulários ---------- */

const { masks, rules, digits, passwordStrength } = Validation;
const extraRules = {
  confirm: (v, input) => (v === input.form.password.value ? "" : "As senhas não conferem"),
  range: (v, input) => {
    const n = Number(v);
    if (!Number.isInteger(n)) return "Informe um número inteiro";
    if (input.min !== "" && n < Number(input.min)) return `O mínimo é ${input.min}`;
    if (input.max !== "" && n > Number(input.max)) return `O máximo é ${input.max}`;
    return "";
  },
};
const STRENGTH = ["", "Fraca", "Razoável", "Boa", "Forte"];

function fieldParts(input) {
  const label = input.closest("label");
  return { label, error: label.querySelector(".field-error"), hint: label.querySelector(".field-hint") };
}

function setFieldError(input, message) {
  const { label, error, hint } = fieldParts(input);
  label.classList.toggle("invalid", !!message);
  label.classList.toggle("valid", !message && input.value !== "" && !!input.dataset.rules);
  input.setAttribute("aria-invalid", message ? "true" : "false");
  error.textContent = message || "";
  if (hint) hint.classList.toggle("hidden", !!message);
}

function validateField(input) {
  const names = (input.dataset.rules || "").split(" ").filter(Boolean);
  const value = input.value;
  let message = "";
  if (!names.includes("required") && value.trim() === "" && !(names.includes("confirm") && input.form.password.value)) {
    message = "";
  } else {
    for (const name of names) {
      message = (rules[name] || extraRules[name])(value, input);
      if (message) break;
    }
  }
  setFieldError(input, message);
  return !message;
}

function validateForm(form) {
  clearFormAlert(form);
  const inputs = [...form.querySelectorAll("[data-rules]")].filter((i) => !i.disabled);
  const invalid = inputs.filter((i) => !validateField(i));
  if (invalid.length) {
    invalid[0].focus();
    showFormAlert(form, invalid.length === 1 ? "Corrija o campo destacado." : `Corrija os ${invalid.length} campos destacados.`);
  }
  return invalid.length === 0;
}

function resetFormState(form) {
  clearFormAlert(form);
  form.querySelectorAll("[data-rules]").forEach((i) => {
    delete i.dataset.touched;
    setFieldError(i, "");
    i.closest("label").classList.remove("valid");
  });
  form.querySelectorAll(".strength").forEach((el) => (el.dataset.level = 0));
}

function showFormAlert(form, message, type = "error") {
  let box = form.querySelector(".form-alert");
  if (!box) {
    box = document.createElement("div");
    box.setAttribute("role", "alert");
    const anchor = form.querySelector(".form-sub") || form.querySelector("h2, h3");
    anchor ? anchor.after(box) : form.prepend(box);
  }
  box.className = `form-alert ${type}`;
  box.textContent = message;
}

function clearFormAlert(form) {
  form.querySelector(".form-alert")?.remove();
}

function applyServerErrors(form, err) {
  const entries = Object.entries(err.errors || {}).filter(([name]) => form.elements[name]?.dataset?.rules !== undefined);
  for (const [name, message] of entries) setFieldError(form.elements[name], message);
  if (entries.length) {
    form.elements[entries[0][0]].focus();
    showFormAlert(form, entries.length === 1 && err.status === 409 ? err.message : "Corrija os campos destacados.");
  } else {
    showFormAlert(form, err.message);
  }
}

async function submitting(form, task) {
  const btn = form.querySelector("button:not([type=button])");
  const text = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Enviando…";
  try {
    await task();
  } finally {
    btn.disabled = false;
    btn.textContent = text;
  }
}

function enhanceForm(form) {
  form.noValidate = true;
  form.querySelectorAll("[data-rules], [data-mask]").forEach((input) => {
    const label = input.closest("label");
    if (input.dataset.hint) {
      label.insertAdjacentHTML("beforeend", `<small class="field-hint">${esc(input.dataset.hint)}</small>`);
    }
    if (input.hasAttribute("data-strength")) {
      label.insertAdjacentHTML("beforeend", '<span class="strength" data-level="0"><i></i><i></i><i></i><i></i><em></em></span>');
    }
    label.insertAdjacentHTML("beforeend", '<small class="field-error" aria-live="polite"></small>');
    input.addEventListener("input", () => {
      if (input.dataset.mask) input.value = masks[input.dataset.mask](input.value);
      if (input.hasAttribute("data-strength")) {
        const level = input.value ? passwordStrength(input.value) : 0;
        const meter = label.querySelector(".strength");
        meter.dataset.level = level;
        meter.querySelector("em").textContent = STRENGTH[level];
      }
      if (input.dataset.touched) validateField(input);
      if (input.name === "password" && form.password_confirm?.dataset.touched) validateField(form.password_confirm);
    });
    input.addEventListener("blur", () => {
      if (input.value === "" && !input.dataset.touched) return;
      input.dataset.touched = "1";
      validateField(input);
    });
  });
  form.querySelectorAll(".pass-toggle").forEach((btn) =>
    btn.addEventListener("click", () => {
      const input = btn.previousElementSibling;
      input.type = input.type === "password" ? "text" : "password";
      btn.textContent = input.type === "password" ? "Mostrar" : "Ocultar";
    }));
}

const fmtCpf = (v) => (v ? masks.cpf(v) : "—");
const fmtPhone = (v) => (v ? masks.phone(v) : "—");
const fmtPlate = (v) => masks.plate(v);
const firstName = (name) => name.split(" ")[0];

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
  $("#cnh-notice").classList.toggle("hidden", !logged || !!state.user.driver_license);
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
  show("vehicles");
}

/* ---------- Datas da locação ---------- */

let tripDays = 3;
let pricingRules = [];
let datePicker = null;

const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parseIso = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (iso, n) => {
  const d = parseIso(iso);
  d.setDate(d.getDate() + n);
  return isoLocal(d);
};
const daysBetween = (a, b) => Math.round((parseIso(b) - parseIso(a)) / 86400000);
const fmtLong = (iso) => parseIso(iso).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" });

function setDates(changed, reload = true) {
  const f = $("#form-search");
  const today = isoLocal(new Date());
  if (!f.start_date.value) f.start_date.value = addDays(today, 1);
  if (f.start_date.value < today) f.start_date.value = today;
  if (changed === "range" && f.end_date.value > f.start_date.value) {
    tripDays = daysBetween(f.start_date.value, f.end_date.value);
  }
  f.end_date.value = addDays(f.start_date.value, tripDays);
  datePicker?.setDate([f.start_date.value, f.end_date.value], false);
  renderTripSummary();
  if (reload) loadVehicles();
}

function renderTripSummary() {
  const f = $("#form-search");
  if (!f.start_date.value) return;
  $$("#durations button").forEach((b) => b.classList.toggle("active", Number(b.dataset.days) === tripDays));
  const rule = pricingRules.filter((r) => r.min_days <= tripDays).sort((a, b) => b.min_days - a.min_days)[0];
  $("#trip-summary").innerHTML =
    `<b>${tripDays} ${tripDays === 1 ? "diária" : "diárias"}</b> · retirada ${fmtLong(f.start_date.value)}, devolução ${fmtLong(f.end_date.value)}` +
    (rule ? ` · <span class="discount">${rule.discount_percent}% de desconto</span>` : "");
}

/* ---------- Veículos (cliente) ---------- */

async function loadVehicles() {
  const params = new URLSearchParams(formData($("#form-search")));
  try {
    const [vehicles, rules] = await Promise.all([api(`/api/vehicles?${params}`), api("/api/pricing-rules")]);
    pricingRules = rules;
    renderTripSummary();
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
        toast("Reserva confirmada! Ela aparece em Minhas reservas.", "success");
        show("rentals");
      } catch (e) {
        if (e.errors.driver_license) return goToProfileField("driver_license", e.message);
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
      <td>${esc(r.vehicle.brand)} ${esc(r.vehicle.model)} <span class="muted">${esc(fmtPlate(r.vehicle.plate))}</span></td>
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
  resetFormState(f);
  f.name.value = state.user.name;
  f.phone.value = state.user.phone ? masks.phone(state.user.phone) : "";
  f.driver_license.value = state.user.driver_license || "";
  f.password.value = "";
  f.password_confirm.value = "";
  $("#profile-ids").textContent = `${state.user.email}${state.user.cpf ? ` · CPF ${fmtCpf(state.user.cpf)}` : ""}`;
}

function goToProfileField(name, message) {
  show("profile");
  const input = $("#form-profile").elements[name];
  input.dataset.touched = "1";
  setFieldError(input, message);
  input.focus();
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
        <td>${esc(fmtPlate(v.plate))}</td>
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
  resetFormState(f);
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
  resetFormState(f);
  f.plate.value = fmtPlate(v.plate);
  f.plate.disabled = true;
  $("#vehicle-form-title").textContent = `Editar ${fmtPlate(v.plate)}`;
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
    `<tr><th>Nome</th><th>E-mail</th><th>Celular</th><th>CPF</th><th>CNH</th><th>Papel</th><th>Status</th><th></th></tr>` +
    users.map((u) => {
      const self = u.id === state.user.id;
      return `
      <tr>
        <td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${esc(fmtPhone(u.phone))}</td><td>${esc(fmtCpf(u.cpf))}</td><td>${esc(u.driver_license || "—")}</td>
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
  const form = e.target;
  if (!validateForm(form)) return;
  const { email, password } = formData(form);
  await submitting(form, async () => {
    try {
      await login(email, password);
      form.reset();
      resetFormState(form);
      toast(`Olá, ${firstName(state.user.name)}!`, "success");
    } catch (err) {
      form.password.value = "";
      form.password.focus();
      showFormAlert(form, err.status === 401 ? "E-mail ou senha incorretos. Confira e tente de novo." : err.message);
    }
  });
});

$("#form-register").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  if (!validateForm(form)) return;
  const { password_confirm, ...data } = formData(form);
  await submitting(form, async () => {
    try {
      await api("/api/auth/register", { method: "POST", body: data });
    } catch (err) {
      applyServerErrors(form, err);
      if (err.status === 409) showFormAlert(form, `${err.message}. Se a conta é sua, entre pelo formulário Entrar.`);
      return;
    }
    await login(data.email, data.password);
    form.reset();
    resetFormState(form);
    toast(
      data.driver_license
        ? `Conta criada! Bem-vindo(a), ${firstName(state.user.name)}. Já pode reservar.`
        : `Conta criada! Bem-vindo(a), ${firstName(state.user.name)}. Cadastre a CNH no perfil para reservar.`,
      "success",
    );
  });
});

$$("[data-goto]").forEach((a) =>
  a.addEventListener("click", (e) => {
    e.preventDefault();
    const target = $(`#${a.dataset.goto}`);
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.querySelector("input").focus();
  }));
$("[data-goto-profile]").addEventListener("click", () => goToProfileField("driver_license", ""));

$("#form-search").addEventListener("submit", (e) => e.preventDefault());
$("#form-search").category.addEventListener("change", loadVehicles);
$("#durations").addEventListener("click", (e) => {
  if (!e.target.dataset.days) return;
  tripDays = Number(e.target.dataset.days);
  setDates("duration");
});
datePicker = flatpickr("#date-range", {
  mode: "range",
  locale: "pt",
  minDate: "today",
  dateFormat: "Y-m-d",
  altInput: true,
  altFormat: "d/m/Y",
  showMonths: window.innerWidth > 700 ? 2 : 1,
  disableMobile: true,
  onClose: (dates) => {
    const f = $("#form-search");
    if (dates.length) {
      f.start_date.value = isoLocal(dates[0]);
      f.end_date.value = dates[1] ? isoLocal(dates[1]) : "";
    }
    setDates("range");
  },
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
  const form = e.target;
  if (!validateForm(form)) return;
  const { password_confirm, ...data } = formData(form);
  data.phone ??= null;
  data.driver_license ??= null;
  await submitting(form, async () => {
    try {
      state.user = await api("/api/auth/me", { method: "PATCH", body: data });
    } catch (err) {
      return applyServerErrors(form, err);
    }
    renderSession();
    loadProfile();
    showFormAlert(form, data.password ? "Perfil e senha atualizados." : "Perfil atualizado.", "success");
  });
});

$("#admin-tabs").addEventListener("click", (e) => {
  const tab = e.target.dataset.tab;
  if (!tab) return;
  $$("#admin-tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  $$("#view-admin .tab").forEach((t) => t.classList.toggle("hidden", t.id !== tab));
});

$("#form-vehicle").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  if (!validateForm(form)) return;
  const { id, ...data } = formData(form);
  data.daily_rate = data.daily_rate.replace(",", ".");
  if (id) data.color ??= null;
  await submitting(form, async () => {
    try {
      if (id) {
        await api(`/api/vehicles/${id}`, { method: "PATCH", body: data });
      } else {
        await api("/api/vehicles", { method: "POST", body: data });
      }
    } catch (err) {
      return applyServerErrors(form, err);
    }
    toast(id ? "Veículo atualizado" : `Veículo ${data.plate} cadastrado`, "success");
    resetVehicleForm();
    loadAdmin();
  });
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
  const form = e.target;
  if (!validateForm(form)) return;
  const { min_days, discount_percent } = formData(form);
  await submitting(form, async () => {
    try {
      await api("/api/pricing-rules", { method: "PUT", body: { min_days: Number(min_days), discount_percent: Number(discount_percent) } });
    } catch (err) {
      return applyServerErrors(form, err);
    }
    form.reset();
    resetFormState(form);
    toast(`Desconto de ${discount_percent}% a partir de ${min_days} dias salvo`, "success");
    loadAdminRules();
  });
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

["#form-login", "#form-register", "#form-profile", "#form-vehicle", "#form-rule"].forEach((sel) => enhanceForm($(sel)));
setDates("init", false);
loadMe().then(() => show("vehicles"));

$("#btn-reset").addEventListener("click", () => {
  if (!confirm("Apagar todos os dados da demo neste navegador?")) return;
  LocalApi.reset();
  location.reload();
});
