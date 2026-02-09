import os
from functools import wraps
from datetime import datetime

from flask import Flask, request, jsonify, render_template, send_from_directory
from flask_cors import CORS

import psycopg2
from psycopg2.extras import RealDictCursor
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired

# ---------------- App ----------------
app = Flask(__name__, template_folder="templates", static_folder="static")
CORS(app)

# ---------------- DB ----------------
DATABASE_URL = os.getenv("DATABASE_URL")

def db():
    if DATABASE_URL:
        return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)
    return psycopg2.connect(
        host=os.getenv("DB_HOST"),
        database=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASS"),
        port=os.getenv("DB_PORT", "5432"),
        sslmode=os.getenv("DB_SSLMODE", "require"),
        cursor_factory=RealDictCursor
    )

# ---------------- Auth ----------------
SECRET_KEY = os.getenv("SECRET_KEY", "ieq-central-2026")
TOKEN_MAX_AGE = 60 * 60 * 24 * 14
serializer = URLSafeTimedSerializer(SECRET_KEY)

def api_error(msg, status=400, err=None):
    return jsonify({"ok": False, "error": msg}), status

def create_token(user):
    return serializer.dumps({"id": user["id"], "role": user["role"]})

def require_auth(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return api_error("Token ausente", 401)
        token = auth.replace("Bearer ", "")
        try:
            data = serializer.loads(token, max_age=TOKEN_MAX_AGE)
            request.user = data
        except SignatureExpired:
            return api_error("Token expirado", 401)
        except BadSignature:
            return api_error("Token inválido", 401)
        return fn(*args, **kwargs)
    return wrapper

# ---------------- DB INIT ----------------
def ensure_tables():
    conn = db()
    cur = conn.cursor()

    cur.execute("""
    CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        nome TEXT,
        usuario TEXT UNIQUE,
        senha TEXT,
        role TEXT,
        foto TEXT
    )
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS alunos (
        id SERIAL PRIMARY KEY,
        nome TEXT,
        data_nascimento TEXT,
        responsavel TEXT,
        telefone TEXT,
        observacoes TEXT,
        autorizado_retirar TEXT,
        autorizado_2 TEXT,
        autorizado_3 TEXT,
        foto TEXT,
        imagem_ficha TEXT
    )
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS aulas (
        id SERIAL PRIMARY KEY,
        data_aula TIMESTAMP,
        tema TEXT,
        professores TEXT,
        encerrada_em TIMESTAMP
    )
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS frequencia (
        id SERIAL PRIMARY KEY,
        id_aula INTEGER REFERENCES aulas(id) ON DELETE CASCADE,
        id_aluno INTEGER REFERENCES alunos(id) ON DELETE CASCADE,
        horario_entrada TIMESTAMP,
        horario_saida TIMESTAMP,
        retirado_por TEXT,
        UNIQUE(id_aula, id_aluno)
    )
    """)

    # seed admin
    cur.execute("SELECT id FROM usuarios WHERE usuario='admin'")
    if not cur.fetchone():
        cur.execute(
            "INSERT INTO usuarios (nome, usuario, senha, role) VALUES (%s,%s,%s,%s)",
            ("Administrador", "admin", "1234", "admin")
        )

    conn.commit()
    cur.close()
    conn.close()

ensure_tables()

# ---------------- Routes ----------------
@app.route("/")
def index():
    return render_template("index.html")

@app.route("/sw.js")
def sw_root():
    return send_from_directory(app.static_folder, "sw.js")

# -------- Auth --------
@app.route("/api/login", methods=["POST"])
def login():
    data = request.json or {}
    usuario = data.get("usuario")
    senha = data.get("senha")

    if not usuario or not senha:
        return api_error("Dados inválidos")

    conn = db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM usuarios WHERE usuario=%s AND senha=%s", (usuario, senha))
    u = cur.fetchone()
    cur.close()
    conn.close()

    if not u:
        return api_error("Usuário ou senha inválidos", 401)

    return jsonify({"ok": True, "token": create_token(u)})

@app.route("/api/me")
@require_auth
def me():
    conn = db()
    cur = conn.cursor()
    cur.execute("SELECT id, nome, usuario, role FROM usuarios WHERE id=%s", (request.user["id"],))
    u = cur.fetchone()
    cur.close()
    conn.close()
    return jsonify({"ok": True, "usuario": u})

# -------- Alunos --------
@app.route("/api/alunos")
@require_auth
def alunos():
    conn = db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM alunos ORDER BY nome")
    data = cur.fetchall()
    cur.close()
    conn.close()
    return jsonify({"ok": True, "alunos": data})

@app.route("/api/alunos", methods=["POST"])
@require_auth
def add_aluno():
    data = request.json
    conn = db()
    cur = conn.cursor()
    cur.execute("INSERT INTO alunos (nome) VALUES (%s)", (data["nome"],))
    conn.commit()
    cur.close()
    conn.close()
    return jsonify({"ok": True})

# -------- Aulas --------
@app.route("/api/aulas/ativa")
@require_auth
def aula_ativa():
    conn = db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM aulas WHERE encerrada_em IS NULL ORDER BY id DESC LIMIT 1")
    aula = cur.fetchone()
    cur.close()
    conn.close()
    return jsonify({"ok": True, "aula": aula})

@app.route("/api/aulas/iniciar", methods=["POST"])
@require_auth
def iniciar_aula():
    data = request.json
    conn = db()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO aulas (data_aula, tema, professores) VALUES (%s,%s,%s) RETURNING id",
        (datetime.now(), data["tema"], data["professores"])
    )
    aula_id = cur.fetchone()["id"]
    conn.commit()
    cur.close()
    conn.close()
    return jsonify({"ok": True, "aula_id": aula_id})

@app.route("/api/aulas/historico")
@require_auth
def historico():
    conn = db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM aulas ORDER BY data_aula DESC LIMIT 50")
    data = cur.fetchall()
    cur.close()
    conn.close()
    return jsonify({"ok": True, "aulas": data})

@app.route("/api/aulas/<int:aula_id>/presenca")
@require_auth
def presenca(aula_id):
    conn = db()
    cur = conn.cursor()
    cur.execute("""
        SELECT f.*, a.nome 
        FROM frequencia f
        JOIN alunos a ON a.id=f.id_aluno
        WHERE f.id_aula=%s
    """, (aula_id,))
    data = cur.fetchall()
    cur.close()
    conn.close()
    return jsonify({"ok": True, "presenca": data})

@app.route("/api/aulas/entrada", methods=["POST"])
@require_auth
def entrada():
    d = request.json
    conn = db()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO frequencia (id_aula,id_aluno,horario_entrada)
        VALUES (%s,%s,%s)
        ON CONFLICT (id_aula,id_aluno)
        DO UPDATE SET horario_entrada=%s
    """, (d["aula_id"], d["aluno_id"], datetime.now(), datetime.now()))
    conn.commit()
    cur.close()
    conn.close()
    return jsonify({"ok": True})
