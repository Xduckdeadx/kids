import os
from functools import wraps
from datetime import datetime

from flask import Flask, request, jsonify, render_template
from flask_cors import CORS

import psycopg2
from psycopg2.extras import RealDictCursor
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired


# ---------------- App ----------------
app = Flask(
    __name__,
    template_folder="templates",
    static_folder="static",
    static_url_path="/static"
)
CORS(app)


# ---------------- DB ----------------
def db():
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL não configurada no Railway.")

    database_url = database_url.strip()

    if "sslmode=" not in database_url:
        sep = "&" if "?" in database_url else "?"
        database_url += f"{sep}sslmode=require"

    return psycopg2.connect(database_url, cursor_factory=RealDictCursor)


# ---------------- Auth ----------------
SECRET_KEY = os.getenv("SECRET_KEY", "ieq-central-2026")
TOKEN_MAX_AGE = 60 * 60 * 24 * 14
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

        token = auth.replace("Bearer ", "").strip()
        try:
            data = serializer.loads(token, max_age=TOKEN_MAX_AGE)
            request.user = data
        except SignatureExpired:
            return api_error("Token expirado", 401)
        except BadSignature:
            return api_error("Token inválido", 401)

        return fn(*args, **kwargs)

    return wrapper


# ---------------- FRONT ----------------
@app.route("/")
def index():
    return render_template("index.html")


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
        retirado_por TEXT,
        UNIQUE (id_aula, id_aluno)
    );
    """)

    cur.execute("SELECT id FROM usuarios WHERE usuario='admin'")
    if not cur.fetchone():
        cur.execute("""
            INSERT INTO usuarios (nome, usuario, senha, role)
            VALUES ('Administrador', 'admin', '1234', 'admin')
        """)

    conn.commit()
    cur.close()
    conn.close()


ensure_tables()


# ---------------- API (exemplo base) ----------------
@app.route("/api/me")
@require_auth
def me():
    conn = db()
    cur = conn.cursor()
    cur.execute(
        "SELECT id, nome, usuario, role FROM usuarios WHERE id=%s",
        (request.user["id"],)
    )
    u = cur.fetchone()
    cur.close()
    conn.close()
    return jsonify({"ok": True, "usuario": u})


# ---------------- Run local ----------------
if __name__ == "__main__":
    port = int(os.getenv("PORT", 8080))
    app.run(host="0.0.0.0", port=port)
