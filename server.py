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
    # Railway normalmente fornece DATABASE_URL
    if DATABASE_URL:
        return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)

    # fallback para vars separadas (se você usar)
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
TOKEN_MAX_AGE = 60 * 60 * 24 * 14  # 14 dias
serializer = URLSafeTimedSerializer(SECRET_KEY)

def api_error(msg, status=400):
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

    # adiciona encerrada_em para controlar aula ativa
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
        id_aula INTEGER REFERENCES aulas(id) ON DELETE CASCADE,
        id_aluno INTEGER REFERENCES alunos(id) ON DELETE CASCADE,
        horario_entrada TIMESTAMP,
        horario_saida TIMESTAMP,
        retirado_por TEXT
    );
    """)

    # garante unique para evitar duplicar check-in na mesma aula
    cur.execute("""
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'frequencia_id_aula_id_aluno_key'
        ) THEN
            ALTER TABLE frequencia
            ADD CONSTRAINT frequencia_id_aula_id_aluno_key UNIQUE (id_aula, id_aluno);
        END IF;
    END $$;
    """)

    # seed admin (corrige o bug do cur fora do escopo)
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

# ---------------- Pages / Static ----------------
@app.route("/")
def index():
    return render_template("index.html")

@app.route("/sw.js")
def sw_root():
    # para registrar SW na raiz: /sw.js
    return send_from_directory(app.static_folder, "sw.js")

# ---------------- API: AUTH ----------------
@app.route("/api/login", methods=["POST"])
def login():
    data = request.json or {}
    usuario = data.get("usuario")
    senha = data.get("senha")

    if not usuario or not senha:
        return api_error("Informe usuario e senha")

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

# ---------------- API: ALUNOS ----------------
@app.route("/api/alunos")
@require_auth
def get_alunos():
    conn = db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM alunos ORDER BY nome")
    alunos = cur.fetchall()
    cur.close()
    conn.close()
    return jsonify({"ok": True, "alunos": alunos})

@app.route("/api/alunos", methods=["POST"])
@require_auth
def add_aluno():
    data = request.json or {}
    nome = (data.get("nome") or "").strip()
    if not nome:
        return api_error("Nome do aluno é obrigatório")

    conn = db()
    cur = conn.cursor()
    cur.execute("INSERT INTO alunos (nome) VALUES (%s)", (nome,))
    conn.commit()
    cur.close()
    conn.close()
    return jsonify({"ok": True})

# ---------------- API: AULAS ----------------
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
    data = request.json or {}
    tema = (data.get("tema") or "").strip()
    professores = (data.get("professores") or "").strip()

    if not tema:
        return api_error("Tema é obrigatório")

    conn = db()
    cur = conn.cursor()

    # opcional: encerra qualquer aula ativa anterior antes de iniciar outra
    cur.execute("UPDATE aulas SET encerrada_em=%s WHERE encerrada_em IS NULL", (datetime.now(),))

    cur.execute(
        "INSERT INTO aulas (data_aula, tema, professores, encerrada_em) VALUES (%s,%s,%s,NULL) RETURNING id",
        (datetime.now(), tema, professores)
    )
    aula_id = cur.fetchone()["id"]

    conn.commit()
    cur.close()
    conn.close()
    return jsonify({"ok": True, "aula_id": aula_id})

@app.route("/api/aulas/encerrar", methods=["POST"])
@require_auth
def encerrar_aula():
    data = request.json or {}
    aula_id = data.get("aula_id")

    conn = db()
    cur = conn.cursor()

    if aula_id:
        cur.execute("UPDATE aulas SET encerrada_em=%s WHERE id=%s", (datetime.now(), aula_id))
    else:
        cur.execute("UPDATE aulas SET encerrada_em=%s WHERE encerrada_em IS NULL", (datetime.now(),))

    conn.commit()
    cur.close()
    conn.close()
    return jsonify({"ok": True})

@app.route("/api/aulas/historico")
@require_auth
def aulas_historico():
    conn = db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM aulas ORDER BY data_aula DESC LIMIT 100")
    aulas = cur.fetchall()
    cur.close()
    conn.close()
    return jsonify({"ok": True, "aulas": aulas})

@app.route("/api/aulas/<int:aula_id>/presenca")
@require_auth
def presenca(aula_id):
    conn = db()
    cur = conn.cursor()
    cur.execute("""
        SELECT f.*, a.nome
        FROM frequencia f
        JOIN alunos a ON a.id = f.id_aluno
        WHERE f.id_aula = %s
        ORDER BY a.nome
    """, (aula_id,))
    data = cur.fetchall()
    cur.close()
    conn.close()
    return jsonify({"ok": True, "presenca": data})

@app.route("/api/aulas/entrada", methods=["POST"])
@require_auth
def entrada():
    d = request.json or {}
    aula_id = d.get("aula_id")
    aluno_id = d.get("aluno_id")

    if not aula_id or not aluno_id:
        return api_error("aula_id e aluno_id são obrigatórios")

    conn = db()
    cur = conn.cursor()

    cur.execute("""
        INSERT INTO frequencia (id_aula, id_aluno, horario_entrada)
        VALUES (%s, %s, %s)
        ON CONFLICT (id_aula, id_aluno)
        DO UPDATE SET horario_entrada=%s
    """, (aula_id, aluno_id, datetime.now(), datetime.now()))

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
        return api_error("aula_id e aluno_id são obrigatórios")

    conn = db()
    cur = conn.cursor()

    # tenta atualizar a frequência existente
    cur.execute("""
        UPDATE frequencia
        SET horario_saida=%s, retirado_por=%s
        WHERE id_aula=%s AND id_aluno=%s
    """, (datetime.now(), retirado_por, aula_id, aluno_id))

    # se não existia check-in ainda, cria registro com saída (caso raro)
    if cur.rowcount == 0:
        cur.execute("""
            INSERT INTO frequencia (id_aula, id_aluno, horario_entrada, horario_saida, retirado_por)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (id_aula, id_aluno)
            DO UPDATE SET horario_saida=%s, retirado_por=%s
        """, (
            aula_id, aluno_id,
            datetime.now(), datetime.now(), retirado_por,
            datetime.now(), retirado_por
        ))

    conn.commit()
    cur.close()
    conn.close()
    return jsonify({"ok": True})

# ------------- Local run (não usado no Railway com gunicorn) -------------
if __name__ == "__main__":
    port = int(os.getenv("PORT", "8080"))
    app.run(host="0.0.0.0", port=port)
    
