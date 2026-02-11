import os
from datetime import datetime, timedelta
from functools import wraps

import psycopg2
from psycopg2.extras import RealDictCursor
from flask import Flask, jsonify, request, render_template, send_from_directory
from flask_cors import CORS
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired


# =========================
# App
# =========================
app = Flask(__name__, static_folder="static", template_folder="templates")
CORS(app)

SECRET_KEY = os.getenv("SECRET_KEY", "ieqcentral_secret_dev_2026")
TOKEN_SALT = os.getenv("TOKEN_SALT", "ieqcentral_token_salt_2026")
TOKEN_MAX_AGE = int(os.getenv("TOKEN_MAX_AGE", "2592000"))  # 30 dias

serializer = URLSafeTimedSerializer(SECRET_KEY, salt=TOKEN_SALT)


# =========================
# Database
# =========================
def _normalize_database_url(url: str) -> str:
    """
    - remove espaços e quebras de linha (muito comum quando cola no Railway)
    - garante sslmode=require (necessário no Supabase)
    """
    url = (url or "").strip()

    # Se tiver aspas acidentais
    if (url.startswith('"') and url.endswith('"')) or (url.startswith("'") and url.endswith("'")):
        url = url[1:-1].strip()

    # Se não tem sslmode, adiciona
    if "sslmode=" not in url:
        if "?" in url:
            url = url + "&sslmode=require"
        else:
            url = url + "?sslmode=require"

    return url


def db():
    database_url = os.getenv("DATABASE_URL") or os.getenv("SUPABASE_DB_URL") or ""
    database_url = _normalize_database_url(database_url)

    if not database_url:
        raise RuntimeError("DATABASE_URL não configurada. Coloque no Railway > Variables.")

    return psycopg2.connect(database_url, cursor_factory=RealDictCursor)


def ensure_tables():
    conn = db()
    cur = conn.cursor()

    # usuarios
    cur.execute("""
    CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        nome TEXT NOT NULL,
        usuario TEXT UNIQUE NOT NULL,
        senha TEXT NOT NULL,
        role TEXT NOT NULL,
        foto TEXT
    )
    """)
    # extras que seu app.js já usa em tela (mesmo se não preencher)
    cur.execute("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefone TEXT")
    cur.execute("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS email TEXT")
    cur.execute("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS foto TEXT")

    # alunos
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
    )
    """)

    # avisos
    cur.execute("""
    CREATE TABLE IF NOT EXISTS avisos (
        id SERIAL PRIMARY KEY,
        mensagem TEXT,
        data_criacao TIMESTAMP,
        autor TEXT,
        autor_id INTEGER,
        imagem TEXT,
        fixado BOOLEAN DEFAULT FALSE
    )
    """)
    cur.execute("ALTER TABLE avisos ADD COLUMN IF NOT EXISTS autor_id INTEGER")

    # likes / comentarios
    cur.execute("""
    CREATE TABLE IF NOT EXISTS avisos_likes (
        id SERIAL PRIMARY KEY,
        aviso_id INTEGER REFERENCES avisos(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(aviso_id, user_id)
    )
    """)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS avisos_comentarios (
        id SERIAL PRIMARY KEY,
        aviso_id INTEGER REFERENCES avisos(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
        autor TEXT,
        texto TEXT,
        created_at TIMESTAMP DEFAULT NOW()
    )
    """)

    # aulas
    cur.execute("""
    CREATE TABLE IF NOT EXISTS aulas (
        id SERIAL PRIMARY KEY,
        data_aula TIMESTAMP,
        tema TEXT,
        professores TEXT
    )
    """)
    cur.execute("ALTER TABLE aulas ADD COLUMN IF NOT EXISTS data_aula TIMESTAMP")
    cur.execute("ALTER TABLE aulas ADD COLUMN IF NOT EXISTS tema TEXT")
    cur.execute("ALTER TABLE aulas ADD COLUMN IF NOT EXISTS professores TEXT")
    cur.execute("ALTER TABLE aulas ADD COLUMN IF NOT EXISTS encerrada_em TIMESTAMP")

    # frequencia
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


# roda migração na inicialização (se DB ok)
try:
    ensure_tables()
except Exception as e:
    print("⚠️ Falha ao preparar/migrar tabelas:", e)


# =========================
# Auth / Token
# =========================
def make_token(user: dict) -> str:
    payload = {
        "id": user["id"],
        "role": user.get("role", "membro"),
        "exp": (datetime.utcnow() + timedelta(seconds=TOKEN_MAX_AGE)).timestamp()
    }
    return serializer.dumps(payload)


def read_token(token: str) -> dict:
    try:
        data = serializer.loads(token, max_age=TOKEN_MAX_AGE)
        # exp extra (por garantia)
        exp = data.get("exp")
        if exp and datetime.utcnow().timestamp() > float(exp):
            raise SignatureExpired("exp")
        return data
    except SignatureExpired:
        raise
    except BadSignature:
        raise


def api_error(msg: str, status: int = 400, exc: Exception | None = None):
    if exc:
        print("❌", msg, "->", repr(exc))
    return jsonify({"ok": False, "error": msg}), status


def require_auth(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return api_error("Token ausente", 401)
        token = auth.split(" ", 1)[1].strip()
        try:
            t = read_token(token)
        except Exception:
            return api_error("Token inválido/expirado", 401)

        # carrega usuário
        try:
            conn = db()
            cur = conn.cursor()
            cur.execute("SELECT id, nome, usuario, role, email, telefone, foto FROM usuarios WHERE id=%s", (t["id"],))
            user = cur.fetchone()
            cur.close()
            conn.close()
            if not user:
                return api_error("Usuário não encontrado", 401)
        except Exception as e:
            return api_error("Erro ao validar usuário", 500, e)

        request.user = user
        return fn(*args, **kwargs)
    return wrapper


def is_admin():
    u = getattr(request, "user", None) or {}
    return (u.get("role") or "").lower() == "admin"


# =========================
# Pages / Static
# =========================
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/sw.js")
def sw_root():
    resp = send_from_directory(app.static_folder, "sw.js")
    resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    return resp


@app.route("/health")
def health():
    # ajuda debug do front pra ver pastas
    try:
        static_items = []
        if os.path.isdir(app.static_folder):
            static_items = sorted(os.listdir(app.static_folder))
        return jsonify({"ok": True, "static_files": static_items})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# =========================
# API Auth
# =========================
@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}

    # seu app.js manda email/password
    email = (data.get("email") or "").strip()
    password = (data.get("password") or "").strip()

    # fallback (caso você use usuario/senha)
    usuario = (data.get("usuario") or "").strip()
    senha = (data.get("senha") or "").strip()

    try:
        conn = db()
        cur = conn.cursor()

        if email and password:
            # tenta por email primeiro; se não achar, tenta pelo usuario (muita gente usa usuario=admin sem email)
            cur.execute(
                "SELECT id, nome, usuario, role, email, telefone, foto, senha FROM usuarios WHERE email=%s",
                (email,)
            )
            user = cur.fetchone()
            if not user:
                cur.execute(
                    "SELECT id, nome, usuario, role, email, telefone, foto, senha FROM usuarios WHERE usuario=%s",
                    (email,)
                )
                user = cur.fetchone()
            if not user or (user.get("senha") != password):
                cur.close(); conn.close()
                return api_error("Credenciais inválidas", 401)

        else:
            if not usuario or not senha:
                cur.close(); conn.close()
                return api_error("Informe email/password ou usuario/senha", 400)

            cur.execute(
                "SELECT id, nome, usuario, role, email, telefone, foto, senha FROM usuarios WHERE usuario=%s",
                (usuario,)
            )
            user = cur.fetchone()
            if not user or (user.get("senha") != senha):
                cur.close(); conn.close()
                return api_error("Credenciais inválidas", 401)

        cur.close()
        conn.close()

        token = make_token(user)
        return jsonify({
            "ok": True,
            "token": token,
            "id": user["id"],
            "nome": user.get("nome"),
            "usuario": user.get("usuario"),
            "role": user.get("role"),
            "email": user.get("email"),
        })
    except Exception as e:
        return api_error("Erro no login", 500, e)


@app.route("/api/me", methods=["GET"])
@require_auth
def me():
    u = request.user
    return jsonify({
        "ok": True,
        "id": u["id"],
        "nome": u.get("nome"),
        "usuario": u.get("usuario"),
        "role": u.get("role"),
        "email": u.get("email"),
        "telefone": u.get("telefone"),
        "foto": u.get("foto"),
    })


# =========================
# ALUNOS
# =========================
@app.route("/api/alunos", methods=["GET"])
@require_auth
def alunos_list():
    q = (request.args.get("q") or "").strip()
    try:
        conn = db()
        cur = conn.cursor()
        if q:
            cur.execute("""
                SELECT *
                FROM alunos
                WHERE nome ILIKE %s
                ORDER BY nome ASC
                LIMIT 500
            """, (f"%{q}%",))
        else:
            cur.execute("SELECT * FROM alunos ORDER BY nome ASC LIMIT 500")
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return jsonify(rows)
    except Exception as e:
        return api_error("Erro ao listar alunos", 500, e)


@app.route("/api/alunos", methods=["POST"])
@require_auth
def alunos_create():
    # ✅ professor/auxiliar também podem cadastrar alunos (bloqueia só se você quiser um role específico)
    data = request.get_json(silent=True) or {}
    nome = (data.get("nome") or "").strip()
    if not nome:
        return api_error("Nome do aluno é obrigatório", 400)

    payload = (
        nome,
        (data.get("data_nascimento") or "").strip(),
        (data.get("responsavel") or "").strip(),
        (data.get("telefone") or "").strip(),
        (data.get("obs") or data.get("observacoes") or "").strip(),
        (data.get("autorizado_retirar") or "").strip(),
        (data.get("autorizado_2") or "").strip(),
        (data.get("autorizado_3") or "").strip(),
        (data.get("foto") or "").strip() or None,
    )

    try:
        conn = db()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO alunos
            (nome, data_nascimento, responsavel, telefone, observacoes,
             autorizado_retirar, autorizado_2, autorizado_3, foto)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
            RETURNING id
        """, payload)
        new_id = cur.fetchone()["id"]
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"ok": True, "id": new_id})
    except Exception as e:
        return api_error("Erro ao cadastrar aluno", 500, e)


# =========================
# EQUIPE (USUÁRIOS) - só admin cria/edita/exclui
# =========================
@app.route("/api/usuarios", methods=["GET"])
@require_auth
def usuarios_list():
    try:
        conn = db()
        cur = conn.cursor()
        cur.execute("""
            SELECT id, nome, usuario, role, telefone, email, foto
            FROM usuarios
            ORDER BY nome ASC
            LIMIT 500
        """)
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return jsonify(rows)
    except Exception as e:
        return api_error("Erro ao listar equipe", 500, e)


@app.route("/api/usuarios", methods=["POST"])
@require_auth
def usuarios_create():
    if not is_admin():
        return api_error("Apenas admin pode cadastrar equipe", 403)

    data = request.get_json(silent=True) or {}
    nome = (data.get("nome") or "").strip()
    usuario = (data.get("usuario") or "").strip()
    senha = (data.get("senha") or "").strip()
    role = (data.get("role") or "membro").strip()

    if not nome or not usuario or not senha:
        return api_error("Nome, usuário e senha são obrigatórios", 400)

    try:
        conn = db()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO usuarios (nome, usuario, senha, role, telefone, email, foto)
            VALUES (%s,%s,%s,%s,%s,%s,%s)
            RETURNING id
        """, (
            nome, usuario, senha, role,
            (data.get("telefone") or "").strip(),
            (data.get("email") or "").strip(),
            (data.get("foto") or "").strip() or None
        ))
        new_id = cur.fetchone()["id"]
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"ok": True, "id": new_id})
    except Exception as e:
        return api_error("Erro ao cadastrar membro", 500, e)


# =========================
# AULAS / PRESENÇA  ✅ (rotas que seu app.js usa)
# =========================
@app.route("/api/aulas/ativa", methods=["GET"])
@require_auth
def aulas_ativa():
    try:
        conn = db()
        cur = conn.cursor()
        cur.execute("""
            SELECT id, data_aula, tema, professores, encerrada_em
            FROM aulas
            WHERE encerrada_em IS NULL
            ORDER BY data_aula DESC NULLS LAST
            LIMIT 1
        """)
        aula = cur.fetchone()
        cur.close()
        conn.close()
        return jsonify({"ok": True, "aula": aula})
    except Exception as e:
        return api_error("Erro ao buscar aula ativa", 500, e)


@app.route("/api/aulas/iniciar", methods=["POST"])
@require_auth
def aulas_iniciar():
    data = request.get_json(silent=True) or {}
    tema = (data.get("tema") or "").strip()
    professor = (data.get("professor") or "").strip()
    auxiliar = (data.get("auxiliar") or "").strip()

    if not tema or not professor:
        return api_error("Tema e professor são obrigatórios", 400)

    professores_txt = professor
    if auxiliar:
        professores_txt = f"{professor} / {auxiliar}"

    try:
        conn = db()
        cur = conn.cursor()

        # se já existe uma ativa, não cria outra
        cur.execute("SELECT id FROM aulas WHERE encerrada_em IS NULL ORDER BY data_aula DESC NULLS LAST LIMIT 1")
        active = cur.fetchone()
        if active:
            cur.close(); conn.close()
            return api_error("Já existe uma aula ativa. Encerre antes de iniciar outra.", 400)

        cur.execute("""
            INSERT INTO aulas (data_aula, tema, professores, encerrada_em)
            VALUES (%s,%s,%s,NULL)
            RETURNING id, data_aula, tema, professores, encerrada_em
        """, (datetime.utcnow(), tema, professores_txt))

        aula = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"ok": True, "aula": aula})
    except Exception as e:
        return api_error("Erro ao iniciar aula", 500, e)


@app.route("/api/aulas/encerrar", methods=["POST"])
@require_auth
def aulas_encerrar():
    try:
        conn = db()
        cur = conn.cursor()
        cur.execute("""
            UPDATE aulas
            SET encerrada_em=%s
            WHERE id = (
                SELECT id FROM aulas WHERE encerrada_em IS NULL
                ORDER BY data_aula DESC NULLS LAST
                LIMIT 1
            )
            RETURNING id
        """, (datetime.utcnow(),))
        row = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"ok": True, "encerrada": bool(row)})
    except Exception as e:
        return api_error("Erro ao encerrar aula", 500, e)


@app.route("/api/aulas/historico", methods=["GET"])
@require_auth
def aulas_historico():
    try:
        conn = db()
        cur = conn.cursor()

        cur.execute("""
            SELECT id FROM aulas
            WHERE encerrada_em IS NULL
            ORDER BY data_aula DESC NULLS LAST
            LIMIT 1
        """)
        ativa = cur.fetchone()
        ativa_id = ativa["id"] if ativa else None

        cur.execute("""
            SELECT id, data_aula, tema, professores, encerrada_em
            FROM aulas
            ORDER BY COALESCE(data_aula, NOW()) DESC
            LIMIT 200
        """)
        aulas = cur.fetchall()

        cur.close()
        conn.close()
        return jsonify({"ok": True, "ativa_id": ativa_id, "aulas": aulas})
    except Exception as e:
        return api_error("Erro ao carregar histórico", 500, e)


@app.route("/api/aulas/<int:aula_id>/presenca", methods=["GET"])
@require_auth
def aulas_presenca(aula_id):
    try:
        conn = db()
        cur = conn.cursor()
        cur.execute("""
            SELECT
                f.id_aula,
                f.id_aluno,
                a.nome,
                f.horario_entrada,
                f.horario_saida,
                f.retirado_por
            FROM frequencia f
            JOIN alunos a ON a.id = f.id_aluno
            WHERE f.id_aula=%s
            ORDER BY a.nome ASC
        """, (aula_id,))
        presentes = cur.fetchall()
        cur.close()
        conn.close()
        return jsonify({"ok": True, "presentes": presentes})
    except Exception as e:
        return api_error("Erro ao carregar presença", 500, e)


@app.route("/api/aulas/entrada", methods=["POST"])
@require_auth
def aulas_entrada():
    d = request.get_json(silent=True) or {}
    aula_id = d.get("aula_id")
    aluno_id = d.get("aluno_id")
    if not aula_id or not aluno_id:
        return api_error("aula_id e aluno_id são obrigatórios", 400)

    try:
        conn = db()
        cur = conn.cursor()
        now = datetime.utcnow()

        # UPSERT pela UNIQUE(id_aula,id_aluno)
        cur.execute("""
            INSERT INTO frequencia (id_aula, id_aluno, horario_entrada)
            VALUES (%s,%s,%s)
            ON CONFLICT (id_aula, id_aluno)
            DO UPDATE SET horario_entrada = COALESCE(frequencia.horario_entrada, EXCLUDED.horario_entrada)
        """, (aula_id, aluno_id, now))

        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"ok": True})
    except Exception as e:
        return api_error("Erro ao registrar entrada", 500, e)


@app.route("/api/aulas/saida", methods=["POST"])
@require_auth
def aulas_saida():
    d = request.get_json(silent=True) or {}
    aula_id = d.get("aula_id")
    aluno_id = d.get("aluno_id")
    retirado_por = (d.get("retirado_por") or "").strip()

    if not aula_id or not aluno_id:
        return api_error("aula_id e aluno_id são obrigatórios", 400)

    try:
        conn = db()
        cur = conn.cursor()
        now = datetime.utcnow()

        cur.execute("""
            UPDATE frequencia
            SET horario_saida=%s, retirado_por=%s
            WHERE id_aula=%s AND id_aluno=%s
        """, (now, retirado_por, aula_id, aluno_id))

        # se não existia entrada ainda, cria registro
        if cur.rowcount == 0:
            cur.execute("""
                INSERT INTO frequencia (id_aula, id_aluno, horario_entrada, horario_saida, retirado_por)
                VALUES (%s,%s,%s,%s,%s)
                ON CONFLICT (id_aula, id_aluno)
                DO UPDATE SET horario_saida=%s, retirado_por=%s
            """, (aula_id, aluno_id, now, now, retirado_por, now, retirado_por))

        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"ok": True})
    except Exception as e:
        return api_error("Erro ao registrar saída", 500, e)


# =========================
# Run local
# =========================
if __name__ == "__main__":
    port = int(os.getenv("PORT", "8080"))
    app.run(host="0.0.0.0", port=port)
