"""Gera a demo estática em docs/ a partir da interface em app/static/."""

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "app" / "static"
DOCS = ROOT / "docs"

FETCH_BLOCK = '''  const headers = { "Content-Type": "application/json" };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {'''

LOCAL_BLOCK = '''  const res = await LocalApi.handle(method, path, body, state.token);
  if (res.status === 204) return null;
  const data = res.data;
  if (res.status >= 400) {'''

RESET_HANDLER = '''
$("#btn-reset").addEventListener("click", () => {
  if (!confirm("Apagar todos os dados da demo neste navegador?")) return;
  LocalApi.reset();
  location.reload();
});
'''

BANNER = '''  <div class="demo-banner">
    Demo: os dados ficam salvos só neste navegador. Admin: <b>admin@locadora.com</b> / <b>admin123</b>.
    <button id="btn-reset" class="btn small ghost">Restaurar dados</button>
  </div>
'''

BANNER_CSS = '''
.demo-banner { background: var(--surface); border-bottom: 1px solid var(--border); padding: 8px 16px; font-size: 13px; color: var(--muted); display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.demo-banner b { color: var(--text); }
'''


def replace_once(text: str, old: str, new: str) -> str:
    if old not in text:
        raise SystemExit(f"Trecho não encontrado em app/static: {old[:60]!r}")
    return text.replace(old, new, 1)


def main() -> None:
    js = replace_once((SRC / "app.js").read_text(), FETCH_BLOCK, LOCAL_BLOCK) + RESET_HANDLER
    (DOCS / "app.js").write_text(js)

    html = (SRC / "index.html").read_text()
    html = replace_once(html, 'href="/static/style.css"', 'href="style.css"')
    html = replace_once(
        html,
        '<script src="/static/app.js"></script>',
        '<script src="local-api.js"></script>\n  <script src="app.js"></script>',
    )
    html = replace_once(html, "<title>Locadora de Veículos</title>", "<title>Locadora de Veículos (demo)</title>")
    html = replace_once(html, "<body>\n", "<body>\n" + BANNER)
    (DOCS / "index.html").write_text(html)

    (DOCS / "style.css").write_text((SRC / "style.css").read_text() + BANNER_CSS)
    print("docs/ atualizado")


if __name__ == "__main__":
    main()
