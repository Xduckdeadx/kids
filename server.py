import os
import json
from datetime import datetime
from functools import wraps

import psycopg2
from psycopg2.extras import RealDictCursor
from flask import Flask, request, jsonify, render_template, send_from_directory
from flask_cors import CORS

# =========================
# Flask app (STATIC OK)
# =========================
app = Flask(__name__, static_folder="static", static_url_path="/static", template_folder="templates")
CORS(app)

# =========================
# DB
# =========================
def db():
    database_url = os.environ.get("DATABASE_URL", "").strip()

    if not database_url:
        raise RuntimeError("DATABASE_URL não configurada no Railway.")

    # Corrige caso venha com quebra de linha/aspas
    database_url = database_url.replace("\n", "").replace("\r", "").strip().strip('"').strip("'")

    # Supabase quase sempre exige SSL
    if "sslmode=" not in database_url:
        if "?" in database_url:
            database_url += "&sslmode=require"
        else:
            database_url += "?sslmode=require"

    return psycopg2.connect(database_url, cursor_factory=RealDictCursor)

def ensure_tables():
    # Se você já criou as tabelas no Supabase, pode deixar isso ligado sem problema
    # (não vai recriar se já existir).
    conn = db()
    cur = conn.cursor()

    cur.execute("""
    CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        nome TEXT NOT NULL,
        usuario TEXT UNIQUE NOT NULL,
        senha TEXT NOT NULL,
        role TEXT NOT NULL,
        foto TEXT
    );
    """)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS alunos (
        id SERIAL PRIMARY KEY,
        nome TEXT NOT NULL,
        data_nascimento TEXT,
        responsavel TEXT,
        telefone TEXT,
        observacoes TEXT,
        autorizado_retirar TEXT,
        autorizado_2 TEXT,
        autorizado_3 TEXT,
        foto TEXT,
        imagem_ficha TEXT
    );
    """)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS avisos (
        id SERIAL PRIMARY KEY,
        mensagem TEXT,
        data_criacao TIMESTAMP,
        autor TEXT,
        imagem TEXT,
        fixado BOOLEAN DEFAULT FALSE
    );
    """)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS aulas (
        id SERIAL PRIMARY KEY,
        data_aula TIMESTAMP,
        tema TEXT,
        professores TEXT,
        encerrada_em TIMESTAMP
    );
    """)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS frequencia (
        id SERIAL PRIMARY KEY,
        id_aula INTEGER REFERENCES aulas(id),
        id_aluno INTEGER REFERENCES alunos(id) ON DELETE CASCADE,
        horario_entrada TIMESTAMP,
        horario_saida TIMESTAMP,
        retirado_por TEXT
    );
    """)

    # cria admin se não existir
    cur.execute("SELECT id FROM usuarios WHERE usuario=%s", ("admin",))
    if not cur.fetchone():
        cur.execute(
            "INSERT INTO usuarios (nome, usuario, senha, role) VALUES (%s,%s,%s,%s)",
            ("Administrador", "admin", "1234", "admin")
        )

    conn.commit()
    cur.close()
    conn.close()

# roda no boot
try:
    ensure_tables()
except Exception as e:
    print("ERRO ensure_tables:", e)

# =========================
# Auth simples (token)
# =========================
def make_token(payload: dict) -> str:
    # token simples (não é JWT). funciona bem para seu caso básico.
    return json.dumps(payload)

def parse_token(token: str):
    try:
        return json.loads(token)
    except:
        return None

def require_auth(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        h = request.headers.get("Authorization", "")
        token = ""
        if h.startswith("Bearer "):
            token = h.replace("Bearer ", "").strip()
        data = parse_token(token)
        if not data:
            return jsonify({"ok": False, "error": "Não autenticado"}), 401
        request.user = data
        return fn(*args, **kwargs)
    return wrapper

# =========================
# ROTAS FRONT
# =========================
@app.route("/")
def index():
    return render_template("index.html")

# ✅ PWA: serve service worker no root também (opcional)
@app.route("/sw.js")
def sw_root():
    return send_from_directory("static", "sw.js")

# ✅ Debug rápido: confirma que static existe no deploy
@app.route("/debug/static")
def debug_static():
    try:
        files = sorted(os.listdir("static"))
    except Exception as e:
        files = [f"ERRO listando static: {e}"]
    return jsonify({"ok": True, "static_files": files})

# =========================
# API
# =========================
@app.route("/api/health")
def health():
    return jsonify({"ok": True, "time": datetime.utcnow().isoformat()})

@app.route("/api/login", methods=["POST"])
def api_login():
    d = request.json or {}
    usuario = (d.get("usuario") or "").strip()
    senha = (d.get("senha") or "").strip()
    if not usuario or not senha:
        return jsonify({"ok": False, "error": "Usuário e senha obrigatórios"}), 400

    conn = db()
    cur = conn.cursor()
    cur.execute("SELECT id, nome, usuario, role FROM usuarios WHERE usuario=%s AND senha=%s", (usuario, senha))
    u = cur.fetchone()
    cur.close()
    conn.close()

    if not u:
        return jsonify({"ok": False, "error": "Credenciais inválidas"}), 401

    token = make_token({"id": u["id"], "nome": u["nome"], "usuario": u["usuario"], "role": u["role"]})
    return jsonify({"ok": True, "token": token, "usuario": u})

@app.route("/api/me")
@require_auth
def api_me():
    return jsonify({"ok": True, "usuario": request.user})

@app.route("/api/alunos", methods=["GET"])
@require_auth
def alunos_list():
    conn = db()
    cur = conn.cursor()
    cur.execute("SELECT id, nome FROM alunos ORDER BY nome ASC")
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return jsonify({"ok": True, "alunos": rows})

@app.route("/api/alunos", methods=["POST"])
@require_auth
def alunos_add():
    # admin / professor / auxiliar podem cadastrar aluno
    role = (request.user.get("role") or "").lower()
    if role not in ("admin", "professor", "auxiliar"):
        return jsonify({"ok": False, "error": "Sem permissão para cadastrar aluno"}), 403

    d = request.json or {}
    nome = (d.get("nome") or "").strip()
    if not nome:
        return jsonify({"ok": False, "error": "Nome obrigatório"}), 400

    conn = db()
    cur = conn.cursor()
    cur.execute("INSERT INTO alunos (nome) VALUES (%s) RETURNING id, nome", (nome,))
    row = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    return jsonify({"ok": True, "aluno": row})

@app.route("/api/aulas/ativa", methods=["GET"])
@require_auth
def aula_ativa():
    conn = db()
    cur = conn.cursor()
    cur.execute("""
        SELECT id, data_aula, tema, professores, encerrada_em
        FROM aulas
        WHERE encerrada_em IS NULL
        ORDER BY id DESC
        LIMIT 1
    """)
    a = cur.fetchone()
    cur.close()
    conn.close()
    return jsonify({"ok": True, "aula": a})

@app.route("/api/aulas/iniciar", methods=["POST"])
@require_auth
def iniciar():
    d = request.json or {}
    tema = (d.get("tema") or "").strip()
    professores = (d.get("professores") or "").strip()
    if not tema:
        return jsonify({"ok": False, "error": "Tema obrigatório"}), 400

    conn = db()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO aulas (data_aula, tema, professores, encerrada_em)
        VALUES (%s, %s, %s, NULL)
        RETURNING id, data_aula, tema, professores, encerrada_em
    """, (datetime.now(), tema, professores))
    aula = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    return jsonify({"ok": True, "aula": aula})

@app.route("/api/aulas/historico", methods=["GET"])
@require_auth
def historico():
    conn = db()
    cur = conn.cursor()
    cur.execute("""
        SELECT id, data_aula, tema, professores, encerrada_em
        FROM aulas
        ORDER BY id DESC
        LIMIT 50
    """)
    aulas = cur.fetchall()
    cur.close()
    conn.close()
    return jsonify({"ok": True, "aulas": aulas})

@app.route("/api/aulas/<int:aula_id>/presenca", methods=["GET"])
@require_auth
def presenca(aula_id):
    conn = db()
    cur = conn.cursor()
    cur.execute("""
        SELECT f.id_aluno, a.nome, f.horario_entrada, f.horario_saida
        FROM frequencia f
        JOIN alunos a ON a.id = f.id_aluno
        WHERE f.id_aula = %s
        ORDER BY a.nome ASC
    """, (aula_id,))
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return jsonify({"ok": True, "presenca": rows})

@app.route("/api/aulas/entrada", methods=["POST"])
@require_auth
def entrada():
    d = request.json or {}
    aula_id = d.get("aula_id")
    aluno_id = d.get("aluno_id")
    if not aula_id or not aluno_id:
        return jsonify({"ok": False, "error": "aula_id e aluno_id são obrigatórios"}), 400

    conn = db()
    cur = conn.cursor()
    # cria ou atualiza entrada
    cur.execute("""
        INSERT INTO frequencia (id_aula, id_aluno, horario_entrada)
        VALUES (%s, %s, %s)
        ON CONFLICT DO NOTHING
    """, (aula_id, aluno_id, datetime.now()))
    conn.commit()
    cur.close()
    conn.close()
    return jsonify({"ok": True})

@app.route("/api/aulas/saida", methods=["POST"])
@require_auth
def saida():
    d = request.json or {}
    aula_id = d.get("aula_id")
    aluno_id = d.get("aluno_id")
    retirado_por = d.get("retirado_por", "")
    if not aula_id or not aluno_id:
        return jsonify({"ok": False, "error": "aula_id e aluno_id são obrigatórios"}), 400

    conn = db()
    cur = conn.cursor()

    cur.execute("""
        UPDATE frequencia
        SET horario_saida=%s, retirado_por=%s
        WHERE id_aula=%s AND id_aluno=%s
    """, (datetime.now(), retirado_por, aula_id, aluno_id))

    if cur.rowcount == 0:
        cur.execute("""
            INSERT INTO frequencia (id_aula,id_aluno,horario_entrada,horario_saida,retirado_por)
            VALUES (%s,%s,%s,%s,%s)
        """, (aula_id, aluno_id, datetime.now(), datetime.now(), retirado_por))

    conn.commit()
    cur.close()
    conn.close()
    return jsonify({"ok": True})


# =========================
# Local run
# =========================
if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    app.run(host="0.0.0.0", port=port)
