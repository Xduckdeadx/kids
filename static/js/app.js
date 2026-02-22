/* Kid IEQ 2025 - app.js (VERSÃO FINAL 100% FUNCIONAL) */
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
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("pt-BR");
  } catch {
    return iso;
  }
}

function formatTimeBR(iso) {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleTimeString("pt-BR", {hour: "2-digit", minute: "2-digit"});
  } catch {
    return iso;
  }
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
      const parts = res.split(",");
      resolve(parts[1] || "");
    };
    reader.readAsDataURL(file);
  });
}

function b64ImgTag(b64, alt = "") {
  if (!b64) return "";
  return `<img src="data:image/*;base64,${b64}" alt="${esc(alt)}">`;
}

function isAdmin(user) {
  const role = user?.usuario?.role || user?.role;
  return role === "admin";
}

/* ---------------- Auth ---------------- */
const Auth = {
  token: localStorage.getItem("kid_ieq_token") || "",
  save(token) {
    this.token = token || "";
    if (this.token) localStorage.setItem("kid_ieq_token", this.token);
    else localStorage.removeItem("kid_ieq_token");
  },
  headers(extra = {}) {
    const h = { ...extra };
    if (!h["Content-Type"] && !(h instanceof Headers)) h["Content-Type"] = "application/json";
    if (this.token) h.Authorization = `Bearer ${this.token}`;
    return h;
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
  root: null,
  init() {
    this.root = document.getElementById("modal-root");
  },
  close() {
    if (this.root) this.root.innerHTML = "";
  },
  open({ title, bodyHTML, footerHTML }) {
    if (!this.root) this.init();
    this.root.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-card">
          <div class="modal-head">
            <div class="modal-title">${esc(title || "")}</div>
            <button class="iconbtn" id="modal-close" title="Fechar">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
          <div class="modal-body">${bodyHTML || ""}</div>
          <div class="modal-foot">${footerHTML || ""}</div>
        </div>
      </div>
    `;
    $("#modal-close")?.addEventListener("click", () => this.close());
    $(".modal")?.addEventListener("click", (e) => {
      if (e.target === $(".modal")) this.close();
    });
  }
};

/* ---------------- App ---------------- */
const APP = {
  me: null,
  page: "home",
  lastAvisos: [],
  lastPinned: [],
  els: {},

  bindEls() {
    this.els.loading = $("#loading");
    this.els.login = $("#login");
    this.els.app = $("#app");
    this.els.loginUser = $("#login-user");
    this.els.loginPass = $("#login-pass");
    this.els.loginMsg = $("#login-msg");
    this.els.btnLogin = $("#btn-login");
    this.els.btnLogout = $("#btn-logout");
    this.els.btnToggleSide = $("#btn-toggle-side");
    this.els.btnSync = $("#btn-sync");
    this.els.btnTheme = $("#btn-theme");
    this.els.pageTitle = $("#page-title");
    this.els.pageSub = $("#page-sub");
    this.els.statAlunos = $("#stat-alunos");
    this.els.statEquipe = $("#stat-equipe");
    this.els.statAvisos = $("#stat-avisos");
    this.els.homePinned = $("#home-pinned");
    this.els.btnNovoAluno = $("#btn-novo-aluno");
    this.els.qAlunos = $("#q-alunos");
    this.els.btnBuscarAlunos = $("#btn-buscar-alunos");
    this.els.listAlunos = $("#list-alunos");
    this.els.btnNovoUser = $("#btn-novo-user");
    this.els.qUsers = $("#q-users");
    this.els.btnBuscarUsers = $("#btn-buscar-users");
    this.els.listUsers = $("#list-users");
    this.els.equipeHint = $("#equipe-hint");
    this.els.btnNovoAviso = $("#btn-novo-aviso");
    this.els.listAvisos = $("#list-avisos");
    this.els.darkToggle = $("#dark-toggle");
    this.els.btnAbout = $("#btn-about");
    this.els.btnClear = $("#btn-clear");
  },

  showScreen(name) {
    hide(this.els.loading);
    hide(this.els.login);
    hide(this.els.app);
    if (name === "loading") show(this.els.loading);
    if (name === "login") show(this.els.login);
    if (name === "app") show(this.els.app);
  },

  setLoading(msg) {
    const el = $("#loading-status");
    if (el) el.innerText = msg || "Carregando...";
  },

  setTheme(isDark) {
    document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
    localStorage.setItem("kid_ieq_theme", isDark ? "dark" : "light");
    if (this.els.darkToggle) this.els.darkToggle.checked = !!isDark;
  },

  toggleTheme() {
    const cur = document.documentElement.getAttribute("data-theme") || "light";
    this.setTheme(cur !== "dark");
  },

  async boot() {
    this.bindEls();
    Modal.init();
    const savedTheme = localStorage.getItem("kid_ieq_theme") || "light";
    this.setTheme(savedTheme === "dark");
    this.bindEvents();
    this.showScreen("loading");
    this.setLoading("Iniciando...");
    this.setLoading("Verificando sessão...");
    const ok = await this.trySession();
    if (!ok) {
      this.showScreen("login");
      return;
    }
    this.showScreen("app");
    await this.go("home");
  },

  bindEvents() {
    $$(".side-item").forEach(btn => {
      btn.addEventListener("click", async () => {
        const page = btn.getAttribute("data-page");
        await this.go(page || "home");
      });
    });
    this.els.btnLogin?.addEventListener("click", () => this.login());
    this.els.loginPass?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.login();
    });
    this.els.btnLogout?.addEventListener("click", () => this.logout());
    this.els.btnToggleSide?.addEventListener("click", () => {
      $(".sidebar")?.classList.toggle("open");
    });
    this.els.btnSync?.addEventListener("click", async () => {
      await this.loadPage(this.page);
      toast("Atualizado", "ok");
    });
    this.els.btnTheme?.addEventListener("click", () => this.toggleTheme());
    this.els.darkToggle?.addEventListener("change", (e) => this.setTheme(e.target.checked));
    this.els.btnAbout?.addEventListener("click", () => this.showAbout());
    this.els.btnClear?.addEventListener("click", () => this.clearLocalCache());
    this.els.btnNovoAluno?.addEventListener("click", () => this.modalAluno());
    this.els.btnBuscarAlunos?.addEventListener("click", () => this.loadAlunos());
    this.els.qAlunos?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.loadAlunos();
    });
    this.els.btnNovoUser?.addEventListener("click", () => this.modalUser());
    this.els.btnBuscarUsers?.addEventListener("click", () => this.loadEquipe());
    this.els.qUsers?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.loadEquipe();
    });
    this.els.btnNovoAviso?.addEventListener("click", () => this.modalAviso());
  },

  async trySession() {
    if (!Auth.token) return false;
    try {
      const me = await apiFetch("/me");
      this.me = me;
      this.paintUser();
      return true;
    } catch (e) {
      if (e.status === 401) {
        Auth.save("");
        return false;
      }
      console.warn(e);
      Auth.save("");
      return false;
    }
  },

  async login() {
    const usuario = (this.els.loginUser?.value || "").trim();
    const senha = (this.els.loginPass?.value || "").trim();
    if (this.els.loginMsg) this.els.loginMsg.innerText = "";
    if (!usuario || !senha) {
      if (this.els.loginMsg) this.els.loginMsg.innerText = "Informe usuário e senha.";
      return;
    }
    try {
      this.showScreen("loading");
      this.setLoading("Autenticando...");
      const data = await apiFetch("/login", {
        method: "POST",
        body: JSON.stringify({ usuario, senha })
      });
      if (!data?.token) throw new Error("Token não retornou");
      Auth.save(data.token);
      const me = await apiFetch("/me");
      this.me = me;
      this.paintUser();
      this.showScreen("app");
      await this.go("home");
      toast("Bem-vindo!", "ok");
    } catch (e) {
      console.error(e);
      this.showScreen("login");
      if (this.els.loginMsg) this.els.loginMsg.innerText = "Falha no login. Verifique usuário/senha.";
      toast("Falha no login", "err");
    }
  },

  async logout() {
    Auth.save("");
    this.me = null;
    this.showScreen("login");
    toast("Saiu do sistema", "ok");
  },

  paintUser() {
    const u = this.me?.usuario || {};
    $("#user-name") && ($("#user-name").innerText = u.nome || "Usuário");
    $("#user-role") && ($("#user-role").innerText = (u.role || "membro"));
    const avatar = $("#user-avatar");
    if (avatar) {
      if (u.foto) avatar.innerHTML = b64ImgTag(u.foto, u.nome || "avatar");
      else avatar.innerHTML = `<i class="fa-solid fa-user"></i>`;
    }
    const admin = isAdmin(this.me);
    if (this.els.btnNovoUser) this.els.btnNovoUser.style.display = admin ? "" : "none";
    if (this.els.btnNovoAviso) this.els.btnNovoAviso.style.display = "";
  },

  async go(page) {
    this.page = page || "home";
    $$(".side-item").forEach(b => b.classList.remove("active"));
    $(`.side-item[data-page="${this.page}"]`)?.classList.add("active");
    const pages = ["home","alunos","equipe","mural","aulas","historico","config"];
    pages.forEach(p => {
      const sec = document.getElementById(`page-${p}`);
      if (sec) sec.style.display = (p === this.page) ? "" : "none";
    });
    $(".sidebar")?.classList.remove("open");
    const mapTitle = {
      home: ["Início", "Resumo do sistema"],
      alunos: ["Alunos", "Cadastros e fichas"],
      equipe: ["Equipe", "Professores e auxiliares"],
      mural: ["Mural", "Avisos, curtidas e comentários"],
      aulas: ["Aulas", "Nova aula, aula ativa e checkout"],
      historico: ["Histórico", "Relatórios de presença por aula"],
      config: ["Configurações", "Tema e informações"],
    };
    const [t, s] = mapTitle[this.page] || ["IEQ Central", ""];
    if (this.els.pageTitle) this.els.pageTitle.innerText = t;
    if (this.els.pageSub) this.els.pageSub.innerText = s;
    await this.loadPage(this.page);
  },

  async loadPage(page) {
    if (!this.me) return;
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

  /* ---------------- HOME ---------------- */
  async loadStats() {
    try {
      const data = await apiFetch("/estatisticas");
      const totalAlunos = data.total_alunos ?? 0;
      const totalEquipe = data.total_equipe ?? 0;
      const totalAvisos = data.total_avisos ?? 0;
      if (this.els.statAlunos) this.els.statAlunos.innerText = String(totalAlunos);
      if (this.els.statEquipe) this.els.statEquipe.innerText = String(totalEquipe);
      if (this.els.statAvisos) this.els.statAvisos.innerText = String(totalAvisos);
    } catch (e) {
      console.warn(e);
      if (this.els.statAlunos) this.els.statAlunos.innerText = "0";
      if (this.els.statEquipe) this.els.statEquipe.innerText = "0";
      if (this.els.statAvisos) this.els.statAvisos.innerText = "0";
      if (e.status === 401) await this.logout();
    }
  },

  async loadHomePinned() {
    if (!this.els.homePinned) return;
    this.els.homePinned.innerHTML = `<div class="hint">Carregando avisos fixados...</div>`;
    try {
      const avisos = await apiFetch("/avisos");
      this.lastAvisos = Array.isArray(avisos) ? avisos : [];
      const pinned = this.lastAvisos.filter(a => !!a.fixado).slice(0, 6);
      this.lastPinned = pinned;
      if (this.els.statAvisos) this.els.statAvisos.innerText = String(this.lastAvisos.length);
      if (!pinned.length) {
        this.els.homePinned.innerHTML = `<div class="hint">Nenhum aviso fixado ainda.</div>`;
        return;
      }
      this.els.homePinned.innerHTML = pinned.map(a => `
        <div class="item">
          <div class="item-left">
            <div class="avatar" style="width:42px;height:42px;border-radius:14px;">
              <i class="fa-solid fa-thumbtack"></i>
            </div>
            <div>
              <div class="item-title">${esc((a.mensagem || "").slice(0, 60) || "Aviso")}</div>
              <div class="item-sub">
                ${esc(a.autor || "Equipe")} • ${esc(fmtDate(a.data_criacao))}
              </div>
            </div>
          </div>
          <div class="item-actions">
            <span class="tag"><i class="fa-solid fa-heart"></i> ${a.like_count ?? 0}</span>
            <span class="tag"><i class="fa-solid fa-comment"></i> ${a.comment_count ?? 0}</span>
            <button class="btn btn-outline" data-open-aviso="${a.id}">
              Ver
            </button>
          </div>
        </div>
      `).join("");
      $$(`[data-open-aviso]`, this.els.homePinned).forEach(btn => {
        btn.addEventListener("click", () => {
          const id = Number(btn.getAttribute("data-open-aviso"));
          const aviso = this.lastAvisos.find(x => x.id === id);
          if (aviso) this.modalAvisoDetalhe(aviso);
        });
      });
    } catch (e) {
      console.error(e);
      this.els.homePinned.innerHTML = `<div class="hint">Falha ao carregar avisos fixados.</div>`;
      if (e.status === 401) await this.logout();
    }
  },

  /* ---------------- AULAS (100% FUNCIONAL) ---------------- */
  async loadAulas() {
    const root = document.getElementById("page-aulas");
    if (!root) return;

    root.innerHTML = `
      <div class="grid2">
        <div class="card">
          <div class="card-title">🚀 Nova Aula</div>
          <div class="hint">Escolha a equipe e o tema, depois inicie.</div>
          <div class="form">
            <label>Professor(a) *</label>
            <select id="aula-prof" class="form-select">
              <option value="">Carregando professores...</option>
            </select>
            <label>Auxiliar</label>
            <select id="aula-aux" class="form-select">
              <option value="Nenhum">Nenhum</option>
            </select>
            <label>Tema *</label>
            <input id="aula-tema" type="text" placeholder="Ex: A Arca de Noé" class="form-input">
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
          <select id="entrada-aluno" class="form-select" style="flex:1;">
            <option value="">Carregando alunos...</option>
          </select>
          <button id="btn-entrada" class="btn btn-success">Dar entrada</button>
        </div>
        <div id="lista-presentes" class="list" style="margin-top:12px;"></div>
      </div>
    `;

    try {
      const [equipe, alunos] = await Promise.all([
        apiFetch("/usuarios").catch(() => []),
        apiFetch("/alunos").catch(() => [])
      ]);

      const usuarios = Array.isArray(equipe) ? equipe : [];
      const alunosList = Array.isArray(alunos) ? alunos : [];

      const selProf = $("#aula-prof");
      const selAux = $("#aula-aux");
      const selEntrada = $("#entrada-aluno");

      if (selProf) {
        if (usuarios.length === 0) {
          selProf.innerHTML = '<option value="">Nenhum professor cadastrado</option>';
        } else {
          selProf.innerHTML = usuarios.map(u => 
            `<option value="${esc(u.nome)}">${esc(u.nome)}</option>`
          ).join('');
        }
      }

      if (selAux) {
        let auxOptions = '<option value="Nenhum">Nenhum</option>';
        if (usuarios.length > 0) {
          auxOptions += usuarios.map(u => 
            `<option value="${esc(u.nome)}">${esc(u.nome)}</option>`
          ).join('');
        }
        selAux.innerHTML = auxOptions;
      }

      if (selEntrada) {
        if (alunosList.length === 0) {
          selEntrada.innerHTML = '<option value="">Nenhum aluno cadastrado</option>';
        } else {
          selEntrada.innerHTML = alunosList.map(a => 
            `<option value="${a.id}">${esc(a.nome)}</option>`
          ).join('');
        }
      }

      $("#btn-iniciar-aula")?.addEventListener("click", async () => {
        const tema = ($("#aula-tema")?.value || "").trim();
        const professor = selProf?.value || "";
        const auxiliar = selAux?.value || "Nenhum";
        if (!tema) return toast("Digite o tema da aula.", "warn");
        if (!professor) return toast("Selecione um professor.", "warn");
        try {
          await apiFetch("/aulas/iniciar", {
            method: "POST",
            body: JSON.stringify({ tema, professor, auxiliar })
          });
          toast("Aula iniciada ✅", "ok");
          await this.refreshAulaAtivaUI();
          $("#aula-tema").value = "";
        } catch (e) {
          toast(e.message || "Falha ao iniciar aula", "err");
        }
      });

      $("#btn-entrada")?.addEventListener("click", async () => {
        const aluno_id = Number(selEntrada?.value || 0);
        if (!aluno_id) return toast("Selecione um aluno.", "warn");
        try {
          await apiFetch("/aulas/entrada", { 
            method: "POST", 
            body: JSON.stringify({ aluno_id }) 
          });
          toast("Entrada registrada ✅", "ok");
          await this.refreshAulaAtivaUI();
        } catch (e) {
          toast(e.message || "Falha ao dar entrada", "err");
        }
      });

      $("#btn-encerrar-aula")?.addEventListener("click", async () => {
        if (!confirm("Encerrar aula e salvar tudo?")) return;
        try {
          await apiFetch("/aulas/encerrar", { 
            method: "POST", 
            body: JSON.stringify({}) 
          });
          toast("Aula encerrada ✅", "ok");
          await this.refreshAulaAtivaUI();
        } catch (e) {
          toast(e.message || "Falha ao encerrar", "err");
        }
      });

      await this.refreshAulaAtivaUI();
    } catch (error) {
      console.error("Erro ao carregar página de aulas:", error);
      toast("Erro ao carregar dados", "err");
    }
  },

  async refreshAulaAtivaUI() {
    const box = $("#aula-ativa-box");
    const list = $("#lista-presentes");
    const btnEncerrar = $("#btn-encerrar-aula");

    try {
      const data = await apiFetch("/aulas/ativa");
      const aula = data?.aula;

      if (!aula) {
        if (box) box.innerHTML = `<div class="hint">Nenhuma aula ativa no momento.</div>`;
        if (list) list.innerHTML = `<div class="hint">Inicie uma aula para registrar presença.</div>`;
        if (btnEncerrar) btnEncerrar.style.display = "none";
        return;
      }

      if (box) {
        box.innerHTML = `
          <div class="mini-grid">
            <div><b>Tema:</b> ${esc(aula.tema || "-")}</div>
            <div><b>Equipe:</b> ${esc(aula.professores || "-")}</div>
            <div><b>Início:</b> ${fmtDate(aula.data_aula)}</div>
          </div>
        `;
      }
      if (btnEncerrar) btnEncerrar.style.display = "";

      const pres = await apiFetch(`/aulas/presentes?aula_id=${encodeURIComponent(aula.id)}`);
      const presentes = pres?.presentes || [];

      if (list) {
        if (!presentes.length) {
          list.innerHTML = `<div class="hint">Ainda ninguém deu entrada.</div>`;
        } else {
          list.innerHTML = presentes.map(p => {
            const saiu = !!p.horario_saida;
            const entradaTime = formatTimeBR(p.horario_entrada);
            const saidaTime = formatTimeBR(p.horario_saida);
            const right = saiu
              ? `<span class="tag">Saiu ${saidaTime} (${esc(p.retirado_por || "-")})</span>`
              : `<button class="btn btn-warn btn-sm" data-checkout="${p.frequencia_id}" data-aluno="${p.aluno_id}">Checkout</button>`;
            return `
              <div class="item">
                <div class="item-left">
                  <div class="item-title">${esc(p.nome)}</div>
                  <div class="item-sub">Entrada: ${entradaTime}</div>
                </div>
                <div class="item-actions">${right}</div>
              </div>
            `;
          }).join("");

          $$("[data-checkout]", list).forEach(btn => {
            btn.addEventListener("click", async () => {
              const fid = Number(btn.getAttribute("data-checkout"));
              const alunoId = Number(btn.getAttribute("data-aluno"));
              await this.openCheckoutModal(fid, alunoId);
            });
          });
        }
      }
    } catch (e) {
      console.error("Erro em refreshAulaAtivaUI:", e);
      if (box) box.innerHTML = `<div class="hint">Falha ao carregar aula ativa.</div>`;
      if (list) list.innerHTML = `<div class="hint">Erro ao carregar presenças.</div>`;
      if (btnEncerrar) btnEncerrar.style.display = "none";
    }
  },

  async openCheckoutModal(frequenciaId, alunoId) {
    try {
      let aluno = null;
      try {
        const response = await fetch(`${API}/alunos/${alunoId}`, {
          headers: Auth.headers()
        });
        if (response.ok) {
          aluno = await response.json();
        }
      } catch (e) {
        const alunos = await apiFetch("/alunos").catch(() => []);
        aluno = Array.isArray(alunos) ? alunos.find(a => a.id === alunoId) : null;
      }

      const auths = [];
      if (aluno?.responsavel?.trim()) auths.push(aluno.responsavel.trim());
      if (aluno?.autorizado_retirar?.trim()) auths.push(aluno.autorizado_retirar.trim());
      if (aluno?.autorizado_2?.trim()) auths.push(aluno.autorizado_2.trim());
      if (aluno?.autorizado_3?.trim()) auths.push(aluno.autorizado_3.trim());
      
      const uniq = [...new Set(auths)];
      if (uniq.length === 0) uniq.push("Responsável (não cadastrado)");

      Modal.open({
        title: "Checkout de Segurança",
        bodyHTML: `
          <div class="form">
            <label>Quem está buscando ${aluno?.nome ? esc(aluno.nome) : 'o aluno'}?</label>
            <select id="checkout-who" class="form-select" required>
              <option value="">Selecione...</option>
              ${uniq.map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join("")}
            </select>
            <div class="hint" style="margin-top:8px;">
              <i class="fa-solid fa-info-circle"></i> 
              Isso registra horário de saída e o nome de quem retirou.
            </div>
          </div>
        `,
        footerHTML: `
          <button class="btn btn-outline" data-modal-close>Cancelar</button>
          <button class="btn btn-success" id="btn-confirm-checkout">Confirmar saída</button>
        `
      });

      $("#btn-confirm-checkout")?.addEventListener("click", async () => {
        const select = $("#checkout-who");
        const retirado_por = select?.value?.trim();
        if (!retirado_por || retirado_por === "") {
          select.style.borderColor = "var(--danger)";
          return toast("Selecione quem está buscando", "warn");
        }
        try {
          await apiFetch("/aulas/saida", {
            method: "POST",
            body: JSON.stringify({ frequencia_id: frequenciaId, retirado_por })
          });
          toast("Saída registrada ✅", "ok");
          Modal.close();
          await this.refreshAulaAtivaUI();
        } catch (e) {
          toast(e.message || "Falha no checkout", "err");
        }
      });
    } catch (e) {
      console.error("Erro ao abrir checkout:", e);
      toast("Falha ao abrir checkout", "err");
    }
  },

  /* ---------------- HISTÓRICO ---------------- */
  async loadHistorico() {
    const root = document.getElementById("page-historico");
    if (!root) return;
    root.innerHTML = `
      <div class="card">
        <div class="between-row">
          <div>
            <div class="card-title">📜 Histórico de Aulas</div>
            <div class="hint">Clique em uma aula para ver detalhes e presença.</div>
          </div>
          <button id="btn-recarregar-hist" class="btn btn-primary">Recarregar</button>
        </div>
        <div id="hist-list" class="list" style="margin-top:12px;"></div>
      </div>
    `;
    $("#btn-recarregar-hist")?.addEventListener("click", () => this.refreshHistoricoList());
    await this.refreshHistoricoList();
  },

  async refreshHistoricoList() {
    const list = $("#hist-list");
    if (!list) return;
    list.innerHTML = `<div class="hint">Carregando...</div>`;
    try {
      const data = await apiFetch("/historico");
      const rows = data?.historico || [];
      if (!rows.length) {
        list.innerHTML = `<div class="hint">Nenhuma aula encerrada ainda.</div>`;
        return;
      }
      list.innerHTML = rows.map(r => {
        const dt = r.data_aula ? new Date(r.data_aula).toLocaleDateString("pt-BR") : "-";
        return `
          <div class="item clickable" data-hist="${r.id}">
            <div class="item-left">
              <div class="item-title">${esc(dt)} | ${esc(r.tema || "Sem tema")}</div>
              <div class="item-sub">${esc(r.professores || "-")}</div>
            </div>
            <div class="item-actions">
              <span class="tag">${esc(r.total_criancas || 0)} crianças</span>
            </div>
          </div>
        `;
      }).join("");
      $$("[data-hist]", list).forEach(el => {
        el.addEventListener("click", async () => {
          const id = Number(el.getAttribute("data-hist"));
          await this.openHistoricoDetalhe(id);
        });
      });
    } catch (e) {
      list.innerHTML = `<div class="hint">${esc(e.message || "Erro")}</div>`;
    }
  },

  async openHistoricoDetalhe(aulaId) {
    try {
      const data = await apiFetch(`/historico/${aulaId}`);
      const aula = data?.aula;
      const pres = data?.presencas || [];
      Modal.open({
        title: `Detalhes da Aula`,
        bodyHTML: `
          <div class="card mini" style="background:#f8fafc;">
            <div><b>Tema:</b> ${esc(aula?.tema || "-")}</div>
            <div><b>Equipe:</b> ${esc(aula?.professores || "-")}</div>
            <div><b>Data:</b> ${aula?.data_aula ? esc(new Date(aula.data_aula).toLocaleString("pt-BR")) : "-"}</div>
          </div>
          <div class="hint" style="margin-top:12px;">Presenças</div>
          <div class="list" style="margin-top:8px;">
            ${pres.length ? pres.map(p => {
              const ent = p.horario_entrada ? formatTimeBR(p.horario_entrada) : "-";
              const sai = p.horario_saida ? formatTimeBR(p.horario_saida) : "";
              const txtSaida = p.horario_saida ? `Saiu: ${esc(sai)} (${esc(p.retirado_por || "-")})` : "Não saiu";
              return `
                <div class="item">
                  <div class="item-left">
                    <div class="item-title">${esc(p.nome)}</div>
                    <div class="item-sub">Ent: ${esc(ent)} | ${txtSaida}</div>
                  </div>
                </div>
              `;
            }).join("") : `<div class="hint">Sem registros de presença.</div>`}
          </div>
        `,
        footerHTML: `<button class="btn btn-primary" data-modal-close>Fechar</button>`
      });
    } catch (e) {
      toast(e.message || "Falha ao abrir detalhes", "err");
    }
  },

  /* ---------------- ALUNOS ---------------- */
  async loadAlunos() {
    if (!this.els.listAlunos) return;
    const q = (this.els.qAlunos?.value || "").trim();
    this.els.listAlunos.innerHTML = `<div class="hint">Carregando alunos...</div>`;
    try {
      const alunos = await apiFetch(`/alunos${q ? `?q=${encodeURIComponent(q)}` : ""}`);
      const arr = Array.isArray(alunos) ? alunos : [];
      if (!arr.length) {
        this.els.listAlunos.innerHTML = `<div class="hint">Nenhum aluno encontrado.</div>`;
        return;
      }
      this.els.listAlunos.innerHTML = arr.map(a => `
        <div class="item">
          <div class="item-left">
            <div class="avatar">
              ${a.foto ? b64ImgTag(a.foto, a.nome) : `<i class="fa-solid fa-child"></i>`}
            </div>
            <div>
              <div class="item-title">${esc(a.nome)}</div>
              <div class="item-sub">
                Resp: ${esc(a.responsavel || "-")} • Tel: ${esc(a.telefone || "-")}
              </div>
            </div>
          </div>
          <div class="item-actions">
            <button class="btn btn-outline" data-view-aluno="${a.id}">
              <i class="fa-solid fa-id-card"></i> Ver
            </button>
            <button class="btn btn-outline" data-edit-aluno="${a.id}">
              <i class="fa-solid fa-pen"></i> Editar
            </button>
            <button class="btn btn-danger" data-del-aluno="${a.id}">
              <i class="fa-solid fa-trash"></i> Excluir
            </button>
          </div>
        </div>
      `).join("");
      $$(`[data-view-aluno]`, this.els.listAlunos).forEach(b => {
        b.addEventListener("click", () => {
          const id = Number(b.getAttribute("data-view-aluno"));
          const aluno = arr.find(x => x.id === id);
          if (aluno) this.modalAlunoView(aluno);
        });
      });
      $$(`[data-edit-aluno]`, this.els.listAlunos).forEach(b => {
        b.addEventListener("click", () => {
          const id = Number(b.getAttribute("data-edit-aluno"));
          const aluno = arr.find(x => x.id === id);
          this.modalAluno(aluno || null);
        });
      });
      $$(`[data-del-aluno]`, this.els.listAlunos).forEach(b => {
        b.addEventListener("click", async () => {
          const id = Number(b.getAttribute("data-del-aluno"));
          if (!confirm("Excluir este aluno?")) return;
          await this.delAluno(id);
        });
      });
    } catch (e) {
      console.error(e);
      this.els.listAlunos.innerHTML = `<div class="hint">Erro ao carregar alunos.</div>`;
      if (e.status === 401) await this.logout();
    }
  },

  modalAlunoView(a) {
    Modal.open({
      title: "Ficha do aluno",
      bodyHTML: `
        <div class="preview" style="margin-bottom:12px;">
          <div class="avatar">${a.foto ? b64ImgTag(a.foto, a.nome) : `<i class="fa-solid fa-child"></i>`}</div>
          <div>
            <div style="font-weight:900;font-size:16px">${esc(a.nome)}</div>
            <div class="small">Nascimento: ${esc(a.data_nascimento || "-")}</div>
          </div>
        </div>
        <div class="grid2">
          <div class="card" style="box-shadow:none;margin:0">
            <div class="card-title">Responsável</div>
            <div class="small"><b>Nome:</b> ${esc(a.responsavel || "-")}</div>
            <div class="small"><b>Telefone:</b> ${esc(a.telefone || "-")}</div>
          </div>
          <div class="card" style="box-shadow:none;margin:0">
            <div class="card-title">Autorizados a retirar</div>
            <div class="small">1) ${esc(a.autorizado_retirar || "-")}</div>
            <div class="small">2) ${esc(a.autorizado_2 || "-")}</div>
            <div class="small">3) ${esc(a.autorizado_3 || "-")}</div>
          </div>
        </div>
        <div class="card" style="box-shadow:none;margin-top:12px">
          <div class="card-title">Observações</div>
          <div class="small">${esc(a.observacoes || "-")}</div>
        </div>
      `,
      footerHTML: `
        <button class="btn btn-outline" id="btn-close">Fechar</button>
        <button class="btn btn-primary" id="btn-edit">Editar</button>
      `
    });
    $("#btn-close")?.addEventListener("click", () => Modal.close());
    $("#btn-edit")?.addEventListener("click", () => this.modalAluno(a));
  },

  modalAluno(a = null) {
    const isEdit = !!a?.id;
    Modal.open({
      title: isEdit ? "Editar aluno" : "Novo aluno",
      bodyHTML: `
        <div class="grid2">
          <div class="field">
            <label>Nome *</label>
            <input id="al-nome" value="${esc(a?.nome || "")}" placeholder="Nome completo" class="form-input">
          </div>
          <div class="field">
            <label>Nascimento</label>
            <input id="al-nasc" value="${esc(a?.data_nascimento || "")}" placeholder="dd/mm/aaaa" class="form-input">
          </div>
        </div>
        <div class="grid2" style="margin-top:10px">
          <div class="field">
            <label>Responsável</label>
            <input id="al-resp" value="${esc(a?.responsavel || "")}" placeholder="Nome do responsável" class="form-input">
          </div>
          <div class="field">
            <label>Telefone</label>
            <input id="al-tel" value="${esc(a?.telefone || "")}" placeholder="(xx) xxxxx-xxxx" class="form-input">
          </div>
        </div>
        <div class="grid3" style="margin-top:10px">
          <div class="field">
            <label>Autorizado 1</label>
            <input id="al-aut1" value="${esc(a?.autorizado_retirar || "")}" placeholder="Nome autorizado" class="form-input">
          </div>
          <div class="field">
            <label>Autorizado 2</label>
            <input id="al-aut2" value="${esc(a?.autorizado_2 || "")}" placeholder="Nome autorizado" class="form-input">
          </div>
          <div class="field">
            <label>Autorizado 3</label>
            <input id="al-aut3" value="${esc(a?.autorizado_3 || "")}" placeholder="Nome autorizado" class="form-input">
          </div>
        </div>
        <div class="field" style="margin-top:10px">
          <label>Observações (alergias, cuidados)</label>
          <textarea id="al-obs" class="form-input" placeholder="Ex: Alergia a amendoim...">${esc(a?.observacoes || "")}</textarea>
        </div>
        <div class="field" style="margin-top:10px">
          <label>Foto do aluno</label>
          <input id="al-foto" type="file" accept="image/*" class="form-input">
          <div class="preview" style="margin-top:10px">
            <div class="avatar" id="al-prev">
              ${a?.foto ? b64ImgTag(a.foto, a.nome) : `<i class="fa-solid fa-camera"></i>`}
            </div>
            <div>
              <div style="font-weight:900">Prévia</div>
              <div class="small">A foto aparece na lista e na ficha.</div>
            </div>
          </div>
        </div>
      `,
      footerHTML: `
        <button class="btn btn-outline" id="al-cancel">Cancelar</button>
        <button class="btn btn-success" id="al-save">${isEdit ? "Salvar" : "Cadastrar"}</button>
      `
    });
    $("#al-cancel")?.addEventListener("click", () => Modal.close());
    const fotoInput = $("#al-foto");
    fotoInput?.addEventListener("change", async () => {
      const f = fotoInput.files?.[0];
      const b64 = await fileToBase64(f).catch(() => "");
      fotoInput.dataset.b64 = b64;
      const prev = $("#al-prev");
      if (prev) prev.innerHTML = b64 ? b64ImgTag(b64, "foto") : `<i class="fa-solid fa-camera"></i>`;
    });
    $("#al-save")?.addEventListener("click", async () => {
      const nome = ($("#al-nome")?.value || "").trim();
      if (!nome) return toast("Nome é obrigatório", "err");
      const payload = {
        nome,
        data_nascimento: ($("#al-nasc")?.value || "").trim(),
        responsavel: ($("#al-resp")?.value || "").trim(),
        telefone: ($("#al-tel")?.value || "").trim(),
        observacoes: ($("#al-obs")?.value || "").trim(),
        autorizado_retirar: ($("#al-aut1")?.value || "").trim(),
        autorizado_2: ($("#al-aut2")?.value || "").trim(),
        autorizado_3: ($("#al-aut3")?.value || "").trim(),
        foto: (fotoInput?.dataset?.b64 || a?.foto || "").trim(),
      };
      try {
        if (isEdit) {
          await apiFetch(`/alunos/${a.id}`, { method: "PUT", body: JSON.stringify(payload) });
          toast("Aluno atualizado", "ok");
        } else {
          await apiFetch("/alunos", { method: "POST", body: JSON.stringify(payload) });
          toast("Aluno cadastrado", "ok");
        }
        Modal.close();
        await this.loadAlunos();
        await this.loadStats();
      } catch (e) {
        console.error(e);
        toast("Erro ao salvar aluno", "err");
        if (e.status === 401) await this.logout();
      }
    });
  },

  async delAluno(id) {
    try {
      await apiFetch(`/alunos/${id}`, { method: "DELETE" });
      toast("Aluno excluído", "ok");
      await this.loadAlunos();
      await this.loadStats();
    } catch (e) {
      console.error(e);
      toast("Erro ao excluir aluno", "err");
      if (e.status === 401) await this.logout();
    }
  },

  /* ---------------- EQUIPE ---------------- */
  async loadEquipe() {
    if (!this.els.listUsers) return;
    const q = (this.els.qUsers?.value || "").trim();
    this.els.listUsers.innerHTML = `<div class="hint">Carregando equipe...</div>`;
    try {
      const users = await apiFetch(`/usuarios${q ? `?q=${encodeURIComponent(q)}` : ""}`);
      const arr = Array.isArray(users) ? users : [];
      const admin = isAdmin(this.me);
      if (this.els.equipeHint) {
        this.els.equipeHint.innerText = admin
          ? "Como admin, você pode cadastrar/editar/excluir membros."
          : "Somente administradores podem cadastrar/editar/excluir membros.";
      }
      if (!arr.length) {
        this.els.listUsers.innerHTML = `<div class="hint">Nenhum membro encontrado.</div>`;
        return;
      }
      this.els.listUsers.innerHTML = arr.map(u => `
        <div class="item">
          <div class="item-left">
            <div class="avatar">
              ${u.foto ? b64ImgTag(u.foto, u.nome) : `<i class="fa-solid fa-user"></i>`}
            </div>
            <div>
              <div class="item-title">${esc(u.nome)} <span class="tag">${esc(u.role || "membro")}</span></div>
              <div class="item-sub">${esc(u.usuario || "-")} • ${esc(u.telefone || "-")} • ${esc(u.email || "-")}</div>
            </div>
          </div>
          <div class="item-actions">
            ${admin ? `
              <button class="btn btn-outline" data-edit-user="${u.id}">
                <i class="fa-solid fa-pen"></i> Editar
              </button>
              <button class="btn btn-danger" data-del-user="${u.id}">
                <i class="fa-solid fa-trash"></i> Excluir
              </button>
            ` : `<span class="tag">Somente visualização</span>`}
          </div>
        </div>
      `).join("");
      if (admin) {
        $$(`[data-edit-user]`, this.els.listUsers).forEach(b => {
          b.addEventListener("click", () => {
            const id = Number(b.getAttribute("data-edit-user"));
            const user = arr.find(x => x.id === id);
            this.modalUser(user || null);
          });
        });
        $$(`[data-del-user]`, this.els.listUsers).forEach(b => {
          b.addEventListener("click", async () => {
            const id = Number(b.getAttribute("data-del-user"));
            if (id === this.me?.usuario?.id) return toast("Você não pode excluir seu próprio usuário", "err");
            if (!confirm("Excluir este membro?")) return;
            await this.delUser(id);
          });
        });
      }
    } catch (e) {
      console.error(e);
      this.els.listUsers.innerHTML = `<div class="hint">Erro ao carregar equipe.</div>`;
      if (e.status === 401) await this.logout();
    }
  },

  modalUser(u = null) {
    const admin = isAdmin(this.me);
    if (!admin) return toast("Apenas admin", "err");
    const isEdit = !!u?.id;
    Modal.open({
      title: isEdit ? "Editar membro" : "Novo membro",
      bodyHTML: `
        <div class="grid2">
          <div class="field">
            <label>Nome *</label>
            <input id="us-nome" value="${esc(u?.nome || "")}" placeholder="Nome completo" class="form-input">
          </div>
          <div class="field">
            <label>Usuário (login) *</label>
            <input id="us-user" value="${esc(u?.usuario || "")}" placeholder="ex: joao" class="form-input">
          </div>
        </div>
        <div class="grid2" style="margin-top:10px">
          <div class="field">
            <label>Função</label>
            <select id="us-role" class="form-select">
              <option value="membro">membro</option>
              <option value="professor">professor</option>
              <option value="auxiliar">auxiliar</option>
              <option value="admin">admin</option>
            </select>
          </div>
          <div class="field">
            <label>Senha ${isEdit ? "(deixe vazio para manter)" : "*"}</label>
            <input id="us-pass" type="password" placeholder="${isEdit ? "•••••• (não altera)" : "Defina uma senha"}" class="form-input">
          </div>
        </div>
        <div class="grid2" style="margin-top:10px">
          <div class="field">
            <label>Telefone</label>
            <input id="us-tel" value="${esc(u?.telefone || "")}" placeholder="(xx) xxxxx-xxxx" class="form-input">
          </div>
          <div class="field">
            <label>Email</label>
            <input id="us-email" value="${esc(u?.email || "")}" placeholder="email@exemplo.com" class="form-input">
          </div>
        </div>
        <div class="field" style="margin-top:10px">
          <label>Foto</label>
          <input id="us-foto" type="file" accept="image/*" class="form-input">
          <div class="preview" style="margin-top:10px">
            <div class="avatar" id="us-prev">
              ${u?.foto ? b64ImgTag(u.foto, u.nome) : `<i class="fa-solid fa-camera"></i>`}
            </div>
            <div>
              <div style="font-weight:900">Prévia</div>
              <div class="small">A foto aparece na lista e no perfil.</div>
            </div>
          </div>
        </div>
      `,
      footerHTML: `
        <button class="btn btn-outline" id="us-cancel">Cancelar</button>
        <button class="btn btn-success" id="us-save">${isEdit ? "Salvar" : "Cadastrar"}</button>
      `
    });
    $("#us-role").value = (u?.role || "membro");
    $("#us-cancel")?.addEventListener("click", () => Modal.close());
    const fotoInput = $("#us-foto");
    fotoInput?.addEventListener("change", async () => {
      const f = fotoInput.files?.[0];
      const b64 = await fileToBase64(f).catch(() => "");
      fotoInput.dataset.b64 = b64;
      const prev = $("#us-prev");
      if (prev) prev.innerHTML = b64 ? b64ImgTag(b64, "foto") : `<i class="fa-solid fa-camera"></i>`;
    });
    $("#us-save")?.addEventListener("click", async () => {
      const nome = ($("#us-nome")?.value || "").trim();
      const usuario = ($("#us-user")?.value || "").trim();
      const role = ($("#us-role")?.value || "membro").trim();
      const senha = ($("#us-pass")?.value || "").trim();
      if (!nome || !usuario) return toast("Nome e usuário são obrigatórios", "err");
      if (!isEdit && !senha) return toast("Senha é obrigatória", "err");
      const payload = {
        nome,
        usuario,
        role,
        senha: senha || "",
        telefone: ($("#us-tel")?.value || "").trim(),
        email: ($("#us-email")?.value || "").trim(),
        foto: (fotoInput?.dataset?.b64 || u?.foto || "").trim(),
      };
      try {
        if (isEdit) {
          await apiFetch(`/usuarios/${u.id}`, { method: "PUT", body: JSON.stringify(payload) });
          toast("Membro atualizado", "ok");
        } else {
          await apiFetch("/usuarios", { method: "POST", body: JSON.stringify(payload) });
          toast("Membro cadastrado", "ok");
        }
        Modal.close();
        await this.loadEquipe();
        await this.loadStats();
      } catch (e) {
        console.error(e);
        toast("Erro ao salvar membro", "err");
        if (e.status === 401) await this.logout();
      }
    });
  },

  async delUser(id) {
    try {
      await apiFetch(`/usuarios/${id}`, { method: "DELETE" });
      toast("Membro excluído", "ok");
      await this.loadEquipe();
      await this.loadStats();
    } catch (e) {
      console.error(e);
      toast("Erro ao excluir membro", "err");
      if (e.status === 401) await this.logout();
    }
  },

  /* ---------------- MURAL ---------------- */
  async loadAvisos() {
    if (!this.els.listAvisos) return;
    this.els.listAvisos.innerHTML = `<div class="hint">Carregando avisos...</div>`;
    try {
      const avisos = await apiFetch("/avisos");
      this.lastAvisos = Array.isArray(avisos) ? avisos : [];
      if (this.els.statAvisos) this.els.statAvisos.innerText = String(this.lastAvisos.length);
      if (!this.lastAvisos.length) {
        this.els.listAvisos.innerHTML = `<div class="hint">Nenhum aviso ainda.</div>`;
        return;
      }
      const admin = isAdmin(this.me);
      this.els.listAvisos.innerHTML = this.lastAvisos.map(a => `
        <div class="card aviso">
          <div class="card-head">
            <div>
              <div class="card-title">
                ${a.fixado ? `<i class="fa-solid fa-thumbtack"></i> ` : ""}
                ${esc(a.autor || "Equipe")}
              </div>
              <div class="card-sub">${esc(fmtDate(a.data_criacao))}</div>
            </div>
            <div class="item-actions">
              ${admin ? `
                <button class="btn btn-outline" data-fixar="${a.id}">
                  <i class="fa-solid fa-thumbtack"></i> ${a.fixado ? "Desfixar" : "Fixar"}
                </button>
                <button class="btn btn-danger" data-del-aviso="${a.id}">
                  <i class="fa-solid fa-trash"></i> Excluir
                </button>
              ` : ""}
            </div>
          </div>
          ${a.mensagem ? `<div style="margin:8px 0 10px;color:var(--text);font-weight:600">${esc(a.mensagem)}</div>` : ""}
          ${a.imagem ? `
            <div class="aviso-img">
              <img src="data:image/*;base64,${a.imagem}" alt="imagem do aviso">
            </div>
          ` : ""}
          <div class="aviso-actions">
            <button class="btn btn-outline" data-like="${a.id}">
              <i class="fa-solid fa-heart"></i> ${a.like_count ?? 0}
            </button>
            <button class="btn btn-outline" data-coments="${a.id}">
              <i class="fa-solid fa-comment"></i> ${a.comment_count ?? 0}
            </button>
            <button class="btn btn-primary" data-open="${a.id}">
              <i class="fa-solid fa-arrow-right"></i> Abrir
            </button>
          </div>
        </div>
      `).join("");
      $$(`[data-fixar]`, this.els.listAvisos).forEach(b => {
        b.addEventListener("click", async () => {
          const id = Number(b.getAttribute("data-fixar"));
          await this.toggleFixar(id);
        });
      });
      $$(`[data-del-aviso]`, this.els.listAvisos).forEach(b => {
        b.addEventListener("click", async () => {
          const id = Number(b.getAttribute("data-del-aviso"));
          if (!confirm("Excluir este aviso?")) return;
          await this.delAviso(id);
        });
      });
      $$(`[data-like]`, this.els.listAvisos).forEach(b => {
        b.addEventListener("click", async () => {
          const id = Number(b.getAttribute("data-like"));
          await this.toggleLike(id);
        });
      });
      $$(`[data-open]`, this.els.listAvisos).forEach(b => {
        b.addEventListener("click", () => {
          const id = Number(b.getAttribute("data-open"));
          const aviso = this.lastAvisos.find(x => x.id === id);
          if (aviso) this.modalAvisoDetalhe(aviso);
        });
      });
      $$(`[data-coments]`, this.els.listAvisos).forEach(b => {
        b.addEventListener("click", () => {
          const id = Number(b.getAttribute("data-coments"));
          const aviso = this.lastAvisos.find(x => x.id === id);
          if (aviso) this.modalAvisoDetalhe(aviso);
        });
      });
    } catch (e) {
      console.error(e);
      this.els.listAvisos.innerHTML = `<div class="hint">Erro ao carregar avisos.</div>`;
      if (e.status === 401) await this.logout();
    }
  },

  modalAviso() {
    Modal.open({
      title: "Novo aviso",
      bodyHTML: `
        <div class="field">
          <label>Mensagem</label>
          <textarea id="av-msg" class="form-input" placeholder="Escreva o aviso..."></textarea>
        </div>
        <div class="field" style="margin-top:10px">
          <label>Imagem (opcional)</label>
          <input id="av-img" type="file" accept="image/*" class="form-input">
          <div class="preview" style="margin-top:10px">
            <div class="avatar" id="av-prev" style="width:56px;height:56px;border-radius:14px">
              <i class="fa-solid fa-image"></i>
            </div>
            <div>
              <div style="font-weight:900">Prévia</div>
              <div class="small">A imagem aparece no mural.</div>
            </div>
          </div>
        </div>
      `,
      footerHTML: `
        <button class="btn btn-outline" id="av-cancel">Cancelar</button>
        <button class="btn btn-primary" id="av-publish">Publicar</button>
      `
    });
    $("#av-cancel")?.addEventListener("click", () => Modal.close());
    const imgInput = $("#av-img");
    imgInput?.addEventListener("change", async () => {
      const f = imgInput.files?.[0];
      const b64 = await fileToBase64(f).catch(() => "");
      imgInput.dataset.b64 = b64;
      const prev = $("#av-prev");
      if (prev) prev.innerHTML = b64 ? b64ImgTag(b64, "imagem") : `<i class="fa-solid fa-image"></i>`;
    });
    $("#av-publish")?.addEventListener("click", async () => {
      const mensagem = ($("#av-msg")?.value || "").trim();
      const imagem = (imgInput?.dataset?.b64 || "").trim();
      if (!mensagem && !imagem) return toast("Informe mensagem ou imagem", "err");
      try {
        await apiFetch("/avisos", {
          method: "POST",
          body: JSON.stringify({ mensagem, imagem })
        });
        toast("Aviso publicado", "ok");
        Modal.close();
        await this.loadAvisos();
        await this.loadHomePinned();
        await this.loadStats();
      } catch (e) {
        console.error(e);
        toast("Erro ao publicar aviso", "err");
        if (e.status === 401) await this.logout();
      }
    });
  },

  async toggleFixar(id) {
    try {
      await apiFetch(`/avisos/${id}/fixar`, { method: "POST" });
      toast("Atualizado", "ok");
      await this.loadAvisos();
      await this.loadHomePinned();
    } catch (e) {
      console.error(e);
      toast("Erro ao fixar", "err");
      if (e.status === 401) await this.logout();
    }
  },

  async delAviso(id) {
    try {
      await apiFetch(`/avisos/${id}`, { method: "DELETE" });
      toast("Aviso excluído", "ok");
      await this.loadAvisos();
      await this.loadHomePinned();
      await this.loadStats();
    } catch (e) {
      console.error(e);
      toast("Erro ao excluir aviso", "err");
      if (e.status === 401) await this.logout();
    }
  },

  async toggleLike(id) {
    try {
      await apiFetch(`/avisos/${id}/like`, { method: "POST" });
      await this.loadAvisos();
      await this.loadHomePinned();
    } catch (e) {
      console.error(e);
      toast("Erro no like", "err");
      if (e.status === 401) await this.logout();
    }
  },

  async modalAvisoDetalhe(aviso) {
    Modal.open({
      title: "Aviso",
      bodyHTML: `
        <div class="card" style="box-shadow:none;margin:0">
          <div class="card-title">${esc(aviso.autor || "Equipe")}</div>
          <div class="card-sub">${esc(fmtDate(aviso.data_criacao))}</div>
          ${aviso.mensagem ? `<div style="margin-top:10px;font-weight:650">${esc(aviso.mensagem)}</div>` : ""}
          ${aviso.imagem ? `
            <div class="aviso-img" style="margin-top:12px">
              <img src="data:image/*;base64,${aviso.imagem}" alt="imagem do aviso">
            </div>
          ` : ""}
          <div class="aviso-actions" style="margin-top:12px">
            <button class="btn btn-outline" id="det-like">
              <i class="fa-solid fa-heart"></i> ${aviso.like_count ?? 0}
            </button>
            <button class="btn btn-outline" id="det-refresh">
              <i class="fa-solid fa-rotate"></i> Atualizar
            </button>
          </div>
        </div>
        <div class="card" style="box-shadow:none;margin-top:12px">
          <div class="card-title">Comentários</div>
          <div id="det-comments" class="comments"></div>
          <div class="field" style="margin-top:10px">
            <label>Adicionar comentário</label>
            <input id="det-text" class="form-input" placeholder="Escreva um comentário...">
          </div>
        </div>
      `,
      footerHTML: `
        <button class="btn btn-outline" id="det-close">Fechar</button>
        <button class="btn btn-primary" id="det-send">
          <i class="fa-solid fa-paper-plane"></i> Enviar
        </button>
      `
    });

    const loadComments = async () => {
      const box = $("#det-comments");
      if (!box) return;
      box.innerHTML = `<div class="hint">Carregando comentários...</div>`;
      try {
        const rows = await apiFetch(`/avisos/${aviso.id}/comentarios`);
        const arr = Array.isArray(rows) ? rows : [];
        if (!arr.length) {
          box.innerHTML = `<div class="hint">Nenhum comentário ainda.</div>`;
          return;
        }
        const admin = isAdmin(this.me);
        const myId = this.me?.usuario?.id;
        box.innerHTML = arr.map(c => `
          <div class="comment">
            <div class="comment-head">
              <div class="comment-name">${esc(c.user_nome || "Usuário")}</div>
              <div class="comment-date">${esc(fmtDate(c.created_at))}</div>
            </div>
            <div class="comment-text">${esc(c.texto || "")}</div>
            <div class="comment-actions">
              ${(admin || c.user_id === myId) ? `
                <button class="btn btn-outline" data-del-com="${c.id}">
                  <i class="fa-solid fa-trash"></i> apagar
                </button>
              ` : ""}
            </div>
          </div>
        `).join("");
        $$(`[data-del-com]`, box).forEach(b => {
          b.addEventListener("click", async () => {
            const cid = Number(b.getAttribute("data-del-com"));
            if (!confirm("Excluir comentário?")) return;
            await this.delComentario(cid);
            await loadComments();
            await this.loadAvisos();
            await this.loadHomePinned();
          });
        });
      } catch (e) {
        console.error(e);
        box.innerHTML = `<div class="hint">Falha ao carregar comentários.</div>`;
      }
    };

    $("#det-close")?.addEventListener("click", () => Modal.close());
    $("#det-refresh")?.addEventListener("click", async () => {
      await this.loadAvisos();
      await this.loadHomePinned();
      await loadComments();
      toast("Atualizado", "ok");
    });
    $("#det-like")?.addEventListener("click", async () => {
      await this.toggleLike(aviso.id);
      const novo = this.lastAvisos.find(x => x.id === aviso.id) || aviso;
      this.modalAvisoDetalhe(novo);
    });
    $("#det-send")?.addEventListener("click", async () => {
      const txt = ($("#det-text")?.value || "").trim();
      if (!txt) return toast("Comentário vazio", "err");
      try {
        await apiFetch(`/avisos/${aviso.id}/comentarios`, {
          method: "POST",
          body: JSON.stringify({ texto: txt })
        });
        $("#det-text").value = "";
        toast("Comentado", "ok");
        await loadComments();
        await this.loadAvisos();
        await this.loadHomePinned();
      } catch (e) {
        console.error(e);
        toast("Erro ao comentar", "err");
      }
    });
    await loadComments();
  },

  async delComentario(cid) {
    try {
      await apiFetch(`/comentarios/${cid}`, { method: "DELETE" });
      toast("Comentário apagado", "ok");
    } catch (e) {
      console.error(e);
      toast("Erro ao apagar comentário", "err");
    }
  },

  /* ---------------- CONFIG ---------------- */
  showAbout() {
    Modal.open({
      title: "Sobre",
      bodyHTML: `
        <div class="card" style="box-shadow:none;margin:0">
          <div class="card-title">Kid IEQ 2025 • IEQ Central</div>
          <div class="card-sub">Sistema de Gestão do Ministério Infantil</div>
          <div class="hint" style="margin-top:12px">
            PWA pronto para instalar no celular. Segurança com login, mural e cadastros.
          </div>
        </div>
      `,
      footerHTML: `<button class="btn btn-primary" id="about-ok">Ok</button>`
    });
    $("#about-ok")?.addEventListener("click", () => Modal.close());
  },

  clearLocalCache() {
    if (!confirm("Limpar cache local do navegador? (não apaga o servidor)")) return;
    try {
      localStorage.removeItem("kid_ieq_token");
      localStorage.removeItem("kid_ieq_theme");
      toast("Cache local limpo. Recarregue a página.", "ok");
    } catch {
      toast("Falha ao limpar cache", "err");
    }
  }
}; // <--- CHAVE DE FECHAMENTO DO OBJETO APP

window.APP = APP;

document.addEventListener("DOMContentLoaded", () => {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
  APP.boot();
});
