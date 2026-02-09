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
  async login(email, password) {
    const res = await fetch(`${API}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
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
            <label>Email</label>
            <input id="login-email" type="email" placeholder="seu@email.com" autocomplete="username">
            <label>Senha</label>
            <input id="login-pass" type="password" placeholder="••••••••" autocomplete="current-password">
            <button id="btn-login" class="btn btn-success">Entrar</button>
          </div>
        </div>
      </div>
    `;
    $("#btn-login")?.addEventListener("click", async () => {
      const email = ($("#login-email")?.value || "").trim();
      const password = ($("#login-pass")?.value || "").trim();
      if (!email || !password) return toast("Informe email e senha.", "warn");
      try {
        await Auth.login(email, password);
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
              <label>Email</label>
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
          <div class="page-title">🧒 Alunos</div>
          <div class="hint">Cadastre e gerencie alunos.</div>
        </div>
        <button id="btn-open-aluno" class="btn btn-success">+ Cadastrar</button>
      </div>

      <div id="alunos-list" class="list" style="margin-top:12px;"></div>
    `;

    $("#btn-open-aluno")?.addEventListener("click", () => Modal.open("modal-aluno"));

    $("#btn-salvar-aluno")?.addEventListener("click", async () => {
      const nome = ($("#aluno-nome")?.value || "").trim();
      const responsavel = ($("#aluno-resp")?.value || "").trim();
      const telefone = ($("#aluno-fone")?.value || "").trim();
      const obs = ($("#aluno-obs")?.value || "").trim();
      if (!nome) return toast("Nome é obrigatório.", "warn");

      try {
        await apiFetch("/alunos", {
          method: "POST",
          body: JSON.stringify({ nome, responsavel, telefone, obs })
        });
        toast("Aluno cadastrado ✅", "ok");
        Modal.close("modal-aluno");
        await this.loadAlunos();
      } catch (e) {
        toast(e.message || "Falha ao cadastrar", "err");
      }
    });

    try {
      const data = await apiFetch("/alunos");
      const list = Array.isArray(data) ? data : (data?.alunos || []);
      const box = $("#alunos-list");
      box.innerHTML = list.map(a => `
        <div class="row">
          <div style="flex:1;">
            <b>${esc(a.nome)}</b>
            <div class="hint">${esc(a.responsavel || "")} ${a.telefone ? `· ${esc(a.telefone)}` : ""}</div>
          </div>
          <div class="pill">#${esc(a.id)}</div>
        </div>
      `).join("") || `<div class="hint">Nenhum aluno cadastrado.</div>`;
    } catch (e) {
      $("#alunos-list").innerHTML = `<div class="hint">Falha ao carregar alunos.</div>`;
    }
  },

  /* ---------------- Equipe ---------------- */
  async loadEquipe() {
    const root = document.getElementById("page-equipe");
    if (!root) return;

    root.innerHTML = `
      <div class="between-row">
        <div>
          <div class="page-title">👥 Equipe</div>
          <div class="hint">Cadastre usuários (admin/professor/auxiliar).</div>
        </div>
        <button id="btn-open-equipe" class="btn btn-success">+ Cadastrar</button>
      </div>

      <div id="equipe-list" class="list" style="margin-top:12px;"></div>
    `;

    $("#btn-open-equipe")?.addEventListener("click", () => Modal.open("modal-equipe"));

    $("#btn-salvar-user")?.addEventListener("click", async () => {
      const nome = ($("#user-nome")?.value || "").trim();
      const email = ($("#user-email")?.value || "").trim();
      const password = ($("#user-pass")?.value || "").trim();
      const role = ($("#user-role")?.value || "professor").trim();
      if (!nome || !email || !password) return toast("Nome, email e senha são obrigatórios.", "warn");

      try {
        await apiFetch("/usuarios", {
          method: "POST",
          body: JSON.stringify({ nome, email, password, role })
        });
        toast("Usuário cadastrado ✅", "ok");
        Modal.close("modal-equipe");
        await this.loadEquipe();
      } catch (e) {
        toast(e.message || "Falha ao cadastrar", "err");
      }
    });

    try {
      const data = await apiFetch("/usuarios");
      const list = Array.isArray(data) ? data : (data?.usuarios || []);
      $("#equipe-list").innerHTML = list.map(u => `
        <div class="row">
          <div style="flex:1;">
            <b>${esc(u.nome)}</b>
            <div class="hint">${esc(u.email || "")} · ${esc(u.role || "")}</div>
          </div>
          <div class="pill">#${esc(u.id)}</div>
        </div>
      `).join("") || `<div class="hint">Nenhum usuário cadastrado.</div>`;
    } catch (e) {
      $("#equipe-list").innerHTML = `<div class="hint">Falha ao carregar equipe.</div>`;
    }
  },

  /* ---------------- AULAS ---------------- */
  async loadAulas() {
    const root = document.getElementById("page-aulas");
    if (!root) return;

    // UI base
    root.innerHTML = `
      <div class="grid2">
        <div class="card">
          <div class="card-title">🚀 Nova Aula</div>
          <div class="hint">Escolha a equipe e o tema, depois inicie.</div>

          <div class="form">
            <label>Professor(a)</label>
            <select id="aula-prof"></select>

            <label>Auxiliar</label>
            <select id="aula-aux"></select>

            <label>Tema</label>
            <input id="aula-tema" type="text" placeholder="Ex: A Arca de Noé">

            <button id="btn-iniciar-aula" class="btn btn-success">Iniciar aula</button>
          </div>
        </div>

        <div class="card">
          <div class="card-title">🔴 Aula Ativa</div>
          <div id="aula-ativa-box" class="hint">Carregando...</div>
        </div>
      </div>

      <div class="card" style="margin-top:16px;">
        <div class="between-row">
          <div>
            <div class="card-title">✅ Presenças</div>
            <div class="hint">Dar entrada e fazer checkout seguro.</div>
          </div>
          <button id="btn-encerrar-aula" class="btn btn-danger" style="display:none;">Encerrar aula</button>
        </div>

        <div class="between-row" style="gap:10px; margin-top:12px;">
          <select id="entrada-aluno" style="flex:1;"></select>
          <button id="btn-entrada" class="btn btn-success">Dar entrada</button>
        </div>

        <div id="lista-presentes" class="list" style="margin-top:12px;"></div>
      </div>
    `;

    // load equipe + alunos (robusto: aceita array ou objeto)
    const [equipeRaw, alunosRaw] = await Promise.all([
      apiFetch("/usuarios").catch(() => []),
      apiFetch("/alunos").catch(() => []),
    ]);

    const usuarios = Array.isArray(equipeRaw) ? equipeRaw : (equipeRaw?.usuarios || []);
    const alunosList = Array.isArray(alunosRaw) ? alunosRaw : (alunosRaw?.alunos || []);

    const selProf = $("#aula-prof");
    const selAux = $("#aula-aux");
    const selEntrada = $("#entrada-aluno");

    if (selProf) {
      const profs = usuarios.filter(u => ["professor","admin"].includes(String(u.role || "").toLowerCase()));
      selProf.innerHTML =
        profs.map(u => `<option value="${esc(u.nome)}">${esc(u.nome)}</option>`).join("") ||
        `<option value="">(Sem equipe cadastrada)</option>`;
    }
    if (selAux) {
      const opts = [`<option value="Nenhum">Nenhum</option>`].concat(
        usuarios.map(u => `<option value="${esc(u.nome)}">${esc(u.nome)}</option>`)
      );
      selAux.innerHTML = opts.join("");
    }
    if (selEntrada) {
      selEntrada.innerHTML =
        alunosList.map(a => `<option value="${a.id}">${esc(a.nome)}</option>`).join("") ||
        `<option value="">(Sem alunos cadastrados)</option>`;
    }

    $("#btn-iniciar-aula")?.addEventListener("click", async () => {
      const tema = ($("#aula-tema")?.value || "").trim();
      const professor = selProf?.value || "";
      const auxiliar = selAux?.value || "Nenhum";
      if (!tema) return toast("Digite o tema da aula.", "warn");

      try {
        await apiFetch("/aulas/iniciar", {
          method: "POST",
          body: JSON.stringify({ tema, professor, auxiliar })
        });
        toast("Aula iniciada ✅", "ok");
        await this.refreshAulaAtivaUI();
      } catch (e) {
        const msg = (e?.payload && (e.payload.error || e.payload.message)) || e.message || "Falha ao iniciar aula";
        toast(msg, "err");
      }
    });

    // ✅ CHECK-IN (entrada) agora manda aula_id + aluno_id (não falha por “aula ativa”)
    $("#btn-entrada")?.addEventListener("click", async () => {
      const aluno_id = Number(selEntrada?.value || 0);
      if (!aluno_id) return toast("Selecione um aluno.", "warn");
      try {
        const ativa = await apiFetch("/aulas/ativa");
        const aula = ativa?.aula;
        if (!aula?.id) return toast("Não há aula ativa.", "warn");

        await apiFetch("/aulas/entrada", {
          method: "POST",
          body: JSON.stringify({ aula_id: aula.id, aluno_id })
        });
        toast("Entrada registrada ✅", "ok");
        await this.refreshAulaAtivaUI();
      } catch (e) {
        const msg = (e?.payload && (e.payload.error || e.payload.message)) || e.message || "Falha ao dar entrada";
        toast(msg, "err");
      }
    });

    $("#btn-encerrar-aula")?.addEventListener("click", async () => {
      if (!confirm("Encerrar aula atual?")) return;
      try {
        await apiFetch("/aulas/encerrar", { method: "POST", body: JSON.stringify({}) });
        toast("Aula encerrada ✅", "ok");
        await this.refreshAulaAtivaUI();
      } catch (e) {
        toast(e.message || "Falha ao encerrar", "err");
      }
    });

    await this.refreshAulaAtivaUI();
  },

  async refreshAulaAtivaUI() {
    const box = $("#aula-ativa-box");
    const list = $("#lista-presentes");
    const btnEncerrar = $("#btn-encerrar-aula");
    if (!box || !list) return;

    try {
      const data = await apiFetch("/aulas/ativa");
      const aula = data?.aula;

      if (!aula?.id) {
        box.innerHTML = `<div class="hint">Nenhuma aula ativa.</div>`;
        list.innerHTML = `<div class="hint">Inicie uma aula para registrar presença.</div>`;
        if (btnEncerrar) btnEncerrar.style.display = "none";
        return;
      }

      box.innerHTML = `
        <div class="list">
          <div class="row"><b>ID:</b> #${esc(aula.id)}</div>
          <div class="row"><b>Tema:</b> ${esc(aula.tema || "")}</div>
          <div class="row"><b>Equipe:</b> ${esc(aula.professores || "")}</div>
          <div class="row"><b>Início:</b> ${fmtDate(aula.data_aula)}</div>
        </div>
      `;
      if (btnEncerrar) btnEncerrar.style.display = "";

      const pres = await apiFetch(`/aulas/${aula.id}/presenca`).catch(() => ({ ok: true, presentes: [] }));
      const presentes = pres?.presentes || [];
      list.innerHTML = presentes.map(p => `
        <div class="row">
          <div style="flex:1;">
            <b>${esc(p.nome)}</b>
            <div class="hint">
              Entrada: ${fmtDate(p.horario_entrada)} · Saída: ${fmtDate(p.horario_saida)} ${p.retirado_por ? `· Retirado por: ${esc(p.retirado_por)}` : ""}
            </div>
          </div>
          <div class="actions">
            <button class="btn btn-ghost" data-acao="saida" data-id="${esc(p.aluno_id)}">Checkout</button>
          </div>
        </div>
      `).join("") || `<div class="hint">Ainda sem presenças.</div>`;

      // bind checkout
      $$(`[data-acao="saida"]`, list).forEach(btn => {
        btn.addEventListener("click", async () => {
          const aluno_id = Number(btn.getAttribute("data-id") || 0);
          if (!aluno_id) return;
          const retirado_por = prompt("Quem retirou o aluno? (opcional)") || "";
          try {
            await apiFetch("/aulas/saida", {
              method: "POST",
              body: JSON.stringify({ aula_id: aula.id, aluno_id, retirado_por })
            });
            toast("Checkout registrado ✅", "ok");
            await this.refreshAulaAtivaUI();
          } catch (e) {
            const msg = (e?.payload && (e.payload.error || e.payload.message)) || e.message || "Falha no checkout";
            toast(msg, "err");
          }
        });
      });

    } catch (e) {
      box.innerHTML = `<div class="hint">Falha ao buscar aula ativa.</div>`;
      list.innerHTML = `<div class="hint">Falha ao listar presenças.</div>`;
    }
  },

  /* ---------------- Histórico ---------------- */
  async loadHistorico() {
    const root = document.getElementById("page-historico");
    if (!root) return;

    root.innerHTML = `
      <div class="between-row">
        <div>
          <div class="page-title">📜 Histórico</div>
          <div class="hint">Clique para ver o relatório completo.</div>
        </div>
      </div>
      <div id="hist-list" class="list" style="margin-top:12px;"></div>
    `;

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
