const API = "/api";
const $ = (id) => document.getElementById(id);

function setLoading(msg){ const s = $("loading-status"); if(s) s.textContent = msg || "Carregando..."; }
function hideLoading(){ const el = $("loading"); if(el) el.style.display = "none"; }
function show(el, on=true){ if(el) el.style.display = on ? "" : "none"; }

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
    if (!d.ok) throw (d.error || "Falha no login");
    this.token = d.token;
    localStorage.setItem("token", d.token);
  },

  async me() {
    const r = await fetch(`${API}/me`, { headers: this.headers() });
    const d = await r.json().catch(() => ({}));
    if (!d.ok) throw (d.error || "Não autenticado");
    return d.usuario;
  },

  logout() {
    localStorage.removeItem("token");
    location.reload();
  }
};

const State = { user:null, aulaAtiva:null, alunos:[], historico:[], page:"home" };

function fmtDT(v){
  if (!v) return "-";
  try { return new Date(v).toLocaleString("pt-BR"); }
  catch { return String(v); }
}

async function apiGet(path){
  const r = await fetch(`${API}${path}`, { headers: Auth.headers() });
  const d = await r.json().catch(() => ({}));
  if (!d.ok) throw (d.error || `Erro em ${path}`);
  return d;
}
async function apiPost(path, body){
  const r = await fetch(`${API}${path}`, {
    method:"POST",
    headers: Auth.headers(),
    body: JSON.stringify(body || {})
  });
  const d = await r.json().catch(() => ({}));
  if (!d.ok) throw (d.error || `Erro em ${path}`);
  return d;
}

function setMeta(txt){ $("page-meta").textContent = txt || ""; }
function setTitle(t){ $("page-title").textContent = t; }

function setPill(){
  const p = $("pill-status");
  if (!p) return;
  p.className = "pill";
  if (State.aulaAtiva) { p.classList.add("ok"); p.textContent = "🟢 Aula ativa"; }
  else { p.classList.add("warn"); p.textContent = "🟡 Sem aula ativa"; }
}

function setActiveNav(page){
  document.querySelectorAll(".nav button").forEach(b => b.classList.toggle("active", b.dataset.page === page));
}

function showPage(page){
  State.page = page;
  setActiveNav(page);

  const titles = {
    home:["Dashboard","Resumo rápido"],
    aulas:["Aulas","Configurar e iniciar aula"],
    ativa:["Aula ativa","Check-in e presença"],
    alunos:["Alunos","Cadastrar e listar"],
    historico:["Histórico","Aulas anteriores e acesso à ativa"]
  };

  Object.keys(titles).forEach(k => show($(`page-${k}`), k === page));
  setTitle(titles[page][0]);
  setMeta(titles[page][1]);
}

function fillAlunos(){
  const sel = $("check-aluno");
  if (sel){
    sel.innerHTML = "";
    for (const a of State.alunos){
      const o = document.createElement("option");
      o.value = a.id;
      o.textContent = a.nome;
      sel.appendChild(o);
    }
  }

  const tb = $("t-alunos");
  if (tb){
    tb.innerHTML = "";
    for (const a of State.alunos){
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${a.nome || ""}</td>`;
      tb.appendChild(tr);
    }
  }
}

function renderHistorico(){
  const tb = $("t-historico");
  if (!tb) return;
  tb.innerHTML = "";
  for (const a of State.historico){
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

function renderPresenca(rows){
  const tb = $("t-presenca");
  if (!tb) return;
  tb.innerHTML = "";
  for (const r of rows){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.nome || ""}</td>
      <td>${fmtDT(r.horario_entrada)}</td>
      <td>${fmtDT(r.horario_saida)}</td>
    `;
    tb.appendChild(tr);
  }
}

async function loadAlunos(){
  const d = await apiGet("/alunos");
  State.alunos = d.alunos || [];
  fillAlunos();
}

async function loadAulaAtiva(){
  const d = await apiGet("/aulas/ativa");
  State.aulaAtiva = d.aula || null;

  setPill();

  $("home-aula-ativa").textContent = State.aulaAtiva
    ? `Aula #${State.aulaAtiva.id} • Tema: ${State.aulaAtiva.tema || "-"}`
    : "Nenhuma aula ativa no momento.";

  $("ativa-info").textContent = State.aulaAtiva
    ? `Aula #${State.aulaAtiva.id} • Tema: ${State.aulaAtiva.tema || "-"} • Professores: ${State.aulaAtiva.professores || "-"}`
    : "Nenhuma aula ativa agora. Vá em “Aulas” e inicie uma.";

  if (State.aulaAtiva){
    const p = await apiGet(`/aulas/${State.aulaAtiva.id}/presenca`);
    renderPresenca(p.presenca || []);
  } else {
    renderPresenca([]);
  }
}

async function loadHistorico(){
  const d = await apiGet("/aulas/historico");
  State.historico = d.aulas || [];
  renderHistorico();
}

async function refreshAll(){
  setMeta("Atualizando…");
  await Promise.all([loadAlunos(), loadAulaAtiva(), loadHistorico()]);
  setMeta("Atualizado ✅");
}

async function iniciarAula(){
  const prof = ($("aula-prof").value || "").trim();
  const aux  = ($("aula-aux").value || "").trim();
  const tema = ($("aula-tema").value || "").trim();
  if (!tema){ $("aula-msg").textContent = "Informe o tema."; return; }

  const professores = [prof, aux].filter(Boolean).join(" / ");
  $("aula-msg").textContent = "Iniciando…";

  try{
    await apiPost("/aulas/iniciar", { tema, professores });
    $("aula-msg").textContent = "Aula iniciada ✅";
    await loadAulaAtiva();
    showPage("ativa");
  } catch(e){
    $("aula-msg").textContent = String(e);
  }
}

async function entrada(){
  if (!State.aulaAtiva){ $("check-msg").textContent = "Sem aula ativa."; return; }
  const aluno_id = Number($("check-aluno").value);
  if (!aluno_id){ $("check-msg").textContent = "Selecione um aluno."; return; }

  $("check-msg").textContent = "Registrando entrada…";
  try{
    await apiPost("/aulas/entrada", { aula_id: State.aulaAtiva.id, aluno_id });
    $("check-msg").textContent = "Entrada ✅";
    await loadAulaAtiva();
  } catch(e){
    $("check-msg").textContent = String(e);
  }
}

async function saida(){
  if (!State.aulaAtiva){ $("check-msg").textContent = "Sem aula ativa."; return; }
  const aluno_id = Number($("check-aluno").value);
  if (!aluno_id){ $("check-msg").textContent = "Selecione um aluno."; return; }

  const retirado_por = ($("retirado-por").value || "").trim();

  $("check-msg").textContent = "Registrando saída…";
  try{
    await apiPost("/aulas/saida", { aula_id: State.aulaAtiva.id, aluno_id, retirado_por });
    $("check-msg").textContent = "Saída ✅";
    await loadAulaAtiva();
  } catch(e){
    $("check-msg").textContent = String(e);
  }
}

async function addAluno(){
  const nome = ($("novo-aluno").value || "").trim();
  if (!nome){ $("aluno-msg").textContent = "Digite o nome."; return; }

  $("aluno-msg").textContent = "Cadastrando…";
  try{
    await apiPost("/alunos", { nome });
    $("novo-aluno").value = "";
    $("aluno-msg").textContent = "Cadastrado ✅";
    await loadAlunos();
  } catch(e){
    $("aluno-msg").textContent = String(e);
  }
}

async function boot(){
  try{
    setLoading("Verificando acesso…");
    State.user = await Auth.me();

    show($("login-wrap"), false);
    show($("app"), true);

    document.querySelectorAll(".nav button").forEach(b => {
      b.onclick = async () => {
        showPage(b.dataset.page);
        if (b.dataset.page === "ativa") await loadAulaAtiva();
        if (b.dataset.page === "alunos") await loadAlunos();
        if (b.dataset.page === "historico") await loadHistorico();
      };
    });

    document.querySelectorAll("[data-goto]").forEach(btn => btn.onclick = () => showPage(btn.dataset.goto));

    $("btn-logout").onclick = () => Auth.logout();
    $("btn-refresh").onclick = () => refreshAll();

    $("home-open-ativa").onclick = async () => { await loadAulaAtiva(); showPage("ativa"); };
    $("btn-iniciar-aula").onclick = () => iniciarAula();
    $("btn-ver-ativa").onclick = async () => { await loadAulaAtiva(); showPage("ativa"); };

    $("btn-entrada").onclick = () => entrada();
    $("btn-saida").onclick = () => saida();

    $("btn-add-aluno").onclick = () => addAluno();

    $("hist-open-ativa").onclick = async () => { await loadAulaAtiva(); showPage("ativa"); };
    $("hist-refresh").onclick = async () => { await loadHistorico(); $("hist-msg").textContent = "Atualizado ✅"; };

    setLoading("Carregando dados…");
    showPage("home");
    await refreshAll();

  } catch(e){
    console.error(e);
    show($("login-wrap"), true);
    show($("app"), false);

    $("btn-login").onclick = async () => {
      const u = $("login-user").value.trim();
      const p = $("login-pass").value;
      $("login-msg").textContent = "";
      try{
        await Auth.login(u, p);
        location.reload();
      } catch(err){
        $("login-msg").textContent = String(err);
      }
    };
  } finally {
    hideLoading();
  }
}

boot();
