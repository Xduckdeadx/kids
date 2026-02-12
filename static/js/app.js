/* static/js/app.js
   IEQ Central • Kid 2026
   SPA sem framework
*/

(() => {
  "use strict";

  // =========================
  // Helpers
  // =========================
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const escapeHtml = (str) =>
    String(str ?? "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[m]));

  const fmtDT = (v) => {
    if (!v) return "";
    try {
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) return String(v);
      return d.toLocaleString("pt-BR");
    } catch {
      return String(v);
    }
  };

  const toast = (msg, type="info") => {
    const el = $("#toast");
    if (!el) return;
    el.textContent = msg;
    el.dataset.type = type;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 2800);
  };

  // =========================
  // Theme
  // =========================
  const Theme = {
    key: "ieq_theme",
    get() { return localStorage.getItem(this.key) || "light"; },
    set(v) { localStorage.setItem(this.key, v); this.apply(); },
    toggle() { this.set(this.get() === "dark" ? "light" : "dark"); },
    apply() {
      document.documentElement.dataset.theme = this.get();
      const b = $("#btn-theme");
      if (b) b.textContent = this.get() === "dark" ? "Modo claro" : "Modo escuro";
    }
  };

  // =========================
  // API
  // =========================
  const API = {
    tokenKey: "ieq_token",
    get token() { return localStorage.getItem(this.tokenKey) || ""; },
    set token(v) { localStorage.setItem(this.tokenKey, v || ""); },
    clearToken() { localStorage.removeItem(this.tokenKey); },

    async request(path, { method="GET", body=null, headers={} } = {}) {
      const h = { "Content-Type": "application/json", ...headers };
      if (API.token) h.Authorization = `Bearer ${API.token}`;
      const opt = { method, headers: h };
      if (body) opt.body = JSON.stringify(body);

      const res = await fetch(path, opt);
      const ct = (res.headers.get("content-type") || "").toLowerCase();
      let data = null;
      try {
        data = ct.includes("application/json") ? await res.json() : { ok:false, error: await res.text() };
      } catch {
        data = { ok:false, error:"Resposta inválida do servidor." };
      }
      if (!res.ok && data && data.ok !== true) {
        data.status = res.status;
      }
      return data;
    },

    login(usuario, senha) {
      return this.request("/api/login", { method:"POST", body:{ usuario, senha } });
    },
    me() { return this.request("/api/me"); },
    stats() { return this.request("/api/stats"); },

    alunosList() { return this.request("/api/alunos"); },
    alunoCreate(payload) { return this.request("/api/alunos", { method:"POST", body: payload }); },
    alunoUpdate(id, payload) { return this.request(`/api/alunos/${id}`, { method:"PUT", body: payload }); },
    alunoDelete(id) { return this.request(`/api/alunos/${id}`, { method:"DELETE" }); },

    usuariosList() { return this.request("/api/usuarios"); },
    equipeCreate(payload) { return this.request("/api/equipe", { method:"POST", body: payload }); },
    equipeDelete(id) { return this.request(`/api/equipe/${id}`, { method:"DELETE" }); },

    aulaIniciar(payload) { return this.request("/api/aulas/iniciar", { method:"POST", body: payload }); },
    aulaAtiva() { return this.request("/api/aulas/ativa"); },
    aulaEntrada(payload) { return this.request("/api/aulas/entrada", { method:"POST", body: payload }); },
    aulaSaida(payload) { return this.request("/api/aulas/saida", { method:"POST", body: payload }); },
    aulaEncerrar() { return this.request("/api/aulas/encerrar", { method:"POST" }); },

    historico() { return this.request("/api/historico"); },

    avisosList() { return this.request("/api/avisos"); },
    avisoCreate(payload) { return this.request("/api/avisos", { method:"POST", body: payload }); },
    avisoFixar(id, fixado) { return this.request(`/api/avisos/${id}/fixar`, { method:"POST", body:{ fixado } }); },
    avisoDelete(id) { return this.request(`/api/avisos/${id}`, { method:"DELETE" }); },
    avisoLike(id) { return this.request(`/api/avisos/${id}/like`, { method:"POST" }); },
    avisoComentar(id, comentario) { return this.request(`/api/avisos/${id}/comentario`, { method:"POST", body:{ comentario } }); },

    assistInsights(limite_aulas, min_pct) {
      const qs = new URLSearchParams({ limite_aulas: String(limite_aulas), min_pct: String(min_pct) });
      return this.request(`/api/assistente/insights?${qs.toString()}`);
    },
    assistTema(janela) {
      const qs = new URLSearchParams({ janela: String(janela) });
      return this.request(`/api/assistente/sugestao-tema?${qs.toString()}`);
    },
    assistNarrativo(aula_id) {
      const qs = new URLSearchParams({ aula_id: String(aula_id) });
      return this.request(`/api/assistente/relatorio-narrativo?${qs.toString()}`);
    }
  };

  // =========================
  // State
  // =========================
  const State = {
    user: null,
    stats: null,
    alunos: [],
    usuarios: [],
    aulaAtiva: null,
    presenca: [],
    historico: [],
    avisos: [],
    page: "home",
    alunoEditId: null,
  };

  // =========================
  // UI base (espera IDs no HTML)
  // =========================
  const UI = {
    app: $("#app"),
    login: $("#login"),
    loginUser: $("#login-user"),
    loginPass: $("#login-pass"),
    btnLogin: $("#btn-login"),
    loginError: $("#login-error"),

    headerTitle: $("#header-title"),
    headerMeta: $("#header-meta"),
    btnRefresh: $("#btn-refresh"),
    btnLogout: $("#btn-logout"),

    navButtons: $$(".nav-btn"),
    pageHost: $("#page-host"),
  };

  function setHeader(title, meta="") {
    if (UI.headerTitle) UI.headerTitle.textContent = title || "IEQ Central";
    if (UI.headerMeta) UI.headerMeta.textContent = meta || "";
  }

  function showLogin(msg="") {
    if (UI.app) UI.app.style.display = "none";
    if (UI.login) UI.login.style.display = "block";
    if (UI.loginError) UI.loginError.textContent = msg || "";
  }

  function showApp() {
    if (UI.login) UI.login.style.display = "none";
    if (UI.app) UI.app.style.display = "block";
  }

  function setActiveNav(page) {
    UI.navButtons.forEach(b => b.classList.toggle("active", b.dataset.page === page));
  }

  function goto(page) {
    State.page = page;
    setActiveNav(page);

    const titles = {
      home: ["Home", "Visão geral e status do sistema"],
      aulas: ["Iniciar aula", "Selecione prof/aux e tema"],
      ativa: ["Aula ativa", "Check-in e check-out com segurança"],
      alunos: ["Alunos", "Cadastro completo, foto e responsáveis"],
      historico: ["Histórico", "Relatórios por aula"],
      assistente: ["Assistente", "Insights, sugestão de tema e relatório narrativo"],
      mural: ["Mural", "Avisos com imagem, likes e comentários"],
      equipe: ["Equipe", "Somente admin gerencia usuários"],
      config: ["Config", "Diagnóstico e preferências do app"],
    };

    const [t, m] = titles[page] || ["IEQ Central", ""];
    setHeader(t, m);

    switch(page) {
      case "home": return renderHome();
      case "aulas": return renderIniciarAula();
      case "ativa": return renderAulaAtiva();
      case "alunos": return renderAlunos();
      case "historico": return renderHistorico();
      case "assistente": return renderAssistente();
      case "mural": return renderMural();
      case "equipe": return renderEquipe();
      case "config": return renderConfig();
      default: return renderHome();
    }
  }

  // =========================
  // Boot / Auth
  // =========================
  async function boot() {
    Theme.apply();

    if (!API.token) return showLogin("");

    const me = await API.me();
    if (!me.ok) {
      API.clearToken();
      return showLogin("Faça login novamente.");
    }
    State.user = me.user;
    showApp();

    await preloadAll();
    goto("home");
  }

  async function doLogin() {
    const usuario = (UI.loginUser?.value || "").trim();
    const senha = (UI.loginPass?.value || "").trim();

    if (!usuario || !senha) {
      if (UI.loginError) UI.loginError.textContent = "Informe usuário e senha.";
      return;
    }

    UI.btnLogin.disabled = true;
    const r = await API.login(usuario, senha);
    UI.btnLogin.disabled = false;

    if (!r.ok) {
      if (UI.loginError) UI.loginError.textContent = r.error || "Falha no login.";
      return;
    }

    API.token = r.token;
    State.user = r.user;
    showApp();
    toast("Login realizado ✅", "ok");

    await preloadAll();
    goto("home");
  }

  function logout() {
    API.clearToken();
    State.user = null;
    State.stats = null;
    State.alunos = [];
    State.usuarios = [];
    State.aulaAtiva = null;
    State.presenca = [];
    State.historico = [];
    State.avisos = [];
    showLogin("");
  }

  async function preloadAll() {
    await Promise.allSettled([
      refreshStats(),
      loadAlunos(),
      loadUsuariosSoft(),
      loadAulaAtiva(),
      loadHistoricoSoft(),
      loadAvisosSoft(),
    ]);
  }

  // =========================
  // Loaders
  // =========================
  async function refreshStats() {
    const r = await API.stats();
    if (r.ok) State.stats = r;
    return r;
  }

  async function loadAlunos() {
    const r = await API.alunosList();
    if (r.ok) State.alunos = r.alunos || [];
    return r;
  }

  async function loadUsuariosSoft() {
    const r = await API.usuariosList();
    if (r.ok) State.usuarios = r.usuarios || [];
    else State.usuarios = [];
    return r;
  }

  async function loadAulaAtiva() {
    const r = await API.aulaAtiva();
    if (r.ok) {
      State.aulaAtiva = r.aula || null;
      State.presenca = r.presenca || [];
    }
    return r;
  }

  async function loadHistoricoSoft() {
    const r = await API.historico();
    if (r.ok) State.historico = r.historico || [];
    else State.historico = [];
    return r;
  }

  async function loadAvisosSoft() {
    const r = await API.avisosList();
    if (r.ok) State.avisos = r.avisos || [];
    else State.avisos = [];
    return r;
  }

  // =========================
  // Components
  // =========================
  function card(title, bodyHtml, actionsHtml="") {
    return `
      <div class="card">
        <div class="card-h">
          <div>
            <div class="card-title">${escapeHtml(title)}</div>
          </div>
          <div class="card-actions">${actionsHtml || ""}</div>
        </div>
        <div class="card-b">${bodyHtml || ""}</div>
      </div>
    `;
  }

  function button(label, cls="", attrs="") {
    return `<button class="btn ${cls}" ${attrs}>${escapeHtml(label)}</button>`;
  }

  function input(label, id, value="", placeholder="", type="text") {
    return `
      <label class="field">
        <span>${escapeHtml(label)}</span>
        <input id="${id}" type="${type}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}"/>
      </label>
    `;
  }

  function textarea(label, id, value="", placeholder="") {
    return `
      <label class="field">
        <span>${escapeHtml(label)}</span>
        <textarea id="${id}" rows="3" placeholder="${escapeHtml(placeholder)}">${escapeHtml(value)}</textarea>
      </label>
    `;
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result || ""));
      fr.onerror = () => reject(new Error("Falha ao ler arquivo"));
      fr.readAsDataURL(file);
    });
  }

  // searchable dropdown (input + list)
  function renderSearchSelect({ id, items, label, placeholder="Digite para buscar...", getLabel, onPick }) {
    // returns HTML; wiring happens after render
    return `
      <div class="search-select" data-ss="${id}">
        <label class="field">
          <span>${escapeHtml(label)}</span>
          <input class="ss-input" type="text" placeholder="${escapeHtml(placeholder)}" autocomplete="off"/>
        </label>
        <div class="ss-list"></div>
      </div>
    `;
  }

  function wireSearchSelect(rootEl, { items, getLabel, onPick }) {
    const inputEl = rootEl.querySelector(".ss-input");
    const listEl = rootEl.querySelector(".ss-list");

    const renderList = (q="") => {
      const qq = q.trim().toLowerCase();
      const filtered = !qq ? items.slice(0, 20) : items.filter(it => getLabel(it).toLowerCase().includes(qq)).slice(0, 20);

      listEl.innerHTML = filtered.length
        ? filtered.map(it => `<button class="ss-item" data-id="${it.id}">${escapeHtml(getLabel(it))}</button>`).join("")
        : `<div class="ss-empty">Nada encontrado.</div>`;
    };

    inputEl.addEventListener("input", () => renderList(inputEl.value));
    listEl.addEventListener("click", (e) => {
      const btn = e.target.closest(".ss-item");
      if (!btn) return;
      const id = Number(btn.dataset.id);
      const it = items.find(x => x.id === id);
      if (!it) return;
      inputEl.value = getLabel(it);
      listEl.innerHTML = "";
      onPick(it);
    });

    // initial
    renderList("");
  }

  // =========================
  // Pages
  // =========================

  async function renderHome() {
    await Promise.allSettled([refreshStats(), loadAvisosSoft(), loadAulaAtiva()]);

    const s = State.stats || {};
    const fixados = (State.avisos || []).filter(a => a.fixado);

    const statusHtml = `
      <div class="grid-4">
        <div class="stat">
          <div class="stat-ico">🧒</div>
          <div class="stat-k">${escapeHtml(String(s.total_alunos ?? "—"))}</div>
          <div class="stat-l">Alunos</div>
        </div>
        <div class="stat">
          <div class="stat-ico">👥</div>
          <div class="stat-k">${escapeHtml(String(s.total_equipe ?? "—"))}</div>
          <div class="stat-l">Equipe</div>
        </div>
        <div class="stat">
          <div class="stat-ico">🎓</div>
          <div class="stat-k">${escapeHtml((s.aula_ativa ? "Sim" : "Não"))}</div>
          <div class="stat-l">Aula ativa</div>
        </div>
        <div class="stat">
          <div class="stat-ico">✅</div>
          <div class="stat-k">${escapeHtml(String(s.presentes ?? "—"))}</div>
          <div class="stat-l">Presentes</div>
        </div>
      </div>
    `;

    const atalhosHtml = `
      <div class="grid-3">
        <div class="shortcut" data-go="aulas">
          <div class="sc-ico">🎓</div>
          <div>
            <div class="sc-t">Iniciar aula</div>
            <div class="sc-s">Selecione prof/aux e tema</div>
          </div>
        </div>
        <div class="shortcut" data-go="ativa">
          <div class="sc-ico">✅</div>
          <div>
            <div class="sc-t">Aula ativa</div>
            <div class="sc-s">Check-in e check-out</div>
          </div>
        </div>
        <div class="shortcut" data-go="assistente">
          <div class="sc-ico">🧠</div>
          <div>
            <div class="sc-t">Assistente</div>
            <div class="sc-s">Insights e relatório</div>
          </div>
        </div>
      </div>
    `;

    const fixadosHtml = fixados.length ? `
      <div class="list">
        ${fixados.map(a => `
          <div class="notice">
            <div class="notice-h">
              <div class="badge">Fixado</div>
              <div class="notice-meta">${escapeHtml(a.autor || "Sistema")} • ${escapeHtml(fmtDT(a.data_criacao))}</div>
            </div>
            ${a.mensagem ? `<div class="notice-msg">${escapeHtml(a.mensagem)}</div>` : ""}
            ${a.imagem ? `<img class="notice-img" src="${a.imagem}" alt="imagem do aviso"/>` : ""}
          </div>
        `).join("")}
      </div>
    ` : `<div class="muted">Nenhum aviso fixado.</div>`;

    UI.pageHost.innerHTML = `
      ${card("Status", statusHtml, `<button class="btn" id="btn-home-refresh">Atualizar</button>`)}
      ${card("Atalhos", atalhosHtml)}
      ${card("Avisos fixados", fixadosHtml, `<button class="btn" id="btn-go-mural">Abrir mural</button>`)}
    `;

    $("#btn-home-refresh").onclick = async () => {
      await preloadAll();
      renderHome();
      toast("Atualizado.", "ok");
    };
    $("#btn-go-mural").onclick = () => goto("mural");

    $$(".shortcut").forEach(el => {
      el.addEventListener("click", () => goto(el.dataset.go));
    });
  }

  async function renderIniciarAula() {
    await loadUsuariosSoft();

    const profs = State.usuarios.filter(u => (u.role || "").toLowerCase() === "professor");
    const auxs  = State.usuarios.filter(u => (u.role || "").toLowerCase() !== "admin"); // auxiliares e professores

    UI.pageHost.innerHTML = `
      ${card("Iniciar aula", `
        <div class="grid-2">
          <label class="field">
            <span>Professor</span>
            <select id="sel-prof">
              <option value="">Selecione...</option>
              ${profs.map(u => `<option value="${u.id}">${escapeHtml(u.nome)} (@${escapeHtml(u.usuario)})</option>`).join("")}
            </select>
          </label>

          <label class="field">
            <span>Auxiliar</span>
            <select id="sel-aux">
              <option value="">(opcional)</option>
              ${auxs.map(u => `<option value="${u.id}">${escapeHtml(u.nome)} (@${escapeHtml(u.usuario)})</option>`).join("")}
            </select>
          </label>
        </div>

        ${input("Tema", "tema", "", "Ex: Deus é amor")}

        <div class="row">
          <button class="btn primary" id="btn-iniciar">Iniciar aula</button>
          <span class="muted" id="iniciar-msg"></span>
        </div>
      `)}
    `;

    $("#btn-iniciar").onclick = async () => {
      const professor_id = Number($("#sel-prof").value || 0) || null;
      const auxiliar_id = Number($("#sel-aux").value || 0) || null;
      const tema = ($("#tema").value || "").trim();
      const msg = $("#iniciar-msg");

      msg.textContent = "";
      if (!professor_id) return msg.textContent = "Selecione um professor.";
      if (!tema) return msg.textContent = "Informe o tema.";

      const r = await API.aulaIniciar({ professor_id, auxiliar_id, tema });
      if (!r.ok) {
        msg.textContent = r.error || "Erro ao iniciar aula.";
        toast(msg.textContent, "err");
        return;
      }
      toast("Aula iniciada ✅", "ok");
      await loadAulaAtiva();
      goto("ativa");
    };
  }

  async function renderAulaAtiva() {
    const host = UI.pageHost;
    host.innerHTML = card("Carregando...", `<div class="muted">Buscando aula ativa…</div>`, `<button class="btn" id="btn-ativa-refresh">Atualizar</button>`);

    $("#btn-ativa-refresh").onclick = async () => {
      await loadAulaAtiva();
      renderAulaAtiva();
    };

    const r = await loadAulaAtiva();
    if (!r.ok) {
      host.innerHTML = card("Informações", `<div class="err">Erro ao carregar aula ativa: ${escapeHtml(r.error || "—")}</div>`,
        `<button class="btn" id="btn-ativa-refresh2">Atualizar</button>`);
      $("#btn-ativa-refresh2").onclick = async () => {
        await loadAulaAtiva();
        renderAulaAtiva();
      };
      return;
    }

    const aula = State.aulaAtiva;
    await loadAlunos();

    if (!aula) {
      host.innerHTML = card("Aula ativa", `<div class="muted">Nenhuma aula ativa. Inicie uma aula para registrar presença.</div>`,
        `<button class="btn primary" id="btn-go-iniciar">Iniciar aula</button>`);
      $("#btn-go-iniciar").onclick = () => goto("aulas");
      return;
    }

    let pickedEntrada = null;
    let pickedSaida = null;

    const alunos = State.alunos.slice().sort((a,b)=> (a.nome||"").localeCompare(b.nome||"", "pt-BR"));

    const entradaBox = `
      <div class="box">
        <h3>Check-in (Entrada)</h3>
        <div class="muted">Digite o nome e selecione.</div>
        ${renderSearchSelect({
          id: "entrada",
          items: alunos,
          label: "Aluno",
          getLabel: (a) => `${a.nome} (ID: ${a.id})`,
          onPick: () => {}
        })}
        <div class="row">
          <button class="btn primary" id="btn-entrada">Registrar entrada</button>
          <span class="muted" id="entrada-msg"></span>
        </div>
      </div>
    `;

    const saidaBox = `
      <div class="box">
        <h3>Check-out (Saída)</h3>
        <div class="muted">Somente com responsável cadastrado do aluno.</div>

        ${renderSearchSelect({
          id: "saida",
          items: alunos,
          label: "Aluno",
          getLabel: (a) => `${a.nome} (ID: ${a.id})`,
          onPick: () => {}
        })}

        <label class="field">
          <span>Retirado por</span>
          <select id="sel-retirado">
            <option value="">Selecione o aluno primeiro</option>
          </select>
          <small class="muted">Se não tiver responsáveis cadastrados, a saída é bloqueada.</small>
        </label>

        <div class="row">
          <button class="btn" id="btn-saida">Registrar saída</button>
          <span class="muted" id="saida-msg"></span>
        </div>
      </div>
    `;

    const presHtml = `
      <div class="box">
        <div class="row between">
          <div>
            <h3>Lista de presença</h3>
            <div class="muted">Entrada/saída + retirado por</div>
          </div>
          <a class="btn" href="/api/aulas/${aula.id}/relatorio.csv" target="_blank" rel="noopener">Baixar relatório (CSV)</a>
        </div>

        <div class="table">
          <div class="tr th">
            <div>Aluno</div><div>Entrada</div><div>Saída</div><div>Retirado por</div>
          </div>
          ${(State.presenca||[]).map(p => `
            <div class="tr">
              <div>${escapeHtml(p.aluno)}</div>
              <div>${escapeHtml(fmtDT(p.horario_entrada))}</div>
              <div>${escapeHtml(fmtDT(p.horario_saida))}</div>
              <div>${escapeHtml(p.retirado_por || "")}</div>
            </div>
          `).join("") || `<div class="muted pad">Nenhum registro ainda.</div>`}
        </div>
      </div>
    `;

    host.innerHTML = `
      ${card("Informações", `
        <div class="row between">
          <div>
            <div><b>Tema:</b> ${escapeHtml(aula.tema || "")}</div>
            <div><b>Equipe:</b> ${escapeHtml(aula.professores || "")}</div>
            <div><b>Iniciada em:</b> ${escapeHtml(fmtDT(aula.iniciada_em || aula.data_aula))}</div>
          </div>
          <div class="row">
            <button class="btn" id="btn-ativa-refresh3">Atualizar</button>
            <button class="btn danger" id="btn-encerrar">Encerrar aula</button>
          </div>
        </div>
      `)}
      <div class="grid-2">
        ${entradaBox}
        ${saidaBox}
      </div>
      ${presHtml}
    `;

    $("#btn-ativa-refresh3").onclick = async () => {
      await loadAulaAtiva();
      renderAulaAtiva();
      toast("Atualizado.", "ok");
    };

    $("#btn-encerrar").onclick = async () => {
      if (!confirm("Encerrar a aula ativa?")) return;
      const rr = await API.aulaEncerrar();
      if (!rr.ok) return toast(rr.error || "Erro ao encerrar aula.", "err");
      toast("Aula encerrada ✅", "ok");
      await loadAulaAtiva();
      await loadHistoricoSoft();
      renderAulaAtiva();
    };

    // wire search selects
    const ssEntrada = host.querySelector('[data-ss="entrada"]');
    wireSearchSelect(ssEntrada, {
      items: alunos,
      getLabel: (a) => a.nome,
      onPick: (a) => { pickedEntrada = a; }
    });

    const ssSaida = host.querySelector('[data-ss="saida"]');
    wireSearchSelect(ssSaida, {
      items: alunos,
      getLabel: (a) => a.nome,
      onPick: (a) => {
        pickedSaida = a;
        // preencher responsáveis
        const opts = [];
        const a1 = (a.autorizado_retirar || "").trim();
        const a2 = (a.autorizado_2 || "").trim();
        const a3 = (a.autorizado_3 || "").trim();
        if (a1) opts.push(a1);
        if (a2) opts.push(a2);
        if (a3) opts.push(a3);

        const sel = $("#sel-retirado");
        sel.innerHTML = opts.length
          ? `<option value="">Selecione...</option>` + opts.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("")
          : `<option value="">Sem responsáveis cadastrados</option>`;
      }
    });

    $("#btn-entrada").onclick = async () => {
      const msg = $("#entrada-msg");
      msg.textContent = "";
      if (!pickedEntrada) return msg.textContent = "Selecione um aluno.";
      const rr = await API.aulaEntrada({ aula_id: aula.id, aluno_id: pickedEntrada.id });
      if (!rr.ok) return toast(rr.error || "Erro no check-in.", "err");
      toast(`Entrada registrada: ${pickedEntrada.nome} ✅`, "ok");
      await loadAulaAtiva();
      renderAulaAtiva();
    };

    $("#btn-saida").onclick = async () => {
      const msg = $("#saida-msg");
      msg.textContent = "";
      if (!pickedSaida) return msg.textContent = "Selecione um aluno.";
      const retirado_por = ($("#sel-retirado").value || "").trim();
      if (!retirado_por) return msg.textContent = "Selecione o responsável.";
      const rr = await API.aulaSaida({ aula_id: aula.id, aluno_id: pickedSaida.id, retirado_por });
      if (!rr.ok) return toast(rr.error || "Erro no check-out.", "err");
      toast(`Saída registrada: ${pickedSaida.nome} ✅`, "ok");
      await loadAulaAtiva();
      renderAulaAtiva();
    };
  }

  async function renderAlunos() {
    await loadAlunos();

    const list = State.alunos.slice().sort((a,b)=> (a.nome||"").localeCompare(b.nome||"", "pt-BR"));

    const edit = (id) => {
      State.alunoEditId = id;
      renderAlunos();
    };

    const clearEdit = () => {
      State.alunoEditId = null;
      renderAlunos();
    };

    const alunoEdit = State.alunoEditId ? list.find(a => a.id === State.alunoEditId) : null;

    const formHtml = `
      <div class="grid-2">
        ${input("Nome do aluno", "al-nome", alunoEdit?.nome || "", "Nome completo")}
        ${input("Data de nascimento", "al-nasc", alunoEdit?.data_nascimento || "", "Ex: 12/03/2018")}
      </div>

      <div class="grid-2">
        ${input("Responsável principal (nome)", "al-resp", alunoEdit?.responsavel || "", "Ex: Maria Silva")}
        ${input("Telefone do responsável", "al-tel", alunoEdit?.telefone || "", "(xx) xxxxx-xxxx")}
      </div>

      <div class="grid-2">
        ${input("Autorizado a retirar (1)", "al-aut1", alunoEdit?.autorizado_retirar || "", "Nome do autorizado")}
        ${input("Autorizado a retirar (2)", "al-aut2", alunoEdit?.autorizado_2 || "", "Nome do autorizado")}
      </div>

      <div class="grid-2">
        ${input("Autorizado a retirar (3)", "al-aut3", alunoEdit?.autorizado_3 || "", "Nome do autorizado")}
        ${textarea("Observações", "al-obs", alunoEdit?.observacoes || "", "Alergias, restrições, recados…")}
      </div>

      <label class="field">
        <span>Foto (opcional)</span>
        <input id="al-foto" type="file" accept="image/*"/>
        <small class="muted">Você pode enviar uma foto da criança para aparecer no cadastro.</small>
      </label>

      ${alunoEdit?.foto ? `<img class="preview" src="${alunoEdit.foto}" alt="foto do aluno"/>` : ""}

      <div class="row">
        <button class="btn primary" id="btn-al-save">${State.alunoEditId ? "Salvar alterações" : "Cadastrar"}</button>
        ${State.alunoEditId ? `<button class="btn" id="btn-al-cancel">Cancelar edição</button>` : ""}
        <span class="muted" id="al-msg"></span>
      </div>
    `;

    const listHtml = `
      <div class="row between">
        <div class="muted">Clique em “Editar” para alterar o cadastro.</div>
        <input id="al-busca" class="mini" placeholder="Pesquisar aluno…"/>
      </div>
      <div class="list" id="al-list">
        ${list.map(a => `
          <div class="item">
            <div class="item-main">
              <div class="item-title">${escapeHtml(a.nome)}</div>
              <div class="item-sub">
                ID: ${a.id}
                ${a.telefone ? " • Tel: " + escapeHtml(a.telefone) : ""}
                ${a.responsavel ? " • Resp: " + escapeHtml(a.responsavel) : ""}
              </div>
            </div>
            <div class="row">
              <button class="btn" data-edit="${a.id}">Editar</button>
              <button class="btn danger" data-del="${a.id}">Excluir</button>
            </div>
          </div>
        `).join("")}
      </div>
    `;

    UI.pageHost.innerHTML = `
      ${card(State.alunoEditId ? "Editar aluno" : "Cadastrar aluno", formHtml,
        State.alunoEditId ? "" : `<button class="btn" id="btn-al-refresh">Atualizar</button>`)}
      ${card("Lista", listHtml)}
    `;

    $("#btn-al-refresh")?.addEventListener("click", async () => {
      await loadAlunos();
      renderAlunos();
      toast("Atualizado.", "ok");
    });

    $("#btn-al-cancel")?.addEventListener("click", clearEdit);

    // salvar
    $("#btn-al-save").onclick = async () => {
      const msg = $("#al-msg");
      msg.textContent = "";

      const nome = ($("#al-nome").value || "").trim();
      if (!nome) return msg.textContent = "Nome é obrigatório.";

      const payload = {
        nome,
        data_nascimento: ($("#al-nasc").value || "").trim(),
        responsavel: ($("#al-resp").value || "").trim(),
        telefone: ($("#al-tel").value || "").trim(),
        observacoes: ($("#al-obs").value || "").trim(),
        autorizado_retirar: ($("#al-aut1").value || "").trim(),
        autorizado_2: ($("#al-aut2").value || "").trim(),
        autorizado_3: ($("#al-aut3").value || "").trim(),
      };

      // foto
      const f = $("#al-foto")?.files?.[0];
      if (f) {
        if (f.size > 2_500_000) return toast("Foto muito grande (máx ~2.5MB).", "err");
        payload.foto = await fileToDataUrl(f);
      }

      let r;
      if (State.alunoEditId) r = await API.alunoUpdate(State.alunoEditId, payload);
      else r = await API.alunoCreate(payload);

      if (!r.ok) return toast(r.error || "Erro ao salvar aluno.", "err");

      toast("Cadastro salvo ✅", "ok");
      State.alunoEditId = null;
      await loadAlunos();
      renderAlunos();
    };

    // list actions
    $("#al-list").addEventListener("click", async (e) => {
      const ed = e.target.closest("[data-edit]");
      const del = e.target.closest("[data-del]");

      if (ed) return edit(Number(ed.dataset.edit));

      if (del) {
        const id = Number(del.dataset.del);
        const a = list.find(x => x.id === id);
        if (!confirm(`Excluir o aluno "${a?.nome || id}"?`)) return;
        const r = await API.alunoDelete(id);
        if (!r.ok) return toast(r.error || "Erro ao excluir.", "err");
        toast("Aluno excluído.", "ok");
        await loadAlunos();
        renderAlunos();
      }
    });

    // busca
    $("#al-busca").addEventListener("input", () => {
      const q = ($("#al-busca").value || "").trim().toLowerCase();
      const host = $("#al-list");
      const items = host.querySelectorAll(".item");
      items.forEach(it => {
        const t = it.querySelector(".item-title")?.textContent?.toLowerCase() || "";
        it.style.display = t.includes(q) ? "" : "none";
      });
    });
  }

  async function renderHistorico() {
    await loadHistoricoSoft();

    const h = State.historico || [];

    UI.pageHost.innerHTML = `
      ${card("Aulas encerradas", `
        <div class="table">
          <div class="tr th">
            <div>ID</div><div>Data</div><div>Tema</div><div>Equipe</div><div>Relatório</div>
          </div>
          ${h.map(a => `
            <div class="tr">
              <div>${a.id}</div>
              <div>${escapeHtml(fmtDT(a.encerrada_em || a.data_aula))}</div>
              <div>${escapeHtml(a.tema || "")}</div>
              <div>${escapeHtml(a.professores || "")}</div>
              <div><a class="link" href="/api/aulas/${a.id}/relatorio.csv" target="_blank" rel="noopener">Baixar CSV</a></div>
            </div>
          `).join("") || `<div class="muted pad">Nenhuma aula encerrada ainda.</div>`}
        </div>
      `, `<button class="btn" id="btn-hist-refresh">Atualizar</button>`)}
    `;

    $("#btn-hist-refresh").onclick = async () => {
      await loadHistoricoSoft();
      renderHistorico();
      toast("Atualizado.", "ok");
    };
  }

  async function renderAssistente() {
    await Promise.allSettled([loadHistoricoSoft(), loadAulaAtiva()]);

    UI.pageHost.innerHTML = `
      ${card("Insights", `
        <div class="grid-2">
          ${input("Últimas aulas (para cálculo de frequência)", "ai-limite", "10", "10", "number")}
          ${input("Mínimo % para NÃO entrar em baixa frequência", "ai-min", "50", "50", "number")}
        </div>
        <div class="row between">
          <div class="muted">Alertas da aula ativa + frequência baixa</div>
          <button class="btn" id="btn-ai-run">Atualizar</button>
        </div>
        <div id="ai-out" class="pad-top"></div>
      `)}

      ${card("Sugestão de tema", `
        ${input("Janela de “não repetir” (últimos temas)", "at-janela", "8", "8", "number")}
        <div class="row between">
          <div class="muted">Evita repetir temas recentes</div>
          <button class="btn" id="btn-at-run">Gerar</button>
        </div>
        <div id="at-out" class="pad-top"></div>
      `)}

      ${card("Relatório narrativo", `
        <div class="grid-2">
          <div>
            <div class="muted">Usar aula ativa</div>
            <button class="btn primary" id="btn-an-ativa">Carregar aula ativa</button>
            <div id="an-ativa-meta" class="muted pad-top"></div>
          </div>
          <div>
            <div class="muted">Ou escolher do histórico</div>
            <select id="an-hist">
              <option value="">Selecione uma aula encerrada…</option>
              ${(State.historico||[]).slice(0, 50).map(a => `
                <option value="${a.id}">Aula ${a.id} • ${fmtDT(a.encerrada_em || a.data_aula)} • ${escapeHtml(a.tema||"")}</option>
              `).join("")}
            </select>
          </div>
        </div>

        <div class="row between">
          <div class="muted">Gera um texto pronto com base nos dados</div>
          <button class="btn" id="btn-an-run">Gerar</button>
        </div>

        <textarea id="an-text" rows="10" placeholder="O texto do relatório aparecerá aqui…"></textarea>
      `)}
    `;

    // Insights
    $("#btn-ai-run").onclick = async () => {
      const limite = Number($("#ai-limite").value || 10);
      const min = Number($("#ai-min").value || 50);
      const out = $("#ai-out");
      out.innerHTML = `<div class="muted">Gerando…</div>`;

      const r = await API.assistInsights(limite, min);
      if (!r.ok) {
        out.innerHTML = `<div class="err">Erro ao gerar insights: ${escapeHtml(r.error || "—")}</div>`;
        return;
      }

      const alertas = r.alertas || [];
      const fb = r.frequencia_baixa || { alunos: [] };

      out.innerHTML = `
        <div class="box">
          <h3>Alertas (aula ativa)</h3>
          ${alertas.length ? alertas.map(a => `
            <div class="pill">
              <b>${escapeHtml(a.titulo)}</b> • ${a.qtd} item(ns)
            </div>
          `).join("") : `<div class="muted">Nenhum alerta.</div>`}
        </div>

        <div class="box">
          <h3>Frequência baixa</h3>
          <div class="muted">Total de aulas analisadas: ${fb.total_aulas || 0} • Limite: ${fb.min_pct || min}%</div>
          ${fb.alunos?.length ? `
            <div class="table">
              <div class="tr th"><div>Aluno</div><div>Presenças</div><div>Total</div><div>%</div></div>
              ${fb.alunos.map(a => `
                <div class="tr">
                  <div>${escapeHtml(a.nome)}</div>
                  <div>${a.presentes}</div>
                  <div>${a.total_aulas}</div>
                  <div>${a.pct}%</div>
                </div>
              `).join("")}
            </div>
          ` : `<div class="muted">Nenhum aluno abaixo do limite.</div>`}
        </div>
      `;
    };

    // Tema
    $("#btn-at-run").onclick = async () => {
      const janela = Number($("#at-janela").value || 8);
      const out = $("#at-out");
      out.innerHTML = `<div class="muted">Gerando…</div>`;
      const r = await API.assistTema(janela);
      if (!r.ok) {
        out.innerHTML = `<div class="err">Erro ao sugerir tema: ${escapeHtml(r.error || "—")}</div>`;
        return;
      }

      out.innerHTML = `
        <div class="grid-3">
          ${(r.sugestoes||[]).map(s => `
            <div class="box">
              <div class="pill"><b>${escapeHtml(s.tema)}</b></div>
              <div class="muted">${escapeHtml(s.verso)}</div>
              <div class="pad-top">${escapeHtml(s.ideia)}</div>
            </div>
          `).join("")}
        </div>
      `;
    };

    // Narrativo
    let selectedAulaId = null;

    $("#btn-an-ativa").onclick = async () => {
      await loadAulaAtiva();
      if (!State.aulaAtiva) {
        $("#an-ativa-meta").textContent = "Nenhuma aula ativa agora.";
        selectedAulaId = null;
        return;
      }
      selectedAulaId = State.aulaAtiva.id;
      $("#an-ativa-meta").textContent = `Aula ativa: ${State.aulaAtiva.id} • ${State.aulaAtiva.tema || ""}`;
      toast("Aula ativa selecionada.", "ok");
    };

    $("#an-hist").onchange = () => {
      const v = $("#an-hist").value;
      selectedAulaId = v ? Number(v) : null;
    };

    $("#btn-an-run").onclick = async () => {
      if (!selectedAulaId) return toast("Selecione uma aula ativa ou do histórico.", "err");
      $("#an-text").value = "Gerando…";
      const r = await API.assistNarrativo(selectedAulaId);
      if (!r.ok) {
        $("#an-text").value = `Erro: ${r.error || "—"}`;
        return;
      }
      $("#an-text").value = r.texto || "";
      toast("Relatório gerado ✅", "ok");
    };
  }

  async function renderMural() {
    await loadAvisosSoft();
    const avisos = State.avisos || [];
    const isAdmin = (State.user?.role || "").toLowerCase() === "admin";

    UI.pageHost.innerHTML = `
      ${card("Novo aviso", `
        <label class="field">
          <span>Mensagem</span>
          <textarea id="av-msg" rows="4" placeholder="Digite o aviso…"></textarea>
        </label>
        <label class="field">
          <span>Anexar imagem (opcional)</span>
          <input id="av-img" type="file" accept="image/*"/>
        </label>

        <div class="row between">
          <button class="btn primary" id="btn-av-pub">Publicar</button>
          <button class="btn" id="btn-av-refresh">Atualizar</button>
        </div>
      `)}

      ${card("Avisos", `
        <div class="list" id="av-list">
          ${avisos.map(a => `
            <div class="notice">
              <div class="notice-h">
                <div class="row">
                  ${a.fixado ? `<span class="badge">Fixado</span>` : ``}
                  <div class="notice-meta">${escapeHtml(a.autor || "Sistema")} • ${escapeHtml(fmtDT(a.data_criacao))}</div>
                </div>

                <div class="row">
                  ${isAdmin ? `<button class="btn mini" data-fixar="${a.id}" data-fix="${a.fixado ? "0" : "1"}">${a.fixado ? "Desfixar" : "Fixar"}</button>` : ``}
                  ${isAdmin ? `<button class="btn mini danger" data-del="${a.id}">Excluir</button>` : ``}
                </div>
              </div>

              ${a.mensagem ? `<div class="notice-msg">${escapeHtml(a.mensagem)}</div>` : ""}
              ${a.imagem ? `<img class="notice-img" src="${a.imagem}" alt="imagem do aviso"/>` : ""}

              <div class="row between pad-top">
                <button class="btn mini" data-like="${a.id}">❤️ ${a.likes || 0}</button>
                <span class="muted">${a.liked_by_me ? "Você curtiu" : ""}</span>
              </div>

              <div class="comments">
                ${(a.comentarios||[]).map(c => `
                  <div class="comment">
                    <b>@${escapeHtml(c.usuario)}</b> ${escapeHtml(c.comentario)}
                    <span class="muted">• ${escapeHtml(fmtDT(c.criado_em))}</span>
                  </div>
                `).join("")}
              </div>

              <div class="row">
                <input class="mini" placeholder="Comentar…" data-com-in="${a.id}"/>
                <button class="btn mini" data-com-btn="${a.id}">Enviar</button>
              </div>
            </div>
          `).join("") || `<div class="muted">Nenhum aviso ainda.</div>`}
        </div>
      `)}
    `;

    $("#btn-av-refresh").onclick = async () => {
      await loadAvisosSoft();
      renderMural();
      toast("Atualizado.", "ok");
    };

    $("#btn-av-pub").onclick = async () => {
      const mensagem = ($("#av-msg").value || "").trim();
      const f = $("#av-img")?.files?.[0];
      let imagem = null;
      if (f) {
        if (f.size > 2_500_000) return toast("Imagem muito grande (máx ~2.5MB).", "err");
        imagem = await fileToDataUrl(f);
      }
      const r = await API.avisoCreate({ mensagem, imagem });
      if (!r.ok) return toast(r.error || "Erro ao publicar aviso.", "err");
      $("#av-msg").value = "";
      $("#av-img").value = "";
      toast("Aviso publicado ✅", "ok");
      await loadAvisosSoft();
      renderMural();
    };

    $("#av-list").addEventListener("click", async (e) => {
      const del = e.target.closest("[data-del]");
      const fix = e.target.closest("[data-fixar]");
      const like = e.target.closest("[data-like]");
      const comBtn = e.target.closest("[data-com-btn]");

      if (del) {
        const id = Number(del.dataset.del);
        if (!confirm("Excluir este aviso?")) return;
        const r = await API.avisoDelete(id);
        if (!r.ok) return toast(r.error || "Erro ao excluir.", "err");
        toast("Aviso excluído.", "ok");
        await loadAvisosSoft();
        renderMural();
      }

      if (fix) {
        const id = Number(fix.dataset.fixar);
        const desired = fix.dataset.fix === "1";
        const r = await API.avisoFixar(id, desired);
        if (!r.ok) return toast(r.error || "Erro ao fixar.", "err");
        toast(desired ? "Fixado." : "Desfixado.", "ok");
        await loadAvisosSoft();
        renderMural();
      }

      if (like) {
        const id = Number(like.dataset.like);
        const r = await API.avisoLike(id);
        if (!r.ok) return toast(r.error || "Erro no like.", "err");
        await loadAvisosSoft();
        renderMural();
      }

      if (comBtn) {
        const id = Number(comBtn.dataset.comBtn);
        const input = $(`[data-com-in="${id}"]`);
        const comentario = (input?.value || "").trim();
        if (!comentario) return;
        const r = await API.avisoComentar(id, comentario);
        if (!r.ok) return toast(r.error || "Erro ao comentar.", "err");
        input.value = "";
        await loadAvisosSoft();
        renderMural();
      }
    });
  }

  async function renderEquipe() {
    await loadUsuariosSoft();
    const isAdmin = (State.user?.role || "").toLowerCase() === "admin";

    if (!isAdmin) {
      UI.pageHost.innerHTML = card("Equipe", `<div class="muted">Somente o admin pode gerenciar usuários.</div>`);
      return;
    }

    const list = State.usuarios.slice().sort((a,b)=> (a.nome||"").localeCompare(b.nome||"", "pt-BR"));

    UI.pageHost.innerHTML = `
      ${card("Lista", `
        <div class="list" id="eq-list">
          ${list.map(u => `
            <div class="item">
              <div class="item-main">
                <div class="item-title">${escapeHtml(u.nome)} <span class="tag">${escapeHtml(u.role)}</span></div>
                <div class="item-sub">@${escapeHtml(u.usuario)}</div>
              </div>
              <div class="row">
                ${u.usuario === "admin" ? `<span class="muted">—</span>` : `<button class="btn danger" data-del="${u.id}">Excluir</button>`}
              </div>
            </div>
          `).join("")}
        </div>
      `, `<button class="btn" id="btn-eq-refresh">Atualizar</button>`)}

      ${card("Cadastrar membro", `
        <div class="grid-2">
          ${input("Nome", "eq-nome", "", "Nome completo")}
          ${input("Usuário (login)", "eq-user", "", "Ex: joicecampos")}
        </div>
        <div class="grid-2">
          ${input("Senha", "eq-pass", "", "Senha", "password")}
          <label class="field">
            <span>Role</span>
            <select id="eq-role">
              <option value="professor">professor</option>
              <option value="auxiliar">auxiliar</option>
              <option value="admin">admin</option>
            </select>
          </label>
        </div>
        <div class="row">
          <button class="btn primary" id="btn-eq-add">Cadastrar</button>
          <span class="muted" id="eq-msg"></span>
        </div>
      `)}
    `;

    $("#btn-eq-refresh").onclick = async () => {
      await loadUsuariosSoft();
      renderEquipe();
      toast("Atualizado.", "ok");
    };

    $("#btn-eq-add").onclick = async () => {
      const nome = ($("#eq-nome").value || "").trim();
      const usuario = ($("#eq-user").value || "").trim();
      const senha = ($("#eq-pass").value || "").trim();
      const role = ($("#eq-role").value || "auxiliar").trim();
      const msg = $("#eq-msg");

      msg.textContent = "";
      if (!nome || !usuario || !senha) return msg.textContent = "Preencha nome, usuário e senha.";

      const r = await API.equipeCreate({ nome, usuario, senha, role });
      if (!r.ok) return toast(r.error || "Erro ao cadastrar usuário.", "err");

      toast("Usuário cadastrado ✅", "ok");
      $("#eq-nome").value = "";
      $("#eq-user").value = "";
      $("#eq-pass").value = "";
      await loadUsuariosSoft();
      renderEquipe();
    };

    $("#eq-list").addEventListener("click", async (e) => {
      const del = e.target.closest("[data-del]");
      if (!del) return;
      const id = Number(del.dataset.del);
      if (!confirm("Excluir este usuário?")) return;
      const r = await API.equipeDelete(id);
      if (!r.ok) return toast(r.error || "Erro ao excluir usuário.", "err");
      toast("Usuário excluído.", "ok");
      await loadUsuariosSoft();
      renderEquipe();
    });
  }

  async function renderConfig() {
    UI.pageHost.innerHTML = `
      ${card("Preferências", `
        <div class="row between">
          <div>
            <div class="pill"><b>Versão</b> • v1.0</div>
            <div class="muted">Desenvolvido por Equipe IEQ Central</div>
          </div>
          <button class="btn" id="btn-theme">Modo escuro</button>
        </div>
      `)}

      ${card("Diagnóstico", `
        <div class="muted">Verifique se o servidor está servindo arquivos estáticos</div>
        <div class="row between">
          <div class="muted" id="dg-out">—</div>
          <button class="btn" id="btn-diag">Rodar /api/diag</button>
        </div>
      `)}

      ${card("Sessão", `
        <div class="row between">
          <div class="muted">Encerrar a sessão atual neste dispositivo.</div>
          <button class="btn danger" id="btn-sair">Sair</button>
        </div>
      `)}
    `;

    Theme.apply();

    $("#btn-theme").onclick = () => {
      Theme.toggle();
      toast("Tema atualizado.", "ok");
    };

    $("#btn-diag").onclick = async () => {
      $("#dg-out").textContent = "Rodando…";
      const r = await API.request("/api/diag");
      if (!r.ok) return $("#dg-out").textContent = "Erro: " + (r.error || "—");
      $("#dg-out").textContent = `OK • ${r.static_files?.length || 0} arquivo(s)`;
    };

    $("#btn-sair").onclick = logout;
  }

  // =========================
  // Events / Nav
  // =========================
  function wireNav() {
    UI.navButtons.forEach(btn => {
      btn.addEventListener("click", () => goto(btn.dataset.page));
    });

    UI.btnLogin?.addEventListener("click", doLogin);
    UI.loginPass?.addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });
    UI.loginUser?.addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });

    UI.btnLogout?.addEventListener("click", logout);
    UI.btnRefresh?.addEventListener("click", async () => {
      await preloadAll();
      goto(State.page || "home");
      toast("Atualizado.", "ok");
    });
  }

  // =========================
  // Start
  // =========================
  document.addEventListener("DOMContentLoaded", () => {
    wireNav();
    boot();
  });

})();
