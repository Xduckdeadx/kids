const API = "/api";

const Auth = {
  token: localStorage.getItem("token"),

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
    const d = await r.json();
    if (!d.ok) throw d.error;
    this.token = d.token;
    localStorage.setItem("token", d.token);
  },

  async me() {
    const r = await fetch(`${API}/me`, { headers: this.headers() });
    const d = await r.json();
    if (!d.ok) throw "Não autenticado";
    return d.usuario;
  },

  logout() {
    localStorage.clear();
    location.reload();
  }
};

function hideLoading() {
  document.getElementById("loading").style.display = "none";
}

async function boot() {
  try {
    await Auth.me();
    document.getElementById("login").style.display = "none";
    document.getElementById("app").style.display = "block";
  } catch {
    document.getElementById("login").style.display = "block";
  } finally {
    hideLoading();
  }
}

document.getElementById("btn-login").onclick = async () => {
  const u = document.getElementById("login-user").value;
  const p = document.getElementById("login-pass").value;
  try {
    await Auth.login(u, p);
    location.reload();
  } catch (e) {
    document.getElementById("login-msg").innerText = e;
  }
};

boot();
