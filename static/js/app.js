/* ================================
   APP GLOBAL
================================ */
const APP = {
  aulaAtiva: null,
  usuarios: [],
  alunos: []
};

/* ================================
   INIT
================================ */
APP.boot = async function () {
  await APP.loadUsuarios();
  await APP.loadAlunos();
  APP.loadAulas();
};

/* ================================
   USUÁRIOS (EQUIPE)
================================ */
APP.loadUsuarios = async function () {
  try {
    const r = await fetch("/api/usuarios");
    const data = await r.json();
    APP.usuarios = Array.isArray(data) ? data : (data.usuarios || []);
  } catch (e) {
    APP.usuarios = [];
  }
};

/* ================================
   ALUNOS
================================ */
APP.loadAlunos = async function () {
  try {
    const r = await fetch("/api/alunos");
    const data = await r.json();
    APP.alunos = Array.isArray(data) ? data : (data.alunos || []);
  } catch (e) {
    APP.alunos = [];
  }
};

/* ================================
   AULAS
================================ */
APP.loadAulas = function () {
  APP.renderSelectProfessor();
  APP.renderSelectAluno();
};

/* ================================
   SELECT PROFESSOR
================================ */
APP.renderSelectProfessor = function () {
  const select = document.getElementById("selectProfessor");
  if (!select) return;

  select.innerHTML = "";

  const professores = APP.usuarios.filter(u =>
    ["professor", "admin"].includes(u.role)
  );

  if (professores.length === 0) {
    select.innerHTML = `<option value="">Sem equipe cadastrada</option>`;
    return;
  }

  select.innerHTML = `<option value="">Selecione o professor</option>`;
  professores.forEach(p => {
    select.innerHTML += `<option value="${p.id}">${p.nome}</option>`;
  });
};

/* ================================
   SELECT ALUNO (PRESENÇA)
================================ */
APP.renderSelectAluno = function () {
  const select = document.getElementById("selectAlunoPresenca");
  if (!select) return;

  select.innerHTML = "";

  if (APP.alunos.length === 0) {
    select.innerHTML = `<option value="">Sem alunos cadastrados</option>`;
    return;
  }

  select.innerHTML = `<option value="">Selecione o aluno</option>`;
  APP.alunos.forEach(a => {
    select.innerHTML += `<option value="${a.id}">${a.nome}</option>`;
  });
};

/* ================================
   INICIAR AULA
================================ */
APP.iniciarAula = async function () {
  const professor = document.getElementById("selectProfessor").value;
  const tema = document.getElementById("temaAula").value;

  if (!professor || !tema) {
    alert("Selecione o professor e informe o tema");
    return;
  }

  const r = await fetch("/api/aulas/iniciar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      professor_id: professor,
      tema: tema
    })
  });

  const data = await r.json();

  if (!r.ok) {
    alert(data.error || "Erro ao iniciar aula");
    return;
  }

  APP.aulaAtiva = data.aula_id || data.id;
  document.getElementById("btnPresenca").disabled = false;
  alert("Aula iniciada com sucesso");
};

/* ================================
   PRESENÇA
================================ */
APP.registrarPresenca = async function () {
  if (!APP.aulaAtiva) {
    alert("Nenhuma aula ativa");
    return;
  }

  const aluno = document.getElementById("selectAlunoPresenca").value;
  const retiradoPor = document.getElementById("retiradoPor").value || "";

  if (!aluno) {
    alert("Selecione um aluno");
    return;
  }

  const r = await fetch("/api/presenca", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      aula_id: APP.aulaAtiva,
      aluno_id: aluno,
      retirado_por: retiradoPor
    })
  });

  const data = await r.json();

  if (!r.ok) {
    alert(data.error || "Erro ao registrar presença");
    return;
  }

  alert("Presença registrada");
};

/* ================================
   EVENTOS
================================ */
document.addEventListener("DOMContentLoaded", () => {
  APP.boot();

  const btnAula = document.getElementById("btnIniciarAula");
  if (btnAula) btnAula.onclick = APP.iniciarAula;

  const btnPresenca = document.getElementById("btnPresenca");
  if (btnPresenca) btnPresenca.onclick = APP.registrarPresenca;
});
