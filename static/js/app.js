/* Kid IEQ 2026 - app.js (FULL) */
const API = "/api";

/* ---------------- helpers ---------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

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
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
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

  // ✅ backend espera {usuario, senha}
  async login(usuario, senha) {
    const res = await fetch(`${API}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario, senha })
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) throw new Error(data?.error || "Falha no login");
    this.token = data.token;
    return data.usuario;
  },

  // ✅ backend retorna {ok:true, usuario:{...}}
  async me() {
    const res = await fetch(`${API}/me`, { headers: this.headers() });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) throw new Error(data?.error || "Não autenticado");
    return data.usuario;
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
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:18px;background:#f4f6fb;">
        <div style="max-width:420px;width:100%;background:#fff;border-radius:18px;padding:18px;box-shadow:0 10px 25px rgba(0,0,0,.08);border:1px solid rgba(0,0,0,.06);">
          <div style="font-weight:900;font-size:18px;margin-bottom:6px;">🔐 Kid IEQ 2026</div>
          <div style="color:#64748b;margin-bottom:14px;">IEQ Central • Ministério Infantil</div>

          <label style="font-weight:800;font-size:13px;">Usuário</label>
          <input id="login-user" style="width:100%;padding:12px;border-radius:12px;border:1px solid #e5e7eb;margin:6px 0 12px;" placeholder="admin" autocomplete="username">

          <label style="font-weight:800;font-size:13px;">Senha</label>
          <input id="login-pass" type="password" style="width:100%;padding:12px;border-radius:12px;border:1px solid #e5e7eb;margin:6px 0 12px;" placeholder="1234" autocomplete="current-password">

          <button id="btn-login" style="width:100%;padding:12px;border-radius:12px;border:0;background:#3b82f6;color:#fff;font-weight:900;cursor:pointer;">
            Entrar
          </button>

          <div style="color:#64748b;font-size:12px;margin-top:12px;text-align:center;">
            Padrão: admin / 1234
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
      <style>
        .layout{display:grid;grid-template-columns:270px 1fr;min-height:100vh;background:#f4f6fb;}
        .sidebar{background:#ffffffcc;backdrop-filter:blur(8px);border-right:1px solid rgba(0,0,0,.06);padding:14px;}
        .brand{font-weight:900;font-size:18px;margin-bottom:10px;}
        .brand-sub{color:#64748b;font-size:12px;margin-top:4px;}
        .nav{display:flex;flex-direction:column;gap:10px;margin-top:14px;}
        .nav-item{width:100%;text-align:left;padding:12px;border-radius:14px;background:#fff;border:1px solid rgba(0,0,0,.06);box-shadow:0 6px 14px rgba(0,0,0,.05);font-weight:900;cursor:pointer;}
        .nav-item.active{outline:3px solid rgba(59,130,246,.18);border-color:rgba(59,130,246,.35);}
        .sidebar-foot{position:sticky;top:calc(100vh - 140px);margin-top:18px;}
        .btn-ghost{width:100%;padding:10px;border-radius:12px;border:1px solid rgba(0,0,0,.1);background:#fff;font-weight:900;cursor:pointer;}
        .main{padding:16px;overflow:auto;}
        .card{background:#fff;border-radius:16px;box-shadow:0 10px 25px rgba(0,0,0,.08);border:1px solid rgba(0,0,0,.06);padding:14px;}
        .page-title{font-weight:900;font-size:18px;margin-bottom:8px;}
        .hint{color:#64748b;font-size:13px;}
        @media (max-width: 900px){
          .layout{grid-template-columns:1fr;}
          .sidebar{border-right:none;border-bottom:1px solid rgba(0,0,0,.06);}
        }
      </style>

      <div class="layout">
        <aside class="sidebar">
          <div class="brand">IEQ Central</div>
          <div class="brand-sub">Kid 2026 • Ministério Infantil</div>

          <nav class="nav">
            <button class="nav-item active" data-page="home">🏠 Início</button>
            <button class="nav-item" data-page="alunos">🧒 Alunos</button>
            <button class="nav-item" data-page="equipe">👥 Equipe</button>
            <button class="nav-item" data-page="aulas">🎓 Aulas</button>
            <button class="nav-item" data-page="historico">📜 Histórico</button>
            <button class="nav-item" data-page="mural">📌 Mural</button>
            <button class="nav-item" data-page="config">⚙️ Config</button>
          </nav>

          <div class="sidebar-foot">
            <div class="hint" style="margin:14px 0 10px;">
              <b>${esc(this.me?.nome || "Usuário")}</b><br>
              ${esc(this.me?.role || "membro")}
            </div>
            <button id="btn-logout" class="btn-ghost">Sair</button>
          </div>
        </aside>

        <main class="main">
          <div id="pages">
            <section id="page-home" class="card"></section>
            <section id="page-alunos" class="card" style="display:none;"></section>
            <section id="page-equipe" class="card" style="display:none;"></section>
            <section id="page-aulas" class="card" style="display:none;"></section>
            <section id="page-historico" class="card" style="display:none;"></section>
            <section id="page-mural" class="card" style="display:none;"></section>
            <section id="page-config" class="card" style="display:none;"></section>
          </div>
        </main>
      </div>
    `;

    $("#btn-logout")?.addEventListener("click", () => Auth.logout());
    this.bindNav();
  },

  bindNav() {
    $$(".nav-item").forEach(btn => {
      btn.addEventListener("click", () => this.goto(btn.dataset.page));
    });
  },

  async goto(page) {
    this.page = page;

    // toggle nav
    $$(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.page === page));

    // toggle pages
    const ids = ["home","alunos","equipe","aulas","historico","mural","config"];
    ids.forEach(p => {
      const el = document.getElementById(`page-${p}`);
      if (el) el.style.display = (p === page) ? "" : "none";
    });

    // load
    if (page === "home") return this.loadHome();
    if (page === "alunos") return this.loadAlunos();
    if (page === "equipe") return this.loadEquipe();
    if (page === "aulas") return this.loadAulas();
    if (page === "historico") return this.loadHistorico();
    if (page === "mural") return this.loadMural();
    if (page === "config") return this.loadConfig();
  },

  async loadHome() {
    const root = document.getElementById("page-home");
    root.innerHTML = `
      <div class="page-title">Bem-vindo 👋</div>
      <div class="hint">Use o menu para gerenciar alunos, equipe, aulas e presença.</div>
      <div style="height:12px;"></div>
      <div id="home-stats" class="hint">Carregando estatísticas…</div>
    `;
    try {
      const st = await apiFetch("/estatisticas");
      $("#home-stats").innerHTML =
        `<b>Alunos:</b> ${esc(st.total_alunos)} &nbsp; • &nbsp; <b>Equipe:</b> ${esc(st.total_equipe)}`;
    } catch (e) {
      $("#home-stats").innerText = "Falha ao carregar estatísticas.";
    }
  },

  async loadAlunos() {
    const root = document.getElementById("page-alunos");
    root.innerHTML = `
      <div class="page-title">Alunos</div>
      <div class="hint">Cadastrar e listar alunos.</div>
      <div style="height:12px;"></div>

      <div style="display:grid;gap:10px;max-width:760px;">
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <input id="aluno-nome" placeholder="Nome do aluno" style="flex:1;min-width:240px;padding:12px;border-radius:12px;border:1px solid #e5e7eb;">
          <button id="btn-add-aluno" style="padding:12px 14px;border-radius:12px;border:0;background:#3b82f6;color:#fff;font-weight:900;cursor:pointer;">Cadastrar</button>
        </div>

        <input id="aluno-q" placeholder="Pesquisar..." style="padding:12px;border-radius:12px;border:1px solid #e5e7eb;">

        <div id="aluno-list" class="hint">Carregando…</div>
      </div>
    `;

    const refresh = async () => {
      try {
        const q = ($("#aluno-q").value || "").trim();
        const rows = await apiFetch(`/alunos${q ? `?q=${encodeURIComponent(q)}` : ""}`);
        $("#aluno-list").innerHTML = rows.length
          ? `<ul style="margin:0;padding-left:18px;">${rows.map(r => `<li>${esc(r.nome)}</li>`).join("")}</ul>`
          : `<div class="hint">Nenhum aluno encontrado.</div>`;
      } catch (e) {
        $("#aluno-list").innerText = "Erro ao listar alunos.";
      }
    };

    $("#btn-add-aluno").addEventListener("click", async () => {
      const nome = ($("#aluno-nome").value || "").trim();
      if (!nome) return toast("Informe o nome do aluno.", "warn");
      try {
        await apiFetch("/alunos", { method: "POST", body: JSON.stringify({ nome }) });
        $("#aluno-nome").value = "";
        toast("Aluno cadastrado ✅", "ok");
        refresh();
      } catch (e) {
        toast(e.message || "Erro ao cadastrar aluno", "err");
      }
    });

    $("#aluno-q").addEventListener("input", () => {
      clearTimeout(window.__t_aluno);
      window.__t_aluno = setTimeout(refresh, 250);
    });

    refresh();
  },

  async loadEquipe() {
    const root = document.getElementById("page-equipe");
    root.innerHTML = `
      <div class="page-title">Equipe</div>
      <div class="hint">Listar equipe (cadastro de equipe só admin).</div>
      <div style="height:12px;"></div>

      <input id="eq-q" placeholder="Pesquisar..." style="padding:12px;border-radius:12px;border:1px solid #e5e7eb;max-width:560px;width:100%;">
      <div style="height:10px;"></div>
      <div id="eq-list" class="hint">Carregando…</div>
    `;

    const refresh = async () => {
      try {
        const q = ($("#eq-q").value || "").trim();
        const rows = await apiFetch(`/usuarios${q ? `?q=${encodeURIComponent(q)}` : ""}`);
        $("#eq-list").innerHTML = rows.length
          ? `<ul style="margin:0;padding-left:18px;">${rows.map(r => `<li>${esc(r.nome)} <span class="hint">(${esc(r.role)})</span></li>`).join("")}</ul>`
          : `<div class="hint">Nenhum usuário encontrado.</div>`;
      } catch (e) {
        $("#eq-list").innerText = "Erro ao listar equipe.";
      }
    };

    $("#eq-q").addEventListener("input", () => {
      clearTimeout(window.__t_eq);
      window.__t_eq = setTimeout(refresh, 250);
    });

    refresh();
  },

  async loadAulas() {
    const root = document.getElementById("page-aulas");
    root.innerHTML = `
      <div class="page-title">Aulas</div>
      <div class="hint">Iniciar aula e depois fazer check-in na aula ativa.</div>
      <div style="height:12px;"></div>

      <div style="display:grid;gap:10px;max-width:760px;">
        <input id="aula-prof" placeholder="Professor(es)" style="padding:12px;border-radius:12px;border:1px solid #e5e7eb;">
        <input id="aula-tema" placeholder="Tema" style="padding:12px;border-radius:12px;border:1px solid #e5e7eb;">
        <button id="btn-aula-iniciar" style="padding:12px 14px;border-radius:12px;border:0;background:#10b981;color:#fff;font-weight:900;cursor:pointer;">
          Iniciar aula
        </button>
        <div id="aula-msg" class="hint"></div>
      </div>
    `;

    $("#btn-aula-iniciar").addEventListener("click", async () => {
      const professores = ($("#aula-prof").value || "").trim();
      const tema = ($("#aula-tema").value || "").trim();
      if (!professores || !tema) return toast("Informe professor(es) e tema.", "warn");
      try {
        const res = await apiFetch("/aulas/iniciar", { method: "POST", body: JSON.stringify({ professores, tema }) });
        $("#aula-msg").innerHTML = `Aula iniciada ✅ (ID: <b>${esc(res.id)}</b>)`;
        toast("Aula iniciada ✅", "ok");
      } catch (e) {
        toast(e.message || "Falha ao iniciar aula", "err");
      }
    });
  },

  async loadHistorico() {
    const root = document.getElementById("page-historico");
    root.innerHTML = `
      <div class="page-title">Histórico</div>
      <div class="hint">Lista de aulas registradas.</div>
      <div style="height:12px;"></div>
      <div id="hist" class="hint">Carregando…</div>
    `;
    try {
      const rows = await apiFetch("/aulas");
      $("#hist").innerHTML = rows.length
        ? `<ul style="margin:0;padding-left:18px;">${rows.map(a =>
            `<li><b>#${esc(a.id)}</b> ${esc(a.tema || "")} <span class="hint">(${fmtDate(a.data_aula)})</span></li>`
          ).join("")}</ul>`
        : `<div class="hint">Nenhuma aula encontrada.</div>`;
    } catch (e) {
      $("#hist").innerText = "Erro ao carregar histórico.";
    }
  },

  async loadMural() {
    const root = document.getElementById("page-mural");
    root.innerHTML = `
      <div class="page-title">Mural</div>
      <div class="hint">Seu backend tem avisos/likes/comentários. Se quiser, eu ligo essa tela também.</div>
    `;
  },

  async loadConfig() {
    const root = document.getElementById("page-config");
    root.innerHTML = `
      <div class="page-title">Configurações</div>
      <div class="hint">Sessão / conta</div>
      <div style="height:12px;"></div>
      <div class="hint"><b>Usuário:</b> ${esc(this.me?.usuario || "")}</div>
      <div class="hint"><b>Nome:</b> ${esc(this.me?.nome || "")}</div>
      <div class="hint"><b>Role:</b> ${esc(this.me?.role || "")}</div>
    `;
  },
};

/* ---------------- Bootstrap ---------------- */
document.addEventListener("DOMContentLoaded", () => {
  App.boot();
});
