window.__IEQ_APP_STARTED = true;
const API = "/api";
const $ = (id) => document.getElementById(id);

const UI = {
  setLoading(msg) {
    const s = $("loading-status");
    if (s) s.textContent = msg || "Carregando...";
  },
  hideLoading() {
    const el = $("loading");
    if (el) el.style.display = "none";
  },
  showLoading(msg) {
    const el = $("loading");
    if (el) el.style.display = "";
    this.setLoading(msg);
  },
  show(el, on = true) {
    if (el) el.style.display = on ? "" : "none";
  }
};

const Auth = {
  token: localStorage.getItem("token") || "",

  headers(extra = {}) {
    const h = { "Content-Type": "application/json", ...extra };
    if (this.token) h.Authorization = `Bearer ${this.token}`;
    return h;
  },

  async login(usuario, senha) {
    const r = await fetch(`${API}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario, senha })
    });
    const d = await r.json().catch(() => ({}));
    if (!d.ok) throw new Error(d.error || "Falha no login");
    this.token = d.token;
    localStorage.setItem("token", d.token);
  },

  async me() {
    if (!this.token) throw new Error("Sem token");
    const r = await fetch(`${API}/me`, { headers: this.headers() });
    const d = await r.json().catch(() => ({}));
    if (!d.ok) throw new Error(d.error || "Não autenticado");
    return d.usuario;
  },

  logout() {
    localStorage.removeItem("token");
    location.reload();
  }
};

const State = {
  user: null,
  aulaAtiva: null,
  alunos: [],
  historico: [],
  page: "home"
};

function fmtDT(v) {
  if (!v) return "-";
  try {
    return new Date(v).toLocaleString("pt-BR");
  } catch {
    return String(v);
  }
}

async function apiGet(path) {
  const r = await fetch(`${API}${path}`, { headers: Auth.headers() });
  const d = await r.json().catch(() => ({}));
  if (!d.ok) throw new Error(d.error || `Erro em ${path}`);
  return d;
}

async function apiPost(path, body) {
  const r = await fetch(`${API}${path}`, {
    method: "POST",
    headers: Auth.headers(),
    body: JSON.stringify(body || {})
  });
  const d = await r.json().catch(() => ({}));
  if (!d.ok) throw new Error(d.error || `Erro em ${path}`);
  return d;
}

function setMeta(txt) {
  const el = $("page-meta");
  if (el) el.textContent = txt || "";
}
function setTitle(txt) {
  const el = $("page-title");
  if (el) el.textContent = txt || "";
}

function setPill() {
  const p = $("pill-status");
  if (!p) return;
  p.className = "pill";
  if (State.aulaAtiva) {
    p.classList.add("ok");
    p.textContent = "🟢 Aula ativa";
  } else {
    p.classList.add("warn");
    p.textContent = "🟡 Sem aula ativa";
  }
}

function setActiveNav(page) {
  document.querySelectorAll(".nav button").forEach((b) => {
    b.classList.toggle("active", b.dataset.page === page);
  });
}

function showPage(page) {
  State.page = page;
  setActiveNav(page);

  const titles = {
    home: ["Dashboard", "Resumo rápido"],
    aulas: ["Aulas", "Configurar e iniciar aula"],
    ativa: ["Aula ativa", "Check-in e presença"],
    alunos: ["Alunos", "Cadastrar e listar"],
    historico: ["Histórico", "Aulas anteriores e acesso à ativa"]
  };

  Object.keys(titles).forEach((k) => UI.show($(`page-${k}`), k === page));
  setTitle(titles[page][0]);
  setMeta(titles[page][1]);
}

function fillAlunos() {
  const sel = $("check-aluno");
  if (sel) {
    sel.innerHTML = "";
    for (const a of State.alunos) {
      const o = document.createElement("option");
      o.value = a.id;
      o.textContent = a.nome;
      sel.appendChild(o);
    }
  }

  const tb = $("t-alunos");
  if (tb) {
    tb.innerHTML = "";
    for (const a of State.alunos) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${a.nome || ""}</td>`;
      tb.appendChild(tr);
    }
  }
}

function renderHistorico() {
  const tb = $("t-historico");
  if (!tb) return;
  tb.innerHTML = "";
  for (const a of State.historico) {
    const st = a.encerrada_em ? "Encerrada" : "Ativa";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${a.id}</td>
      <td>${fmtDT(a.data_aula)}</td>
      <td>${a.tema || ""}</td>
      <td>${a.professores || ""}</td>
      <td>${st}</td>
    `;
    tb.appendChild(tr);
  }
}

function renderPresenca(rows) {
  const tb = $("t-presenca");
  if (!tb) return;
  tb.innerHTML = "";
  for (const r of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.nome || ""}</td>
      <td>${fmtDT(r.horario_entrada)}</td>
      <td>${fmtDT(r.horario_saida)}</td>
    `;
    tb.appendChild(tr);
  }
}

async function loadAlunos() {
  const d = await apiGet("/alunos");
  State.alunos = d.alunos || [];
  fillAlunos();
}

async function loadAulaAtiva() {
  const d = await apiGet("/aulas/ativa");
  State.aulaAtiva = d.aula || null;

  setPill();

  const h = $("home-aula-ativa");
  if (h) {
    h.textContent = State.aulaAtiva
      ? `Aula #${State.aulaAtiva.id} • Tema: ${State.aulaAtiva.tema || "-"}`
      : "Nenhuma aula ativa no momento.";
  }

  const info = $("ativa-info");
  if (info) {
    info.textContent = State.aulaAtiva
      ? `Aula #${State.aulaAtiva.id} • Tema: ${State.aulaAtiva.tema || "-"} • Professores: ${State.aulaAtiva.professores || "-"}`
      : "Nenhuma aula ativa agora. Vá em “Aulas” e inicie uma.";
  }

  if (State.aulaAtiva) {
    const p = await apiGet(`/aulas/${State.aulaAtiva.id}/presenca`);
    renderPresenca(p.presenca || []);
  } else {
    renderPresenca([]);
  }
}

async function loadHistorico() {
  const d = await apiGet("/aulas/historico");
  State.historico = d.aulas || [];
  renderHistorico();
}

async function refreshAll() {
  setMeta("Atualizando…");
  await Promise.all([loadAlunos(), loadAulaAtiva(), loadHistorico()]);
  setMeta("Atualizado ✅");
}

async function iniciarAula() {
  const prof = ($("aula-prof").value || "").trim();
  const aux = ($("aula-aux").value || "").trim();
  const tema = ($("aula-tema").value || "").trim();

  const msg = $("aula-msg");
  if (!tema) {
    if (msg) msg.textContent = "Informe o tema.";
    return;
  }

  const professores = [prof, aux].filter(Boolean).join(" • ");
  UI.setLoading("Iniciando aula…");

  try {
    await apiPost("/aulas/iniciar", { tema, professores });
    if (msg) msg.textContent = "Aula iniciada ✅";
    await loadAulaAtiva();
    showPage("ativa");
  } catch (e) {
    if (msg) msg.textContent = e.message || "Falha ao iniciar aula";
  } finally {
    UI.hideLoading();
  }
}

async function checkEntrada() {
  if (!State.aulaAtiva) return;
  const alunoId = Number(($("check-aluno").value || "0"));
  if (!alunoId) return;

  const msg = $("check-msg");
  if (msg) msg.textContent = "Registrando entrada…";

  try {
    await apiPost("/aulas/entrada", { aula_id: State.aulaAtiva.id, aluno_id: alunoId });
    if (msg) msg.textContent = "Entrada registrada ✅";
    await loadAulaAtiva();
  } catch (e) {
    if (msg) msg.textContent = e.message || "Erro na entrada";
  }
}

async function checkSaida() {
  if (!State.aulaAtiva) return;
  const alunoId = Number(($("check-aluno").value || "0"));
  const retiradoPor = ($("retirado-por").value || "").trim();
  if (!alunoId) return;

  const msg = $("check-msg");
  if (msg) msg.textContent = "Registrando saída…";

  try {
    await apiPost("/aulas/saida", {
      aula_id: State.aulaAtiva.id,
      aluno_id: alunoId,
      retirado_por: retiradoPor
    });
    if (msg) msg.textContent = "Saída registrada ✅";
    await loadAulaAtiva();
  } catch (e) {
    if (msg) msg.textContent = e.message || "Erro na saída";
  }
}

async function cadastrarAluno() {
  const nome = ($("novo-aluno").value || "").trim();
  const msg = $("aluno-msg");
  if (!nome) {
    if (msg) msg.textContent = "Digite o nome.";
    return;
  }

  try {
    await apiPost("/alunos", { nome });
    $("novo-aluno").value = "";
    if (msg) msg.textContent = "Aluno cadastrado ✅";
    await loadAlunos();
  } catch (e) {
    if (msg) msg.textContent = e.message || "Falha ao cadastrar";
  }
}

function bindUI() {
  // Navegação
  document.querySelectorAll(".nav button").forEach((b) => {
    b.addEventListener("click", () => showPage(b.dataset.page));
  });

  // Atalhos
  document.querySelectorAll("[data-goto]").forEach((b) => {
    b.addEventListener("click", () => showPage(b.getAttribute("data-goto")));
  });

  $("btn-logout")?.addEventListener("click", () => Auth.logout());
  $("btn-refresh")?.addEventListener("click", () => refreshAll());

  $("home-open-ativa")?.addEventListener("click", () => showPage("ativa"));
  $("btn-ver-ativa")?.addEventListener("click", () => showPage("ativa"));

  $("btn-iniciar-aula")?.addEventListener("click", () => iniciarAula());

  $("btn-entrada")?.addEventListener("click", () => checkEntrada());
  $("btn-saida")?.addEventListener("click", () => checkSaida());

  $("btn-add-aluno")?.addEventListener("click", () => cadastrarAluno());

  $("hist-open-ativa")?.addEventListener("click", async () => {
    await loadAulaAtiva();
    showPage("ativa");
  });
  $("hist-refresh")?.addEventListener("click", () => loadHistorico());
}

async function boot() {
  // ✅ GARANTIA: nunca fica preso no “Iniciando…”
  UI.setLoading("Iniciando…");

  // Tenta evitar SW antigo segurando arquivo velho
  try {
    if ("serviceWorker" in navigator) {
      // não desregistra automaticamente, mas força pegar versão nova quando você fizer hard refresh
    }
  } catch {}

  try {
    // Checa se API está viva
    await fetch(`${API}/health`).catch(() => null);

    // Se tiver token, tenta autenticar
    if (Auth.token) {
      State.user = await Auth.me();
    }

    // Mostra telas
    UI.hideLoading();

    if (!State.user) {
      UI.show($("login-wrap"), true);
      UI.show($("app"), false);

      $("btn-login")?.addEventListener("click", async () => {
        const u = ($("login-user").value || "").trim();
        const p = ($("login-pass").value || "").trim();
        const msg = $("login-msg");

        if (msg) msg.textContent = "";
        if (!u || !p) {
          if (msg) msg.textContent = "Informe usuário e senha.";
          return;
        }

        try {
          await Auth.login(u, p);
          location.reload();
        } catch (e) {
          if (msg) msg.textContent = e.message || "Falha no login";
        }
      });

      return;
    }

    UI.show($("login-wrap"), false);
    UI.show($("app"), true);

    bindUI();
    showPage("home");
    await refreshAll();
  } catch (e) {
    // Se tudo der ruim, mostra erro no loader
    UI.setLoading(`Erro: ${e.message || e}`);
  }
}

document.addEventListener("DOMContentLoaded", boot);
