/* static/js/app.js
   IEQ Central • Kid 2026
   Frontend SPA sem framework
*/

(() => {
  "use strict";

  // ============ Helpers ============
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const API = {
    tokenKey: "ieq_token",
    get token() { return localStorage.getItem(API.tokenKey) || ""; },
    set token(v) { localStorage.setItem(API.tokenKey, v || ""); },
    clearToken() { localStorage.removeItem(API.tokenKey); },

    async request(path, { method="GET", body=null, headers={} } = {}) {
      const h = { "Content-Type": "application/json", ...headers };
      if (API.token) h.Authorization = `Bearer ${API.token}`;

      const opt = { method, headers: h };
      if (body) opt.body = JSON.stringify(body);

      const res = await fetch(path, opt);
      let data = null;

      try { data = await res.json(); }
      catch { data = { ok:false, error:"Resposta inválida do servidor." }; }

      if (!res.ok && data && data.ok !== true) {
        // mantém o erro do backend
      }
      return data;
    },

    login(usuario, senha) {
      return API.request("/api/login", { method:"POST", body:{ usuario, senha } });
    },
    me() { return API.request("/api/me"); },

    // Alunos
    alunosList() { return API.request("/api/alunos"); },
    alunoCreate(nome) { return API.request("/api/alunos", { method:"POST", body:{ nome } }); },
    alunoDelete(id) { return API.request(`/api/alunos/${id}`, { method:"DELETE" }); },

    // Equipe
    usuariosList() { return API.request("/api/usuarios"); },
    usuarioCreate(nome, usuario, senha, role) {
      return API.request("/api/usuarios", { method:"POST", body:{ nome, usuario, senha, role } });
    },
    usuarioDelete(id) { return API.request(`/api/usuarios/${id}`, { method:"DELETE" }); },

    // Aulas
    aulaAtiva() { return API.request("/api/aulas/ativa"); },
    aulaIniciar(professores, tema) {
      return API.request("/api/aulas/iniciar", { method:"POST", body:{ professores, tema } });
    },
    aulaEncerrar(aula_id) {
      return API.request("/api/aulas/encerrar", { method:"POST", body:{ aula_id } });
    },
    aulaEntrada(aula_id, aluno_id) {
      return API.request("/api/aulas/entrada", { method:"POST", body:{ aula_id, aluno_id } });
    },
    aulaSaida(aula_id, aluno_id, retirado_por) {
      return API.request("/api/aulas/saida", { method:"POST", body:{ aula_id, aluno_id, retirado_por } });
    },

    // Histórico
    historico() { return API.request("/api/historico"); },

    // Mural
    avisosList() { return API.request("/api/avisos"); },
    avisoCreate(mensagem) {
      return API.request("/api/avisos", { method:"POST", body:{ mensagem } });
    },
    avisoFixar(id, fixado) {
      return API.request(`/api/avisos/${id}`, { method:"PUT", body:{ fixado } });
    },
    avisoDelete(id) { return API.request(`/api/avisos/${id}`, { method:"DELETE" }); },
  };

  // ============ UI ============
  const UI = {
    loading: $("#loading"),
    loadingStatus: $("#loading-status"),
    loginWrap: $("#login-wrap"),
    app: $("#app"),

    loginUser: $("#login-user"),
    loginPass: $("#login-pass"),
    btnLogin: $("#btn-login"),
    loginMsg: $("#login-msg"),

    pageTitle: $("#page-title"),
    pageMeta: $("#page-meta"),
    pillStatus: $("#pill-status"),

    // pages
    pages: {
      home: $("#page-home"),
      alunos: $("#page-alunos"),
      equipe: $("#page-equipe"),
      aulas: $("#page-aulas"),
      ativa: $("#page-ativa"),
      historico: $("#page-historico"),
      mural: $("#page-mural"),
      config: $("#page-config"),
    },

    // nav
    navButtons: $$(".nav button"),

    setLoading(on, msg="") {
      if (!UI.loading) return;
      UI.loading.style.display = on ? "flex" : "none";
      if (UI.loadingStatus && msg) UI.loadingStatus.textContent = msg;
    },

    showLogin(msg="") {
      UI.app.style.display = "none";
      UI.loginWrap.style.display = "flex";
      UI.setLoading(false);
      UI.loginMsg.textContent = msg || "";
    },

    showApp() {
      UI.loginWrap.style.display = "none";
      UI.app.style.display = "block";
      UI.setLoading(false);
    },

    toast(text, type="ok") {
      // simples, sem biblioteca
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

    setStatusPill(text, kind="warn") {
      UI.pillStatus.textContent = text;
      UI.pillStatus.classList.remove("ok","warn");
      UI.pillStatus.classList.add(kind);
    },

    setPage(name, title) {
      UI.navButtons.forEach(b => b.classList.toggle("active", b.dataset.page === name));
      Object.entries(UI.pages).forEach(([k, el]) => el.style.display = (k === name ? "block" : "none"));
      UI.pageTitle.textContent = title || "IEQ Central";
    },

    fmtTS(ts) {
      if (!ts) return "-";
      try {
        const d = new Date(ts);
        return d.toLocaleString("pt-BR");
      } catch { return String(ts); }
    }
  };

  // ============ State ============
  const State = {
    user: null,
    aulaAtiva: null,
    alunos: [],
    usuarios: [],
  };

  // ============ Renderers ============
  function renderHome() {
    const box = UI.pages.home;
    box.innerHTML = `
      <h2 style="margin:0 0 8px;">Bem-vindo 👋</h2>
      <div class="muted">Use o menu para gerenciar alunos, equipe, aulas e presença.</div>
      <div style="height:14px;"></div>
      <div class="row">
        <div class="card section">
          <div style="font-weight:900;">Aula ativa</div>
          <div class="muted" id="home-aula-ativa" style="margin-top:6px;">Carregando…</div>
          <div class="actions" style="margin-top:10px;">
            <button id="home-open-ativa" class="btn primary small">Abrir aula ativa</button>
            <button id="home-refresh" class="btn small">Atualizar</button>
          </div>
        </div>
        <div class="card section">
          <div style="font-weight:900;">Sessão</div>
          <div class="muted" style="margin-top:8px;">
            <div><b>Usuário:</b> ${escapeHtml(State.user?.usuario || "-")}</div>
            <div><b>Nome:</b> ${escapeHtml(State.user?.nome || "-")}</div>
            <div><b>Role:</b> ${escapeHtml(State.user?.role || "-")}</div>
          </div>
        </div>
      </div>
      <div style="height:10px;"></div>
      <div class="card section">
        <div style="font-weight:900;">Dica</div>
        <div class="muted" style="margin-top:8px;">
          Para fazer check-in, primeiro <b>inicie uma aula</b> (menu Aulas). Depois entre em <b>Aula ativa</b>.
        </div>
      </div>
    `;

    $("#home-open-ativa").onclick = () => goto("ativa");
    $("#home-refresh").onclick = () => refreshAll();

    refreshAulaAtivaHome();
  }

  async function refreshAulaAtivaHome() {
    const out = $("#home-aula-ativa");
    if (!out) return;
    out.textContent = "Verificando…";

    const data = await API.aulaAtiva();
    if (data.ok) {
      State.aulaAtiva = data.aula || null;

      if (State.aulaAtiva) {
        out.innerHTML = `
          <b>ID:</b> ${State.aulaAtiva.id} <br>
          <b>Tema:</b> ${escapeHtml(State.aulaAtiva.tema || "-")} <br>
          <b>Professores:</b> ${escapeHtml(State.aulaAtiva.professores || "-")} <br>
          <b>Início:</b> ${UI.fmtTS(State.aulaAtiva.data_aula)}
        `;
        UI.setStatusPill("Aula ativa", "ok");
      } else {
        out.textContent = "Nenhuma aula ativa agora.";
        UI.setStatusPill("Sem aula ativa", "warn");
      }
    } else {
      out.textContent = data.error || "Falha ao verificar aula ativa.";
      UI.setStatusPill("Erro", "warn");
    }
  }

  function renderAlunos() {
    const box = UI.pages.alunos;

    box.innerHTML = `
      <h2 style="margin:0 0 8px;">Alunos</h2>
      <div class="muted">Cadastrar e listar alunos. (Professor/Auxiliar também pode cadastrar)</div>
      <div style="height:12px;"></div>

      <div class="row">
        <div class="card section">
          <div style="font-weight:900;">Cadastrar aluno</div>
          <input id="novo-aluno" class="input" placeholder="Nome do aluno" />
          <div class="actions" style="margin-top:12px;">
            <button id="btn-add-aluno" class="btn primary small">Cadastrar</button>
            <button id="btn-refresh-alunos" class="btn small">Atualizar</button>
          </div>
          <div id="aluno-msg" class="muted" style="margin-top:10px;"></div>
        </div>

        <div class="card section">
          <div style="font-weight:900;">Lista</div>
          <input id="aluno-q" class="input" placeholder="Pesquisar..." style="margin-top:10px;" />
          <div style="overflow:auto; max-height: 360px; margin-top:10px;">
            <table>
              <thead><tr><th>Nome</th><th style="width:120px;">Ações</th></tr></thead>
              <tbody id="t-alunos"></tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    $("#btn-add-aluno").onclick = async () => {
      const nome = ($("#novo-aluno").value || "").trim();
      const msg = $("#aluno-msg");
      msg.textContent = "";

      if (!nome) { msg.textContent = "Digite o nome."; return; }

      const r = await API.alunoCreate(nome);
      if (r.ok) {
        UI.toast("Aluno cadastrado ✅");
        $("#novo-aluno").value = "";
        await loadAlunos();
        fillAlunosTable();
      } else {
        msg.textContent = r.error || "Erro ao cadastrar aluno.";
      }
    };

    $("#btn-refresh-alunos").onclick = async () => {
      await loadAlunos();
      fillAlunosTable();
    };

    $("#aluno-q").oninput = () => fillAlunosTable();

    loadAlunos().then(fillAlunosTable);
  }

  function fillAlunosTable() {
    const tb = $("#t-alunos");
    if (!tb) return;

    const q = ($("#aluno-q")?.value || "").trim().toLowerCase();
    const rows = (State.alunos || [])
      .filter(a => !q || (a.nome || "").toLowerCase().includes(q))
      .map(a => `
        <tr>
          <td>${escapeHtml(a.nome)}</td>
          <td>
            <div class="actions">
              <button class="btn small" data-del="${a.id}">Excluir</button>
            </div>
          </td>
        </tr>
      `).join("");

    tb.innerHTML = rows || `<tr><td colspan="2" class="muted">Nenhum aluno encontrado.</td></tr>`;

    $$("button[data-del]").forEach(btn => {
      btn.onclick = async () => {
        const id = btn.getAttribute("data-del");
        if (!confirm("Excluir este aluno?")) return;
        const r = await API.alunoDelete(id);
        if (r.ok) {
          UI.toast("Aluno excluído");
          await loadAlunos();
          fillAlunosTable();
        } else {
          UI.toast(r.error || "Erro ao excluir", "err");
        }
      };
    });
  }

  function renderEquipe() {
    const box = UI.pages.equipe;
    const isAdmin = State.user?.role === "admin";

    box.innerHTML = `
      <h2 style="margin:0 0 8px;">Equipe</h2>
      <div class="muted">Listar equipe (cadastro de equipe só admin).</div>
      <div style="height:12px;"></div>

      <div class="row">
        <div class="card section">
          <div style="font-weight:900;">Pesquisar</div>
          <input id="user-q" class="input" placeholder="Pesquisar..." style="margin-top:10px;" />
          <div class="actions" style="margin-top:12px;">
            <button id="btn-refresh-users" class="btn small">Atualizar</button>
          </div>

          <div style="overflow:auto; max-height: 360px; margin-top:12px;">
            <table>
              <thead><tr><th>Nome</th><th>Usuário</th><th>Role</th><th style="width:120px;">Ações</th></tr></thead>
              <tbody id="t-users"></tbody>
            </table>
          </div>
        </div>

        <div class="card section">
          <div style="font-weight:900;">Cadastrar membro</div>
          <div class="muted" style="margin-top:6px;">
            ${isAdmin ? "Somente admin pode cadastrar equipe." : "Você não tem permissão para cadastrar equipe."}
          </div>
          <div style="height:10px;"></div>

          <input id="u-nome" class="input" placeholder="Nome" ${isAdmin ? "" : "disabled"} />
          <div style="height:10px;"></div>
          <input id="u-usuario" class="input" placeholder="Usuário (login)" ${isAdmin ? "" : "disabled"} />
          <div style="height:10px;"></div>
          <input id="u-senha" class="input" type="password" placeholder="Senha" ${isAdmin ? "" : "disabled"} />
          <div style="height:10px;"></div>
          <select id="u-role" class="input" ${isAdmin ? "" : "disabled"}>
            <option value="professor">professor</option>
            <option value="auxiliar">auxiliar</option>
            <option value="admin">admin</option>
          </select>

          <div class="actions" style="margin-top:12px;">
            <button id="btn-add-user" class="btn primary small" ${isAdmin ? "" : "disabled"}>Cadastrar</button>
          </div>

          <div id="user-msg" class="muted" style="margin-top:10px;"></div>
        </div>
      </div>
    `;

    $("#btn-refresh-users").onclick = async () => {
      await loadUsuarios();
      fillUsersTable();
    };
    $("#user-q").oninput = () => fillUsersTable();

    if (isAdmin) {
      $("#btn-add-user").onclick = async () => {
        const nome = ($("#u-nome").value || "").trim();
        const usuario = ($("#u-usuario").value || "").trim();
        const senha = ($("#u-senha").value || "").trim();
        const role = ($("#u-role").value || "professor").trim();
        const msg = $("#user-msg");
        msg.textContent = "";

        if (!nome || !usuario || !senha || !role) {
          msg.textContent = "Preencha todos os campos.";
          return;
        }

        const r = await API.usuarioCreate(nome, usuario, senha, role);
        if (r.ok) {
          UI.toast("Usuário criado ✅");
          $("#u-nome").value = "";
          $("#u-usuario").value = "";
          $("#u-senha").value = "";
          await loadUsuarios();
          fillUsersTable();
        } else {
          msg.textContent = r.error || "Erro ao criar usuário.";
        }
      };
    }

    loadUsuarios().then(fillUsersTable);
  }

  function fillUsersTable() {
    const tb = $("#t-users");
    if (!tb) return;

    const q = ($("#user-q")?.value || "").trim().toLowerCase();
    const isAdmin = State.user?.role === "admin";

    const rows = (State.usuarios || [])
      .filter(u => !q || `${u.nome||""} ${u.usuario||""} ${u.role||""}`.toLowerCase().includes(q))
      .map(u => `
        <tr>
          <td>${escapeHtml(u.nome || "")}</td>
          <td>${escapeHtml(u.usuario || "")}</td>
          <td>${escapeHtml(u.role || "")}</td>
          <td>
            ${isAdmin && u.usuario !== "admin"
              ? `<button class="btn small" data-udel="${u.id}">Excluir</button>`
              : `<span class="muted">-</span>`}
          </td>
        </tr>
      `).join("");

    tb.innerHTML = rows || `<tr><td colspan="4" class="muted">Nenhum usuário.</td></tr>`;

    $$("button[data-udel]").forEach(btn => {
      btn.onclick = async () => {
        const id = btn.getAttribute("data-udel");
        if (!confirm("Excluir este usuário?")) return;
        const r = await API.usuarioDelete(id);
        if (r.ok) {
          UI.toast("Usuário excluído");
          await loadUsuarios();
          fillUsersTable();
        } else {
          UI.toast(r.error || "Erro ao excluir", "err");
        }
      };
    });
  }

  function renderAulas() {
    const box = UI.pages.aulas;

    box.innerHTML = `
      <h2 style="margin:0 0 8px;">Aulas</h2>
      <div class="muted">Professor + auxiliar + tema. Ao iniciar, você vai para a tela “Aula ativa”.</div>
      <div style="height:14px;"></div>

      <div class="card section">
        <div class="row">
          <div>
            <label style="font-weight:900;">Professor</label>
            <input id="a-prof" class="input" placeholder="Ex: Prof. Maria" />
          </div>
          <div>
            <label style="font-weight:900;">Auxiliar</label>
            <input id="a-aux" class="input" placeholder="Ex: Tia Ana" />
          </div>
        </div>
        <div style="height:12px;"></div>
        <label style="font-weight:900;">Tema</label>
        <input id="a-tema" class="input" placeholder="Ex: O Bom Pastor" />
        <div class="actions" style="margin-top:14px;">
          <button id="btn-iniciar-aula" class="btn primary">Iniciar aula</button>
          <button id="btn-ir-ativa" class="btn">Abrir aula ativa</button>
        </div>
        <div id="aula-msg" class="muted" style="margin-top:10px;"></div>
      </div>
    `;

    $("#btn-ir-ativa").onclick = () => goto("ativa");

    $("#btn-iniciar-aula").onclick = async () => {
      const prof = ($("#a-prof").value || "").trim();
      const aux = ($("#a-aux").value || "").trim();
      const tema = ($("#a-tema").value || "").trim();
      const msg = $("#aula-msg");
      msg.textContent = "";

      if (!prof || !tema) {
        msg.textContent = "Tema e professor são obrigatórios.";
        return;
      }

      const professores = aux ? `${prof} (prof) • ${aux} (aux)` : `${prof}`;
      const r = await API.aulaIniciar(professores, tema);

      if (r.ok) {
        UI.toast("Aula iniciada ✅");
        goto("ativa");
      } else {
        msg.textContent = r.error || "Erro ao iniciar aula.";
      }
    };
  }

  function renderAtiva() {
    const box = UI.pages.ativa;

    box.innerHTML = `
      <h2 style="margin:0 0 8px;">Aula ativa</h2>
      <div class="muted" id="ativa-info">Carregando…</div>
      <div style="height:14px;"></div>

      <div class="row">
        <div class="card section">
          <div style="font-weight:900;">Check-in</div>
          <div class="muted" style="margin:6px 0 10px;">Selecione aluno e marque entrada/saída.</div>

          <label style="font-weight:900;">Aluno</label>
          <select id="check-aluno" class="input"></select>

          <label style="font-weight:900; margin-top:10px;">Retirado por (opcional)</label>
          <input id="retirado-por" class="input" placeholder="Ex: Pai / Mãe / Responsável" />

          <div class="actions" style="margin-top:12px;">
            <button id="btn-entrada" class="btn primary small">Entrada</button>
            <button id="btn-saida" class="btn small">Saída</button>
            <button id="btn-encerrar" class="btn danger small">Encerrar aula</button>
            <button id="btn-refresh-ativa" class="btn small">Atualizar</button>
          </div>

          <div id="check-msg" class="muted" style="margin-top:10px;"></div>
        </div>

        <div class="card section">
          <div style="font-weight:900;">Lista de presença</div>
          <div style="overflow:auto; max-height: 340px; margin-top:10px;">
            <table>
              <thead>
                <tr><th>Aluno</th><th>Entrada</th><th>Saída</th><th>Retirado por</th></tr>
              </thead>
              <tbody id="t-presenca"></tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    $("#btn-refresh-ativa").onclick = () => loadAulaAtivaPage();
    $("#btn-entrada").onclick = async () => {
      const msg = $("#check-msg");
      msg.textContent = "";
      if (!State.aulaAtiva) return msg.textContent = "Sem aula ativa.";

      const alunoId = $("#check-aluno").value;
      if (!alunoId) return msg.textContent = "Selecione um aluno.";

      const r = await API.aulaEntrada(State.aulaAtiva.id, alunoId);
      if (r.ok) {
        UI.toast("Entrada registrada ✅");
        await loadAulaAtivaPage();
      } else {
        msg.textContent = r.error || "Erro ao registrar entrada.";
      }
    };

    $("#btn-saida").onclick = async () => {
      const msg = $("#check-msg");
      msg.textContent = "";
      if (!State.aulaAtiva) return msg.textContent = "Sem aula ativa.";

      const alunoId = $("#check-aluno").value;
      const retiradoPor = ($("#retirado-por").value || "").trim();
      if (!alunoId) return msg.textContent = "Selecione um aluno.";

      const r = await API.aulaSaida(State.aulaAtiva.id, alunoId, retiradoPor);
      if (r.ok) {
        UI.toast("Saída registrada ✅");
        $("#retirado-por").value = "";
        await loadAulaAtivaPage();
      } else {
        msg.textContent = r.error || "Erro ao registrar saída.";
      }
    };

    $("#btn-encerrar").onclick = async () => {
      if (!State.aulaAtiva) return UI.toast("Sem aula ativa.", "err");
      if (!confirm("Encerrar a aula ativa agora?")) return;

      const r = await API.aulaEncerrar(State.aulaAtiva.id);
      if (r.ok) {
        UI.toast("Aula encerrada ✅");
        State.aulaAtiva = null;
        goto("historico");
      } else {
        UI.toast(r.error || "Erro ao encerrar", "err");
      }
    };

    loadAulaAtivaPage();
  }

  async function loadAulaAtivaPage() {
    $("#ativa-info").textContent = "Carregando…";
    $("#t-presenca").innerHTML = "";
    $("#check-aluno").innerHTML = "";

    // aula ativa
    const a = await API.aulaAtiva();
    if (!a.ok) {
      $("#ativa-info").textContent = a.error || "Erro ao carregar aula ativa.";
      return;
    }

    State.aulaAtiva = a.aula || null;
    if (!State.aulaAtiva) {
      $("#ativa-info").innerHTML = "Nenhuma aula ativa agora. Vá em <b>Aulas</b> para iniciar.";
      UI.setStatusPill("Sem aula ativa", "warn");
      return;
    }

    UI.setStatusPill("Aula ativa", "ok");
    $("#ativa-info").innerHTML = `
      <b>ID:</b> ${State.aulaAtiva.id} <br>
      <b>Tema:</b> ${escapeHtml(State.aulaAtiva.tema || "-")} <br>
      <b>Professores:</b> ${escapeHtml(State.aulaAtiva.professores || "-")} <br>
      <b>Início:</b> ${UI.fmtTS(State.aulaAtiva.data_aula)}
    `;

    // alunos
    await loadAlunos();
    const sel = $("#check-aluno");
    sel.innerHTML = `<option value="">Selecione…</option>` + (State.alunos||[])
      .map(x => `<option value="${x.id}">${escapeHtml(x.nome)}</option>`)
      .join("");

    // presença
    const pres = a.presenca || [];
    const tb = $("#t-presenca");
    tb.innerHTML = pres.length ? pres.map(p => `
      <tr>
        <td>${escapeHtml(p.nome || "")}</td>
        <td>${UI.fmtTS(p.horario_entrada)}</td>
        <td>${UI.fmtTS(p.horario_saida)}</td>
        <td>${escapeHtml(p.retirado_por || "-")}</td>
      </tr>
    `).join("") : `<tr><td colspan="4" class="muted">Sem registros ainda.</td></tr>`;
  }

  function renderHistorico() {
    const box = UI.pages.historico;

    box.innerHTML = `
      <h2 style="margin:0 0 8px;">Histórico</h2>
      <div class="muted">Lista de aulas registradas. Se houver aula ativa, você pode entrar nela também.</div>

      <div class="actions" style="margin-top:12px;">
        <button id="hist-open-ativa" class="btn primary small">Entrar na aula ativa</button>
        <button id="hist-refresh" class="btn small">Atualizar</button>
      </div>

      <div style="overflow:auto; margin-top:10px;">
        <table>
          <thead>
            <tr><th>ID</th><th>Data</th><th>Tema</th><th>Professores</th><th>Status</th></tr>
          </thead>
          <tbody id="t-historico"></tbody>
        </table>
      </div>

      <div id="hist-msg" class="muted" style="margin-top:10px;"></div>
    `;

    $("#hist-open-ativa").onclick = () => goto("ativa");
    $("#hist-refresh").onclick = () => loadHistorico();

    loadHistorico();
  }

  async function loadHistorico() {
    $("#hist-msg").textContent = "";
    $("#t-historico").innerHTML = `<tr><td colspan="5" class="muted">Carregando…</td></tr>`;

    const r = await API.historico();
    if (!r.ok) {
      $("#hist-msg").textContent = r.error || "Erro ao carregar histórico.";
      $("#t-historico").innerHTML = `<tr><td colspan="5" class="muted">Erro ao carregar.</td></tr>`;
      return;
    }

    const rows = (r.aulas || []).map(a => `
      <tr>
        <td>${a.id}</td>
        <td>${UI.fmtTS(a.data_aula)}</td>
        <td>${escapeHtml(a.tema || "-")}</td>
        <td>${escapeHtml(a.professores || "-")}</td>
        <td>${a.encerrada_em ? "Encerrada" : "<b>Ativa</b>"}</td>
      </tr>
    `).join("");

    $("#t-historico").innerHTML = rows || `<tr><td colspan="5" class="muted">Nenhuma aula ainda.</td></tr>`;
  }

  function renderMural() {
    const box = UI.pages.mural;
    const isAdmin = State.user?.role === "admin";

    box.innerHTML = `
      <h2 style="margin:0 0 8px;">Mural</h2>
      <div class="muted">Avisos rápidos do ministério.</div>

      <div class="card section" style="margin-top:12px;">
        <div style="font-weight:900;">Novo aviso</div>
        <textarea id="aviso-msg" class="input" style="margin-top:10px; height:90px; resize:vertical;" placeholder="Digite o aviso..."></textarea>
        <div class="actions" style="margin-top:12px;">
          <button id="btn-add-aviso" class="btn primary small">Publicar</button>
          <button id="btn-refresh-avisos" class="btn small">Atualizar</button>
        </div>
        <div class="muted" id="aviso-err" style="margin-top:10px;"></div>
      </div>

      <div class="card section" style="margin-top:12px;">
        <div style="font-weight:900;">Avisos</div>
        <div id="avisos-list" style="margin-top:10px;"></div>
      </div>

      <div class="muted" style="margin-top:10px;">
        ${isAdmin ? "Admin pode fixar e excluir avisos." : ""}
      </div>
    `;

    $("#btn-add-aviso").onclick = async () => {
      const t = ($("#aviso-msg").value || "").trim();
      $("#aviso-err").textContent = "";
      if (!t) return $("#aviso-err").textContent = "Digite uma mensagem.";

      const r = await API.avisoCreate(t);
      if (r.ok) {
        UI.toast("Aviso publicado ✅");
        $("#aviso-msg").value = "";
        await loadAvisos();
      } else {
        $("#aviso-err").textContent = r.error || "Erro ao publicar.";
      }
    };

    $("#btn-refresh-avisos").onclick = () => loadAvisos();

    loadAvisos();
  }

  async function loadAvisos() {
    const list = $("#avisos-list");
    list.innerHTML = `<div class="muted">Carregando…</div>`;

    const r = await API.avisosList();
    if (!r.ok) {
      list.innerHTML = `<div class="muted">${escapeHtml(r.error || "Erro ao carregar avisos.")}</div>`;
      return;
    }

    const isAdmin = State.user?.role === "admin";
    const avisos = r.avisos || [];

    const html = avisos.map(a => `
      <div class="card section" style="margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start;">
          <div>
            <div style="font-weight:900;">${a.fixado ? "📌 " : ""}${escapeHtml((a.autor || "Sistema"))}</div>
            <div class="muted" style="font-size:12px;">${UI.fmtTS(a.data_criacao)}</div>
          </div>
          <div class="actions">
            ${isAdmin ? `<button class="btn small" data-fix="${a.id}" data-fixv="${a.fixado ? "0" : "1"}">${a.fixado ? "Desfixar" : "Fixar"}</button>` : ""}
            ${isAdmin ? `<button class="btn small" data-adel="${a.id}">Excluir</button>` : ""}
          </div>
        </div>
        <div style="margin-top:10px;">${escapeHtml(a.mensagem || "")}</div>
      </div>
    `).join("");

    list.innerHTML = html || `<div class="muted">Nenhum aviso.</div>`;

    $$("button[data-fix]").forEach(b => {
      b.onclick = async () => {
        const id = b.getAttribute("data-fix");
        const v = b.getAttribute("data-fixv") === "1";
        const rr = await API.avisoFixar(id, v);
        if (rr.ok) { UI.toast("Atualizado ✅"); loadAvisos(); }
        else UI.toast(rr.error || "Erro", "err");
      };
    });

    $$("button[data-adel]").forEach(b => {
      b.onclick = async () => {
        const id = b.getAttribute("data-adel");
        if (!confirm("Excluir aviso?")) return;
        const rr = await API.avisoDelete(id);
        if (rr.ok) { UI.toast("Excluído"); loadAvisos(); }
        else UI.toast(rr.error || "Erro", "err");
      };
    });
  }

  function renderConfig() {
    const box = UI.pages.config;
    box.innerHTML = `
      <h2 style="margin:0 0 8px;">Configurações</h2>
      <div class="muted">Sessão / conta</div>
      <div style="height:12px;"></div>

      <div class="card section">
        <div><b>Usuário:</b> ${escapeHtml(State.user?.usuario || "-")}</div>
        <div style="margin-top:8px;"><b>Nome:</b> ${escapeHtml(State.user?.nome || "-")}</div>
        <div style="margin-top:8px;"><b>Role:</b> ${escapeHtml(State.user?.role || "-")}</div>

        <div class="actions" style="margin-top:14px;">
          <button id="btn-logout2" class="btn danger small">Sair</button>
        </div>
      </div>
    `;
    $("#btn-logout2").onclick = logout;
  }

  // ============ Loaders ============
  async function loadAlunos() {
    const r = await API.alunosList();
    if (r.ok) State.alunos = r.alunos || [];
    return r;
  }

  async function loadUsuarios() {
    // só admin tem acesso, mas professor/aux pode abrir a tela e ver erro,
    // então a gente trata com fallback visual
    const r = await API.usuariosList();
    if (r.ok) State.usuarios = r.usuarios || [];
    else State.usuarios = [];
    return r;
  }

  // ============ Navigation ============
  function goto(page) {
    const titles = {
      home: "Início",
      alunos: "Alunos",
      equipe: "Equipe",
      aulas: "Aulas",
      ativa: "Aula ativa",
      historico: "Histórico",
      mural: "Mural",
      config: "Config",
    };

    UI.setPage(page, titles[page] || "IEQ Central");
    UI.pageMeta.textContent = "Pronto.";

    switch(page) {
      case "home": renderHome(); break;
      case "alunos": renderAlunos(); break;
      case "equipe": renderEquipe(); break;
      case "aulas": renderAulas(); break;
      case "ativa": renderAtiva(); break;
      case "historico": renderHistorico(); break;
      case "mural": renderMural(); break;
      case "config": renderConfig(); break;
      default: renderHome(); break;
    }
  }

  // ============ Auth ============
  async function boot() {
    UI.setLoading(true, "Validando sessão...");
    UI.pageMeta.textContent = "Validando sessão…";

    const me = await API.me();
    if (!me.ok) {
      API.clearToken();
      UI.showLogin(me.error || "");
      return;
    }

    State.user = me.user;
    UI.showApp();

    UI.pageMeta.textContent = `Logado como ${State.user.nome} (${State.user.role})`;
    goto("home");
  }

  async function doLogin() {
    UI.loginMsg.textContent = "";
    const usuario = (UI.loginUser.value || "").trim();
    const senha = (UI.loginPass.value || "").trim();

    if (!usuario || !senha) {
      UI.loginMsg.textContent = "Informe usuário e senha.";
      return;
    }

    UI.btnLogin.disabled = true;
    UI.btnLogin.textContent = "Entrando...";

    const r = await API.login(usuario, senha);

    UI.btnLogin.disabled = false;
    UI.btnLogin.textContent = "Entrar";

    if (r.ok && r.token) {
      API.token = r.token;
      UI.toast("Bem-vindo ✅");
      await boot();
    } else {
      UI.loginMsg.textContent = r.error || "Login inválido.";
    }
  }

  function logout() {
    API.clearToken();
    State.user = null;
    State.aulaAtiva = null;
    UI.showLogin("");
  }

  async function refreshAll() {
    await refreshAulaAtivaHome();
  }

  // ============ Security helpers ============
  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (m) => ({
      "&":"&amp;",
      "<":"&lt;",
      ">":"&gt;",
      "\"":"&quot;",
      "'":"&#039;",
    }[m]));
  }

  // ============ Events ============
  function wireNav() {
    UI.navButtons.forEach(btn => {
      btn.addEventListener("click", () => goto(btn.dataset.page));
    });

    const btnLogout = $("#btn-logout");
    const btnRefresh = $("#btn-refresh");
    if (btnLogout) btnLogout.onclick = logout;
    if (btnRefresh) btnRefresh.onclick = refreshAll;

    UI.btnLogin.onclick = doLogin;
    UI.loginPass.addEventListener("keydown", (e) => {
      if (e.key === "Enter") doLogin();
    });
    UI.loginUser.addEventListener("keydown", (e) => {
      if (e.key === "Enter") doLogin();
    });
  }

  // ============ Start ============
  document.addEventListener("DOMContentLoaded", () => {
    wireNav();
    boot();
  });

})();
