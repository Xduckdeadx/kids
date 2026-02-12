/* static/js/app.js
   IEQ Central • Kid 2026
   Frontend SPA sem framework (vanilla)
*/

(() => {
  "use strict";

  // ✅ Constantes
  const APP_NAME = "IEQ Central";

  // ========= Helpers =========
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const escapeHtml = (s) => {
    const str = String(s ?? "");
    return str
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  };

  const fmtTS = (ts) => {
    if (!ts) return "-";
    try {
      const d = new Date(ts);
      return d.toLocaleString("pt-BR");
    } catch {
      return String(ts);
    }
  };

  const downloadFile = async (url, filename = "relatorio.csv") => {
    const res = await fetch(url, { headers: API.authHeaders() });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      UI.toast(`Falha ao baixar (${res.status})`, "err");
      console.warn("download error:", t);
      return;
    }
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  };

  // ========= API =========
  const API = {
    tokenKey: "ieq_token",
    get token() { return localStorage.getItem(API.tokenKey) || ""; },
    set token(v) { localStorage.setItem(API.tokenKey, v || ""); },
    clearToken() { localStorage.removeItem(API.tokenKey); },

    authHeaders() {
      const h = {};
      if (API.token) h.Authorization = `Bearer ${API.token}`;
      return h;
    },

    async request(path, { method = "GET", body = null, headers = {} } = {}) {
      const h = { "Content-Type": "application/json", ...headers, ...API.authHeaders() };
      const opt = { method, headers: h };
      if (body) opt.body = JSON.stringify(body);

      const res = await fetch(path, opt);

      let data = null;
      try { data = await res.json(); }
      catch { data = { ok: false, error: "Resposta inválida do servidor." }; }

      return data;
    },

    // Auth
    login(usuario, senha) { return API.request("/api/login", { method: "POST", body: { usuario, senha } }); },
    me() { return API.request("/api/me"); },

    // Stats
    stats() { return API.request("/api/stats"); },

    // Alunos
    alunosList() { return API.request("/api/alunos"); },
    alunoCreate(nome) { return API.request("/api/alunos", { method: "POST", body: { nome } }); },
    alunoDelete(id) { return API.request(`/api/alunos/${id}`, { method: "DELETE" }); },

    // Responsáveis
    respList(alunoId) { return API.request(`/api/alunos/${alunoId}/responsaveis`); },
    respCreate(alunoId, nome) { return API.request(`/api/alunos/${alunoId}/responsaveis`, { method: "POST", body: { nome } }); },
    respDelete(alunoId, respId) { return API.request(`/api/alunos/${alunoId}/responsaveis/${respId}`, { method: "DELETE" }); },

    // Usuários (admin)
    usuariosList() { return API.request("/api/usuarios"); },
    usuarioCreate(nome, usuario, senha, role) {
      return API.request("/api/equipe", { method: "POST", body: { nome, usuario, senha, role } });
    },
    usuarioDelete(id) { return API.request(`/api/equipe/${id}`, { method: "DELETE" }); },

    // Aulas
    aulaAtiva() { return API.request("/api/aulas/ativa"); },
    aulaIniciarManual(professores, tema) {
      return API.request("/api/aulas/iniciar", { method: "POST", body: { professores, tema } });
    },
    aulaIniciarPorIds(professor_id, auxiliar_id, tema) {
      return API.request("/api/aulas/iniciar", { method: "POST", body: { professor_id, auxiliar_id, tema } });
    },
    aulaEncerrar() { return API.request("/api/aulas/encerrar", { method: "POST", body: {} }); },
    aulaEntrada(aula_id, aluno_id) {
      return API.request("/api/aulas/entrada", { method: "POST", body: { aula_id, aluno_id } });
    },
    aulaSaida(aula_id, aluno_id, retirado_por) {
      return API.request("/api/aulas/saida", { method: "POST", body: { aula_id, aluno_id, retirado_por } });
    },

    // Histórico
    historico() { return API.request("/api/historico"); },
    relatorio(aulaId) { return API.request(`/api/aulas/${aulaId}/relatorio`); },

    // Mural
    avisosList() { return API.request("/api/avisos"); },
    avisoCreate(mensagem) { return API.request("/api/avisos", { method: "POST", body: { mensagem } }); },
    avisoFixar(id, fixado) { return API.request(`/api/avisos/${id}/fixar`, { method: "POST", body: { fixado } }); },
    avisoDelete(id) { return API.request(`/api/avisos/${id}`, { method: "DELETE" }); },

    // ✅ Assistente IEQ
    assistInsights(params = "") { return API.request(`/api/assistente/insights${params}`); },
    assistTema(params = "") { return API.request(`/api/assistente/sugestao-tema${params}`); },
    assistRelatorioNarrativo(aulaId) { return API.request(`/api/assistente/relatorio-narrativo?aula_id=${encodeURIComponent(aulaId)}`); },
  };

  // ========= UI =========
  const UI = {
    root: null,

    toast(text, type = "ok") {
      const el = document.createElement("div");
      el.style.position = "fixed";
      el.style.right = "18px";
      el.style.top = "18px";
      el.style.zIndex = 99999;
      el.style.padding = "12px 14px";
      el.style.borderRadius = "12px";
      el.style.fontWeight = "900";
      el.style.boxShadow = "0 12px 30px rgba(0,0,0,.12)";
      el.style.background = type === "err" ? "#ef4444" : "#16a34a";
      el.style.color = "#fff";
      el.textContent = text;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 2400);
    },

    modal({ title = "Modal", bodyHtml = "", onClose = null, footerHtml = "" }) {
      const wrap = document.createElement("div");
      wrap.className = "modal";
      wrap.innerHTML = `
        <div class="modal-card">
          <div class="modal-head">
            <div class="modal-title">${escapeHtml(title)}</div>
            <button class="iconbtn" data-x title="Fechar">✕</button>
          </div>
          <div class="modal-body">${bodyHtml}</div>
          <div class="modal-foot">${footerHtml}</div>
        </div>
      `;
      document.body.appendChild(wrap);

      const close = () => {
        wrap.remove();
        if (typeof onClose === "function") onClose();
      };

      wrap.addEventListener("click", (e) => {
        if (e.target === wrap) close();
      });
      wrap.querySelector("[data-x]").onclick = close;

      return { el: wrap, close };
    },

    renderLogin() {
      UI.root.innerHTML = `
        <div class="login">
          <div class="login-card">
            <div class="brand">
              <div class="brand-icon">👶</div>
              <div>
                <div class="brand-title">IEQ Central</div>
                <div class="brand-sub">Ministério Infantil • Kid 2026</div>
              </div>
            </div>

            <div class="form">
              <label>Usuário</label>
              <input id="l-user" placeholder="admin" />
              <label>Senha</label>
              <input id="l-pass" type="password" placeholder="1234" />
              <div class="msg" id="l-msg"></div>
              <button class="btn btn-primary" id="l-btn">Entrar</button>
            </div>

            <div class="login-foot">
              <div class="pill">PWA • Offline parcial</div>
              <div class="pill">Aulas • Presença • Relatório</div>
            </div>
          </div>
        </div>
      `;

      $("#l-btn").onclick = async () => {
        const u = ($("#l-user").value || "").trim();
        const p = ($("#l-pass").value || "").trim();
        $("#l-msg").textContent = "";

        if (!u || !p) { $("#l-msg").textContent = "Preencha usuário e senha."; return; }

        const r = await API.login(u, p);
        if (r.ok) {
          API.token = r.token;
          State.user = r.user;
          UI.toast("Login OK ✅");
          UI.renderAppShell();
          goto("home");
        } else {
          $("#l-msg").textContent = r.error || "Falha no login.";
        }
      };
    },

    renderAppShell() {
      UI.root.innerHTML = `
        <div class="app">
          <aside class="sidebar" id="sidebar">
            <div class="side-top">
              <div class="side-brand">
                <div class="side-logo">👶</div>
                <div>
                  <div class="side-title">IEQ Central</div>
                  <div class="side-sub">Kid 2026</div>
                </div>
              </div>

              <div class="side-user">
                <div class="avatar">${escapeHtml((State.user?.nome || "?").slice(0,1).toUpperCase())}</div>
                <div>
                  <div class="side-user-name">${escapeHtml(State.user?.nome || "-")}</div>
                  <div class="side-user-role">${escapeHtml(State.user?.role || "-")}</div>
                </div>
              </div>

              <div class="side-menu nav">
                <button class="side-item active" data-page="home">🏠 Home</button>
                <button class="side-item" data-page="aulas">🎓 Iniciar aula</button>
                <button class="side-item" data-page="ativa">✅ Aula ativa</button>
                <button class="side-item" data-page="alunos">👧 Alunos</button>
                <button class="side-item" data-page="historico">🗂️ Histórico</button>
                <button class="side-item" data-page="assistente">🧠 Assistente</button>
                <button class="side-item" data-page="mural">📌 Mural</button>
                <button class="side-item" data-page="equipe">👥 Equipe</button>
                <button class="side-item" data-page="config">⚙️ Config</button>
              </div>
            </div>

            <div class="side-bottom">
              <button class="btn btn-outline" id="btn-logout" style="width:100%;">Sair</button>
              <div class="side-ver">v1.0 • ${escapeHtml(APP_NAME)}</div>
            </div>
          </aside>

          <main class="main">
            <div class="topbar">
              <div class="topbar-left">
                <button class="iconbtn" id="btn-menu" title="Menu">☰</button>
                <div>
                  <div class="page-title" id="page-title">IEQ Central</div>
                  <div class="page-sub" id="page-sub">—</div>
                </div>
              </div>
              <div class="tag" id="pill-status">Status</div>
            </div>

            <div class="page" id="page"></div>
          </main>
        </div>
      `;

      $("#btn-logout").onclick = () => {
        API.clearToken();
        State.reset();
        UI.renderLogin();
      };

      $("#btn-menu").onclick = () => {
        const sb = $("#sidebar");
        sb.classList.toggle("open");
      };

      $$(".nav button").forEach(b => {
        b.onclick = () => goto(b.dataset.page);
      });
    },

    setHeader(title, sub = "") {
      $("#page-title").textContent = title;
      $("#page-sub").textContent = sub;
    },

    setStatus(text, kind = "warn") {
      const pill = $("#pill-status");
      pill.textContent = text;
      pill.classList.remove("ok", "warn");
      pill.classList.add(kind);
    },
  };

  // ========= State =========
  const State = {
    user: null,
    aulaAtiva: null,
    alunos: [],
    usuarios: [],
    reset() {
      State.user = null;
      State.aulaAtiva = null;
      State.alunos = [];
      State.usuarios = [];
    }
  };

  // ========= Router =========
  async function goto(page) {
    $("#sidebar")?.classList.remove("open");
    $$(".nav button").forEach(b => b.classList.toggle("active", b.dataset.page === page));

    if (page === "home") return renderHome();
    if (page === "aulas") return renderAulas();
    if (page === "ativa") return renderAtiva();
    if (page === "alunos") return renderAlunos();
    if (page === "historico") return renderHistorico();
    if (page === "assistente") return renderAssistente();
    if (page === "mural") return renderMural();
    if (page === "equipe") return renderEquipe();
    if (page === "config") return renderConfig();

    renderHome();
  }

  // ========= Pages =========

  async function renderHome() {
    UI.setHeader("Home", "Visão geral e status do sistema");
    $("#page").innerHTML = `
      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-title">Status</div>
            <div class="card-sub">Resumo rápido</div>
          </div>
          <button class="btn btn-outline" id="btn-home-refresh">Atualizar</button>
        </div>

        <div class="grid stats" id="home-stats">
          <div class="stat"><div class="stat-ico">👧</div><div class="stat-val">—</div><div class="stat-lab">Alunos</div></div>
          <div class="stat"><div class="stat-ico">👥</div><div class="stat-val">—</div><div class="stat-lab">Equipe</div></div>
          <div class="stat"><div class="stat-ico">🎓</div><div class="stat-val">—</div><div class="stat-lab">Aula ativa</div></div>
          <div class="stat"><div class="stat-ico">✅</div><div class="stat-val">—</div><div class="stat-lab">Presentes</div></div>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-title">Atalhos</div>
            <div class="card-sub">Ir direto ao ponto</div>
          </div>
        </div>

        <div class="grid quick">
          <button class="quickbtn" id="q-start">
            <i>🎓</i>
            <div><div class="q-title">Iniciar aula</div><div class="q-sub">Selecione prof/aux e tema</div></div>
          </button>
          <button class="quickbtn" id="q-ativa">
            <i>✅</i>
            <div><div class="q-title">Aula ativa</div><div class="q-sub">Check-in e check-out</div></div>
          </button>
          <button class="quickbtn" id="q-ass">
            <i>🧠</i>
            <div><div class="q-title">Assistente</div><div class="q-sub">Insights e relatório narrativo</div></div>
          </button>
        </div>
      </div>
    `;

    $("#q-start").onclick = () => goto("aulas");
    $("#q-ativa").onclick = () => goto("ativa");
    $("#q-ass").onclick = () => goto("assistente");
    $("#btn-home-refresh").onclick = () => renderHome();

    const st = await API.stats();
    if (!st.ok) {
      UI.setStatus("Erro", "warn");
      UI.toast(st.error || "Falha ao carregar stats", "err");
      return;
    }

    UI.setStatus(st.aula_ativa ? "Aula ativa" : "Sem aula ativa", st.aula_ativa ? "ok" : "warn");

    const vals = [
      st.total_alunos ?? "-",
      st.total_equipe ?? "-",
      st.aula_ativa ? "Sim" : "Não",
      st.presentes ?? "-"
    ];
    $$("#home-stats .stat-val").forEach((el, i) => el.textContent = String(vals[i] ?? "-"));
  }

  async function renderAlunos() {
    UI.setHeader("Alunos", "Cadastrar alunos e responsáveis autorizados");
    $("#page").innerHTML = `
      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-title">Cadastrar aluno</div>
            <div class="card-sub">Nome único</div>
          </div>
        </div>

        <div class="toolbar">
          <div class="search">
            <span>👧</span>
            <input id="al-nome" placeholder="Nome do aluno" />
          </div>
          <button class="btn btn-primary" id="al-add">Cadastrar</button>
          <button class="btn btn-outline" id="al-refresh">Atualizar</button>
        </div>

        <div class="hint" id="al-msg"></div>
      </div>

      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-title">Lista</div>
            <div class="card-sub">Gerencie responsáveis e exclusões</div>
          </div>
        </div>

        <div class="toolbar">
          <div class="search">
            <span>🔎</span>
            <input id="al-q" placeholder="Pesquisar..." />
          </div>
        </div>

        <div class="list" id="al-list"></div>
      </div>
    `;

    $("#al-add").onclick = async () => {
      const nome = ($("#al-nome").value || "").trim();
      $("#al-msg").textContent = "";
      if (!nome) { $("#al-msg").textContent = "Digite o nome do aluno."; return; }

      const r = await API.alunoCreate(nome);
      if (r.ok) {
        UI.toast("Aluno cadastrado ✅");
        $("#al-nome").value = "";
        await loadAlunos();
        paintAlunos();
      } else {
        $("#al-msg").textContent = r.error || "Erro ao cadastrar.";
      }
    };

    $("#al-refresh").onclick = async () => {
      await loadAlunos();
      paintAlunos();
    };

    $("#al-q").oninput = () => paintAlunos();

    await loadAlunos();
    paintAlunos();
  }

  async function loadAlunos() {
    const r = await API.alunosList();
    if (!r.ok) {
      UI.toast(r.error || "Erro ao listar alunos", "err");
      State.alunos = [];
      return;
    }
    State.alunos = r.alunos || [];
  }

  function paintAlunos() {
    const box = $("#al-list");
    const q = ($("#al-q").value || "").trim().toLowerCase();

    const rows = (State.alunos || [])
      .filter(a => !q || (a.nome || "").toLowerCase().includes(q))
      .map(a => `
        <div class="item">
          <div class="item-left">
            <div>
              <div class="item-title">${escapeHtml(a.nome)}</div>
              <div class="item-sub">ID: ${a.id}</div>
            </div>
          </div>
          <div class="item-actions">
            <button class="btn btn-outline" data-resp="${a.id}">Responsáveis</button>
            <button class="btn btn-danger" data-del="${a.id}">Excluir</button>
          </div>
        </div>
      `).join("");

    box.innerHTML = rows || `<div class="hint">Nenhum aluno.</div>`;

    $$("[data-del]").forEach(btn => {
      btn.onclick = async () => {
        const id = btn.getAttribute("data-del");
        if (!confirm("Excluir este aluno?")) return;
        const r = await API.alunoDelete(id);
        if (r.ok) {
          UI.toast("Aluno excluído");
          await loadAlunos();
          paintAlunos();
        } else {
          UI.toast(r.error || "Erro ao excluir", "err");
        }
      };
    });

    $$("[data-resp]").forEach(btn => {
      btn.onclick = async () => {
        const alunoId = btn.getAttribute("data-resp");
        const aluno = State.alunos.find(x => String(x.id) === String(alunoId));
        await openResponsaveisModal(alunoId, aluno?.nome || "Aluno");
      };
    });
  }

  async function openResponsaveisModal(alunoId, alunoNome) {
    const modal = UI.modal({
      title: `Responsáveis • ${alunoNome}`,
      bodyHtml: `
        <div class="field">
          <label>Novo responsável</label>
          <input id="r-nome" placeholder="Ex: Mãe, Pai, Avó..." />
        </div>
        <div style="height:10px;"></div>
        <div class="toolbar">
          <button class="btn btn-primary" id="r-add">Adicionar</button>
          <button class="btn btn-outline" id="r-refresh">Atualizar</button>
        </div>
        <div class="hint" id="r-msg"></div>
        <div style="height:8px;"></div>
        <div class="list" id="r-list"></div>
      `,
      footerHtml: `<button class="btn btn-outline" data-close>Fechar</button>`
    });

    modal.el.querySelector("[data-close]").onclick = modal.close;

    async function refresh() {
      $("#r-msg").textContent = "Carregando…";
      const r = await API.respList(alunoId);
      if (!r.ok) {
        $("#r-msg").textContent = r.error || "Erro ao listar.";
        $("#r-list").innerHTML = "";
        return;
      }
      const list = r.responsaveis || [];
      $("#r-msg").textContent = list.length ? "" : "Nenhum responsável cadastrado (saída ficará bloqueada).";
      $("#r-list").innerHTML = list.map(x => `
        <div class="item">
          <div class="item-left">
            <div>
              <div class="item-title">${escapeHtml(x.nome)}</div>
              <div class="item-sub">ID: ${x.id}</div>
            </div>
          </div>
          <div class="item-actions">
            <button class="btn btn-danger" data-rdel="${x.id}">Excluir</button>
          </div>
        </div>
      `).join("") || `<div class="hint">Cadastre pelo menos 1 responsável.</div>`;

      $$("[data-rdel]").forEach(b => {
        b.onclick = async () => {
          const rid = b.getAttribute("data-rdel");
          if (!confirm("Excluir responsável?")) return;
          const rr = await API.respDelete(alunoId, rid);
          if (rr.ok) { UI.toast("Excluído"); refresh(); }
          else UI.toast(rr.error || "Erro", "err");
        };
      });
    }

    $("#r-add").onclick = async () => {
      const nome = ($("#r-nome").value || "").trim();
      if (!nome) { $("#r-msg").textContent = "Digite o nome do responsável."; return; }
      const r = await API.respCreate(alunoId, nome);
      if (r.ok) {
        UI.toast("Responsável adicionado ✅");
        $("#r-nome").value = "";
        refresh();
      } else {
        $("#r-msg").textContent = r.error || "Erro ao adicionar.";
      }
    };

    $("#r-refresh").onclick = refresh;
    refresh();
  }

  async function renderEquipe() {
    UI.setHeader("Equipe", "Somente admin gerencia usuários");
    const isAdmin = State.user?.role === "admin";

    $("#page").innerHTML = `
      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-title">Lista</div>
            <div class="card-sub">${isAdmin ? "Gerencie logins e permissões." : "Você não é admin. Somente visual."}</div>
          </div>
          <button class="btn btn-outline" id="u-refresh">Atualizar</button>
        </div>

        <div class="hint" id="u-msg"></div>
        <div class="list" id="u-list"></div>
      </div>

      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-title">Cadastrar membro</div>
            <div class="card-sub">Admin apenas</div>
          </div>
        </div>

        <div class="grid2">
          <div class="field">
            <label>Nome</label>
            <input id="u-nome" ${isAdmin ? "" : "disabled"} />
          </div>
          <div class="field">
            <label>Usuário (login)</label>
            <input id="u-user" ${isAdmin ? "" : "disabled"} />
          </div>
          <div class="field">
            <label>Senha</label>
            <input id="u-pass" type="password" ${isAdmin ? "" : "disabled"} />
          </div>
          <div class="field">
            <label>Role</label>
            <select id="u-role" ${isAdmin ? "" : "disabled"}>
              <option value="professor">professor</option>
              <option value="auxiliar">auxiliar</option>
              <option value="admin">admin</option>
            </select>
          </div>
        </div>

        <div style="height:12px;"></div>
        <button class="btn btn-primary" id="u-add" ${isAdmin ? "" : "disabled"}>Cadastrar</button>
        <div class="hint" id="u-addmsg"></div>
      </div>
    `;

    $("#u-refresh").onclick = async () => {
      await loadUsuariosAdmin();
      paintUsuarios();
    };

    if (isAdmin) {
      $("#u-add").onclick = async () => {
        const nome = ($("#u-nome").value || "").trim();
        const usuario = ($("#u-user").value || "").trim();
        const senha = ($("#u-pass").value || "").trim();
        const role = ($("#u-role").value || "auxiliar").trim();
        $("#u-addmsg").textContent = "";

        if (!nome || !usuario || !senha) {
          $("#u-addmsg").textContent = "Preencha nome, usuário e senha.";
          return;
        }

        const r = await API.usuarioCreate(nome, usuario, senha, role);
        if (r.ok) {
          UI.toast("Usuário criado ✅");
          $("#u-nome").value = "";
          $("#u-user").value = "";
          $("#u-pass").value = "";
          await loadUsuariosAdmin();
          paintUsuarios();
        } else {
          $("#u-addmsg").textContent = r.error || "Erro ao cadastrar.";
        }
      };
    }

    await loadUsuariosAdmin();
    paintUsuarios();
  }

  async function loadUsuariosAdmin() {
    const el = $("#u-msg");
    if (el) el.textContent = "Carregando…";
    const r = await API.usuariosList();
    if (!r.ok) {
      if (el) el.textContent = r.error || "Sem permissão (somente admin).";
      State.usuarios = [];
      return;
    }
    State.usuarios = r.usuarios || [];
    if (el) el.textContent = "";
  }

  function paintUsuarios() {
    const box = $("#u-list");
    if (!box) return;
    const isAdmin = State.user?.role === "admin";
    box.innerHTML = (State.usuarios || []).map(u => `
      <div class="item">
        <div class="item-left">
          <div>
            <div class="item-title">${escapeHtml(u.nome)} <span class="tag">${escapeHtml(u.role)}</span></div>
            <div class="item-sub">@${escapeHtml(u.usuario)}</div>
          </div>
        </div>
        <div class="item-actions">
          ${isAdmin && u.usuario !== "admin" ? `<button class="btn btn-danger" data-udel="${u.id}">Excluir</button>` : `<span class="tag">—</span>`}
        </div>
      </div>
    `).join("") || `<div class="hint">Nenhum usuário.</div>`;

    $$("[data-udel]").forEach(b => {
      b.onclick = async () => {
        const id = b.getAttribute("data-udel");
        if (!confirm("Excluir usuário?")) return;
        const r = await API.usuarioDelete(id);
        if (r.ok) { UI.toast("Excluído"); await loadUsuariosAdmin(); paintUsuarios(); }
        else UI.toast(r.error || "Erro", "err");
      };
    });
  }

  async function renderAulas() {
    UI.setHeader("Iniciar aula", "Escolha professor, auxiliar e tema");

    $("#page").innerHTML = `
      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-title">Nova aula</div>
            <div class="card-sub">Ao iniciar, a aula fica ativa para toda a equipe.</div>
          </div>
          <button class="btn btn-outline" id="a-check">Ver aula ativa</button>
        </div>

        <div class="hint" id="a-hint">
          Se você for admin, dá pra usar lista de equipe. Se não, use modo manual (texto).
        </div>

        <div class="grid2">
          <div class="field">
            <label>Professor (modo lista - admin)</label>
            <select id="a-prof-sel">
              <option value="">(modo manual)</option>
            </select>
            <div class="small">Se não aparecer, use modo manual abaixo.</div>
          </div>
          <div class="field">
            <label>Auxiliar (modo lista - admin)</label>
            <select id="a-aux-sel">
              <option value="">(sem auxiliar)</option>
            </select>
          </div>
        </div>

        <div style="height:12px;"></div>

        <div class="grid2">
          <div class="field">
            <label>Professor (modo manual)</label>
            <input id="a-prof-txt" placeholder="Ex: Prof. Maria" />
          </div>
          <div class="field">
            <label>Auxiliar (modo manual)</label>
            <input id="a-aux-txt" placeholder="Ex: Tia Ana" />
          </div>
        </div>

        <div style="height:12px;"></div>

        <div class="field">
          <label>Tema</label>
          <input id="a-tema" placeholder="Ex: O Bom Pastor" />
        </div>

        <div style="height:14px;"></div>

        <div class="toolbar">
          <button class="btn btn-primary" id="a-start">Iniciar aula</button>
          <button class="btn btn-outline" id="a-go-ativa">Ir para Aula ativa</button>
        </div>

        <div class="hint" id="a-msg"></div>
      </div>
    `;

    $("#a-check").onclick = () => goto("ativa");
    $("#a-go-ativa").onclick = () => goto("ativa");

    // tenta carregar usuários (admin) e preencher selects
    await loadUsuariosAdmin();
    fillProfessorAuxSelects();

    $("#a-start").onclick = async () => {
      const tema = ($("#a-tema").value || "").trim();
      const msg = $("#a-msg");
      msg.textContent = "";

      if (!tema) { msg.textContent = "Tema é obrigatório."; return; }

      const profId = ($("#a-prof-sel").value || "").trim();
      const auxId = ($("#a-aux-sel").value || "").trim();

      if (profId) {
        const r = await API.aulaIniciarPorIds(profId, auxId || null, tema);
        if (r.ok) {
          UI.toast("Aula iniciada ✅");
          goto("ativa");
        } else {
          msg.textContent = r.error || "Erro ao iniciar aula.";
        }
        return;
      }

      const prof = ($("#a-prof-txt").value || "").trim();
      const aux = ($("#a-aux-txt").value || "").trim();

      if (!prof) { msg.textContent = "Professor é obrigatório (modo manual)."; return; }

      const professores = aux ? `${prof} (prof) • ${aux} (aux)` : `${prof} (prof)`;
      const r = await API.aulaIniciarManual(professores, tema);

      if (r.ok) {
        UI.toast("Aula iniciada ✅");
        goto("ativa");
      } else {
        msg.textContent = r.error || "Erro ao iniciar aula.";
      }
    };
  }

  function fillProfessorAuxSelects() {
    const profSel = $("#a-prof-sel");
    const auxSel = $("#a-aux-sel");
    if (!profSel || !auxSel) return;

    const users = (State.usuarios || []);
    const profs = users.filter(u => (u.role || "") === "professor" || (u.role || "") === "admin");
    const auxs = users.filter(u => (u.role || "") === "auxiliar" || (u.role || "") === "admin");

    profSel.innerHTML = `<option value="">(modo manual)</option>` + profs.map(u =>
      `<option value="${u.id}">${escapeHtml(u.nome)} • ${escapeHtml(u.role)}</option>`
    ).join("");

    auxSel.innerHTML = `<option value="">(sem auxiliar)</option>` + auxs.map(u =>
      `<option value="${u.id}">${escapeHtml(u.nome)} • ${escapeHtml(u.role)}</option>`
    ).join("");
  }

  async function renderAtiva() {
    UI.setHeader("Aula ativa", "Check-in e check-out com segurança");
    $("#page").innerHTML = `
      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-title">Informações</div>
            <div class="card-sub" id="ativa-info">Carregando…</div>
          </div>
          <div class="toolbar" style="margin:0;">
            <button class="btn btn-outline" id="ativa-refresh">Atualizar</button>
            <button class="btn btn-danger" id="ativa-end">Encerrar aula</button>
          </div>
        </div>

        <div class="grid2">
          <div class="card" style="margin:0;">
            <div class="card-title">Check-in (Entrada)</div>
            <div class="hint">Selecione aluno e registre entrada.</div>

            <div class="field">
              <label>Aluno</label>
              <select id="chk-aluno">
                <option value="">Carregando…</option>
              </select>
            </div>

            <div style="height:12px;"></div>
            <button class="btn btn-primary" id="btn-entrada">Registrar entrada</button>
            <div class="hint" id="ent-msg"></div>
          </div>

          <div class="card" style="margin:0;">
            <div class="card-title">Check-out (Saída)</div>
            <div class="hint">Somente com responsável cadastrado do aluno.</div>

            <div class="field">
              <label>Aluno</label>
              <select id="out-aluno">
                <option value="">Selecione…</option>
              </select>
            </div>

            <div class="field" style="margin-top:10px;">
              <label>Retirado por</label>
              <select id="out-resp">
                <option value="">Selecione o aluno primeiro</option>
              </select>
              <div class="small">Se não tiver responsáveis cadastrados, a saída é bloqueada.</div>
            </div>

            <div style="height:12px;"></div>
            <button class="btn btn-outline" id="btn-saida">Registrar saída</button>
            <div class="hint" id="out-msg"></div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-title">Lista de presença</div>
            <div class="card-sub">Entrada/saída + retirado por</div>
          </div>
          <button class="btn btn-outline" id="btn-relatorio">Baixar relatório (CSV)</button>
        </div>

        <div style="overflow:auto;">
          <table>
            <thead>
              <tr>
                <th>Aluno</th>
                <th>Entrada</th>
                <th>Saída</th>
                <th>Retirado por</th>
              </tr>
            </thead>
            <tbody id="t-presenca"></tbody>
          </table>
        </div>
      </div>
    `;

    $("#ativa-refresh").onclick = () => loadAulaAtiva();
    $("#btn-entrada").onclick = () => doEntrada();
    $("#btn-saida").onclick = () => doSaida();

    $("#ativa-end").onclick = async () => {
      if (!State.aulaAtiva) return UI.toast("Sem aula ativa.", "err");
      if (!confirm("Encerrar a aula ativa agora?")) return;
      const r = await API.aulaEncerrar();
      if (r.ok) {
        UI.toast("Aula encerrada ✅");
        State.aulaAtiva = null;
        goto("historico");
      } else {
        UI.toast(r.error || "Erro ao encerrar", "err");
      }
    };

    $("#btn-relatorio").onclick = async () => {
      if (!State.aulaAtiva) return UI.toast("Sem aula ativa.", "err");
      const id = State.aulaAtiva.id;
      const name = `relatorio-aula-${id}.csv`;
      await downloadFile(`/api/aulas/${id}/relatorio.csv`, name);
    };

    $("#out-aluno").onchange = async () => {
      const alunoId = ($("#out-aluno").value || "").trim();
      await fillResponsaveisSelect(alunoId);
    };

    await loadAulaAtiva();
  }

  async function loadAulaAtiva() {
    $("#ativa-info").textContent = "Carregando…";
    $("#t-presenca").innerHTML = "";
    $("#ent-msg").textContent = "";
    $("#out-msg").textContent = "";

    const a = await API.aulaAtiva();
    if (!a.ok) {
      UI.setStatus("Erro", "warn");
      $("#ativa-info").textContent = a.error || "Erro ao carregar.";
      return;
    }

    State.aulaAtiva = a.aula || null;

    if (!State.aulaAtiva) {
      UI.setStatus("Sem aula ativa", "warn");
      $("#ativa-info").innerHTML = `Nenhuma aula ativa agora. Vá em <b>Iniciar aula</b> para começar.`;
      $("#chk-aluno").innerHTML = `<option value="">—</option>`;
      $("#out-aluno").innerHTML = `<option value="">—</option>`;
      $("#out-resp").innerHTML = `<option value="">—</option>`;
      $("#t-presenca").innerHTML = `<tr><td colspan="4" class="muted">Sem aula ativa.</td></tr>`;
      return;
    }

    UI.setStatus("Aula ativa", "ok");
    $("#ativa-info").innerHTML = `
      <b>ID:</b> ${State.aulaAtiva.id} •
      <b>Tema:</b> ${escapeHtml(State.aulaAtiva.tema || "-")} •
      <b>Equipe:</b> ${escapeHtml(State.aulaAtiva.professores || "-")}
    `;

    await loadAlunos();

    const alunoOptions = `<option value="">Selecione…</option>` + (State.alunos || [])
      .map(x => `<option value="${x.id}">${escapeHtml(x.nome)}</option>`)
      .join("");

    $("#chk-aluno").innerHTML = alunoOptions;
    $("#out-aluno").innerHTML = alunoOptions;
    $("#out-resp").innerHTML = `<option value="">Selecione o aluno primeiro</option>`;

    const pres = a.presenca || [];
    $("#t-presenca").innerHTML = pres.length
      ? pres.map(p => `
        <tr>
          <td>${escapeHtml(p.aluno || "")}</td>
          <td>${fmtTS(p.horario_entrada)}</td>
          <td>${fmtTS(p.horario_saida)}</td>
          <td>${escapeHtml(p.retirado_por || "-")}</td>
        </tr>
      `).join("")
      : `<tr><td colspan="4" class="muted">Sem registros ainda.</td></tr>`;
  }

  async function doEntrada() {
    const msg = $("#ent-msg");
    msg.textContent = "";
    if (!State.aulaAtiva) { msg.textContent = "Sem aula ativa."; return; }

    const alunoId = ($("#chk-aluno").value || "").trim();
    if (!alunoId) { msg.textContent = "Selecione um aluno."; return; }

    const r = await API.aulaEntrada(State.aulaAtiva.id, alunoId);
    if (r.ok) {
      UI.toast("Entrada registrada ✅");
      await loadAulaAtiva();
    } else {
      msg.textContent = r.error || "Erro ao registrar entrada.";
    }
  }

  async function fillResponsaveisSelect(alunoId) {
    const sel = $("#out-resp");
    sel.innerHTML = `<option value="">Carregando…</option>`;
    if (!alunoId) {
      sel.innerHTML = `<option value="">Selecione o aluno primeiro</option>`;
      return;
    }

    const r = await API.respList(alunoId);
    if (!r.ok) {
      sel.innerHTML = `<option value="">Erro</option>`;
      $("#out-msg").textContent = r.error || "Erro ao carregar responsáveis.";
      return;
    }

    const list = r.responsaveis || [];
    if (!list.length) {
      sel.innerHTML = `<option value="">(sem responsáveis cadastrados)</option>`;
      $("#out-msg").textContent = "Cadastre responsáveis deste aluno na aba Alunos.";
      return;
    }

    $("#out-msg").textContent = "";
    sel.innerHTML = `<option value="">Selecione…</option>` + list.map(x =>
      `<option value="${escapeHtml(x.nome)}">${escapeHtml(x.nome)}</option>`
    ).join("");
  }

  async function doSaida() {
    const msg = $("#out-msg");
    msg.textContent = "";
    if (!State.aulaAtiva) { msg.textContent = "Sem aula ativa."; return; }

    const alunoId = ($("#out-aluno").value || "").trim();
    const resp = ($("#out-resp").value || "").trim();

    if (!alunoId) { msg.textContent = "Selecione um aluno."; return; }
    if (!resp) { msg.textContent = "Selecione o responsável (autorizado)."; return; }

    const r = await API.aulaSaida(State.aulaAtiva.id, alunoId, resp);
    if (r.ok) {
      UI.toast("Saída registrada ✅");
      $("#out-aluno").value = "";
      $("#out-resp").innerHTML = `<option value="">Selecione o aluno primeiro</option>`;
      await loadAulaAtiva();
    } else {
      msg.textContent = r.error || "Erro ao registrar saída.";
    }
  }

  async function renderHistorico() {
    UI.setHeader("Histórico", "Aulas encerradas e relatórios");
    $("#page").innerHTML = `
      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-title">Aulas encerradas</div>
            <div class="card-sub">Você pode baixar o relatório de qualquer aula.</div>
          </div>
          <button class="btn btn-outline" id="h-refresh">Atualizar</button>
        </div>
        <div class="hint" id="h-msg"></div>
        <div style="overflow:auto;">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Data</th>
                <th>Tema</th>
                <th>Equipe</th>
                <th>Crianças</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody id="h-tb"></tbody>
          </table>
        </div>
      </div>
    `;

    $("#h-refresh").onclick = () => loadHistorico();
    await loadHistorico();
  }

  async function loadHistorico() {
    $("#h-msg").textContent = "Carregando…";
    $("#h-tb").innerHTML = "";

    const r = await API.historico();
    if (!r.ok) {
      $("#h-msg").textContent = r.error || "Erro ao carregar histórico.";
      return;
    }

    const rows = r.historico || [];
    $("#h-msg").textContent = rows.length ? "" : "Nenhuma aula encerrada ainda.";

    $("#h-tb").innerHTML = rows.map(a => `
      <tr>
        <td>${a.id}</td>
        <td>${fmtTS(a.data_aula)}</td>
        <td>${escapeHtml(a.tema || "-")}</td>
        <td>${escapeHtml(a.professores || "-")}</td>
        <td>${a.total_criancas ?? 0}</td>
        <td>
          <button class="btn btn-outline" data-csv="${a.id}">CSV</button>
          <button class="btn btn-outline" data-ver="${a.id}">Ver</button>
        </td>
      </tr>
    `).join("") || `<tr><td colspan="6" class="muted">Nenhum registro.</td></tr>`;

    $$("[data-csv]").forEach(b => {
      b.onclick = async () => {
        const id = b.getAttribute("data-csv");
        await downloadFile(`/api/aulas/${id}/relatorio.csv`, `relatorio-aula-${id}.csv`);
      };
    });

    $$("[data-ver]").forEach(b => {
      b.onclick = async () => {
        const id = b.getAttribute("data-ver");
        const rr = await API.relatorio(id);
        if (!rr.ok) return UI.toast(rr.error || "Erro", "err");

        const aula = rr.aula || {};
        const pres = rr.presenca || [];

        const modal = UI.modal({
          title: `Relatório • Aula ${id}`,
          bodyHtml: `
            <div class="hint">
              <b>Tema:</b> ${escapeHtml(aula.tema || "-")}<br/>
              <b>Equipe:</b> ${escapeHtml(aula.professores || "-")}<br/>
              <b>Data:</b> ${escapeHtml(String(aula.data_aula || "-"))}
            </div>
            <div style="height:10px;"></div>
            <div style="overflow:auto;">
              <table>
                <thead><tr><th>Aluno</th><th>Entrada</th><th>Saída</th><th>Retirado por</th></tr></thead>
                <tbody>
                  ${pres.map(p => `
                    <tr>
                      <td>${escapeHtml(p.aluno || "")}</td>
                      <td>${fmtTS(p.horario_entrada)}</td>
                      <td>${fmtTS(p.horario_saida)}</td>
                      <td>${escapeHtml(p.retirado_por || "-")}</td>
                    </tr>
                  `).join("") || `<tr><td colspan="4" class="muted">Sem presença.</td></tr>`}
                </tbody>
              </table>
            </div>
          `,
          footerHtml: `
            <button class="btn btn-outline" data-close>Fechar</button>
            <button class="btn btn-primary" data-csv>Baixar CSV</button>
          `
        });

        modal.el.querySelector("[data-close]").onclick = modal.close;
        modal.el.querySelector("[data-csv]").onclick = () => downloadFile(`/api/aulas/${id}/relatorio.csv`, `relatorio-aula-${id}.csv`);
      };
    });
  }

  // ✅ NOVA PÁGINA: Assistente IEQ
  async function renderAssistente() {
    UI.setHeader("Assistente", "Insights, sugestão de tema e relatório narrativo");

    $("#page").innerHTML = `
      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-title">Insights</div>
            <div class="card-sub">Alertas da aula ativa + frequência baixa</div>
          </div>
          <button class="btn btn-outline" id="as-refresh">Atualizar</button>
        </div>

        <div class="grid2">
          <div class="field">
            <label>Últimas aulas (para cálculo de frequência)</label>
            <input id="as-limite" type="number" min="1" max="60" value="10" />
          </div>
          <div class="field">
            <label>Mínimo % para NÃO entrar em “baixa frequência”</label>
            <input id="as-minpct" type="number" min="0" max="100" value="50" />
          </div>
        </div>

        <div style="height:10px;"></div>
        <div class="hint" id="as-msg">—</div>

        <div style="height:12px;"></div>

        <div class="card" style="margin:0;">
          <div class="card-title">Alertas (aula ativa)</div>
          <div class="hint" id="as-alertas">—</div>
        </div>

        <div style="height:12px;"></div>

        <div class="card" style="margin:0;">
          <div class="card-title">Frequência baixa</div>
          <div style="overflow:auto;">
            <table>
              <thead>
                <tr>
                  <th>Aluno</th>
                  <th>Presenças</th>
                  <th>Total</th>
                  <th>%</th>
                </tr>
              </thead>
              <tbody id="as-freq"></tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-title">Sugestão de tema</div>
            <div class="card-sub">Evita repetir temas recentes</div>
          </div>
          <button class="btn btn-outline" id="tema-refresh">Gerar</button>
        </div>

        <div class="field">
          <label>Janela de “não repetir” (últimos temas)</label>
          <input id="tema-janela" type="number" min="1" max="50" value="8" />
        </div>

        <div style="height:10px;"></div>
        <div class="hint" id="tema-out">—</div>
      </div>

      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-title">Relatório narrativo</div>
            <div class="card-sub">Gera um texto pronto com base nos dados</div>
          </div>
          <button class="btn btn-outline" id="rel-refresh">Gerar</button>
        </div>

        <div class="grid2">
          <div class="field">
            <label>Usar aula ativa</label>
            <button class="btn btn-primary" id="rel-ativa">Carregar aula ativa</button>
            <div class="small" id="rel-ativa-info">—</div>
          </div>

          <div class="field">
            <label>Ou escolher do histórico</label>
            <select id="rel-hist">
              <option value="">Carregando…</option>
            </select>
            <div class="small">Selecione uma aula encerrada.</div>
          </div>
        </div>

        <div style="height:12px;"></div>
        <textarea id="rel-texto" placeholder="O texto do relatório aparecerá aqui..." style="min-height:220px;"></textarea>
      </div>
    `;

    $("#as-refresh").onclick = () => loadAssistInsights();
    $("#tema-refresh").onclick = () => loadAssistTema();
    $("#rel-refresh").onclick = () => gerarRelatorioNarrativo();
    $("#rel-ativa").onclick = () => carregarAulaAtivaParaRelatorio();

    await loadAssistInsights();
    await loadAssistTema();
    await loadHistoricoSelectAssist();
  }

  async function loadAssistInsights() {
    const limite = parseInt(($("#as-limite").value || "10"), 10);
    const minpct = parseFloat(($("#as-minpct").value || "50"));

    $("#as-msg").textContent = "Carregando…";
    $("#as-alertas").textContent = "—";
    $("#as-freq").innerHTML = "";

    const params = `?limite_aulas=${encodeURIComponent(isFinite(limite) ? limite : 10)}&min_pct=${encodeURIComponent(isFinite(minpct) ? minpct : 50)}`;
    const r = await API.assistInsights(params);

    if (!r.ok) {
      $("#as-msg").textContent = r.error || "Erro ao carregar insights.";
      return;
    }

    const ativa = r.aula_ativa;
    const alertas = r.alertas || [];
    const freq = r.frequencia_baixa || {};
    const alunos = (freq.alunos || []);

    $("#as-msg").textContent = ativa
      ? `Aula ativa: ID ${ativa.id} • ${ativa.tema || "-"}`
      : "Sem aula ativa agora.";

    if (!alertas.length) {
      $("#as-alertas").innerHTML = `<span class="tag ok">Sem alertas ✅</span>`;
    } else {
      const html = alertas.map(a => {
        const itens = (a.itens || []).slice(0, 10).map(x => `${escapeHtml(x.aluno)} (${fmtTS(x.horario_entrada)})`).join("<br/>");
        return `
          <div class="hint" style="margin-top:6px;">
            <b>${escapeHtml(a.titulo || a.tipo || "Alerta")}</b> • ${a.qtd ?? (a.itens?.length ?? 0)}<br/>
            ${itens}${(a.itens || []).length > 10 ? "<br/>… (mais)" : ""}
          </div>
        `;
      }).join("");
      $("#as-alertas").innerHTML = html;
    }

    $("#as-freq").innerHTML = alunos.length
      ? alunos.map(x => `
        <tr>
          <td>${escapeHtml(x.nome)}</td>
          <td>${x.presentes}</td>
          <td>${x.total_aulas}</td>
          <td>${x.pct}%</td>
        </tr>
      `).join("")
      : `<tr><td colspan="4" class="muted">Nenhum aluno abaixo do limite.</td></tr>`;
  }

  async function loadAssistTema() {
    const janela = parseInt(($("#tema-janela").value || "8"), 10);
    $("#tema-out").textContent = "Carregando…";

    const r = await API.assistTema(`?janela=${encodeURIComponent(isFinite(janela) ? janela : 8)}`);
    if (!r.ok) {
      $("#tema-out").textContent = r.error || "Erro ao sugerir tema.";
      return;
    }

    const sug = r.sugestoes || [];
    const recentes = (r.evitando_ultimos || []).filter(Boolean);

    const htmlSug = sug.map((s, i) => `
      <div class="item" style="align-items:flex-start;">
        <div class="item-left">
          <div>
            <div class="item-title">${i + 1}. ${escapeHtml(s.tema || "-")}</div>
            <div class="item-sub"><b>Verso:</b> ${escapeHtml(s.verso || "-")}</div>
            <div style="margin-top:6px;">${escapeHtml(s.ideia || "")}</div>
          </div>
        </div>
      </div>
    `).join("");

    const htmlRec = recentes.length
      ? `<div class="hint"><b>Temas recentes (evitar repetir):</b><br/>${recentes.map(escapeHtml).join("<br/>")}</div>`
      : `<div class="hint">Sem histórico recente suficiente.</div>`;

    $("#tema-out").innerHTML = htmlSug + `<div style="height:10px;"></div>` + htmlRec;
  }

  async function loadHistoricoSelectAssist() {
    const sel = $("#rel-hist");
    if (!sel) return;
    sel.innerHTML = `<option value="">Carregando…</option>`;

    const r = await API.historico();
    if (!r.ok) {
      sel.innerHTML = `<option value="">Erro</option>`;
      return;
    }

    const rows = r.historico || [];
    sel.innerHTML = `<option value="">Selecione…</option>` + rows.map(a => {
      const label = `Aula ${a.id} • ${a.data_aula} • ${a.tema || "-"}`;
      return `<option value="${a.id}">${escapeHtml(label)}</option>`;
    }).join("");
  }

  async function carregarAulaAtivaParaRelatorio() {
    $("#rel-ativa-info").textContent = "Carregando…";
    const r = await API.aulaAtiva();
    if (!r.ok) {
      $("#rel-ativa-info").textContent = r.error || "Erro ao carregar aula ativa.";
      return;
    }
    if (!r.aula) {
      $("#rel-ativa-info").textContent = "Sem aula ativa.";
      return;
    }
    $("#rel-ativa-info").textContent = `Aula ativa ID ${r.aula.id} • ${r.aula.tema || "-"}`;
    // pré-seleciona aula ativa guardando num dataset
    $("#rel-texto").dataset.aulaId = String(r.aula.id);
    $("#rel-hist").value = "";
    UI.toast("Aula ativa selecionada ✅");
  }

  async function gerarRelatorioNarrativo() {
    const txt = $("#rel-texto");
    txt.value = "Carregando…";

    const fromAtiva = txt.dataset.aulaId;
    const fromHist = ($("#rel-hist").value || "").trim();
    const aulaId = fromHist || fromAtiva;

    if (!aulaId) {
      txt.value = "";
      UI.toast("Selecione uma aula ativa ou do histórico.", "err");
      return;
    }

    const r = await API.assistRelatorioNarrativo(aulaId);
    if (!r.ok) {
      txt.value = "";
      UI.toast(r.error || "Erro ao gerar relatório narrativo.", "err");
      return;
    }

    txt.value = r.texto || "(sem texto)";
    UI.toast("Relatório gerado ✅");
  }

  async function renderMural() {
    UI.setHeader("Mural", "Avisos do ministério");
    const isAdmin = State.user?.role === "admin";

    $("#page").innerHTML = `
      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-title">Novo aviso</div>
            <div class="card-sub">Mensagens rápidas para a equipe</div>
          </div>
          <button class="btn btn-outline" id="m-refresh">Atualizar</button>
        </div>

        <div class="field">
          <label>Mensagem</label>
          <textarea id="m-text" placeholder="Digite o aviso..."></textarea>
        </div>

        <div style="height:12px;"></div>
        <button class="btn btn-primary" id="m-add">Publicar</button>
        <div class="hint" id="m-msg"></div>
      </div>

      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-title">Avisos</div>
            <div class="card-sub">${isAdmin ? "Admin pode fixar e excluir." : ""}</div>
          </div>
        </div>

        <div class="list" id="m-list"></div>
      </div>
    `;

    $("#m-refresh").onclick = () => loadAvisos();
    $("#m-add").onclick = async () => {
      const t = ($("#m-text").value || "").trim();
      $("#m-msg").textContent = "";
      if (!t) { $("#m-msg").textContent = "Digite uma mensagem."; return; }

      const r = await API.avisoCreate(t);
      if (r.ok) {
        UI.toast("Aviso publicado ✅");
        $("#m-text").value = "";
        loadAvisos();
      } else {
        $("#m-msg").textContent = r.error || "Erro ao publicar.";
      }
    };

    loadAvisos();
  }

  async function loadAvisos() {
    const box = $("#m-list");
    box.innerHTML = `<div class="hint">Carregando…</div>`;

    const r = await API.avisosList();
    if (!r.ok) {
      box.innerHTML = `<div class="hint">${escapeHtml(r.error || "Erro ao carregar avisos.")}</div>`;
      return;
    }

    const isAdmin = State.user?.role === "admin";
    const avisos = r.avisos || [];

    box.innerHTML = avisos.map(a => `
      <div class="item" style="align-items:flex-start;">
        <div class="item-left">
          <div>
            <div class="item-title">${a.fixado ? "📌 " : ""}${escapeHtml(a.autor || "Sistema")}</div>
            <div class="item-sub">${fmtTS(a.data_criacao)}</div>
            <div style="margin-top:8px;">${escapeHtml(a.mensagem || "")}</div>
          </div>
        </div>
        <div class="item-actions">
          ${isAdmin ? `<button class="btn btn-outline" data-fix="${a.id}" data-v="${a.fixado ? "0" : "1"}">${a.fixado ? "Desfixar" : "Fixar"}</button>` : ""}
          ${isAdmin ? `<button class="btn btn-danger" data-delav="${a.id}">Excluir</button>` : ""}
        </div>
      </div>
    `).join("") || `<div class="hint">Nenhum aviso.</div>`;

    $$("[data-fix]").forEach(b => {
      b.onclick = async () => {
        const id = b.getAttribute("data-fix");
        const v = b.getAttribute("data-v") === "1";
        const rr = await API.avisoFixar(id, v);
        if (rr.ok) { UI.toast("Atualizado ✅"); loadAvisos(); }
        else UI.toast(rr.error || "Erro", "err");
      };
    });

    $$("[data-delav]").forEach(b => {
      b.onclick = async () => {
        const id = b.getAttribute("data-delav");
        if (!confirm("Excluir aviso?")) return;
        const rr = await API.avisoDelete(id);
        if (rr.ok) { UI.toast("Excluído"); loadAvisos(); }
        else UI.toast(rr.error || "Erro", "err");
      };
    });
  }

  async function renderConfig() {
    UI.setHeader("Config", "Diagnóstico rápido e utilidades");
    $("#page").innerHTML = `
      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-title">Diagnóstico</div>
            <div class="card-sub">Verifique se o servidor está servindo arquivos estáticos</div>
          </div>
          <button class="btn btn-outline" id="c-diag">Rodar /api/diag</button>
        </div>
        <div class="hint" id="c-out">—</div>
      </div>

      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-title">Dicas</div>
            <div class="card-sub">Se algo “não atualiza”, pode ser cache do Service Worker.</div>
          </div>
        </div>
        <div class="hint">
          Se você mexeu em arquivos estáticos (CSS/JS/ícones), incremente a versão do cache no <b>sw.js</b>.<br/>
          E faça um hard refresh (Ctrl+F5) no PC, ou limpar cache no celular.
        </div>
      </div>
    `;

    $("#c-diag").onclick = async () => {
      $("#c-out").textContent = "Carregando…";
      try {
        const res = await fetch("/api/diag");
        const data = await res.json();
        if (!data.ok) { $("#c-out").textContent = data.error || "Falhou."; return; }
        $("#c-out").innerHTML = `
          <b>Arquivos:</b><br/>
          <div style="max-height:180px; overflow:auto; margin-top:8px; white-space:pre-wrap;">
            ${escapeHtml((data.static_files || []).join("\n"))}
          </div>
        `;
      } catch {
        $("#c-out").textContent = "Falhou ao chamar /api/diag";
      }
    };
  }

  // ========= Boot =========
  async function boot() {
    UI.root = document.getElementById("app");
    if (!UI.root) return;

    if (!API.token) {
      UI.renderLogin();
      return;
    }

    const me = await API.me();
    if (!me.ok) {
      API.clearToken();
      UI.renderLogin();
      return;
    }

    State.user = me.user;
    UI.renderAppShell();
    goto("home");
  }

  boot();
})();
