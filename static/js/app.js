(() => {
  "use strict";

  const $ = (sel) => document.querySelector(sel);

  // Login
  async function doLogin() {
    const usuario = $("#login-user").value.trim();
    const senha = $("#login-pass").value;
    
    console.log("Tentando login:", usuario);
    
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario, senha })
      });
      
      const data = await response.json();
      console.log("Resposta:", data);
      
      if (data.success) {
        alert("Login OK! Token: " + data.data.token.substring(0, 20) + "...");
      } else {
        alert("Erro: " + data.error);
      }
    } catch (error) {
      console.error("Erro:", error);
      alert("Erro de conexão: " + error.message);
    }
  }

  // Eventos
  document.addEventListener("DOMContentLoaded", () => {
    $("#btn-login").onclick = doLogin;
    
    $("#login-pass").onkeypress = (e) => {
      if (e.key === "Enter") doLogin();
    };
    
    // Teste da API
    fetch("/api/test")
      .then(r => r.json())
      .then(data => console.log("API Test:", data))
      .catch(e => console.error("API Test falhou:", e));
  });
})();
