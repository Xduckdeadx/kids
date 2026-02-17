/* static/js/app.js - IEQ Central v2.0 */

(() => {
  "use strict";

  // =========================
  // UTILITÁRIOS
  // =========================
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const toast = (msg, type = "info") => {
    const el = $("#toast");
    if (!el) return;
    el.textContent = msg;
    el.className = `toast toast-${type}`;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 3000);
  };

  const escapeHtml = (text) => {
    if (!text) return "";
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  };

  const formatDate = (date) => {
    if (!date) return "-";
    try {
      const d = new Date(date);
      return d.toLocaleString("pt-BR");
    } catch {
      return String(date);
    }
  };

  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // =========================
  // MODAL
  // =========================
  const Modal = {
    element: null,
    
    init() {
      if (document.getElementById("modal")) return;
      
      const html = `
        <div id="modal" class="modal-container" style="display: none;">
          <div class="modal-overlay"></div>
          <div class="modal">
            <div class="modal-header">
              <h3 class="modal-title"></h3>
              <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body"></div>
            <div class="modal-footer"></div>
          </div>
        </div>
      `;
      
      document.body.insertAdjacentHTML("beforeend", html);
      this.element = $("#modal");
      this.element.querySelector(".modal-overlay").onclick = () => this.hide();
      this.element.querySelector(".modal-close").onclick = () => this.hide();
    },
    
    show({ title, content, footer = "", size = "medium" }) {
      this.init();
      this.element.querySelector(".modal-title").textContent = title;
      this.element.querySelector(".modal-body").innerHTML = content;
      this.element.querySelector(".modal-footer").innerHTML = footer;
      this.element.className = `modal-container modal-${size}`;
      this.element.style.display = "flex";
      setTimeout(() => this.element.classList.add("show"), 10);
    },
    
    hide() {
      this.element.classList.remove("show");
      setTimeout(() => this.element.style.display = "none", 300);
    },
    
    setContent(html) {
      this.element.querySelector(".modal-body").innerHTML = html;
    },
    
    setFooter(html) {
      this.element.querySelector(".modal-footer").innerHTML = html;
    }
  };

  // =========================
  // LOADING
  // =========================
  const Loading = {
    element: null,
    count: 0,
    
    init() {
      if (document.getElementById("loading")) return;
      
      const html = `
        <div id="loading" class="loading-overlay" style="display: none;">
          <div class="loading-spinner">
            <div class="spinner"></div>
            <div class="loading-text">Carregando...</div>
          </div>
        </div>
      `;
      
      document.body.insertAdjacentHTML("beforeend", html);
      this.element = $("#loading");
    },
    
    show() {
      this.count++;
      if (this.count > 1) return;
      this.init();
      this.element.style.display = "flex";
      setTimeout(() => this.element.classList.add("show"), 10);
    },
    
    hide() {
      this.count = Math.max(0, this.count - 1);
      if (this.count > 0) return;
      if (this.element) {
        this.element.classList.remove("show");
        setTimeout(() => this.element.style.display = "none", 300);
      }
    }
  };

  // =========================
  // API
  // =========================
  const API = {
    tokenKey: "ieq_token",
    
    get token() {
      return localStorage.getItem(this.tokenKey) || "";
    },
    
    set token(value) {
      if (value) localStorage.setItem(this.tokenKey, value);
      else localStorage.removeItem(this.tokenKey);
    },
    
    async request(endpoint, options = {}) {
      const url = endpoint.startsWith("http") ? endpoint : endpoint;
      
      const headers = {
        "Content-Type": "application/json",
        ...options.headers
      };
      
      if (this.token) {
        headers.Authorization = `Bearer ${this.token}`;
      }
      
      Loading.show();
      
      try {
        const response = await fetch(url, {
          ...options,
          headers,
          credentials: "same-origin"
        });
        
        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.error || `Erro ${response.status}`);
        }
        
        return data;
      } finally {
        Loading.hide();
      }
    },
    
    // Auth
    async login(usuario, senha) {
      return this.request("/api/login", {
        method: "POST",
        body: JSON.stringify({ usuario, senha })
      });
    },
    
    async getMe() {
      return this.request("/api/me");
    },
    
    // Dashboard
    async getDashboardStats() {
      return this.request("/api/dashboard/stats");
    },
    
    // Alunos
    async getAlunos() {
      return this.request("/api/alunos");
    },
    
    async createAluno(data) {
      return this.request("/api/alunos", {
        method: "POST",
        body: JSON.stringify(data)
      });
    },
    
    async updateAluno(id, data) {
      return this.request(`/api/alunos/${id}`, {
        method: "PUT",
        body: JSON.stringify(data)
      });
    },
    
    async deleteAluno(id) {
      return this.request(`/api/alunos/${id}`, {
        method: "DELETE"
      });
    },
    
    // Equipe
    async getEquipe() {
      return this.request("/api/equipe");
    },
    
    async createMembro(data) {
      return this.request("/api/equipe", {
        method: "POST",
        body: JSON.stringify(data)
      });
    },
    
    async deleteMembro(id) {
      return this.request(`/api/equipe/${id}`, {
        method: "DELETE"
      });
    },
    
    // Aulas
    async iniciarAula(data) {
      return this.request("/api/aulas/iniciar", {
        method: "POST",
        body: JSON.stringify(data)
      });
    },
    
    async getAulaAtiva() {
      return this.request("/api/aulas/ativa");
    },
    
    async registrarEntrada(aulaId, alunoId) {
      return this.request(`/api/aulas/${aulaId}/entrada`, {
        method: "POST",
        body: JSON.stringify({ aluno_id: alunoId })
      });
    },
    
    async registrarSaida(aulaId, alunoId, retiradoPor) {
      return this.request(`/api/aulas/${aulaId}/saida`, {
        method: "POST",
        body: JSON.stringify({ aluno_id: alunoId, retirado_por: retiradoPor })
      });
    },
    
    async encerrarAula(aulaId) {
      return this.request(`/api/aulas/${aulaId}/encerrar`, {
        method: "POST"
      });
    },
    
    // Histórico
    async getHistorico() {
      return this.request("/api/historico");
    },
    
    async getRelatorio(aulaId) {
      return this.request(`/api/aulas/${aulaId}/relatorio`);
    },
    
    downloadRelatorioCSV(aulaId) {
      window.open(`/api/aulas/${aulaId}/relatorio/csv`, "_blank");
    },
    
    // Mural
    async getMural() {
      return this.request("/api/mural");
    },
    
    async criarAviso(data) {
      return this.request("/api/mural", {
        method: "POST",
        body: JSON.stringify(data)
      });
    },
    
    async toggleLike(avisoId) {
      return this.request(`/api/mural/${avisoId}/like`, {
        method: "POST"
      });
    },
    
    async comentar(avisoId, comentario) {
      return this.request(`/api/mural/${avisoId}/comentario`, {
        method: "POST",
        body: JSON.stringify({ comentario })
      });
    },
    
    async fixarAviso(avisoId, fixado) {
      return this.request(`/api/mural/${avisoId}/fixar`, {
        method: "POST",
        body: JSON.stringify({ fixado })
      });
    },
    
    async deleteAviso(avisoId) {
      return this.request(`/api/mural/${avisoId}`, {
        method: "DELETE"
      });
    },
    
    // Config
    async getConfigInfo() {
      return this.request("/api/config/info");
    }
  };

  // =========================
  // STATE
  // =========================
  const State = {
    user: null,
    stats: null,
    alunos: [],
    equipe: [],
    aulaAtiva: null,
    presencas: [],
    historico: [],
    avisos: [],
    currentPage: "home",
    
    set(key, value) {
      this[key] = value;
    }
  };

  // =========================
  // ROUTER
  // =========================
  const Router = {
    pages: {
      home: { title: "Dashboard", render: renderHome },
      aulas: { title: "Iniciar Aula", render: renderIniciarAula },
      ativa: { title: "Aula Ativa", render: renderAulaAtiva },
      alunos: { title: "Alunos", render: renderAlunos },
      historico: { title: "Histórico", render: renderHistorico },
      mural: { title: "Mural", render: renderMural },
      equipe: { title: "Equipe", render: renderEquipe },
      assistente: { title: "Assistente", render: renderAssistente },
      config: { title: "Configurações", render: renderConfig }
    },
    
    async go(page) {
      if (!this.pages[page]) page = "home";
      
      State.currentPage = page;
      $("#header-title").textContent = this.pages[page].title;
      
      $$(".nav-btn").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.page === page);
      });
      
      await this.pages[page].render();
    }
  };

  // =========================
  // THEME
  // =========================
  const Theme = {
    init() {
      const saved = localStorage.getItem("theme") || "light";
      document.documentElement.setAttribute("data-theme", saved);
    },
    
    toggle() {
      const current = document.documentElement.getAttribute("data-theme");
      const next = current === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("theme", next);
    }
  };

  // =========================
  // AUTH
  // =========================
  async function checkAuth() {
    if (!API.token) return false;
    
    try {
      const data = await API.getMe();
      if (data.success) {
        State.user = data.data.user;
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  async function doLogin() {
    const usuario = $("#login-user").value.trim();
    const senha = $("#login-pass").value;
    
    if (!usuario || !senha) {
      toast("Usuário e senha obrigatórios", "error");
      return;
    }
    
    try {
      const data = await API.login(usuario, senha);
      if (data.success) {
        API.token = data.data.token;
        State.user = data.data.user;
        
        $("#login").style.display = "none";
        $("#app").style.display = "grid";
        
        toast(`Bem-vindo, ${data.data.user.nome}!`, "success");
        
        $("#side-user-name").textContent = data.data.user.nome;
        $("#side-user-role").textContent = data.data.user.role.toUpperCase();
        
        await Router.go("home");
      }
    } catch (error) {
      toast(error.message, "error");
    }
  }

  function logout() {
    API.token = null;
    State.user = null;
    $("#login").style.display = "flex";
    $("#app").style.display = "none";
  }

  // =========================
  // PAGES
  // =========================
  
  // Home
  async function renderHome() {
    try {
      const data = await API.getDashboardStats();
      State.stats = data.data;
      
      const stats = data.data.totais || {};
      const aulaAtiva = data.data.aula_ativa;
      
      const html = `
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-icon">👥</div>
            <div class="stat-content">
              <div class="stat-value">${stats.alunos || 0}</div>
              <div class="stat-label">Alunos</div>
            </div>
          </div>
          
          <div class="stat-card">
            <div class="stat-icon">👤</div>
            <div class="stat-content">
              <div class="stat-value">${stats.equipe || 0}</div>
              <div class="stat-label">Equipe</div>
            </div>
          </div>
          
          <div class="stat-card ${aulaAtiva ? 'stat-active' : ''}">
            <div class="stat-icon">📚</div>
            <div class="stat-content">
              <div class="stat-value">${aulaAtiva ? 'Sim' : 'Não'}</div>
              <div class="stat-label">Aula Ativa</div>
            </div>
          </div>
          
          <div class="stat-card">
            <div class="stat-icon">✅</div>
            <div class="stat-content">
              <div class="stat-value">${stats.presentes_hoje || 0}</div>
              <div class="stat-label">Presentes</div>
            </div>
          </div>
        </div>
        
        <div class="quick-actions">
          <h3>Ações Rápidas</h3>
          <div class="actions-grid">
            <button class="action-card" onclick="Router.go('aulas')">
              <span class="action-icon">🎓</span>
              <span class="action-label">Iniciar Aula</span>
            </button>
            <button class="action-card" onclick="Router.go('ativa')">
              <span class="action-icon">✅</span>
              <span class="action-label">Aula Ativa</span>
            </button>
            <button class="action-card" onclick="Router.go('alunos')">
              <span class="action-icon">👥</span>
              <span class="action-label">Alunos</span>
            </button>
            <button class="action-card" onclick="Router.go('assistente')">
              <span class="action-icon">🤖</span>
              <span class="action-label">Assistente</span>
            </button>
          </div>
        </div>
      `;
      
      $("#page-host").innerHTML = html;
      
    } catch (error) {
      $("#page-host").innerHTML = `<p class="error">Erro: ${error.message}</p>`;
    }
  }

  // Iniciar Aula
  async function renderIniciarAula() {
    try {
      const equipe = await API.getEquipe();
      const professores = equipe.data.equipe.filter(p => 
        p.role === "professor" || p.role === "admin"
      );
      
      const html = `
        <div class="page-container">
          <h2>Iniciar Nova Aula</h2>
          
          <div class="form-card">
            <div class="form-group">
              <label>Tema da Aula</label>
              <input type="text" id="tema-aula" placeholder="Ex: O Amor de Deus">
            </div>
            
            <div class="form-group">
              <label>Professor</label>
              <select id="professor-aula">
                <option value="">Selecione...</option>
                ${professores.map(p => `
                  <option value="${p.id}">${escapeHtml(p.nome)}</option>
                `).join("")}
              </select>
            </div>
            
            <div class="form-actions">
              <button class="btn btn-primary" id="btn-iniciar">Iniciar Aula</button>
              <button class="btn btn-secondary" onclick="Router.go('home')">Cancelar</button>
            </div>
          </div>
        </div>
      `;
      
      $("#page-host").innerHTML = html;
      
      $("#btn-iniciar").onclick = async () => {
        const tema = $("#tema-aula").value.trim();
        const professor = $("#professor-aula").value;
        
        if (!tema) return toast("Tema é obrigatório", "error");
        if (!professor) return toast("Selecione um professor", "error");
        
        try {
          await API.iniciarAula({ tema, professores: professor });
          toast("Aula iniciada!", "success");
          Router.go("ativa");
        } catch (error) {
          toast(error.message, "error");
        }
      };
      
    } catch (error) {
      $("#page-host").innerHTML = `<p class="error">${error.message}</p>`;
    }
  }

  // Aula Ativa
  async function renderAulaAtiva() {
    try {
      const data = await API.getAulaAtiva();
      const aula = data.data.aula;
      const presencas = data.data.presencas || [];
      
      if (!aula) {
        $("#page-host").innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">📚</div>
            <h3>Nenhuma aula ativa</h3>
            <p>Inicie uma aula para começar</p>
            <button class="btn btn-primary" onclick="Router.go('aulas')">
              Iniciar Aula
            </button>
          </div>
        `;
        return;
      }
      
      const alunos = await API.getAlunos();
      State.alunos = alunos.data.alunos;
      
      let selectedAluno = null;
      
      const html = `
        <div class="aula-ativa-container">
          <div class="aula-header">
            <div class="aula-info">
              <h2>${escapeHtml(aula.tema)}</h2>
              <div class="aula-meta">
                <span>📅 ${formatDate(aula.iniciada_em)}</span>
                <span>👤 Professor</span>
              </div>
            </div>
            <button class="btn btn-danger" id="btn-encerrar">Encerrar Aula</button>
          </div>
          
          <div class="aula-acoes-grid">
            <div class="acao-card">
              <h4>✅ Check-in</h4>
              <select id="select-entrada" class="form-control">
                <option value="">Selecione um aluno...</option>
                ${State.alunos.map(a => `
                  <option value="${a.id}">${escapeHtml(a.nome)}</option>
                `).join("")}
              </select>
              <button class="btn btn-success btn-block" id="btn-entrada">
                Registrar Entrada
              </button>
            </div>
            
            <div class="acao-card">
              <h4>🔓 Check-out</h4>
              <select id="select-saida" class="form-control">
                <option value="">Selecione um aluno...</option>
                ${State.alunos.map(a => `
                  <option value="${a.id}">${escapeHtml(a.nome)}</option>
                `).join("")}
              </select>
              <input type="text" id="retirado-por" class="form-control" 
                     placeholder="Quem está retirando?">
              <button class="btn btn-warning btn-block" id="btn-saida">
                Registrar Saída
              </button>
            </div>
          </div>
          
          <div class="presenca-card">
            <h3>📋 Lista de Presença</h3>
            <div class="table-responsive">
              <table class="table">
                <thead>
                  <tr>
                    <th>Aluno</th>
                    <th>Entrada</th>
                    <th>Saída</th>
                    <th>Retirado por</th>
                  </tr>
                </thead>
                <tbody>
                  ${presencas.map(p => `
                    <tr>
                      <td>${escapeHtml(p.aluno_nome)}</td>
                      <td>${p.entrada_ts ? formatDate(p.entrada_ts) : '-'}</td>
                      <td>${p.saida_ts ? formatDate(p.saida_ts) : '-'}</td>
                      <td>${escapeHtml(p.retirado_por || '-')}</td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;
      
      $("#page-host").innerHTML = html;
      
      $("#btn-entrada").onclick = async () => {
        const alunoId = $("#select-entrada").value;
        if (!alunoId) return toast("Selecione um aluno", "error");
        
        try {
          await API.registrarEntrada(aula.id, alunoId);
          toast("Entrada registrada!", "success");
          renderAulaAtiva();
        } catch (error) {
          toast(error.message, "error");
        }
      };
      
      $("#btn-saida").onclick = async () => {
        const alunoId = $("#select-saida").value;
        const retiradoPor = $("#retirado-por").value.trim();
        
        if (!alunoId) return toast("Selecione um aluno", "error");
        if (!retiradoPor) return toast("Nome de quem retirou é obrigatório", "error");
        
        try {
          await API.registrarSaida(aula.id, alunoId, retiradoPor);
          toast("Saída registrada!", "success");
          renderAulaAtiva();
        } catch (error) {
          toast(error.message, "error");
        }
      };
      
      $("#btn-encerrar").onclick = async () => {
        if (!confirm("Encerrar aula?")) return;
        try {
          await API.encerrarAula(aula.id);
          toast("Aula encerrada", "success");
          Router.go("historico");
        } catch (error) {
          toast(error.message, "error");
        }
      };
      
    } catch (error) {
      $("#page-host").innerHTML = `<p class="error">${error.message}</p>`;
    }
  }

  // Alunos
  async function renderAlunos() {
    try {
      const data = await API.getAlunos();
      State.alunos = data.data.alunos;
      
      const html = `
        <div class="page-header">
          <div>
            <h2>Alunos</h2>
            <p>${State.alunos.length} cadastrados</p>
          </div>
          <button class="btn btn-primary" id="btn-novo-aluno">
            ➕ Novo Aluno
          </button>
        </div>
        
        <div class="alunos-grid">
          ${State.alunos.map(a => `
            <div class="aluno-card" data-id="${a.id}">
              <div class="aluno-avatar">
                ${a.foto ? `
                  <img src="${a.foto}" alt="${escapeHtml(a.nome)}">
                ` : `
                  <div class="avatar-placeholder">
                    ${a.nome.charAt(0).toUpperCase()}
                  </div>
                `}
              </div>
              <div class="aluno-info">
                <h4>${escapeHtml(a.nome)}</h4>
                <div class="aluno-detalhes">
                  ${a.responsavel ? `
                    <div>👤 ${escapeHtml(a.responsavel)}</div>
                  ` : ''}
                  ${a.telefone ? `
                    <div>📱 ${a.telefone}</div>
                  ` : ''}
                </div>
              </div>
              <div class="aluno-actions">
                <button class="btn-icon" onclick="editarAluno(${a.id})">✏️</button>
                <button class="btn-icon btn-danger" onclick="excluirAluno(${a.id})">🗑️</button>
              </div>
            </div>
          `).join("")}
        </div>
      `;
      
      $("#page-host").innerHTML = html;
      
      $("#btn-novo-aluno").onclick = () => abrirModalAluno();
      
      window.editarAluno = (id) => {
        const aluno = State.alunos.find(a => a.id === id);
        abrirModalAluno(aluno);
      };
      
      window.excluirAluno = async (id) => {
        if (!confirm("Excluir aluno?")) return;
        try {
          await API.deleteAluno(id);
          toast("Aluno excluído", "success");
          renderAlunos();
        } catch (error) {
          toast(error.message, "error");
        }
      };
      
    } catch (error) {
      $("#page-host").innerHTML = `<p class="error">${error.message}</p>`;
    }
  }

  function abrirModalAluno(aluno = null) {
    const isEdit = !!aluno;
    
    const html = `
      <form id="form-aluno">
        <div class="form-group">
          <label>Nome Completo *</label>
          <input type="text" id="aluno-nome" value="${escapeHtml(aluno?.nome || '')}">
        </div>
        
        <div class="form-group">
          <label>Data Nascimento</label>
          <input type="text" id="aluno-nasc" value="${escapeHtml(aluno?.data_nascimento || '')}">
        </div>
        
        <div class="form-group">
          <label>Responsável</label>
          <input type="text" id="aluno-resp" value="${escapeHtml(aluno?.responsavel || '')}">
        </div>
        
        <div class="form-group">
          <label>Telefone</label>
          <input type="text" id="aluno-tel" value="${escapeHtml(aluno?.telefone || '')}">
        </div>
        
        <div class="form-group">
          <label>Autorizado 1</label>
          <input type="text" id="aluno-aut1" value="${escapeHtml(aluno?.autorizado_retirar || '')}">
        </div>
        
        <div class="form-group">
          <label>Autorizado 2</label>
          <input type="text" id="aluno-aut2" value="${escapeHtml(aluno?.autorizado_2 || '')}">
        </div>
        
        <div class="form-group">
          <label>Autorizado 3</label>
          <input type="text" id="aluno-aut3" value="${escapeHtml(aluno?.autorizado_3 || '')}">
        </div>
        
        <div class="form-group">
          <label>Observações</label>
          <textarea id="aluno-obs">${escapeHtml(aluno?.observacoes || '')}</textarea>
        </div>
        
        <div class="form-group">
          <label>Foto</label>
          <input type="file" id="aluno-foto" accept="image/*">
          ${aluno?.foto ? '<p>Foto atual existe</p>' : ''}
        </div>
      </form>
    `;
    
    Modal.show({
      title: isEdit ? "Editar Aluno" : "Novo Aluno",
      content: html,
      footer: `
        <button class="btn btn-primary" id="modal-salvar">Salvar</button>
        <button class="btn btn-secondary" onclick="Modal.hide()">Cancelar</button>
      `,
      size: "large"
    });
    
    $("#modal-salvar").onclick = async () => {
      const data = {
        nome: $("#aluno-nome").value.trim(),
        data_nascimento: $("#aluno-nasc").value.trim(),
        responsavel: $("#aluno-resp").value.trim(),
        telefone: $("#aluno-tel").value.trim(),
        autorizado_retirar: $("#aluno-aut1").value.trim(),
        autorizado_2: $("#aluno-aut2").value.trim(),
        autorizado_3: $("#aluno-aut3").value.trim(),
        observacoes: $("#aluno-obs").value.trim()
      };
      
      if (!data.nome) {
        toast("Nome é obrigatório", "error");
        return;
      }
      
      const fotoFile = $("#aluno-foto").files[0];
      if (fotoFile) {
        try {
          data.foto = await fileToBase64(fotoFile);
        } catch (e) {
          toast("Erro ao carregar foto", "error");
          return;
        }
      }
      
      try {
        if (isEdit) {
          await API.updateAluno(aluno.id, data);
          toast("Aluno atualizado!", "success");
        } else {
          await API.createAluno(data);
          toast("Aluno cadastrado!", "success");
        }
        Modal.hide();
        renderAlunos();
      } catch (error) {
        toast(error.message, "error");
      }
    };
  }

  // Histórico
  async function renderHistorico() {
    try {
      const data = await API.getHistorico();
      State.historico = data.data.historico || [];
      
      const html = `
        <h2>Histórico de Aulas</h2>
        
        <div class="historico-grid">
          ${State.historico.map(a => `
            <div class="historico-card">
              <div class="historico-header">
                <span class="historico-data">${formatDate(a.encerrada_em)}</span>
                <span class="badge">${a.total_presentes || 0} presentes</span>
              </div>
              <h4>${escapeHtml(a.tema || "Sem tema")}</h4>
              <div class="historico-acoes">
                <button class="btn-icon" onclick="verRelatorio(${a.id})">📄</button>
                <button class="btn-icon" onclick="API.downloadRelatorioCSV(${a.id})">📥</button>
              </div>
            </div>
          `).join("")}
        </div>
      `;
      
      $("#page-host").innerHTML = html;
      
      window.verRelatorio = async (id) => {
        try {
          const data = await API.getRelatorio(id);
          const aula = data.data.aula;
          const presencas = data.data.presencas;
          
          const html = `
            <div class="relatorio">
              <h3>${escapeHtml(aula.tema)}</h3>
              <p>Data: ${formatDate(aula.encerrada_em)}</p>
              <p>Total: ${presencas.length} alunos</p>
              
              <table class="table">
                <thead>
                  <tr>
                    <th>Aluno</th>
                    <th>Entrada</th>
                    <th>Saída</th>
                    <th>Retirado por</th>
                  </tr>
                </thead>
                <tbody>
                  ${presencas.map(p => `
                    <tr>
                      <td>${escapeHtml(p.nome)}</td>
                      <td>${p.entrada_ts ? formatDate(p.entrada_ts) : '-'}</td>
                      <td>${p.saida_ts ? formatDate(p.saida_ts) : '-'}</td>
                      <td>${escapeHtml(p.retirado_por || '-')}</td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
          `;
          
          Modal.show({
            title: "Relatório da Aula",
            content: html,
            size: "large",
            footer: `
              <button class="btn" onclick="API.downloadRelatorioCSV(${id})">📥 Download CSV</button>
              <button class="btn btn-secondary" onclick="Modal.hide()">Fechar</button>
            `
          });
        } catch (error) {
          toast(error.message, "error");
        }
      };
      
    } catch (error) {
      $("#page-host").innerHTML = `<p class="error">${error.message}</p>`;
    }
  }

  // Mural
  async function renderMural() {
    try {
      const data = await API.getMural();
      State.avisos = data.data.avisos || [];
      
      const html = `
        <div class="page-header">
          <h2>Mural de Avisos</h2>
          <button class="btn btn-primary" id="btn-novo-aviso">➕ Novo Aviso</button>
        </div>
        
        <div class="mural-grid">
          ${State.avisos.map(a => `
            <div class="aviso-card ${a.fixado ? 'aviso-fixado' : ''}">
              ${a.fixado ? '<span class="fixado-badge">📌 Fixado</span>' : ''}
              
              <div class="aviso-header">
                <div>
                  <strong>${escapeHtml(a.autor_nome || a.autor)}</strong>
                  <small>${formatDate(a.data_criacao)}</small>
                </div>
                ${State.user?.role === 'admin' ? `
                  <div>
                    <button class="btn-icon" onclick="fixarAviso(${a.id}, ${!a.fixado})">📌</button>
                    <button class="btn-icon btn-danger" onclick="excluirAviso(${a.id})">🗑️</button>
                  </div>
                ` : ''}
              </div>
              
              ${a.mensagem ? `<p>${escapeHtml(a.mensagem)}</p>` : ''}
              ${a.imagem ? `<img src="${a.imagem}" class="aviso-imagem">` : ''}
              
              <div class="aviso-stats">
                <button class="btn-like" onclick="likeAviso(${a.id})">
                  ❤️ <span>${a.total_likes || 0}</span>
                </button>
                <span>💬 ${a.total_comentarios || 0}</span>
              </div>
              
              <div class="aviso-comentarios">
                ${(a.comentarios || []).map(c => `
                  <div class="comentario">
                    <strong>${escapeHtml(c.usuario_nome)}:</strong>
                    <span>${escapeHtml(c.comentario)}</span>
                    <small>${formatDate(c.criado_em)}</small>
                  </div>
                `).join("")}
              </div>
              
              <div class="novo-comentario">
                <input type="text" placeholder="Comentar..." id="coment-${a.id}">
                <button class="btn-icon" onclick="comentarAviso(${a.id})">➡️</button>
              </div>
            </div>
          `).join("")}
        </div>
      `;
      
      $("#page-host").innerHTML = html;
      
      $("#btn-novo-aviso").onclick = () => {
        Modal.show({
          title: "Novo Aviso",
          content: `
            <textarea id="aviso-mensagem" class="form-control" rows="4" 
                      placeholder="Escreva seu aviso..."></textarea>
            <input type="file" id="aviso-imagem" accept="image/*" class="form-control">
          `,
          footer: `
            <button class="btn btn-primary" id="modal-publicar">Publicar</button>
            <button class="btn btn-secondary" onclick="Modal.hide()">Cancelar</button>
          `
        });
        
        $("#modal-publicar").onclick = async () => {
          const data = {
            mensagem: $("#aviso-mensagem").value.trim()
          };
          
          const file = $("#aviso-imagem").files[0];
          if (file) {
            try {
              data.imagem = await fileToBase64(file);
            } catch (e) {
              toast("Erro na imagem", "error");
              return;
            }
          }
          
          try {
            await API.criarAviso(data);
            Modal.hide();
            toast("Aviso publicado!", "success");
            renderMural();
          } catch (error) {
            toast(error.message, "error");
          }
        };
      };
      
      window.likeAviso = async (id) => {
        try {
          await API.toggleLike(id);
          renderMural();
        } catch (error) {
          toast(error.message, "error");
        }
      };
      
      window.comentarAviso = async (id) => {
        const input = $(`#coment-${id}`);
        const texto = input.value.trim();
        if (!texto) return;
        
        try {
          await API.comentar(id, texto);
          input.value = "";
          renderMural();
        } catch (error) {
          toast(error.message, "error");
        }
      };
      
      window.fixarAviso = async (id, fixado) => {
        try {
          await API.fixarAviso(id, fixado);
          renderMural();
        } catch (error) {
          toast(error.message, "error");
        }
      };
      
      window.excluirAviso = async (id) => {
        if (!confirm("Excluir aviso?")) return;
        try {
          await API.deleteAviso(id);
          renderMural();
        } catch (error) {
          toast(error.message, "error");
        }
      };
      
    } catch (error) {
      $("#page-host").innerHTML = `<p class="error">${error.message}</p>`;
    }
  }

  // Equipe
  async function renderEquipe() {
    try {
      const data = await API.getEquipe();
      State.equipe = data.data.equipe || [];
      const isAdmin = State.user?.role === "admin";
      
      const html = `
        <div class="page-header">
          <h2>Equipe</h2>
          ${isAdmin ? `
            <button class="btn btn-primary" id="btn-novo-membro">➕ Novo Membro</button>
          ` : ''}
        </div>
        
        <div class="equipe-grid">
          ${State.equipe.map(m => `
            <div class="membro-card">
              <div class="membro-avatar">
                ${m.foto ? `
                  <img src="${m.foto}" alt="${escapeHtml(m.nome)}">
                ` : `
                  <div class="avatar-placeholder">
                    ${m.nome.charAt(0).toUpperCase()}
                  </div>
                `}
              </div>
              <div class="membro-info">
                <h4>${escapeHtml(m.nome)}</h4>
                <p>@${escapeHtml(m.usuario)}</p>
                <span class="badge badge-${m.role}">${m.role}</span>
              </div>
              ${isAdmin && m.usuario !== 'admin' ? `
                <button class="btn-icon btn-danger" onclick="excluirMembro(${m.id})">🗑️</button>
              ` : ''}
            </div>
          `).join("")}
        </div>
      `;
      
      $("#page-host").innerHTML = html;
      
      if (isAdmin) {
        $("#btn-novo-membro").onclick = () => {
          Modal.show({
            title: "Novo Membro",
            content: `
              <input type="text" id="membro-nome" class="form-control" placeholder="Nome">
              <input type="text" id="membro-usuario" class="form-control" placeholder="Usuário">
              <input type="password" id="membro-senha" class="form-control" placeholder="Senha">
              <select id="membro-role" class="form-control">
                <option value="auxiliar">Auxiliar</option>
                <option value="professor">Professor</option>
                <option value="admin">Admin</option>
              </select>
            `,
            footer: `
              <button class="btn btn-primary" id="modal-salvar">Salvar</button>
              <button class="btn btn-secondary" onclick="Modal.hide()">Cancelar</button>
            `
          });
          
          $("#modal-salvar").onclick = async () => {
            const data = {
              nome: $("#membro-nome").value.trim(),
              usuario: $("#membro-usuario").value.trim(),
              senha: $("#membro-senha").value,
              role: $("#membro-role").value
            };
            
            if (!data.nome || !data.usuario || !data.senha) {
              toast("Preencha todos os campos", "error");
              return;
            }
            
            try {
              await API.createMembro(data);
              Modal.hide();
              toast("Membro cadastrado!", "success");
              renderEquipe();
            } catch (error) {
              toast(error.message, "error");
            }
          };
        };
        
        window.excluirMembro = async (id) => {
          if (!confirm("Excluir membro?")) return;
          try {
            await API.deleteMembro(id);
            renderEquipe();
          } catch (error) {
            toast(error.message, "error");
          }
        };
      }
      
    } catch (error) {
      $("#page-host").innerHTML = `<p class="error">${error.message}</p>`;
    }
  }

  // Assistente
  async function renderAssistente() {
    const html = `
      <h2>Assistente Ministerial</h2>
      
      <div class="assistente-section">
        <h3>✅ Checklist de Segurança</h3>
        <div class="checklist-grid">
          <div class="checklist-item checklist-success">
            <span class="checklist-status">✅</span>
            <div>
              <strong>Banco de dados</strong>
              <p>Conectado</p>
            </div>
          </div>
          <div class="checklist-item checklist-info">
            <span class="checklist-status">ℹ️</span>
            <div>
              <strong>Total de Alunos</strong>
              <p>${State.stats?.totais?.alunos || 0} ativos</p>
            </div>
          </div>
          <div class="checklist-item checklist-info">
            <span class="checklist-status">ℹ️</span>
            <div>
              <strong>Equipe</strong>
              <p>${State.stats?.totais?.equipe || 0} membros</p>
            </div>
          </div>
        </div>
      </div>
      
      <div class="assistente-section">
        <h3>💡 Dicas Rápidas</h3>
        <ul>
          <li>Use o mural para comunicar com a equipe</li>
          <li>Cadastre sempre os responsáveis autorizados</li>
          <li>Inicie a aula antes de registrar presença</li>
          <li>Confira o checklist antes de encerrar</li>
        </ul>
      </div>
    `;
    
    $("#page-host").innerHTML = html;
  }

  // Configurações
  async function renderConfig() {
    try {
      const data = await API.getConfigInfo();
      const info = data.data.app;
      
      const html = `
        <h2>Configurações</h2>
        
        <div class="config-grid">
          <div class="config-card">
            <h3>ℹ️ Sobre</h3>
            <p><strong>${info.nome}</strong></p>
            <p>Versão: ${info.versao}</p>
            <p>Ambiente: ${info.ambiente}</p>
            <p>Desenvolvido por ${info.desenvolvido_por}</p>
            <p>© ${new Date().getFullYear()}</p>
          </div>
          
          <div class="config-card">
            <h3>🎨 Aparência</h3>
            <button class="btn" id="btn-theme">Alternar Tema</button>
          </div>
          
          <div class="config-card">
            <h3>🔐 Sessão</h3>
            <p>Usuário: ${State.user?.nome}</p>
            <p>Função: ${State.user?.role}</p>
            <button class="btn btn-danger" id="btn-logout">Sair</button>
          </div>
        </div>
      `;
      
      $("#page-host").innerHTML = html;
      
      $("#btn-theme").onclick = Theme.toggle;
      $("#btn-logout").onclick = logout;
      
    } catch (error) {
      $("#page-host").innerHTML = `<p class="error">${error.message}</p>`;
    }
  }

  // =========================
  // BOOTSTRAP
  // =========================
  async function boot() {
    Theme.init();
    
    $("#btn-login").onclick = doLogin;
    $("#login-pass").onkeypress = (e) => {
      if (e.key === "Enter") doLogin();
    };
    
    $("#btn-refresh").onclick = () => Router.go(State.currentPage);
    
    $$(".nav-btn").forEach(btn => {
      btn.onclick = () => Router.go(btn.dataset.page);
    });
    
    const isAuth = await checkAuth();
    
    if (isAuth) {
      $("#login").style.display = "none";
      $("#app").style.display = "grid";
      
      $("#side-user-name").textContent = State.user.nome;
      $("#side-user-role").textContent = State.user.role.toUpperCase();
      
      await Router.go("home");
    } else {
      $("#login").style.display = "flex";
      $("#app").style.display = "none";
    }
  }

  // Start
  document.addEventListener("DOMContentLoaded", boot);
  
  // Exports
  window.Router = Router;
  window.Modal = Modal;
  window.toast = toast;

})();
