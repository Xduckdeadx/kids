import os
from functools import wraps
from datetime import datetime, timezone

from flask import Flask, request, jsonify, render_template, send_from_directory
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

# ---------------- Helpers ----------------
def now_utc():
    return datetime.now(timezone.utc)

def api_ok(**kwargs):
    payload = {"ok": True}
    payload.update(kwargs)
    return jsonify(payload)

def api_error(msg, status=400):
    return jsonify({"ok": False, "error": msg}), status

# ---------------- DB ----------------
def db():
    database_url = os.getenv("DATABASE_URL", "")
    if not database_url.strip():
        raise RuntimeError("DATABASE_URL não configurada no Railway.")
    database_url = database_url.strip()

    # Garante sslmode=require (Supabase precisa)
    if "sslmode=" not in database_url:
        sep = "&" if "?" in database_url else "?"
        database_url = f"{database_url}{sep}sslmode=require"

    return psycopg2.connect(database_url, cursor_factory=RealDictCursor)

# ---------------- Auth ----------------
SECRET_KEY = os.getenv("SECRET_KEY", "ieq-central-2026")
TOKEN_MAX_AGE = 60 * 60 * 24 * 14  # 14 dias
serializer = URLSafeTimedSerializer(SECRET_KEY)

def create_token(user_row):
    return serializer.dumps({"id": user_row["id"], "role": user_row["role"]})

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

def require_roles(*roles):
    def deco(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            user = getattr(request, "user", None)
            if not user:
                return api_error("Token ausente", 401)
            if user.get("role") not in roles:
                return api_error("Sem permissão", 403)
            return fn(*args, **kwargs)
        return wrapper
    return deco

# ---------------- Front routes ----------------
@app.route("/")
def index():
    return render_template("index.html")

# Mantém igual seu HTML: navigator.serviceWorker.register("/sw.js");
@app.route("/sw.js")
def sw():
    # sw.js fica dentro de /static (recomendado)
    # Se você mantiver o arquivo na raiz do repo, remova este route e deixe o Flask servir direto.
    return send_from_directory(app.static_folder, "sw.js")

# ---------------- DB Init ----------------
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

    # Admin default
    cur.execute("SELECT id FROM usuarios WHERE usuario='admin'")
    if not cur.fetchone():
        cur.execute("""
            INSERT INTO usuarios (nome, usuario, senha, role)
            VALUES ('Administrador', 'admin', '1234', 'admin')
        """)

    conn.commit()
    cur.close()
    conn.close()

# Só executa se tiver DB configurada (evita boot loop se você esqueceu variável)
try:
    ensure_tables()
except Exception as e:
    # loga, mas deixa o server subir pra você conseguir ver a página/diagnóstico
    print("⚠️ ensure_tables falhou:", str(e))

# ---------------- API ----------------
@app.route("/api/health")
def health():
    return api_ok(message="ok")

@app.route("/api/login", methods=["POST"])
def login():
    d = request.json or {}
    usuario = (d.get("usuario") or "").strip()
    senha = (d.get("senha") or "").strip()

    if not usuario or not senha:
        return api_error("Usuário e senha são obrigatórios")

    conn = db()
    cur = conn.cursor()
    cur.execute(
        "SELECT id, nome, usuario, senha, role FROM usuarios WHERE usuario=%s",
        (usuario,)
    )
    u = cur.fetchone()
    cur.close()
    conn.close()

    if not u or u["senha"] != senha:
        return api_error("Credenciais inválidas", 401)

    token = create_token(u)
    return api_ok(token=token)

@app.route("/api/me")
@require_auth
def me():
    conn = db()
    cur = conn.cursor()
    cur.execute("SELECT id, nome, usuario, role FROM usuarios WHERE id=%s", (request.user["id"],))
    u = cur.fetchone()
    cur.close()
    conn.close()
    if not u:
        return api_error("Usuário não encontrado", 404)
    return api_ok(usuario=u)

# ---- Alunos (admin/professor/auxiliar podem cadastrar) ----
@app.route("/api/alunos", methods=["GET"])
@require_auth
def alunos_list():
    conn = db()
    cur = conn.cursor()
    cur.execute("SELECT id, nome FROM alunos ORDER BY nome ASC")
    rows = cur.fetchall() or []
    cur.close()
    conn.close()
    return api_ok(alunos=rows)

@app.route("/api/alunos", methods=["POST"])
@require_auth
@require_roles("admin", "professor", "auxiliar")
def alunos_create():
    d = request.json or {}
    nome = (d.get("nome") or "").strip()
    if not nome:
        return api_error("Nome é obrigatório")

    conn = db()
    cur = conn.cursor()
    cur.execute("INSERT INTO alunos (nome) VALUES (%s) RETURNING id, nome", (nome,))
    novo = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    return api_ok(aluno=novo)

# ---- Aulas ----
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
    aula = cur.fetchone()
    cur.close()
    conn.close()
    return api_ok(aula=aula)

@app.route("/api/aulas/iniciar", methods=["POST"])
@require_auth
@require_roles("admin", "professor", "auxiliar")
def aula_iniciar():
    d = request.json or {}
    tema = (d.get("tema") or "").strip()
    professores = (d.get("professores") or "").strip()

    if not tema:
        return api_error("Tema é obrigatório")

    conn = db()
    cur = conn.cursor()

    # Se já existe aula ativa, reaproveita (evita duplicar sem querer)
    cur.execute("""
        SELECT id, data_aula, tema, professores, encerrada_em
        FROM aulas
        WHERE encerrada_em IS NULL
        ORDER BY id DESC
        LIMIT 1
    """)
    ativa = cur.fetchone()
    if ativa:
        cur.close()
        conn.close()
        return api_ok(aula=ativa, message="Já existe uma aula ativa")

    cur.execute("""
        INSERT INTO aulas (data_aula, tema, professores)
        VALUES (%s, %s, %s)
        RETURNING id, data_aula, tema, professores, encerrada_em
    """, (now_utc(), tema, professores))
    aula = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    return api_ok(aula=aula)

@app.route("/api/aulas/historico", methods=["GET"])
@require_auth
def aulas_historico():
    conn = db()
    cur = conn.cursor()
    cur.execute("""
        SELECT id, data_aula, tema, professores, encerrada_em
        FROM aulas
        ORDER BY id DESC
        LIMIT 200
    """)
    aulas = cur.fetchall() or []
    cur.close()
    conn.close()
    return api_ok(aulas=aulas)

@app.route("/api/aulas/<int:aula_id>/presenca", methods=["GET"])
@require_auth
def aula_presenca(aula_id):
    conn = db()
    cur = conn.cursor()
    cur.execute("""
        SELECT a.nome, f.horario_entrada, f.horario_saida
        FROM frequencia f
        JOIN alunos a ON a.id = f.id_aluno
        WHERE f.id_aula = %s
        ORDER BY a.nome ASC
    """, (aula_id,))
    presenca = cur.fetchall() or []
    cur.close()
    conn.close()
    return api_ok(presenca=presenca)

@app.route("/api/aulas/entrada", methods=["POST"])
@require_auth
@require_roles("admin", "professor", "auxiliar")
def entrada():
    d = request.json or {}
    aula_id = d.get("aula_id")
    aluno_id = d.get("aluno_id")
    if not aula_id or not aluno_id:
        return api_error("aula_id e aluno_id são obrigatórios")

    conn = db()
    cur = conn.cursor()

    # Cria se não existir; se existir e estava sem entrada, atualiza
    cur.execute("""
        INSERT INTO frequencia (id_aula, id_aluno, horario_entrada)
        VALUES (%s, %s, %s)
        ON CONFLICT (id_aula, id_aluno)
        DO UPDATE SET horario_entrada = COALESCE(frequencia.horario_entrada, EXCLUDED.horario_entrada)
    """, (aula_id, aluno_id, now_utc()))

    conn.commit()
    cur.close()
    conn.close()
    return api_ok()

@app.route("/api/aulas/saida", methods=["POST"])
@require_auth
@require_roles("admin", "professor", "auxiliar")
def saida():
    d = request.json or {}
    aula_id = d.get("aula_id")
    aluno_id = d.get("aluno_id")
    retirado_por = (d.get("retirado_por") or "").strip()

    if not aula_id or not aluno_id:
        return api_error("aula_id e aluno_id são obrigatórios")

    conn = db()
    cur = conn.cursor()

    # Atualiza saída se já existe
    cur.execute("""
        UPDATE frequencia
        SET horario_saida=%s, retirado_por=%s
        WHERE id_aula=%s AND id_aluno=%s
    """, (now_utc(), retirado_por, aula_id, aluno_id))

    # Se não existia, cria registro (caso raro)
    if cur.rowcount == 0:
        cur.execute("""
            INSERT INTO frequencia (id_aula, id_aluno, horario_entrada, horario_saida, retirado_por)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (id_aula, id_aluno)
            DO UPDATE SET horario_saida=EXCLUDED.horario_saida, retirado_por=EXCLUDED.retirado_por
        """, (aula_id, aluno_id, now_utc(), now_utc(), retirado_por))

    conn.commit()
    cur.close()
    conn.close()
    return api_ok()

# ---------------- Run local ----------------
if __name__ == "__main__":
    port = int(os.getenv("PORT", 8080))
    app.run(host="0.0.0.0", port=port)
