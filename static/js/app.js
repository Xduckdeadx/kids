/* Kid IEQ 2025 - app.js (FULL) */
const API = "/api";

/* ---------------- helpers ---------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function show(el) { if (el) el.style.display = ""; }
function hide(el) { if (el) el.style.display = "none"; }

function esc(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function fmtDate(iso) {
  if (!iso) return "";
  const s = String(iso);
  // Se vier apenas hora (TIME do Postgres), mostra direto
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(s)) return s.slice(0,5);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString("pt-BR");
}

function toast(msg, type = "info") {
  const el = document.createElement("div");
  el.style.cssText =
    "position:fixed;top:16px;right:16px;z-index:99999;max-width:460px;" +
    "padding:12px 14px;border-radius:12px;color:#fff;font-weight:800;" +
    "box-shadow:0 10px 25px rgba(0,0,0,.18);opacity:0;transform:translateY(-6px);" +
    "transition:.18s ease;";
  el.style.background =
    type === "ok" ? "#10b981" : type === "err" ? "#ef4444" : type === "warn" ? "#f59e0b" : "#3b82f6";
  el.innerText = msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => { el.style.opacity = "1"; el.style.transform = "translateY(0)"; });
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateY(-6px)";
    setTimeout(() => el.remove(), 180);
  }, 2600);
}

async function fileToBase64(file) {
  if (!file) return "";
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
    reader.onload = () => {
      const res = String(reader.result || "");
      // res vem como data:image/...;base64,XXXX
      const parts = res.split(",");
      resolve(parts[1] || "");
    };
    reader.readAsDataURL(file);
  });
}

function b64ImgTag(b64, alt = "") {
  if (!b64) return "";
  return `<img src="data:image/png;base64,${b64}" alt="${esc(alt)}" style="max-width:100%;border-radius:12px;" />`;
}

/* ---------------- Auth ---------------- */
const Auth = {
  tokenKey: "kid_ieq_token",
  get token() { return localStorage.getItem(this.tokenKey) || ""; },
  set token(v) { if (v) localStorage.setItem(this.tokenKey, v); else localStorage.removeItem(this.tokenKey); },
  headers(extra = {}) {
    const h = { "Content-Type": "application/json", ...extra };
    if (this.token) h["Authorization"] = `Bearer ${this.token}`;
    return h;
  },
  
async login(usuario, senha) {
  const res = await fetch(`${API}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usuario, senha })
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) throw new Error(data?.error || "Falha no login");
  this.token = data.token;
  return data;
},

async me() {
    const res = await fetch(`${API}/me`, { headers: this.headers() });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) throw new Error(data?.error || "Não autenticado");
    return data;
  },
  logout() {
    this.token = "";
    location.reload();
  }
};

async function apiFetch(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: Auth.headers(opts.headers || {})
  });

  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("application/json")
    ? await res.json().catch(() => null)
    : await res.text().catch(() => null);

  if (!res.ok) {
    const err = new Error(
      (data && typeof data === "object" && (data.error || data.message)) || `Falha ${res.status}`
    );
    err.status = res.status;
    err.payload = data;
    throw err;
  }
  return data;
}

/* ---------------- Modal ---------------- */
const Modal = {
  open(id) { const el = document.getElementById(id); if (el) el.classList.add("open"); },
  close(id) { const el = document.getElementById(id); if (el) el.classList.remove("open"); },
};

/* ---------------- App State ---------------- */
const App = {
  me: null,
  page: "home",

  async boot() {
    try {
      this.me = await Auth.me();
      this.bindNav();
      this.renderShell();
      await this.goto("home");
    } catch (e) {
      this.renderLogin();
    }
  },

  renderLogin() {
    const root = document.getElementById("app");
    root.innerHTML = `
      <div class="login-wrap">
        <div class="card login-card">
          <div class="card-title">🔐 Kid IEQ</div>
          <div class="hint">Entre para acessar o sistema.</div>
          <div class="form">
            <label>Usuário</label>
            <input id="login-user" type="text" placeholder="Seu usuário" autocomplete="username">
            <label>Senha</label>
            <input id="login-pass" type="password" placeholder="••••••••" autocomplete="current-password">
            <button id="btn-login" class="btn btn-success">Entrar</button>
          </div>
        </div>
      </div>
    `;
    $("#btn-login")?.addEventListener("click", async () => {
      const usuario = ($("#login-user")?.value || "").trim();
      const senha = ($("#login-pass")?.value || "").trim();
      if (!usuario || !senha) return toast("Informe usuário e senha.", "warn");
      try {
        await Auth.login(usuario, senha);
        toast("Bem-vindo ✅", "ok");
        location.reload();
      } catch (e) {
        toast(e.message || "Falha no login", "err");
      }
    });
  },

  renderShell() {
    const root = document.getElementById("app");
    root.innerHTML = `
      <div class="layout">
        <aside class="sidebar">
          <div class="brand">
            <div class="brand-title">Kid IEQ</div>
            <div class="brand-sub">Gestão de aulas e presença</div>
          </div>

          <nav class="nav">
            <button class="nav-item active" data-page="home">🏠 Início</button>
            <button class="nav-item" data-page="alunos">🧒 Alunos</button>
            <button class="nav-item" data-page="equipe">👥 Equipe</button>
            <button class="nav-item" data-page="aulas">🎓 Aulas</button>
            <button class="nav-item" data-page="aula">🟢 Aula ativa</button>
            <button class="nav-item" data-page="historico">📜 Histórico</button>
            <button class="nav-item" data-page="mural">📌 Mural</button>
            <button class="nav-item" data-page="config">⚙️ Config</button>
          </nav>

          <div class="sidebar-foot">
            <div class="me">
              <div class="me-name">${esc(this.me?.nome || "")}</div>
              <div class="me-role">${esc(this.me?.role || "")}</div>
            </div>
            <button id="btn-logout" class="btn btn-ghost">Sair</button>
          </div>
        </aside>

        <main class="main">
          <div id="pages">
            <section id="page-home" class="page"></section>
            <section id="page-alunos" class="page" style="display:none;"></section>
            <section id="page-equipe" class="page" style="display:none;"></section>
            <section id="page-aulas" class="page" style="display:none;"></section>
            <section id="page-aula" class="page" style="display:none;"></section>
            <section id="page-historico" class="page" style="display:none;"></section>
            <section id="page-mural" class="page" style="display:none;"></section>
            <section id="page-config" class="page" style="display:none;"></section>
          </div>
        </main>
      </div>

      <!-- modal aluno -->
      <div id="modal-aluno" class="modal">
        <div class="modal-card">
          <div class="modal-head">
            <div class="modal-title">Cadastrar aluno</div>
            <button class="btn btn-ghost" onclick="Modal.close('modal-aluno')">✖</button>
          </div>
          <div class="modal-body">
            <div class="form">
              <label>Nome</label>
              <input id="aluno-nome" type="text" placeholder="Nome do aluno">
              <label>Responsável</label>
              <input id="aluno-resp" type="text" placeholder="Nome do responsável">
              <label>Telefone</label>
              <input id="aluno-fone" type="text" placeholder="(xx) xxxxx-xxxx">
              <label>Observações</label>
              <textarea id="aluno-obs" rows="3" placeholder="Alergias, cuidados, etc..."></textarea>
            </div>
          </div>
          <div class="modal-foot">
            <button class="btn btn-ghost" onclick="Modal.close('modal-aluno')">Cancelar</button>
            <button id="btn-salvar-aluno" class="btn btn-success">Cadastrar</button>
          </div>
        </div>
      </div>

      <!-- modal equipe -->
      <div id="modal-equipe" class="modal">
        <div class="modal-card">
          <div class="modal-head">
            <div class="modal-title">Cadastrar equipe</div>
            <button class="btn btn-ghost" onclick="Modal.close('modal-equipe')">✖</button>
          </div>
          <div class="modal-body">
            <div class="form">
              <label>Nome</label>
              <input id="user-nome" type="text" placeholder="Nome completo">
              <label>Usuário</label>
              <input id="user-email" type="email" placeholder="email@dominio.com">
              <label>Senha</label>
              <input id="user-pass" type="password" placeholder="Senha">
              <label>Função</label>
              <select id="user-role">
                <option value="professor">Professor</option>
                <option value="auxiliar">Auxiliar</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          <div class="modal-foot">
            <button class="btn btn-ghost" onclick="Modal.close('modal-equipe')">Cancelar</button>
            <button id="btn-salvar-user" class="btn btn-success">Cadastrar</button>
          </div>
        </div>
      </div>

      <!-- modal histórico (relatório) -->
      <div id="modal-relatorio" class="modal">
        <div class="modal-card">
          <div class="modal-head">
            <div class="modal-title">Relatório da Aula</div>
            <button class="btn btn-ghost" onclick="Modal.close('modal-relatorio')">✖</button>
          </div>
          <div class="modal-body" id="relatorio-body"></div>
          <div class="modal-foot">
            <button class="btn btn-ghost" onclick="Modal.close('modal-relatorio')">Fechar</button>
          </div>
        </div>
      </div>
    `;

    $("#btn-logout")?.addEventListener("click", () => Auth.logout());
  },

  bindNav() {
    document.addEventListener("click", (e) => {
      const btn = e.target.closest(".nav-item");
      if (!btn) return;
      const page = btn.getAttribute("data-page");
      this.goto(page);
    });
  },

  async goto(page) {
    if (!this.me) return;
    this.page = page;

    // nav active
    $$(".nav-item").forEach(b => b.classList.toggle("active", b.getAttribute("data-page") === page));

    // show/hide pages
    $$(".page").forEach(p => (p.style.display = "none"));
    const current = document.getElementById(`page-${page}`);
    if (current) current.style.display = "";

    // load page
    if (page === "home") {
      await this.loadStats();
      await this.loadHomePinned();
      return;
    }
    if (page === "alunos") return this.loadAlunos();
    if (page === "equipe") return this.loadEquipe();
    if (page === "mural") return this.loadAvisos();

    if (page === "aulas") return this.loadAulas();
    if (page === "aula") return this.loadAulaAtiva();
    if (page === "historico") return this.loadHistorico();
    if (page === "config") return;
  },

  renderComingSoon(pageId, text) {
    const el = document.getElementById(pageId);
    if (!el) return;
    el.innerHTML = `
      <div class="card">
        <div class="hint">${esc(text || "Em breve.")}</div>
      </div>
    `;
  },

  /* ---------------- Home ---------------- */
  async loadStats() {
    const root = document.getElementById("page-home");
    if (!root) return;

    root.innerHTML = `
      <div class="grid2">
        <div class="card">
          <div class="card-title">📊 Status</div>
          <div id="home-stats" class="hint">Carregando...</div>
        </div>
        <div class="card">
          <div class="card-title">📌 Acessos rápidos</div>
          <div class="hint">Use o menu para navegar.</div>
        </div>
      </div>
    `;

    try {
      const [alunos, equipe, ativa] = await Promise.all([
        apiFetch("/alunos").catch(() => []),
        apiFetch("/usuarios").catch(() => []),
        apiFetch("/aulas/ativa").catch(() => ({ ok: true, aula: null })),
      ]);

      const alunosCount = Array.isArray(alunos) ? alunos.length : (alunos?.alunos?.length || 0);
      const equipeCount = Array.isArray(equipe) ? equipe.length : (equipe?.usuarios?.length || 0);
      const aula = ativa?.aula;

      $("#home-stats").innerHTML = `
        <div class="list">
          <div class="row"><b>Alunos:</b> ${alunosCount}</div>
          <div class="row"><b>Equipe:</b> ${equipeCount}</div>
          <div class="row"><b>Aula ativa:</b> ${aula?.id ? `Sim (#${aula.id})` : "Não"}</div>
        </div>
      `;
    } catch (e) {
      $("#home-stats").innerHTML = `<div class="hint">Falha ao carregar.</div>`;
    }
  },

  async loadHomePinned() {
    // placeholder
  },

  /* ---------------- Alunos ---------------- */
  async loadAlunos() {
    const root = document.getElementById("page-alunos");
    if (!root) return;

    
root.innerHTML = `
  <div class="between-row">
    <div>
      <div class="page-title">📜 Histórico</div>
      <div class="hint">Relatórios das aulas e acesso rápido à aula ativa.</div>
    </div>
  </div>

  <div id="hist-ativa" class="card" style="margin-top:12px; display:none;">
    <div class="between-row">
      <div>
        <div class="card-title">🟢 Aula ativa agora</div>
        <div id="hist-ativa-info" class="hint"></div>
      </div>
      <button id="btn-entrar-ativa" class="btn btn-primary">Entrar</button>
    </div>
  </div>

  <div id="hist-list" class="list" style="margin-top:12px;"></div>
`;

    // Se existir aula ativa, mostra atalho
    try {
      const ativa = await apiFetch("/aulas/ativa");
      const aulaAtiva = ativa?.aula;
      const card = $("#hist-ativa");
      const info = $("#hist-ativa-info");
      if (aulaAtiva?.id && card && info) {
        card.style.display = "";
        info.innerHTML = `${esc(aulaAtiva.tema || "")} · ${esc(aulaAtiva.professores || "")} · ${fmtDate(aulaAtiva.data_aula)}`;
        $("#btn-entrar-ativa")?.addEventListener("click", async () => {
          await this.goto("aula");
        });
      }
    } catch (e) {}

    
// Se existir aula ativa, mostra atalho
try {
  const ativa = await apiFetch("/aulas/ativa");
  const aulaAtiva = ativa?.aula;
  const card = $("#hist-ativa");
  const info = $("#hist-ativa-info");
  if (aulaAtiva?.id && card && info) {
    card.style.display = "";
    info.innerHTML = `${esc(aulaAtiva.tema || "")} · ${esc(aulaAtiva.professores || "")} · ${fmtDate(aulaAtiva.data_aula)}`;
    $("#btn-entrar-ativa")?.addEventListener("click", async () => {
      await App.goto("aula");
    });
  }
} catch (_) {}

try {
      const data = await apiFetch("/aulas/historico");
      const aulas = data?.aulas || [];
      const box = $("#hist-list");

      box.innerHTML = aulas.map(a => `
        <div class="row" style="cursor:pointer;" data-aula="${esc(a.id)}">
          <div style="flex:1;">
            <b>${esc(a.tema || "")}</b>
            <div class="hint">${esc(a.professores || "")} · ${fmtDate(a.data_aula)}</div>
          </div>
          <div class="pill">#${esc(a.id)}</div>
        </div>
      `).join("") || `<div class="hint">Nenhuma aula no histórico.</div>`;

      $$(`[data-aula]`, box).forEach(row => {
        row.addEventListener("click", async () => {
          const id = Number(row.getAttribute("data-aula") || 0);
          if (!id) return;
          try {
            const rel = await apiFetch(`/aulas/${id}/relatorio`);
            const aula = rel?.aula;
            const presentes = rel?.presentes || [];
            const body = $("#relatorio-body");
            body.innerHTML = `
              <div class="list">
                <div class="row"><b>Tema:</b> ${esc(aula?.tema || "")}</div>
                <div class="row"><b>Equipe:</b> ${esc(aula?.professores || "")}</div>
                <div class="row"><b>Data:</b> ${fmtDate(aula?.data_aula)}</div>
              </div>
              <div style="height:10px;"></div>
              <div class="card-title">Presenças</div>
              <div class="list" style="margin-top:8px;">
                ${presentes.map(p => `
                  <div class="row">
                    <div style="flex:1;">
                      <b>${esc(p.nome)}</b>
                      <div class="hint">
                        Entrada: ${fmtDate(p.horario_entrada)} · Saída: ${fmtDate(p.horario_saida)} ${p.retirado_por ? `· Retirado por: ${esc(p.retirado_por)}` : ""}
                      </div>
                    </div>
                  </div>
                `).join("") || `<div class="hint">Sem presenças.</div>`}
              </div>
            `;
            Modal.open("modal-relatorio");
          } catch (e) {
            toast(e.message || "Falha ao abrir relatório", "err");
          }
        });
      });
    } catch (e) {
      $("#hist-list").innerHTML = `<div class="hint">Falha ao carregar histórico.</div>`;
    }
  },

  /* ---------------- Mural ---------------- */
  async loadAvisos() {
    const root = document.getElementById("page-mural");
    if (!root) return;
    root.innerHTML = `
      <div class="page-title">📌 Mural</div>
      <div class="hint">Em breve.</div>
    `;
  },
};

/* ---------------- Service Worker (register) ---------------- */
document.addEventListener("DOMContentLoaded", () => {
  App.boot();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
});
