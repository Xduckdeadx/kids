/* static/js/app.js
   IEQ Central • Ministério Infantil v2.0
   SPA Profissional com UI/UX refinado
*/

(() => {
  "use strict";

  // =========================
  // Configurações Globais
  // =========================
  const CONFIG = {
    APP_NAME: "IEQ Central",
    APP_VERSION: "2.0.0",
    API_TIMEOUT: 30000,
    TOAST_DURATION: 3000,
    MAX_IMAGE_SIZE: 2.5 * 1024 * 1024, // 2.5MB
    ANIMATION_DURATION: 200,
    DEBUG: false
  };

  // =========================
  // Utilitários
  // =========================
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  const log = (...args) => {
    if (CONFIG.DEBUG) console.log("[IEQ]", ...args);
  };

  const formatDate = (date, format = "datetime") => {
    if (!date) return "-";
    
    try {
      const d = new Date(date);
      if (isNaN(d.getTime())) return String(date);
      
      const pad = (n) => String(n).padStart(2, "0");
      
      const day = pad(d.getDate());
      const month = pad(d.getMonth() + 1);
      const year = d.getFullYear();
      const hours = pad(d.getHours());
      const minutes = pad(d.getMinutes());
      
      if (format === "date") return `${day}/${month}/${year}`;
      if (format === "time") return `${hours}:${minutes}`;
      return `${day}/${month}/${year} ${hours}:${minutes}`;
    } catch {
      return String(date);
    }
  };

  const formatPhone = (phone) => {
    if (!phone) return "";
    const cleaned = String(phone).replace(/\D/g, "");
    if (cleaned.length === 11) {
      return cleaned.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
    }
    if (cleaned.length === 10) {
      return cleaned.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
    }
    return phone;
  };

  const escapeHtml = (text) => {
    if (!text) return "";
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  };

  const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  };

  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      if (file.size > CONFIG.MAX_IMAGE_SIZE) {
        reject(new Error(`Arquivo muito grande. Máximo: ${CONFIG.MAX_IMAGE_SIZE / 1024 / 1024}MB`));
        return;
      }
      
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // =========================
  // Sistema de Toast
  // =========================
  const Toast = {
    element: null,
    queue: [],
    isVisible: false,
    
    init() {
      this.element = document.getElementById("toast");
      if (!this.element) {
        this.element = document.createElement("div");
        this.element.id = "toast";
        this.element.className = "toast";
        document.body.appendChild(this.element);
      }
    },
    
    show(message, type = "info") {
      if (!this.element) this.init();
      
      this.queue.push({ message, type });
      if (!this.isVisible) this.processQueue();
    },
    
    processQueue() {
      if (this.queue.length === 0) {
        this.isVisible = false;
        return;
      }
      
      this.isVisible = true;
      const { message, type } = this.queue.shift();
      
      this.element.textContent = message;
      this.element.className = `toast toast-${type}`;
      this.element.classList.add("show");
      
      setTimeout(() => {
        this.element.classList.remove("show");
        setTimeout(() => this.processQueue(), 300);
      }, CONFIG.TOAST_DURATION);
    },
    
    success(message) { this.show(message, "success"); },
    error(message) { this.show(message, "error"); },
    warning(message) { this.show(message, "warning"); },
    info(message) { this.show(message, "info"); }
  };

  // =========================
  // Modal System
  // =========================
  const Modal = {
    element: null,
    contentElement: null,
    titleElement: null,
    
    init() {
      // Cria modal se não existir
      if (document.getElementById("modal-container")) return;
      
      const modalHTML = `
        <div id="modal-container" class="modal-container" style="display: none;">
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
      
      document.body.insertAdjacentHTML("beforeend", modalHTML);
      
      this.element = document.getElementById("modal-container");
      this.titleElement = this.element.querySelector(".modal-title");
      this.bodyElement = this.element.querySelector(".modal-body");
      this.footerElement = this.element.querySelector(".modal-footer");
      
      this.element.querySelector(".modal-overlay").addEventListener("click", () => this.hide());
      this.element.querySelector(".modal-close").addEventListener("click", () => this.hide());
    },
    
    show({ title = "", content = "", footer = "", size = "medium", onClose = null } = {}) {
      this.init();
      
      this.titleElement.textContent = title;
      this.bodyElement.innerHTML = content;
      this.footerElement.innerHTML = footer;
      
      this.element.className = `modal-container modal-${size}`;
      this.element.style.display = "flex";
      
      setTimeout(() => this.element.classList.add("show"), 10);
      
      this.onClose = onClose;
    },
    
    hide() {
      this.element.classList.remove("show");
      setTimeout(() => {
        this.element.style.display = "none";
        if (this.onClose) this.onClose();
      }, 300);
    },
    
    setContent(html) {
      this.bodyElement.innerHTML = html;
    },
    
    setFooter(html) {
      this.footerElement.innerHTML = html;
    }
  };

  // =========================
  // Loading Overlay
  // =========================
  const Loading = {
    element: null,
    counter: 0,
    
    init() {
      if (document.getElementById("loading-overlay")) return;
      
      const loadingHTML = `
        <div id="loading-overlay" class="loading-overlay" style="display: none;">
          <div class="loading-spinner">
            <div class="spinner"></div>
            <div class="loading-text">Carregando...</div>
          </div>
        </div>
      `;
      
      document.body.insertAdjacentHTML("beforeend", loadingHTML);
      this.element = document.getElementById("loading-overlay");
    },
    
    show(text = "Carregando...") {
      this.counter++;
      if (this.counter > 1) return;
      
      this.init();
      this.element.querySelector(".loading-text").textContent = text;
      this.element.style.display = "flex";
      setTimeout(() => this.element.classList.add("show"), 10);
    },
    
    hide() {
      this.counter = Math.max(0, this.counter - 1);
      if (this.counter > 0) return;
      
      if (this.element) {
        this.element.classList.remove("show");
        setTimeout(() => {
          this.element.style.display = "none";
        }, 300);
      }
    }
  };

  // =========================
  // API Service
  // =========================
  const API = {
    baseURL: "",
    tokenKey: "ieq_auth_token",
    
    get token() {
      return localStorage.getItem(this.tokenKey) || "";
    },
    
    set token(value) {
      if (value) localStorage.setItem(this.tokenKey, value);
      else localStorage.removeItem(this.tokenKey);
    },
    
    async request(endpoint, options = {}) {
      const url = endpoint.startsWith("http") ? endpoint : `${this.baseURL}${endpoint}`;
      
      const headers = {
        "Content-Type": "application/json",
        ...options.headers
      };
      
      if (this.token) {
        headers.Authorization = `Bearer ${this.token}`;
      }
      
      const config = {
        ...options,
        headers,
        credentials: "same-origin"
      };
      
      // Timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CONFIG.API_TIMEOUT);
      
      try {
        Loading.show();
        
        const response = await fetch(url, { ...config, signal: controller.signal });
        clearTimeout(timeoutId);
        
        let data;
        const contentType = response.headers.get("content-type") || "";
        
        if (contentType.includes("application/json")) {
          data = await response.json();
        } else if (contentType.includes("text/csv")) {
          data = await response.text();
          return { success: true, data, isCSV: true };
        } else if (contentType.includes("text/html")) {
          data = await response.text();
          return { success: true, data, isHTML: true };
        } else {
          data = await response.text();
        }
        
        if (!response.ok) {
          const error = data?.error || data?.message || `Erro ${response.status}`;
          throw new Error(error);
        }
        
        return data;
        
      } catch (error) {
        if (error.name === "AbortError") {
          throw new Error("Tempo limite excedido. Verifique sua conexão.");
        }
        throw error;
      } finally {
        Loading.hide();
        clearTimeout(timeoutId);
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
    async getAlunos(search = "") {
      const query = search ? `?search=${encodeURIComponent(search)}` : "";
      return this.request(`/api/alunos${query}`);
    },
    
    async getAluno(id) {
      return this.request(`/api/alunos/${id}`);
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
    async getHistorico(limit = 100, offset = 0) {
      return this.request(`/api/historico?limit=${limit}&offset=${offset}`);
    },
    
    async getRelatorio(aulaId, formato = "json") {
      return this.request(`/api/aulas/${aulaId}/relatorio?formato=${formato}`);
    },
    
    async downloadRelatorioCSV(aulaId) {
      window.open(`/api/aulas/${aulaId}/relatorio/csv`, "_blank");
    },
    
    // Mural
    async getMural(limit = 50, offset = 0) {
      return this.request(`/api/mural?limit=${limit}&offset=${offset}`);
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
    
    async deletarAviso(avisoId) {
      return this.request(`/api/mural/${avisoId}`, {
        method: "DELETE"
      });
    },
    
    // Assistente
    async getAssistenteDashboard() {
      return this.request("/api/assistente/dashboard");
    },
    
    async getChecklist() {
      return this.request("/api/assistente/checklist");
    },
    
    // Config
    async getConfigInfo() {
      return this.request("/api/config/info");
    },
    
    async getBackup() {
      window.open("/api/config/backup", "_blank");
    },
    
    async getStatus() {
      return this.request("/api/status");
    }
  };

  // =========================
  // Theme Manager
  // =========================
  const Theme = {
    key: "ieq_theme",
    
    init() {
      const saved = localStorage.getItem(this.key);
      if (saved === "dark") this.setDark();
      else this.setLight();
      
      // Detecta preferência do sistema
      window.matchMedia("(prefers-color-scheme: dark)").addListener((e) => {
        if (!localStorage.getItem(this.key)) {
          if (e.matches) this.setDark();
          else this.setLight();
        }
      });
    },
    
    setLight() {
      document.documentElement.setAttribute("data-theme", "light");
      localStorage.setItem(this.key, "light");
      this.updateButton();
    },
    
    setDark() {
      document.documentElement.setAttribute("data-theme", "dark");
      localStorage.setItem(this.key, "dark");
      this.updateButton();
    },
    
    toggle() {
      if (document.documentElement.getAttribute("data-theme") === "dark") {
        this.setLight();
      } else {
        this.setDark();
      }
    },
    
    updateButton() {
      const btn = $("#btn-theme");
      if (btn) {
        const isDark = document.documentElement.getAttribute("data-theme") === "dark";
        btn.innerHTML = isDark ? "☀️ Modo claro" : "🌙 Modo escuro";
      }
    }
  };

  // =========================
  // Sidebar Manager
  // =========================
  const Sidebar = {
    key: "ieq_sidebar_collapsed",
    
    init() {
      const isMobile = window.innerWidth <= 768;
      
      if (isMobile) {
        document.body.classList.remove("sidebar-collapsed");
        this.closeMobile();
      } else {
        const collapsed = localStorage.getItem(this.key) === "true";
        document.body.classList.toggle("sidebar-collapsed", collapsed);
      }
      
      window.addEventListener("resize", debounce(() => this.handleResize(), 100));
    },
    
    toggle() {
      const isMobile = window.innerWidth <= 768;
      
      if (isMobile) {
        document.body.classList.toggle("sidebar-mobile-open");
      } else {
        const collapsed = document.body.classList.contains("sidebar-collapsed");
        document.body.classList.toggle("sidebar-collapsed", !collapsed);
        localStorage.setItem(this.key, !collapsed);
      }
    },
    
    closeMobile() {
      document.body.classList.remove("sidebar-mobile-open");
    },
    
    handleResize() {
      const isMobile = window.innerWidth <= 768;
      
      if (isMobile) {
        document.body.classList.remove("sidebar-collapsed");
        this.closeMobile();
      } else {
        const collapsed = localStorage.getItem(this.key) === "true";
        document.body.classList.toggle("sidebar-collapsed", collapsed);
      }
    }
  };

  // =========================
  // State Management
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
    isLoading: false,
    
    listeners: {},
    
    on(event, callback) {
      if (!this.listeners[event]) this.listeners[event] = [];
      this.listeners[event].push(callback);
    },
    
    off(event, callback) {
      if (!this.listeners[event]) return;
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    },
    
    emit(event, data) {
      if (!this.listeners[event]) return;
      this.listeners[event].forEach(callback => callback(data));
    },
    
    set(key, value) {
      this[key] = value;
      this.emit("change", { key, value });
      this.emit(`change:${key}`, value);
    }
  };

  // =========================
  // Router
  // =========================
  const Router = {
    routes: {
      "home": { title: "Dashboard", component: "HomePage" },
      "aulas": { title: "Iniciar Aula", component: "IniciarAulaPage" },
      "ativa": { title: "Aula Ativa", component: "AulaAtivaPage" },
      "alunos": { title: "Alunos", component: "AlunosPage" },
      "historico": { title: "Histórico", component: "HistoricoPage" },
      "mural": { title: "Mural", component: "MuralPage" },
      "equipe": { title: "Equipe", component: "EquipePage" },
      "assistente": { title: "Assistente", component: "AssistentePage" },
      "config": { title: "Configurações", component: "ConfigPage" }
    },
    
    async go(page, params = {}) {
      if (!this.routes[page]) page = "home";
      
      State.set("currentPage", page);
      State.set("pageParams", params);
      
      const route = this.routes[page];
      document.title = `${route.title} - ${CONFIG.APP_NAME}`;
      
      // Atualiza header
      $("#header-title").textContent = route.title;
      
      // Atualiza nav ativa
      $$(".nav-btn").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.page === page);
      });
      
      // Fecha sidebar no mobile
      Sidebar.closeMobile();
      
      // Renderiza página
      const pageComponent = Pages[route.component];
      if (pageComponent) {
        await pageComponent.render(params);
      }
    }
  };

  // =========================
  // Pages
  // =========================
  const Pages = {
    // Home / Dashboard
    HomePage: {
      async render() {
        try {
          const data = await API.getDashboardStats();
          
          const stats = data.data || {};
          const aniversariantes = stats.aniversariantes || [];
          const ultimasAulas = stats.ultimas_aulas || [];
          
          const html = `
            <div class="dashboard">
              <!-- Stats Cards -->
              <div class="stats-grid">
                <div class="stat-card">
                  <div class="stat-icon">👥</div>
                  <div class="stat-content">
                    <div class="stat-value">${stats.totais?.alunos || 0}</div>
                    <div class="stat-label">Alunos Ativos</div>
                  </div>
                </div>
                
                <div class="stat-card">
                  <div class="stat-icon">👤</div>
                  <div class="stat-content">
                    <div class="stat-value">${stats.totais?.equipe || 0}</div>
                    <div class="stat-label">Equipe</div>
                  </div>
                </div>
                
                <div class="stat-card ${stats.aula_ativa ? 'stat-active' : ''}">
                  <div class="stat-icon">📚</div>
                  <div class="stat-content">
                    <div class="stat-value">${stats.aula_ativa ? 'Sim' : 'Não'}</div>
                    <div class="stat-label">Aula Ativa</div>
                  </div>
                </div>
                
                <div class="stat-card">
                  <div class="stat-icon">✅</div>
                  <div class="stat-content">
                    <div class="stat-value">${stats.totais?.presentes_hoje || 0}</div>
                    <div class="stat-label">Presentes Hoje</div>
                  </div>
                </div>
              </div>
              
              <!-- Ações Rápidas -->
              <div class="quick-actions">
                <h3>Ações Rápidas</h3>
                <div class="actions-grid">
                  <button class="action-card" data-page="aulas">
                    <span class="action-icon">🎓</span>
                    <span class="action-label">Iniciar Aula</span>
                  </button>
                  
                  <button class="action-card" data-page="ativa">
                    <span class="action-icon">✅</span>
                    <span class="action-label">Aula Ativa</span>
                  </button>
                  
                  <button class="action-card" data-page="alunos">
                    <span class="action-icon">👥</span>
                    <span class="action-label">Cadastrar Aluno</span>
                  </button>
                  
                  <button class="action-card" data-page="assistente">
                    <span class="action-icon">🤖</span>
                    <span class="action-label">Assistente</span>
                  </button>
                </div>
              </div>
              
              <div class="dashboard-grid">
                <!-- Aniversariantes -->
                <div class="dashboard-card">
                  <div class="card-header">
                    <h3>🎂 Aniversariantes da Semana</h3>
                  </div>
                  <div class="card-body">
                    ${aniversariantes.length ? `
                      <div class="birthday-list">
                        ${aniversariantes.map(a => `
                          <div class="birthday-item">
                            <span class="birthday-name">${escapeHtml(a.nome)}</span>
                            <span class="birthday-date">${formatDate(a.data_nascimento, "date")}</span>
                          </div>
                        `).join("")}
                      </div>
                    ` : `
                      <p class="empty-message">Nenhum aniversariante esta semana</p>
                    `}
                  </div>
                </div>
                
                <!-- Últimas Aulas -->
                <div class="dashboard-card">
                  <div class="card-header">
                    <h3>📊 Últimas Aulas</h3>
                  </div>
                  <div class="card-body">
                    ${ultimasAulas.length ? `
                      <div class="recent-classes">
                        ${ultimasAulas.map(a => `
                          <div class="recent-class-item">
                            <div class="class-info">
                              <div class="class-tema">${escapeHtml(a.tema || "Sem tema")}</div>
                              <div class="class-meta">${formatDate(a.data_aula)} • ${a.total_presentes || 0} presentes</div>
                            </div>
                            <button class="btn-icon" data-relatorio="${a.id}">📄</button>
                          </div>
                        `).join("")}
                      </div>
                    ` : `
                      <p class="empty-message">Nenhuma aula realizada</p>
                    `}
                  </div>
                </div>
              </div>
            </div>
          `;
          
          $("#page-host").innerHTML = html;
          
          // Event listeners
          $$("[data-page]").forEach(btn => {
            btn.addEventListener("click", () => Router.go(btn.dataset.page));
          });
          
          $$("[data-relatorio]").forEach(btn => {
            btn.addEventListener("click", () => {
              const aulaId = btn.dataset.relatorio;
              Modal.show({
                title: "Relatório da Aula",
                content: "<div class='loading'>Carregando relatório...</div>",
                size: "large"
              });
              
              API.getRelatorio(aulaId, "html").then(result => {
                if (result.isHTML) {
                  Modal.setContent(result.data);
                  Modal.setFooter(`
                    <button class="btn" onclick="window.print()">🖨️ Imprimir</button>
                    <button class="btn" onclick="API.downloadRelatorioCSV(${aulaId})">📥 Download CSV</button>
                    <button class="btn btn-secondary" onclick="Modal.hide()">Fechar</button>
                  `);
                }
              }).catch(err => {
                Modal.setContent(`<p class="error">Erro: ${err.message}</p>`);
              });
            });
          });
          
        } catch (error) {
          Toast.error("Erro ao carregar dashboard");
          $("#page-host").innerHTML = `<p class="error">${error.message}</p>`;
        }
      }
    },
    
    // Iniciar Aula
    IniciarAulaPage: {
      async render() {
        try {
          const equipe = await API.getEquipe();
          const professores = equipe.data?.equipe?.filter(p => 
            p.role === "professor" || p.role === "admin"
          ) || [];
          
          const auxiliares = equipe.data?.equipe?.filter(p => 
            p.role === "auxiliar" || p.role === "professor" || p.role === "admin"
          ) || [];
          
          const html = `
            <div class="page-container">
              <div class="page-header">
                <h2>Iniciar Nova Aula</h2>
                <p class="page-description">Preencha os dados para começar o registro de presença</p>
              </div>
              
              <div class="form-card">
                <div class="form-grid">
                  <div class="form-group">
                    <label>Tema da Aula *</label>
                    <input type="text" id="tema-aula" placeholder="Ex: O Amor de Deus" autocomplete="off">
                  </div>
                  
                  <div class="form-group">
                    <label>Professor Responsável *</label>
                    <select id="professor-id">
                      <option value="">Selecione...</option>
                      ${professores.map(p => `
                        <option value="${p.id}">${escapeHtml(p.nome)}</option>
                      `).join("")}
                    </select>
                  </div>
                  
                  <div class="form-group">
                    <label>Auxiliares</label>
                    <select id="auxiliar-ids" multiple>
                      ${auxiliares.map(p => `
                        <option value="${p.id}">${escapeHtml(p.nome)}</option>
                      `).join("")}
                    </select>
                    <small>Segure Ctrl para selecionar múltiplos</small>
                  </div>
                  
                  <div class="form-group">
                    <label>Observações</label>
                    <textarea id="observacoes-aula" rows="3" placeholder="Materiais necessários, observações importantes..."></textarea>
                  </div>
                </div>
                
                <div class="form-actions">
                  <button class="btn btn-primary" id="btn-iniciar-aula">
                    <span class="btn-icon">🎓</span>
                    Iniciar Aula
                  </button>
                  <button class="btn btn-secondary" onclick="Router.go('home')">Cancelar</button>
                </div>
              </div>
              
              <!-- Sugestões de Tema -->
              <div class="sugestoes-card">
                <h3>Sugestões de Tema</h3>
                <div class="sugestoes-grid">
                  <div class="sugestao-item" data-tema="O Amor de Deus">
                    <span class="sugestao-tema">O Amor de Deus</span>
                    <span class="sugestao-versiculo">1 João 4:19</span>
                  </div>
                  <div class="sugestao-item" data-tema="A Criação">
                    <span class="sugestao-tema">A Criação</span>
                    <span class="sugestao-versiculo">Gênesis 1:1</span>
                  </div>
                  <div class="sugestao-item" data-tema="A Arca de Noé">
                    <span class="sugestao-tema">A Arca de Noé</span>
                    <span class="sugestao-versiculo">Gênesis 6:22</span>
                  </div>
                  <div class="sugestao-item" data-tema="Davi e Golias">
                    <span class="sugestao-tema">Davi e Golias</span>
                    <span class="sugestao-versiculo">1 Samuel 17:45</span>
                  </div>
                </div>
              </div>
            </div>
          `;
          
          $("#page-host").innerHTML = html;
          
          // Eventos
          $("#btn-iniciar-aula").addEventListener("click", async () => {
            const tema = $("#tema-aula").value.trim();
            const professorId = $("#professor-id").value;
            const auxiliarIds = Array.from($("#auxiliar-ids").selectedOptions).map(opt => opt.value);
            const observacoes = $("#observacoes-aula").value.trim();
            
            if (!tema) {
              Toast.error("Tema é obrigatório");
              return;
            }
            
            if (!professorId) {
              Toast.error("Selecione um professor");
              return;
            }
            
            try {
              const result = await API.iniciarAula({
                tema,
                professores_ids: [professorId, ...auxiliarIds],
                observacoes
              });
              
              Toast.success("Aula iniciada com sucesso!");
              Router.go("ativa");
              
            } catch (error) {
              Toast.error(error.message);
            }
          });
          
          // Sugestões de tema
          $$(".sugestao-item").forEach(item => {
            item.addEventListener("click", () => {
              $("#tema-aula").value = item.dataset.tema;
            });
          });
          
        } catch (error) {
          Toast.error("Erro ao carregar página");
          $("#page-host").innerHTML = `<p class="error">${error.message}</p>`;
        }
      }
    },
    
    // Aula Ativa
    AulaAtivaPage: {
      async render() {
        try {
          const data = await API.getAulaAtiva();
          const aula = data.data?.aula;
          const presencas = data.data?.presencas || [];
          
          if (!aula) {
            $("#page-host").innerHTML = `
              <div class="empty-state">
                <div class="empty-icon">📚</div>
                <h3>Nenhuma aula ativa</h3>
                <p>Inicie uma aula para começar o registro de presença</p>
                <button class="btn btn-primary" onclick="Router.go('aulas')">
                  Iniciar Aula
                </button>
              </div>
            `;
            return;
          }
          
          const alunos = State.alunos.length ? State.alunos : (await API.getAlunos()).data?.alunos || [];
          State.set("alunos", alunos);
          
          const presentes = presencas.filter(p => p.entrada_ts).length;
          const saidas = presencas.filter(p => p.saida_ts).length;
          
          const html = `
            <div class="aula-ativa-container">
              <!-- Header da Aula -->
              <div class="aula-header">
                <div class="aula-info">
                  <h2>${escapeHtml(aula.tema)}</h2>
                  <div class="aula-meta">
                    <span>📅 ${formatDate(aula.iniciada_em)}</span>
                    <span>👥 Equipe: ${escapeHtml(aula.professores || "Não definido")}</span>
                  </div>
                </div>
                <button class="btn btn-danger" id="btn-encerrar-aula">
                  <span class="btn-icon">🔒</span>
                  Encerrar Aula
                </button>
              </div>
              
              <!-- Stats da Aula -->
              <div class="aula-stats">
                <div class="stat-mini-card">
                  <div class="stat-mini-value">${presentes}</div>
                  <div class="stat-mini-label">Check-ins</div>
                </div>
                <div class="stat-mini-card">
                  <div class="stat-mini-value">${saidas}</div>
                  <div class="stat-mini-label">Check-outs</div>
                </div>
                <div class="stat-mini-card">
                  <div class="stat-mini-value">${presentes - saidas}</div>
                  <div class="stat-mini-label">Pendentes</div>
                </div>
              </div>
              
              <!-- Ações Rápidas -->
              <div class="aula-acoes-grid">
                <!-- Check-in -->
                <div class="acao-card">
                  <h4>✅ Check-in</h4>
                  <div class="search-select" id="entrada-container">
                    <input type="text" id="busca-aluno-entrada" placeholder="Buscar aluno..." autocomplete="off">
                    <div class="search-results" id="resultados-entrada"></div>
                  </div>
                  <button class="btn btn-success btn-block" id="btn-registrar-entrada">
                    Registrar Entrada
                  </button>
                </div>
                
                <!-- Check-out -->
                <div class="acao-card">
                  <h4>🔓 Check-out</h4>
                  <div class="search-select" id="saida-container">
                    <input type="text" id="busca-aluno-saida" placeholder="Buscar aluno..." autocomplete="off">
                    <div class="search-results" id="resultados-saida"></div>
                  </div>
                  
                  <div class="form-group" id="responsavel-container" style="display: none;">
                    <label>Responsável autorizado</label>
                    <select id="select-responsavel"></select>
                  </div>
                  
                  <button class="btn btn-warning btn-block" id="btn-registrar-saida" style="display: none;">
                    Registrar Saída
                  </button>
                </div>
              </div>
              
              <!-- Lista de Presença -->
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
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${presencas.map(p => `
                        <tr>
                          <td>${escapeHtml(p.aluno_nome)}</td>
                          <td>
                            ${p.entrada_ts ? `
                              <span class="badge badge-success">${formatDate(p.entrada_ts, "time")}</span>
                            ` : `
                              <span class="badge badge-warning">Pendente</span>
                            `}
                          </td>
                          <td>
                            ${p.saida_ts ? `
                              <span class="badge badge-info">${formatDate(p.saida_ts, "time")}</span>
                            ` : `
                              <span class="badge badge-secondary">-</span>
                            `}
                          </td>
                          <td>${escapeHtml(p.retirado_por || "-")}</td>
                          <td>
                            ${!p.entrada_ts ? `
                              <button class="btn-icon" data-entrada="${p.id_aluno}">✅</button>
                            ` : !p.saida_ts ? `
                              <button class="btn-icon" data-saida="${p.id_aluno}">🔓</button>
                            ` : ''}
                          </td>
                        </tr>
                      `).join("")}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          `;
          
          $("#page-host").innerHTML = html;
          
          // Estado da seleção
          let selectedAlunoEntrada = null;
          let selectedAlunoSaida = null;
          
          // Busca para entrada
          const buscaEntrada = $("#busca-aluno-entrada");
          const resultadosEntrada = $("#resultados-entrada");
          
          buscaEntrada.addEventListener("input", debounce(async () => {
            const query = buscaEntrada.value.trim().toLowerCase();
            if (query.length < 2) {
              resultadosEntrada.innerHTML = "";
              return;
            }
            
            const filtered = alunos
              .filter(a => a.nome.toLowerCase().includes(query))
              .slice(0, 10);
            
            resultadosEntrada.innerHTML = filtered.map(a => `
              <div class="search-result-item" data-id="${a.id}" data-nome="${escapeHtml(a.nome)}">
                <span class="result-nome">${escapeHtml(a.nome)}</span>
                ${a.responsavel ? `<small>Resp: ${escapeHtml(a.responsavel)}</small>` : ''}
              </div>
            `).join("");
            
            $$(".search-result-item").forEach(item => {
              item.addEventListener("click", () => {
                selectedAlunoEntrada = {
                  id: parseInt(item.dataset.id),
                  nome: item.dataset.nome
                };
                buscaEntrada.value = item.dataset.nome;
                resultadosEntrada.innerHTML = "";
              });
            });
          }, 300));
          
          // Busca para saída
          const buscaSaida = $("#busca-aluno-saida");
          const resultadosSaida = $("#resultados-saida");
          const responsavelContainer = $("#responsavel-container");
          const selectResponsavel = $("#select-responsavel");
          const btnSaida = $("#btn-registrar-saida");
          
          buscaSaida.addEventListener("input", debounce(async () => {
            const query = buscaSaida.value.trim().toLowerCase();
            if (query.length < 2) {
              resultadosSaida.innerHTML = "";
              return;
            }
            
            const filtered = alunos
              .filter(a => a.nome.toLowerCase().includes(query))
              .slice(0, 10);
            
            resultadosSaida.innerHTML = filtered.map(a => `
              <div class="search-result-item" data-id="${a.id}" data-nome="${escapeHtml(a.nome)}" 
                   data-aut1="${escapeHtml(a.autorizado_retirar || '')}"
                   data-aut2="${escapeHtml(a.autorizado_2 || '')}"
                   data-aut3="${escapeHtml(a.autorizado_3 || '')}">
                <span class="result-nome">${escapeHtml(a.nome)}</span>
              </div>
            `).join("");
            
            $$(".search-result-item").forEach(item => {
              item.addEventListener("click", () => {
                selectedAlunoSaida = {
                  id: parseInt(item.dataset.id),
                  nome: item.dataset.nome,
                  autorizados: [
                    item.dataset.aut1,
                    item.dataset.aut2,
                    item.dataset.aut3
                  ].filter(a => a)
                };
                
                buscaSaida.value = item.dataset.nome;
                resultadosSaida.innerHTML = "";
                
                // Mostra select de responsáveis
                if (selectedAlunoSaida.autorizados.length) {
                  selectResponsavel.innerHTML = `
                    <option value="">Selecione...</option>
                    ${selectedAlunoSaida.autorizados.map(a => `
                      <option value="${escapeHtml(a)}">${escapeHtml(a)}</option>
                    `).join("")}
                  `;
                  responsavelContainer.style.display = "block";
                  btnSaida.style.display = "block";
                } else {
                  Toast.warning("Aluno não tem responsáveis cadastrados");
                  responsavelContainer.style.display = "none";
                  btnSaida.style.display = "none";
                }
              });
            });
          }, 300));
          
          // Registrar entrada
          $("#btn-registrar-entrada").addEventListener("click", async () => {
            if (!selectedAlunoEntrada) {
              Toast.error("Selecione um aluno");
              return;
            }
            
            try {
              await API.registrarEntrada(aula.id, selectedAlunoEntrada.id);
              Toast.success(`Entrada registrada: ${selectedAlunoEntrada.nome}`);
              await this.render(); // Recarrega página
            } catch (error) {
              Toast.error(error.message);
            }
          });
          
          // Registrar saída
          $("#btn-registrar-saida").addEventListener("click", async () => {
            if (!selectedAlunoSaida) {
              Toast.error("Selecione um aluno");
              return;
            }
            
            const responsavel = selectResponsavel.value;
            if (!responsavel) {
              Toast.error("Selecione o responsável");
              return;
            }
            
            try {
              await API.registrarSaida(aula.id, selectedAlunoSaida.id, responsavel);
              Toast.success(`Saída registrada: ${selectedAlunoSaida.nome}`);
              await this.render(); // Recarrega página
            } catch (error) {
              Toast.error(error.message);
            }
          });
          
          // Ações na tabela
          $$("[data-entrada]").forEach(btn => {
            btn.addEventListener("click", async () => {
              const alunoId = parseInt(btn.dataset.entrada);
              const aluno = alunos.find(a => a.id === alunoId);
              if (aluno) {
                try {
                  await API.registrarEntrada(aula.id, alunoId);
                  Toast.success(`Entrada registrada: ${aluno.nome}`);
                  await this.render();
                } catch (error) {
                  Toast.error(error.message);
                }
              }
            });
          });
          
          $$("[data-saida]").forEach(btn => {
            btn.addEventListener("click", async () => {
              const alunoId = parseInt(btn.dataset.saida);
              const aluno = alunos.find(a => a.id === alunoId);
              
              if (aluno) {
                // Modal para escolher responsável
                const autorizados = [
                  aluno.autorizado_retirar,
                  aluno.autorizado_2,
                  aluno.autorizado_3
                ].filter(a => a);
                
                if (!autorizados.length) {
                  Toast.error("Aluno sem responsáveis cadastrados");
                  return;
                }
                
                Modal.show({
                  title: "Registrar Saída",
                  content: `
                    <p>Aluno: <strong>${escapeHtml(aluno.nome)}</strong></p>
                    <div class="form-group">
                      <label>Responsável autorizado</label>
                      <select id="modal-responsavel">
                        <option value="">Selecione...</option>
                        ${autorizados.map(a => `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`).join("")}
                      </select>
                    </div>
                  `,
                  footer: `
                    <button class="btn btn-primary" id="modal-confirmar-saida">Confirmar Saída</button>
                    <button class="btn btn-secondary" onclick="Modal.hide()">Cancelar</button>
                  `
                });
                
                $("#modal-confirmar-saida").addEventListener("click", async () => {
                  const responsavel = $("#modal-responsavel").value;
                  if (!responsavel) {
                    Toast.error("Selecione o responsável");
                    return;
                  }
                  
                  try {
                    await API.registrarSaida(aula.id, alunoId, responsavel);
                    Modal.hide();
                    Toast.success(`Saída registrada: ${aluno.nome}`);
                    await this.render();
                  } catch (error) {
                    Toast.error(error.message);
                  }
                });
              }
            });
          });
          
          // Encerrar aula
          $("#btn-encerrar-aula").addEventListener("click", async () => {
            if (!confirm("Tem certeza que deseja encerrar esta aula?")) return;
            
            try {
              await API.encerrarAula(aula.id);
              Toast.success("Aula encerrada com sucesso");
              Router.go("historico");
            } catch (error) {
              Toast.error(error.message);
            }
          });
          
        } catch (error) {
          Toast.error("Erro ao carregar aula ativa");
          $("#page-host").innerHTML = `<p class="error">${error.message}</p>`;
        }
      }
    },
    
    // Alunos
    AlunosPage: {
      async render() {
        try {
          const search = State.pageParams?.search || "";
          const data = await API.getAlunos(search);
          const alunos = data.data?.alunos || [];
          State.set("alunos", alunos);
          
          const html = `
            <div class="page-container">
              <div class="page-header">
                <div class="header-title">
                  <h2>Alunos</h2>
                  <p class="page-description">${alunos.length} aluno(s) cadastrado(s)</p>
                </div>
                <button class="btn btn-primary" id="btn-novo-aluno">
                  <span class="btn-icon">➕</span>
                  Novo Aluno
                </button>
              </div>
              
              <!-- Barra de Pesquisa -->
              <div class="search-bar">
                <input type="text" id="search-alunos" placeholder="Buscar por nome, responsável ou telefone..." 
                       value="${escapeHtml(search)}">
                <button class="btn btn-search" id="btn-search">
                  <span class="btn-icon">🔍</span>
                </button>
              </div>
              
              <!-- Lista de Alunos -->
              <div class="alunos-grid">
                ${alunos.map(aluno => `
                  <div class="aluno-card" data-id="${aluno.id}">
                    <div class="aluno-avatar">
                      ${aluno.foto ? `
                        <img src="${aluno.foto}" alt="${escapeHtml(aluno.nome)}">
                      ` : `
                        <div class="avatar-placeholder">
                          ${aluno.nome.charAt(0).toUpperCase()}
                        </div>
                      `}
                    </div>
                    <div class="aluno-info">
                      <h4>${escapeHtml(aluno.nome)}</h4>
                      <div class="aluno-detalhes">
                        ${aluno.responsavel ? `
                          <div class="aluno-detail">
                            <span class="detail-label">Responsável:</span>
                            <span>${escapeHtml(aluno.responsavel)}</span>
                          </div>
                        ` : ''}
                        ${aluno.telefone ? `
                          <div class="aluno-detail">
                            <span class="detail-label">Telefone:</span>
                            <span>${formatPhone(aluno.telefone)}</span>
                          </div>
                        ` : ''}
                        ${aluno.data_nascimento ? `
                          <div class="aluno-detail">
                            <span class="detail-label">Nascimento:</span>
                            <span>${formatDate(aluno.data_nascimento, "date")}</span>
                          </div>
                        ` : ''}
                      </div>
                    </div>
                    <div class="aluno-actions">
                      <button class="btn-icon" data-visualizar="${aluno.id}" title="Visualizar">👁️</button>
                      <button class="btn-icon" data-editar="${aluno.id}" title="Editar">✏️</button>
                      <button class="btn-icon btn-danger" data-excluir="${aluno.id}" title="Excluir">🗑️</button>
                    </div>
                  </div>
                `).join("")}
              </div>
            </div>
          `;
          
          $("#page-host").innerHTML = html;
          
          // Busca
          const buscaInput = $("#search-alunos");
          buscaInput.addEventListener("keyup", (e) => {
            if (e.key === "Enter") {
              Router.go("alunos", { search: buscaInput.value });
            }
          });
          
          $("#btn-search").addEventListener("click", () => {
            Router.go("alunos", { search: buscaInput.value });
          });
          
          // Novo aluno
          $("#btn-novo-aluno").addEventListener("click", () => this.abrirModalAluno());
          
          // Ações nos cards
          $$("[data-visualizar]").forEach(btn => {
            btn.addEventListener("click", () => {
              const id = parseInt(btn.dataset.visualizar);
              this.visualizarAluno(id);
            });
          });
          
          $$("[data-editar]").forEach(btn => {
            btn.addEventListener("click", () => {
              const id = parseInt(btn.dataset.editar);
              this.abrirModalAluno(id);
            });
          });
          
          $$("[data-excluir]").forEach(btn => {
            btn.addEventListener("click", async () => {
              const id = parseInt(btn.dataset.excluir);
              const aluno = alunos.find(a => a.id === id);
              
              if (confirm(`Tem certeza que deseja excluir ${aluno.nome}?`)) {
                try {
                  await API.deleteAluno(id);
                  Toast.success("Aluno excluído com sucesso");
                  await this.render();
                } catch (error) {
                  Toast.error(error.message);
                }
              }
            });
          });
          
        } catch (error) {
          Toast.error("Erro ao carregar alunos");
          $("#page-host").innerHTML = `<p class="error">${error.message}</p>`;
        }
      },
      
      abrirModalAluno(id = null) {
        const aluno = id ? State.alunos.find(a => a.id === id) : null;
        
        const html = `
          <form id="form-aluno" class="form-aluno">
            <div class="form-grid">
              <div class="form-group full-width">
                <label>Nome Completo *</label>
                <input type="text" id="aluno-nome" value="${escapeHtml(aluno?.nome || '')}" required>
              </div>
              
              <div class="form-group">
                <label>Data de Nascimento</label>
                <input type="text" id="aluno-nascimento" value="${escapeHtml(aluno?.data_nascimento || '')}" 
                       placeholder="DD/MM/AAAA">
              </div>
              
              <div class="form-group">
                <label>Responsável</label>
                <input type="text" id="aluno-responsavel" value="${escapeHtml(aluno?.responsavel || '')}">
              </div>
              
              <div class="form-group">
                <label>Telefone</label>
                <input type="text" id="aluno-telefone" value="${escapeHtml(aluno?.telefone || '')}" 
                       placeholder="(99) 99999-9999">
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
              
              <div class="form-group full-width">
                <label>Observações</label>
                <textarea id="aluno-observacoes" rows="3">${escapeHtml(aluno?.observacoes || '')}</textarea>
              </div>
              
              <div class="form-group full-width">
                <label>Foto</label>
                <input type="file" id="aluno-foto" accept="image/*">
                ${aluno?.foto ? `
                  <div class="foto-preview">
                    <img src="${aluno.foto}" alt="Preview">
                    <button type="button" class="btn-icon" id="remover-foto">🗑️</button>
                  </div>
                ` : ''}
              </div>
            </div>
          </form>
        `;
        
        Modal.show({
          title: id ? "Editar Aluno" : "Novo Aluno",
          content: html,
          size: "large",
          footer: `
            <button class="btn btn-primary" id="modal-salvar-aluno">Salvar</button>
            <button class="btn btn-secondary" onclick="Modal.hide()">Cancelar</button>
          `
        });
        
        // Upload de foto
        const fotoInput = $("#aluno-foto");
        if (fotoInput) {
          fotoInput.addEventListener("change", async (e) => {
            const file = e.target.files[0];
            if (file) {
              try {
                const base64 = await fileToBase64(file);
                // Armazena temporariamente
                fotoInput.dataset.base64 = base64;
              } catch (error) {
                Toast.error(error.message);
                fotoInput.value = "";
              }
            }
          });
        }
        
        // Remover foto
        const removerFoto = $("#remover-foto");
        if (removerFoto) {
          removerFoto.addEventListener("click", () => {
            const preview = removerFoto.closest(".foto-preview");
            preview.remove();
            // Marca para remover
            const input = $("#aluno-foto");
            if (input) input.dataset.remover = "true";
          });
        }
        
        // Salvar
        $("#modal-salvar-aluno").addEventListener("click", async () => {
          const data = {
            nome: $("#aluno-nome").value.trim(),
            data_nascimento: $("#aluno-nascimento").value.trim(),
            responsavel: $("#aluno-responsavel").value.trim(),
            telefone: $("#aluno-telefone").value.trim(),
            autorizado_retirar: $("#aluno-aut1").value.trim(),
            autorizado_2: $("#aluno-aut2").value.trim(),
            autorizado_3: $("#aluno-aut3").value.trim(),
            observacoes: $("#aluno-observacoes").value.trim()
          };
          
          if (!data.nome) {
            Toast.error("Nome é obrigatório");
            return;
          }
          
          // Foto
          const fotoInput = $("#aluno-foto");
          if (fotoInput?.dataset.base64) {
            data.foto = fotoInput.dataset.base64;
          } else if (fotoInput?.dataset.remover) {
            data.foto = null;
          }
          
          try {
            if (id) {
              await API.updateAluno(id, data);
              Toast.success("Aluno atualizado com sucesso");
            } else {
              await API.createAluno(data);
              Toast.success("Aluno cadastrado com sucesso");
            }
            
            Modal.hide();
            await this.render();
            
          } catch (error) {
            Toast.error(error.message);
          }
        });
      },
      
      async visualizarAluno(id) {
        try {
          const data = await API.getAluno(id);
          const aluno = data.data?.aluno;
          
          if (!aluno) return;
          
          const autorizados = [
            aluno.autorizado_retirar,
            aluno.autorizado_2,
            aluno.autorizado_3
          ].filter(a => a);
          
          const html = `
            <div class="aluno-visualizacao">
              <div class="vis-header">
                <div class="vis-avatar">
                  ${aluno.foto ? `
                    <img src="${aluno.foto}" alt="${escapeHtml(aluno.nome)}">
                  ` : `
                    <div class="avatar-large">${aluno.nome.charAt(0).toUpperCase()}</div>
                  `}
                </div>
                <div class="vis-titulo">
                  <h3>${escapeHtml(aluno.nome)}</h3>
                  <p>ID: ${aluno.id}</p>
                </div>
              </div>
              
              <div class="vis-info-grid">
                <div class="vis-info-item">
                  <span class="vis-label">Data Nascimento</span>
                  <span class="vis-value">${formatDate(aluno.data_nascimento, "date") || "-"}</span>
                </div>
                
                <div class="vis-info-item">
                  <span class="vis-label">Responsável</span>
                  <span class="vis-value">${escapeHtml(aluno.responsavel) || "-"}</span>
                </div>
                
                <div class="vis-info-item">
                  <span class="vis-label">Telefone</span>
                  <span class="vis-value">${formatPhone(aluno.telefone) || "-"}</span>
                </div>
                
                <div class="vis-info-item full-width">
                  <span class="vis-label">Autorizados a Retirar</span>
                  <span class="vis-value">
                    ${autorizados.length ? autorizados.map(a => `
                      <span class="badge badge-info">${escapeHtml(a)}</span>
                    `).join("") : "-"}
                  </span>
                </div>
                
                ${aluno.observacoes ? `
                  <div class="vis-info-item full-width">
                    <span class="vis-label">Observações</span>
                    <span class="vis-value">${escapeHtml(aluno.observacoes)}</span>
                  </div>
                ` : ''}
              </div>
            </div>
          `;
          
          Modal.show({
            title: "Detalhes do Aluno",
            content: html,
            size: "medium",
            footer: `
              <button class="btn" onclick="Pages.AlunosPage.abrirModalAluno(${id})">Editar</button>
              <button class="btn btn-secondary" onclick="Modal.hide()">Fechar</button>
            `
          });
          
        } catch (error) {
          Toast.error("Erro ao carregar aluno");
        }
      }
    },
    
    // Histórico
    HistoricoPage: {
      async render() {
        try {
          const data = await API.getHistorico();
          const historico = data.data?.historico || [];
          
          const html = `
            <div class="page-container">
              <div class="page-header">
                <h2>Histórico de Aulas</h2>
                <p class="page-description">${historico.length} aula(s) realizadas</p>
              </div>
              
              <div class="historico-grid">
                ${historico.map(aula => `
                  <div class="historico-card" data-aula="${aula.id}">
                    <div class="historico-header">
                      <span class="historico-data">${formatDate(aula.encerrada_em || aula.data_aula)}</span>
                      <span class="badge badge-primary">${aula.total_presentes || 0} presentes</span>
                    </div>
                    
                    <h4>${escapeHtml(aula.tema || "Sem tema")}</h4>
                    
                    <div class="historico-equipe">
                      <small>👥 ${escapeHtml(aula.professores || "Equipe não registrada")}</small>
                    </div>
                    
                    <div class="historico-acoes">
                      <button class="btn-icon" data-relatorio="${aula.id}" title="Ver relatório">📄</button>
                      <button class="btn-icon" data-csv="${aula.id}" title="Download CSV">📥</button>
                    </div>
                  </div>
                `).join("")}
              </div>
            </div>
          `;
          
          $("#page-host").innerHTML = html;
          
          // Relatório
          $$("[data-relatorio]").forEach(btn => {
            btn.addEventListener("click", () => {
              const aulaId = btn.dataset.relatorio;
              Modal.show({
                title: "Relatório da Aula",
                content: "<div class='loading'>Carregando relatório...</div>",
                size: "large"
              });
              
              API.getRelatorio(aulaId, "html").then(result => {
                if (result.isHTML) {
                  Modal.setContent(result.data);
                  Modal.setFooter(`
                    <button class="btn" onclick="window.print()">🖨️ Imprimir</button>
                    <button class="btn" onclick="API.downloadRelatorioCSV(${aulaId})">📥 Download CSV</button>
                    <button class="btn btn-secondary" onclick="Modal.hide()">Fechar</button>
                  `);
                }
              }).catch(err => {
                Modal.setContent(`<p class="error">Erro: ${err.message}</p>`);
              });
            });
          });
          
          // CSV
          $$("[data-csv]").forEach(btn => {
            btn.addEventListener("click", () => {
              API.downloadRelatorioCSV(btn.dataset.csv);
            });
          });
          
        } catch (error) {
          Toast.error("Erro ao carregar histórico");
          $("#page-host").innerHTML = `<p class="error">${error.message}</p>`;
        }
      }
    },
    
    // Mural
    MuralPage: {
      async render() {
        try {
          const data = await API.getMural();
          const avisos = data.data?.avisos || [];
          const isAdmin = State.user?.role === "admin";
          
          const html = `
            <div class="page-container">
              <div class="page-header">
                <h2>Mural de Avisos</h2>
                <button class="btn btn-primary" id="btn-novo-aviso">
                  <span class="btn-icon">➕</span>
                  Novo Aviso
                </button>
              </div>
              
              <div class="mural-grid">
                ${avisos.map(aviso => `
                  <div class="aviso-card ${aviso.fixado ? 'aviso-fixado' : ''}" data-id="${aviso.id}">
                    ${aviso.fixado ? '<div class="fixado-badge">📌 Fixado</div>' : ''}
                    
                    <div class="aviso-header">
                      <div class="aviso-autor">
                        <strong>${escapeHtml(aviso.autor_nome || aviso.autor || "Sistema")}</strong>
                        <span class="aviso-data">${formatDate(aviso.data_criacao)}</span>
                      </div>
                      
                      ${isAdmin ? `
                        <div class="aviso-admin-actions">
                          <button class="btn-icon" data-fixar="${aviso.id}" data-fixado="${aviso.fixado}">
                            ${aviso.fixado ? '📌' : '📍'}
                          </button>
                          <button class="btn-icon btn-danger" data-excluir="${aviso.id}">🗑️</button>
                        </div>
                      ` : ''}
                    </div>
                    
                    ${aviso.mensagem ? `
                      <div class="aviso-mensagem">${escapeHtml(aviso.mensagem).replace(/\n/g, '<br>')}</div>
                    ` : ''}
                    
                    ${aviso.imagem ? `
                      <img class="aviso-imagem" src="${aviso.imagem}" alt="Imagem do aviso">
                    ` : ''}
                    
                    <div class="aviso-stats">
                      <button class="btn-like ${aviso.liked_by_me ? 'liked' : ''}" data-like="${aviso.id}">
                        ❤️ <span class="like-count">${aviso.total_likes || 0}</span>
                      </button>
                      <span class="comment-count">💬 ${aviso.total_comentarios || 0}</span>
                    </div>
                    
                    <!-- Comentários -->
                    <div class="aviso-comentarios">
                      ${(aviso.comentarios || []).map(com => `
                        <div class="comentario">
                          <strong>${escapeHtml(com.usuario_nome || com.usuario)}:</strong>
                          <span>${escapeHtml(com.comentario)}</span>
                          <small>${formatDate(com.criado_em, "time")}</small>
                        </div>
                      `).join("")}
                    </div>
                    
                    <!-- Novo comentário -->
                    <div class="novo-comentario">
                      <input type="text" class="comentario-input" placeholder="Escreva um comentário..." 
                             data-comentario="${aviso.id}">
                      <button class="btn-icon btn-enviar-comentario" data-enviar="${aviso.id}">➡️</button>
                    </div>
                  </div>
                `).join("")}
              </div>
            </div>
          `;
          
          $("#page-host").innerHTML = html;
          
          // Novo aviso
          $("#btn-novo-aviso").addEventListener("click", () => this.novoAviso());
          
          // Likes
          $$("[data-like]").forEach(btn => {
            btn.addEventListener("click", async () => {
              const avisoId = parseInt(btn.dataset.like);
              try {
                const result = await API.toggleLike(avisoId);
                const likeCount = btn.querySelector(".like-count");
                if (likeCount) {
                  likeCount.textContent = result.data?.total_likes || 0;
                }
                btn.classList.toggle("liked", result.data?.liked);
              } catch (error) {
                Toast.error("Erro ao curtir");
              }
            });
          });
          
          // Comentários
          $$(".btn-enviar-comentario").forEach(btn => {
            btn.addEventListener("click", async () => {
              const avisoId = parseInt(btn.dataset.enviar);
              const input = $(`[data-comentario="${avisoId}"]`);
              const comentario = input.value.trim();
              
              if (!comentario) return;
              
              try {
                await API.comentar(avisoId, comentario);
                input.value = "";
                await this.render(); // Recarrega para mostrar comentário
              } catch (error) {
                Toast.error("Erro ao comentar");
              }
            });
          });
          
          // Enter no comentário
          $$(".comentario-input").forEach(input => {
            input.addEventListener("keypress", async (e) => {
              if (e.key === "Enter") {
                const avisoId = parseInt(input.dataset.comentario);
                const comentario = input.value.trim();
                
                if (!comentario) return;
                
                try {
                  await API.comentar(avisoId, comentario);
                  input.value = "";
                  await this.render();
                } catch (error) {
                  Toast.error("Erro ao comentar");
                }
              }
            });
          });
          
          // Admin actions
          if (isAdmin) {
            $$("[data-fixar]").forEach(btn => {
              btn.addEventListener("click", async () => {
                const avisoId = parseInt(btn.dataset.fixar);
                const fixado = btn.dataset.fixado === "true";
                
                try {
                  await API.fixarAviso(avisoId, !fixado);
                  Toast.success(fixado ? "Aviso desafixado" : "Aviso fixado");
                  await this.render();
                } catch (error) {
                  Toast.error("Erro ao fixar aviso");
                }
              });
            });
            
            $$("[data-excluir]").forEach(btn => {
              btn.addEventListener("click", async () => {
                if (!confirm("Tem certeza que deseja excluir este aviso?")) return;
                
                const avisoId = parseInt(btn.dataset.excluir);
                try {
                  await API.deletarAviso(avisoId);
                  Toast.success("Aviso excluído");
                  await this.render();
                } catch (error) {
                  Toast.error("Erro ao excluir aviso");
                }
              });
            });
          }
          
        } catch (error) {
          Toast.error("Erro ao carregar mural");
          $("#page-host").innerHTML = `<p class="error">${error.message}</p>`;
        }
      },
      
      novoAviso() {
        const html = `
          <form id="form-aviso">
            <div class="form-group">
              <label>Mensagem</label>
              <textarea id="aviso-mensagem" rows="4" placeholder="Escreva seu aviso..."></textarea>
            </div>
            
            <div class="form-group">
              <label>Imagem (opcional)</label>
              <input type="file" id="aviso-imagem" accept="image/*">
            </div>
          </form>
        `;
        
        Modal.show({
          title: "Novo Aviso",
          content: html,
          size: "medium",
          footer: `
            <button class="btn btn-primary" id="modal-publicar">Publicar</button>
            <button class="btn btn-secondary" onclick="Modal.hide()">Cancelar</button>
          `
        });
        
        // Upload imagem
        const imagemInput = $("#aviso-imagem");
        if (imagemInput) {
          imagemInput.addEventListener("change", async (e) => {
            const file = e.target.files[0];
            if (file) {
              try {
                const base64 = await fileToBase64(file);
                imagemInput.dataset.base64 = base64;
              } catch (error) {
                Toast.error(error.message);
                imagemInput.value = "";
              }
            }
          });
        }
        
        $("#modal-publicar").addEventListener("click", async () => {
          const data = {
            mensagem: $("#aviso-mensagem").value.trim()
          };
          
          if (imagemInput?.dataset.base64) {
            data.imagem = imagemInput.dataset.base64;
          }
          
          if (!data.mensagem && !data.imagem) {
            Toast.error("Mensagem ou imagem é obrigatória");
            return;
          }
          
          try {
            await API.criarAviso(data);
            Modal.hide();
            Toast.success("Aviso publicado com sucesso");
            await this.render();
          } catch (error) {
            Toast.error(error.message);
          }
        });
      }
    },
    
    // Equipe
    EquipePage: {
      async render() {
        try {
          const data = await API.getEquipe();
          const equipe = data.data?.equipe || [];
          const isAdmin = State.user?.role === "admin";
          
          const html = `
            <div class="page-container">
              <div class="page-header">
                <h2>Equipe</h2>
                ${isAdmin ? `
                  <button class="btn btn-primary" id="btn-novo-membro">
                    <span class="btn-icon">➕</span>
                    Novo Membro
                  </button>
                ` : ''}
              </div>
              
              <div class="equipe-grid">
                ${equipe.map(membro => `
                  <div class="membro-card">
                    <div class="membro-avatar">
                      ${membro.foto ? `
                        <img src="${membro.foto}" alt="${escapeHtml(membro.nome)}">
                      ` : `
                        <div class="avatar-placeholder">
                          ${membro.nome.charAt(0).toUpperCase()}
                        </div>
                      `}
                    </div>
                    
                    <div class="membro-info">
                      <h4>${escapeHtml(membro.nome)}</h4>
                      <p class="membro-usuario">@${escapeHtml(membro.usuario)}</p>
                      <span class="badge badge-${membro.role}">${escapeHtml(membro.role)}</span>
                    </div>
                    
                    ${isAdmin && membro.usuario !== "admin" ? `
                      <div class="membro-actions">
                        <button class="btn-icon btn-danger" data-excluir="${membro.id}">🗑️</button>
                      </div>
                    ` : ''}
                  </div>
                `).join("")}
              </div>
            </div>
          `;
          
          $("#page-host").innerHTML = html;
          
          if (isAdmin) {
            $("#btn-novo-membro").addEventListener("click", () => this.novoMembro());
            
            $$("[data-excluir]").forEach(btn => {
              btn.addEventListener("click", async () => {
                const id = parseInt(btn.dataset.excluir);
                if (!confirm("Tem certeza que deseja excluir este membro?")) return;
                
                try {
                  await API.deleteMembro(id);
                  Toast.success("Membro removido com sucesso");
                  await this.render();
                } catch (error) {
                  Toast.error(error.message);
                }
              });
            });
          }
          
        } catch (error) {
          Toast.error("Erro ao carregar equipe");
          $("#page-host").innerHTML = `<p class="error">${error.message}</p>`;
        }
      },
      
      novoMembro() {
        const html = `
          <form id="form-membro">
            <div class="form-group">
              <label>Nome Completo *</label>
              <input type="text" id="membro-nome" required>
            </div>
            
            <div class="form-group">
              <label>Usuário *</label>
              <input type="text" id="membro-usuario" required>
            </div>
            
            <div class="form-group">
              <label>Senha *</label>
              <input type="password" id="membro-senha" required>
            </div>
            
            <div class="form-group">
              <label>Função</label>
              <select id="membro-role">
                <option value="auxiliar">Auxiliar</option>
                <option value="professor">Professor</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
            
            <div class="form-group">
              <label>Foto (opcional)</label>
              <input type="file" id="membro-foto" accept="image/*">
            </div>
          </form>
        `;
        
        Modal.show({
          title: "Novo Membro da Equipe",
          content: html,
          size: "medium",
          footer: `
            <button class="btn btn-primary" id="modal-salvar-membro">Salvar</button>
            <button class="btn btn-secondary" onclick="Modal.hide()">Cancelar</button>
          `
        });
        
        // Upload foto
        const fotoInput = $("#membro-foto");
        if (fotoInput) {
          fotoInput.addEventListener("change", async (e) => {
            const file = e.target.files[0];
            if (file) {
              try {
                const base64 = await fileToBase64(file);
                fotoInput.dataset.base64 = base64;
              } catch (error) {
                Toast.error(error.message);
                fotoInput.value = "";
              }
            }
          });
        }
        
        $("#modal-salvar-membro").addEventListener("click", async () => {
          const data = {
            nome: $("#membro-nome").value.trim(),
            usuario: $("#membro-usuario").value.trim(),
            senha: $("#membro-senha").value,
            role: $("#membro-role").value
          };
          
          if (fotoInput?.dataset.base64) {
            data.foto = fotoInput.dataset.base64;
          }
          
          if (!data.nome || !data.usuario || !data.senha) {
            Toast.error("Preencha todos os campos obrigatórios");
            return;
          }
          
          try {
            await API.createMembro(data);
            Modal.hide();
            Toast.success("Membro cadastrado com sucesso");
            await this.render();
          } catch (error) {
            Toast.error(error.message);
          }
        });
      }
    },
    
    // Assistente
    AssistentePage: {
      async render() {
        try {
          const [dashboard, checklist] = await Promise.all([
            API.getAssistenteDashboard(),
            API.getChecklist()
          ]);
          
          const dados = dashboard.data || {};
          const checklistItems = checklist.data?.checklist || [];
          
          const html = `
            <div class="page-container">
              <h2>Assistente Ministerial</h2>
              
              <!-- Checklist de Segurança -->
              <div class="assistente-section">
                <h3>✅ Checklist de Segurança</h3>
                <div class="checklist-grid">
                  ${checklistItems.map(item => `
                    <div class="checklist-item checklist-${item.tipo}">
                      <div class="checklist-status">${item.status ? '✅' : '⚠️'}</div>
                      <div class="checklist-content">
                        <strong>${escapeHtml(item.item)}</strong>
                        <p>${escapeHtml(item.mensagem)}</p>
                      </div>
                    </div>
                  `).join("")}
                </div>
              </div>
              
              <!-- Aniversariantes da Semana -->
              <div class="assistente-section">
                <h3>🎂 Aniversariantes da Semana</h3>
                <div class="aniversariantes-list">
                  ${(dados.aniversariantes_semana || []).map(a => `
                    <div class="aniversariante-item">
                      <span class="aniversariante-nome">${escapeHtml(a.nome)}</span>
                      <span class="aniversariante-data">${formatDate(a.data_nascimento, "date")}</span>
                    </div>
                  `).join("") || '<p class="empty-message">Nenhum aniversariante esta semana</p>'}
                </div>
              </div>
              
              <!-- Alunos Faltosos -->
              <div class="assistente-section">
                <h3>⚠️ Alunos sem presença (últimas 4 aulas)</h3>
                <div class="faltosos-list">
                  ${(dados.alunos_faltosos || []).map(a => `
                    <div class="faltoso-item">
                      <span class="faltoso-nome">${escapeHtml(a.nome)}</span>
                      ${a.telefones?.[0] ? `
                        <a href="https://wa.me/55${a.telefones[0].replace(/\D/g, '')}" 
                           target="_blank" class="btn-whatsapp">
                          📱 WhatsApp
                        </a>
                      ` : ''}
                    </div>
                  `).join("") || '<p class="empty-message">Nenhum aluno faltoso</p>'}
                </div>
              </div>
              
              <!-- Sugestões de Tema -->
              <div class="assistente-section">
                <h3>💡 Sugestões de Tema</h3>
                <div class="sugestoes-temas">
                  ${(dados.sugestoes_tema || []).map(s => `
                    <div class="tema-card" data-tema="${escapeHtml(s.tema)}">
                      <h4>${escapeHtml(s.tema)}</h4>
                      <p>${escapeHtml(s.versiculo)}</p>
                      <small>${escapeHtml(s.atividade)}</small>
                    </div>
                  `).join("")}
                </div>
              </div>
            </div>
          `;
          
          $("#page-host").innerHTML = html;
          
          // Clique nos temas
          $$(".tema-card").forEach(card => {
            card.addEventListener("click", () => {
              Router.go("aulas");
              // Preenche o tema depois de navegar
              setTimeout(() => {
                const input = $("#tema-aula");
                if (input) input.value = card.dataset.tema;
              }, 500);
            });
          });
          
        } catch (error) {
          Toast.error("Erro ao carregar assistente");
          $("#page-host").innerHTML = `<p class="error">${error.message}</p>`;
        }
      }
    },
    
    // Configurações
    ConfigPage: {
      async render() {
        try {
          const data = await API.getConfigInfo();
          const info = data.data || {};
          
          const html = `
            <div class="page-container">
              <h2>Configurações</h2>
              
              <div class="config-grid">
                <!-- Sobre o App -->
                <div class="config-card">
                  <h3>ℹ️ Sobre o Sistema</h3>
                  <div class="config-info">
                    <p><strong>Nome:</strong> ${escapeHtml(info.app?.nome || CONFIG.APP_NAME)}</p>
                    <p><strong>Versão:</strong> ${escapeHtml(info.app?.versao || CONFIG.APP_VERSION)}</p>
                    <p><strong>Ambiente:</strong> <span class="badge badge-${info.app?.ambiente}">${escapeHtml(info.app?.ambiente || 'production')}</span></p>
                    <p><strong>Desenvolvido por:</strong> ${escapeHtml(info.app?.desenvolvido_por || 'Equipe IEQ Central')}</p>
                    <p><strong>© ${info.app?.ano || new Date().getFullYear()}</strong></p>
                  </div>
                </div>
                
                <!-- Estatísticas Técnicas -->
                <div class="config-card">
                  <h3>📊 Estatísticas Técnicas</h3>
                  <div class="config-info">
                    <p><strong>Python:</strong> ${escapeHtml(info.estatisticas?.python_version || '-')}</p>
                    <p><strong>Flask:</strong> ${escapeHtml(info.estatisticas?.flask_version || '-')}</p>
                    <p><strong>Banco de Dados:</strong> ${escapeHtml(info.estatisticas?.database || '-')}</p>
                  </div>
                </div>
                
                <!-- Links Úteis -->
                <div class="config-card">
                  <h3>🔗 Links Úteis</h3>
                  <div class="config-links">
                    <a href="${escapeHtml(info.links?.manual || '#')}" target="_blank" class="config-link">
                      📚 Manual do Usuário
                    </a>
                    <a href="${escapeHtml(info.links?.suporte || '#')}" class="config-link">
                      📧 Suporte Técnico
                    </a>
                    <a href="${escapeHtml(info.links?.site || '#')}" target="_blank" class="config-link">
                      🌐 Site Oficial
                    </a>
                  </div>
                </div>
                
                <!-- Backup -->
                <div class="config-card">
                  <h3>💾 Backup de Dados</h3>
                  <p class="config-description">Faça o backup completo do sistema para segurança</p>
                  <button class="btn btn-primary" id="btn-backup">
                    <span class="btn-icon">📥</span>
                    Gerar Backup
                  </button>
                </div>
                
                <!-- Aparência -->
                <div class="config-card">
                  <h3>🎨 Aparência</h3>
                  <p class="config-description">Alterne entre tema claro e escuro</p>
                  <button class="btn" id="btn-theme">
                    🌙 Modo escuro
                  </button>
                </div>
                
                <!-- Sessão -->
                <div class="config-card">
                  <h3>🔐 Sessão</h3>
                  <p class="config-description">Usuário: <strong>${escapeHtml(State.user?.nome || '')}</strong></p>
                  <p class="config-description">Função: <span class="badge badge-${State.user?.role}">${escapeHtml(State.user?.role || '')}</span></p>
                  <button class="btn btn-danger" id="btn-logout">
                    <span class="btn-icon">🚪</span>
                    Sair do Sistema
                  </button>
                </div>
              </div>
            </div>
          `;
          
          $("#page-host").innerHTML = html;
          
          // Backup
          $("#btn-backup").addEventListener("click", () => {
            API.getBackup();
          });
          
          // Theme
          $("#btn-theme").addEventListener("click", () => {
            Theme.toggle();
          });
          Theme.updateButton();
          
          // Logout
          $("#btn-logout").addEventListener("click", () => {
            if (confirm("Tem certeza que deseja sair?")) {
              Auth.logout();
            }
          });
          
        } catch (error) {
          Toast.error("Erro ao carregar configurações");
          $("#page-host").innerHTML = `<p class="error">${error.message}</p>`;
        }
      }
    }
  };

  // =========================
  // Auth Manager
  // =========================
  const Auth = {
    async checkAuth() {
      const token = API.token;
      if (!token) return false;
      
      try {
        const data = await API.getMe();
        if (data.success) {
          State.set("user", data.data.user);
          return true;
        }
        return false;
      } catch {
        return false;
      }
    },
    
    async login(usuario, senha) {
      try {
        const data = await API.login(usuario, senha);
        if (data.success) {
          API.token = data.data.token;
          State.set("user", data.data.user);
          Toast.success(`Bem-vindo, ${data.data.user.nome}!`);
          return true;
        }
        return false;
      } catch (error) {
        Toast.error(error.message);
        return false;
      }
    },
    
    logout() {
      API.token = null;
      State.set("user", null);
      window.location.reload();
    },
    
    showLogin() {
      $("#app").style.display = "none";
      $("#login").style.display = "flex";
      
      $("#btn-login").addEventListener("click", async () => {
        const usuario = $("#login-user").value.trim();
        const senha = $("#login-pass").value;
        
        if (!usuario || !senha) {
          Toast.error("Usuário e senha obrigatórios");
          return;
        }
        
        const success = await this.login(usuario, senha);
        if (success) {
          $("#login").style.display = "none";
          $("#app").style.display = "grid";
          Router.go("home");
        }
      });
      
      // Enter nos inputs
      $("#login-pass").addEventListener("keypress", (e) => {
        if (e.key === "Enter") $("#btn-login").click();
      });
    }
  };

  // =========================
  // Initialization
  // =========================
  async function init() {
    // Inicializa componentes
    Toast.init();
    Theme.init();
    Sidebar.init();
    
    // Botão burger
    $("#btn-burger").addEventListener("click", () => Sidebar.toggle());
    
    // Overlay
    $("#side-overlay").addEventListener("click", () => Sidebar.closeMobile());
    
    // Verifica autenticação
    const isAuthenticated = await Auth.checkAuth();
    
    if (isAuthenticated) {
      $("#login").style.display = "none";
      $("#app").style.display = "grid";
      
      // Atualiza sidebar com nome do usuário
      if (State.user) {
        $("#side-user-name").textContent = State.user.nome;
        $("#side-user-role").textContent = State.user.role.toUpperCase();
      }
      
      // Carrega página inicial
      await Router.go("home");
      
    } else {
      Auth.showLogin();
    }
    
    // Atualizar
    $("#btn-refresh").addEventListener("click", () => {
      Router.go(State.currentPage);
      Toast.success("Página atualizada");
    });
  }

  // Start
  document.addEventListener("DOMContentLoaded", init);
  
  // Exports para debug (opcional)
  window.API = API;
  window.Router = Router;
  window.State = State;
  window.Toast = Toast;
  window.Modal = Modal;
  window.Pages = Pages;

})();
