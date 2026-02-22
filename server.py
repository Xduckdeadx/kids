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
DB_CONFIG = {
    "host": os.getenv("DB_HOST", "db.phqsoznnrrcjyebzyfht.supabase.co"),
    "database": os.getenv("DB_NAME", "postgres"),
    "user": os.getenv("DB_USER", "postgres.phqsoznnrrcjyebzyfht"),
    "password": os.getenv("DB_PASS", "Ieqcentral2026*"),
    "port": os.getenv("DB_PORT", "5432"),
    "sslmode": os.getenv("DB_SSLMODE", "require"),
}

# ---------------- Auth ----------------
SECRET_KEY = os.getenv("SECRET_KEY", "ieq-central-2026-super-secret")
TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 14
serializer = URLSafeTimedSerializer(SECRET_KEY)


def db():
    return psycopg2.connect(**DB_CONFIG, cursor_factory=RealDictCursor)


def api_error(message, status=500, details=None):
    payload = {"ok": False, "error": message}
    if details:
        payload["details"] = str(details)
    return jsonify(payload), status


def make_token(user):
    payload = {"id": user["id"], "usuario": user["usuario"], "role": user.get("role", "membro")}
    return serializer.dumps(payload)


def read_token(token):
    return serializer.loads(token, max_age=TOKEN_MAX_AGE_SECONDS)


def get_bearer_token():
    auth = (request.headers.get("Authorization") or "").strip()
    if auth.lower().startswith("bearer "):
        return auth.split(" ", 1)[1].strip()
    return ""


def require_auth(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        token = get_bearer_token()
        if not token:
            return api_error("Não autenticado", 401)
        try:
            user = read_token(token)
            request.user = user
        except SignatureExpired:
            return api_error("Sessão expirada", 401)
        except BadSignature:
            return api_error("Token inválido", 401)
        return fn(*args, **kwargs)
    return wrapper


def is_admin():
    u = getattr(request, "user", None) or {}
    return u.get("role") == "admin"


# ---------------- Migration / Tables ----------------
def ensure_tables():
    conn = db()
    cur = conn.cursor()

    cur.execute("""
    CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        nome TEXT,
        usuario TEXT UNIQUE,
        senha TEXT,
        role TEXT DEFAULT 'membro',
        telefone TEXT,
        email TEXT,
        foto TEXT,
        imagem_ficha TEXT
    )
    """)
    cur.execute("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefone TEXT")
    cur.execute("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS email TEXT")
    cur.execute("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS foto TEXT")

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
    cur.execute("ALTER TABLE alunos ADD COLUMN IF NOT EXISTS data_nascimento TEXT")
    cur.execute("ALTER TABLE alunos ADD COLUMN IF NOT EXISTS responsavel TEXT")
    cur.execute("ALTER TABLE alunos ADD COLUMN IF NOT EXISTS telefone TEXT")
    cur.execute("ALTER TABLE alunos ADD COLUMN IF NOT EXISTS observacoes TEXT")
    cur.execute("ALTER TABLE alunos ADD COLUMN IF NOT EXISTS autorizado_retirar TEXT")
    cur.execute("ALTER TABLE alunos ADD COLUMN IF NOT EXISTS autorizado_2 TEXT")
    cur.execute("ALTER TABLE alunos ADD COLUMN IF NOT EXISTS autorizado_3 TEXT")
    cur.execute("ALTER TABLE alunos ADD COLUMN IF NOT EXISTS foto TEXT")
    cur.execute("ALTER TABLE alunos ADD COLUMN IF NOT EXISTS imagem_ficha TEXT")

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
    cur.execute("ALTER TABLE avisos ADD COLUMN IF NOT EXISTS imagem TEXT")
    cur.execute("ALTER TABLE avisos ADD COLUMN IF NOT EXISTS fixado BOOLEAN DEFAULT FALSE")
    cur.execute("ALTER TABLE avisos ADD COLUMN IF NOT EXISTS data_criacao TIMESTAMP")
    cur.execute("ALTER TABLE avisos ADD COLUMN IF NOT EXISTS autor TEXT")
    cur.execute("ALTER TABLE avisos ADD COLUMN IF NOT EXISTS mensagem TEXT")

    cur.execute("""
    CREATE TABLE IF NOT EXISTS avisos_likes (
        id SERIAL PRIMARY KEY,
        aviso_id INTEGER REFERENCES avisos(id) ON DELETE CASCADE,
        user_id INTEGER,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(aviso_id, user_id)
    )
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS avisos_comentarios (
        id SERIAL PRIMARY KEY,
        aviso_id INTEGER REFERENCES avisos(id) ON DELETE CASCADE,
        user_id INTEGER,
        user_nome TEXT,
        texto TEXT,
        created_at TIMESTAMP DEFAULT NOW()
    )
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS aulas (
        id SERIAL PRIMARY KEY,
        data_aula TIMESTAMP DEFAULT NOW(),
        tema TEXT,
        professores TEXT,
        encerrada_em TIMESTAMP
    )
    """)
    cur.execute("ALTER TABLE aulas ADD COLUMN IF NOT EXISTS tema TEXT")
    cur.execute("ALTER TABLE aulas ADD COLUMN IF NOT EXISTS professores TEXT")
    cur.execute("ALTER TABLE aulas ADD COLUMN IF NOT EXISTS encerrada_em TIMESTAMP")
    cur.execute("ALTER TABLE aulas ADD COLUMN IF NOT EXISTS data_aula TIMESTAMP")

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
    cur.execute("ALTER TABLE frequencia ADD COLUMN IF NOT EXISTS horario_entrada TIMESTAMP")
    cur.execute("ALTER TABLE frequencia ADD COLUMN IF NOT EXISTS horario_saida TIMESTAMP")
    cur.execute("ALTER TABLE frequencia ADD COLUMN IF NOT EXISTS retirado_por TEXT")

    cur.execute("SELECT id FROM usuarios WHERE usuario='admin'")
    if not cur.fetchone():
        cur.execute(
            "INSERT INTO usuarios (nome, usuario, senha, role) VALUES (%s, %s, %s, %s)",
            ("Administrador", "admin", "1234", "admin")
        )

    conn.commit()
    cur.close()
    conn.close()


try:
    ensure_tables()
except Exception as e:
    print("⚠️ Falha ao preparar/migrar tabelas:", e)


# ---------------- Routes ----------------
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/sw.js")
def sw_root():
    return send_from_directory(app.static_folder, "sw.js")


@app.route("/api/health")
def health():
    return jsonify({"ok": True, "time": datetime.utcnow().isoformat()})


# ---------------- Auth API ----------------
@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    usuario = (data.get("usuario") or "").strip()
    senha = (data.get("senha") or "").strip()

    if not usuario or not senha:
        return api_error("Informe usuário e senha", 400)

    try:
        conn = db()
        cur = conn.cursor()
        cur.execute(
            "SELECT id, nome, usuario, role, telefone, email, foto, senha FROM usuarios WHERE usuario=%s",
            (usuario,)
        )
        u = cur.fetchone()
        cur.close()
        conn.close()
    except Exception as e:
        return api_error("Erro ao consultar usuário", 500, e)

    if not u or (u.get("senha") != senha):
        return api_error("Usuário ou senha inválidos", 401)

    token = make_token(u)
    return jsonify({
        "ok": True,
        "token": token,
        "usuario": {
            "id": u["id"],
            "nome": u.get("nome") or "Usuário",
            "usuario": u.get("usuario"),
            "role": u.get("role") or "membro",
            "telefone": u.get("telefone"),
            "email": u.get("email"),
            "foto": u.get("foto"),
        }
    })


@app.route("/api/me")
@require_auth
def me():
    uid = request.user["id"]
    try:
        conn = db()
        cur = conn.cursor()
        cur.execute("SELECT id, nome, usuario, role, telefone, email, foto FROM usuarios WHERE id=%s", (uid,))
        u = cur.fetchone()
        cur.close()
        conn.close()
    except Exception as e:
        return api_error("Erro ao buscar usuário", 500, e)

    if not u:
        return api_error("Usuário não encontrado", 404)

    return jsonify({"ok": True, "usuario": u})


# ---------------- Stats ----------------
@app.route("/api/estatisticas")
@require_auth
def estatisticas():
    try:
        conn = db()
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*)::int AS total FROM alunos")
        total_alunos = cur.fetchone()["total"]

        cur.execute("SELECT COUNT(*)::int AS total FROM usuarios")
        total_equipe = cur.fetchone()["total"]

        cur.execute("SELECT COUNT(*)::int AS total FROM avisos")
        total_avisos = cur.fetchone()["total"]

        cur.close()
        conn.close()
        return jsonify({
            "total_alunos": total_alunos, 
            "total_equipe": total_equipe,
            "total_avisos": total_avisos
        })
    except Exception as e:
        return api_error("Erro ao carregar estatísticas", 500, e)


# ==========================================================
# ALUNOS CRUD
# ==========================================================
@app.route("/api/alunos", methods=["GET"])
@require_auth
def alunos_list():
    q = (request.args.get("q") or "").strip()
    try:
        conn = db()
        cur = conn.cursor()
        if q:
            cur.execute("""
                SELECT id, nome, data_nascimento, responsavel, telefone, observacoes,
                       autorizado_retirar, autorizado_2, autorizado_3, foto
                FROM alunos
                WHERE nome ILIKE %s OR responsavel ILIKE %s
                ORDER BY nome ASC
                LIMIT 500
            """, (f"%{q}%", f"%{q}%"))
        else:
            cur.execute("""
                SELECT id, nome, data_nascimento, responsavel, telefone, observacoes,
                       autorizado_retirar, autorizado_2, autorizado_3, foto
                FROM alunos
                ORDER BY nome ASC
                LIMIT 500
            """)
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return jsonify(rows)
    except Exception as e:
        return api_error("Erro ao listar alunos", 500, e)


@app.route("/api/alunos", methods=["POST"])
@require_auth
def alunos_create():
    data = request.get_json(silent=True) or {}
    nome = (data.get("nome") or "").strip()
    if not nome:
        return api_error("Nome do aluno é obrigatório", 400)

    payload = (
        nome,
        (data.get("data_nascimento") or "").strip(),
        (data.get("responsavel") or "").strip(),
        (data.get("telefone") or "").strip(),
        (data.get("observacoes") or "").strip(),
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


@app.route("/api/alunos/<int:aluno_id>", methods=["PUT"])
@require_auth
def alunos_update(aluno_id):
    data = request.get_json(silent=True) or {}
    nome = (data.get("nome") or "").strip()
    if not nome:
        return api_error("Nome do aluno é obrigatório", 400)

    payload = (
        nome,
        (data.get("data_nascimento") or "").strip(),
        (data.get("responsavel") or "").strip(),
        (data.get("telefone") or "").strip(),
        (data.get("observacoes") or "").strip(),
        (data.get("autorizado_retirar") or "").strip(),
        (data.get("autorizado_2") or "").strip(),
        (data.get("autorizado_3") or "").strip(),
        (data.get("foto") or "").strip() or None,
        aluno_id
    )

    try:
        conn = db()
        cur = conn.cursor()
        cur.execute("""
            UPDATE alunos
            SET nome=%s, data_nascimento=%s, responsavel=%s, telefone=%s, observacoes=%s,
                autorizado_retirar=%s, autorizado_2=%s, autorizado_3=%s, foto=%s
            WHERE id=%s
        """, payload)
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"ok": True})
    except Exception as e:
        return api_error("Erro ao atualizar aluno", 500, e)


@app.route("/api/alunos/<int:aluno_id>", methods=["DELETE"])
@require_auth
def alunos_delete(aluno_id):
    try:
        conn = db()
        cur = conn.cursor()
        cur.execute("DELETE FROM alunos WHERE id=%s", (aluno_id,))
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"ok": True})
    except Exception as e:
        return api_error("Erro ao excluir aluno", 500, e)


# ==========================================================
# EQUIPE CRUD
# ==========================================================
@app.route("/api/usuarios", methods=["GET"])
@require_auth
def usuarios_list():
    q = (request.args.get("q") or "").strip()
    try:
        conn = db()
        cur = conn.cursor()
        if q:
            cur.execute("""
                SELECT id, nome, usuario, role, telefone, email, foto
                FROM usuarios
                WHERE nome ILIKE %s OR usuario ILIKE %s
                ORDER BY nome ASC
                LIMIT 500
            """, (f"%{q}%", f"%{q}%"))
        else:
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

    payload = (
        nome, usuario, senha, role,
        (data.get("telefone") or "").strip(),
        (data.get("email") or "").strip(),
        (data.get("foto") or "").strip() or None
    )

    try:
        conn = db()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO usuarios (nome, usuario, senha, role, telefone, email, foto)
            VALUES (%s,%s,%s,%s,%s,%s,%s)
            RETURNING id
        """, payload)
        new_id = cur.fetchone()["id"]
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"ok": True, "id": new_id})
    except Exception as e:
        return api_error("Erro ao cadastrar membro", 500, e)


@app.route("/api/usuarios/<int:uid>", methods=["PUT"])
@require_auth
def usuarios_update(uid):
    if not is_admin():
        return api_error("Apenas admin pode editar equipe", 403)

    data = request.get_json(silent=True) or {}
    nome = (data.get("nome") or "").strip()
    usuario = (data.get("usuario") or "").strip()
    role = (data.get("role") or "membro").strip()
    senha = (data.get("senha") or "").strip()

    if not nome or not usuario:
        return api_error("Nome e usuário são obrigatórios", 400)

    try:
        conn = db()
        cur = conn.cursor()

        if senha:
            cur.execute("""
                UPDATE usuarios
                SET nome=%s, usuario=%s, senha=%s, role=%s, telefone=%s, email=%s, foto=%s
                WHERE id=%s
            """, (
                nome, usuario, senha, role,
                (data.get("telefone") or "").strip(),
                (data.get("email") or "").strip(),
                (data.get("foto") or "").strip() or None,
                uid
            ))
        else:
            cur.execute("""
                UPDATE usuarios
                SET nome=%s, usuario=%s, role=%s, telefone=%s, email=%s, foto=%s
                WHERE id=%s
            """, (
                nome, usuario, role,
                (data.get("telefone") or "").strip(),
                (data.get("email") or "").strip(),
                (data.get("foto") or "").strip() or None,
                uid
            ))

        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"ok": True})
    except Exception as e:
        return api_error("Erro ao atualizar membro", 500, e)


@app.route("/api/usuarios/<int:uid>", methods=["DELETE"])
@require_auth
def usuarios_delete(uid):
    if not is_admin():
        return api_error("Apenas admin pode excluir equipe", 403)

    if uid == request.user["id"]:
        return api_error("Você não pode excluir seu próprio usuário", 400)

    try:
        conn = db()
        cur = conn.cursor()
        cur.execute("DELETE FROM usuarios WHERE id=%s", (uid,))
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"ok": True})
    except Exception as e:
        return api_error("Erro ao excluir membro", 500, e)


# ==========================================================
# MURAL (AVISOS / LIKES / COMENTÁRIOS)
# ==========================================================
@app.route("/api/avisos", methods=["GET"])
@require_auth
def avisos_list():
    uid = request.user["id"]
    try:
        conn = db()
        cur = conn.cursor()

        cur.execute("""
            SELECT id, mensagem, data_criacao, autor, autor_id, imagem, fixado
            FROM avisos
            ORDER BY fixado DESC, data_criacao DESC
            LIMIT 200
        """)
        avisos = cur.fetchall()

        cur.execute("SELECT aviso_id, COUNT(*)::int AS likes FROM avisos_likes GROUP BY aviso_id")
        likes_map = {r["aviso_id"]: r["likes"] for r in cur.fetchall()}

        cur.execute("SELECT aviso_id, COUNT(*)::int AS comments FROM avisos_comentarios GROUP BY aviso_id")
        comments_map = {r["aviso_id"]: r["comments"] for r in cur.fetchall()}

        cur.execute("SELECT aviso_id FROM avisos_likes WHERE user_id=%s", (uid,))
        liked_set = {r["aviso_id"] for r in cur.fetchall()}

        cur.close()
        conn.close()

        for a in avisos:
            a["like_count"] = likes_map.get(a["id"], 0)
            a["comment_count"] = comments_map.get(a["id"], 0)
            a["liked_by_me"] = a["id"] in liked_set
            if a.get("data_criacao"):
                a["data_criacao"] = a["data_criacao"].isoformat()

        return jsonify(avisos)

    except Exception as e:
        return api_error("Erro ao carregar avisos", 500, e)


@app.route("/api/avisos", methods=["POST"])
@require_auth
def avisos_create():
    data = request.get_json(silent=True) or {}
    mensagem = (data.get("mensagem") or "").strip()
    imagem = (data.get("imagem") or "").strip()

    if not mensagem and not imagem:
        return api_error("Informe mensagem ou imagem", 400)

    uid = request.user["id"]

    try:
        conn = db()
        cur = conn.cursor()
        cur.execute("SELECT nome FROM usuarios WHERE id=%s", (uid,))
        u = cur.fetchone()
        autor = (u.get("nome") if u else "Usuário")

        cur.execute("""
            INSERT INTO avisos (mensagem, data_criacao, autor, autor_id, imagem, fixado)
            VALUES (%s, NOW(), %s, %s, %s, FALSE)
            RETURNING id
        """, (mensagem, autor, uid, imagem if imagem else None))

        new_id = cur.fetchone()["id"]
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"ok": True, "id": new_id})

    except Exception as e:
        return api_error("Erro ao publicar aviso", 500, e)


@app.route("/api/avisos/<int:aviso_id>/fixar", methods=["POST"])
@require_auth
def avisos_fixar(aviso_id):
    if not is_admin():
        return api_error("Apenas admin", 403)

    try:
        conn = db()
        cur = conn.cursor()
        cur.execute("SELECT fixado FROM avisos WHERE id=%s", (aviso_id,))
        row = cur.fetchone()
        if not row:
            cur.close()
            conn.close()
            return api_error("Aviso não encontrado", 404)

        novo = not bool(row["fixado"])
        cur.execute("UPDATE avisos SET fixado=%s WHERE id=%s", (novo, aviso_id))
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"ok": True, "fixado": novo})
    except Exception as e:
        return api_error("Erro ao fixar aviso", 500, e)


@app.route("/api/avisos/<int:aviso_id>", methods=["DELETE"])
@require_auth
def avisos_delete(aviso_id):
    if not is_admin():
        return api_error("Apenas admin", 403)

    try:
        conn = db()
        cur = conn.cursor()
        cur.execute("DELETE FROM avisos WHERE id=%s", (aviso_id,))
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"ok": True})
    except Exception as e:
        return api_error("Erro ao excluir aviso", 500, e)


@app.route("/api/avisos/<int:aviso_id>/like", methods=["POST"])
@require_auth
def aviso_like_toggle(aviso_id):
    uid = request.user["id"]

    try:
        conn = db()
        cur = conn.cursor()

        liked = False
        try:
            cur.execute("INSERT INTO avisos_likes (aviso_id, user_id) VALUES (%s, %s)", (aviso_id, uid))
            conn.commit()
            liked = True
        except Exception:
            conn.rollback()
            cur.execute("DELETE FROM avisos_likes WHERE aviso_id=%s AND user_id=%s", (aviso_id, uid))
            conn.commit()
            liked = False

        cur.execute("SELECT COUNT(*)::int AS total FROM avisos_likes WHERE aviso_id=%s", (aviso_id,))
        total = cur.fetchone()["total"]

        cur.close()
        conn.close()

        return jsonify({"ok": True, "liked": liked, "like_count": total})

    except Exception as e:
        return api_error("Erro ao processar like", 500, e)


@app.route("/api/avisos/<int:aviso_id>/comentarios", methods=["GET"])
@require_auth
def comentarios_list(aviso_id):
    try:
        conn = db()
        cur = conn.cursor()
        cur.execute("""
            SELECT id, aviso_id, user_id, user_nome, texto, created_at
            FROM avisos_comentarios
            WHERE aviso_id=%s
            ORDER BY created_at ASC
            LIMIT 300
        """, (aviso_id,))
        rows = cur.fetchall()
        cur.close()
        conn.close()

        for r in rows:
            if r.get("created_at"):
                r["created_at"] = r["created_at"].isoformat()
        return jsonify(rows)

    except Exception as e:
        return api_error("Erro ao carregar comentários", 500, e)


@app.route("/api/avisos/<int:aviso_id>/comentarios", methods=["POST"])
@require_auth
def comentarios_create(aviso_id):
    data = request.get_json(silent=True) or {}
    texto = (data.get("texto") or "").strip()
    if not texto:
        return api_error("Comentário vazio", 400)

    uid = request.user["id"]

    try:
        conn = db()
        cur = conn.cursor()
        cur.execute("SELECT nome FROM usuarios WHERE id=%s", (uid,))
        u = cur.fetchone()
        nome = (u.get("nome") if u else "Usuário")

        cur.execute("""
            INSERT INTO avisos_comentarios (aviso_id, user_id, user_nome, texto)
            VALUES (%s, %s, %s, %s)
            RETURNING id
        """, (aviso_id, uid, nome, texto))

        cid = cur.fetchone()["id"]
        conn.commit()
        cur.close()
        conn.close()

        return jsonify({"ok": True, "id": cid})

    except Exception as e:
        return api_error("Erro ao comentar", 500, e)


@app.route("/api/comentarios/<int:comentario_id>", methods=["DELETE"])
@require_auth
def comentarios_delete(comentario_id):
    uid = request.user["id"]

    try:
        conn = db()
        cur = conn.cursor()

        cur.execute("SELECT user_id FROM avisos_comentarios WHERE id=%s", (comentario_id,))
        row = cur.fetchone()
        if not row:
            cur.close()
            conn.close()
            return api_error("Comentário não encontrado", 404)

        if (row["user_id"] != uid) and (not is_admin()):
            cur.close()
            conn.close()
            return api_error("Sem permissão", 403)

        cur.execute("DELETE FROM avisos_comentarios WHERE id=%s", (comentario_id,))
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"ok": True})

    except Exception as e:
        return api_error("Erro ao excluir comentário", 500, e)


# ==========================================================
# AULAS (VERSÃO CORRIGIDA)
# ==========================================================
@app.get("/api/aulas/ativa")
@require_auth
def aulas_ativa():
    """Retorna a aula ativa (encerrada_em IS NULL) mais recente"""
    try:
        conn = db()
        cur = conn.cursor()
        cur.execute(
            "SELECT id, data_aula, tema, professores, encerrada_em FROM aulas WHERE encerrada_em IS NULL ORDER BY data_aula DESC LIMIT 1"
        )
        row = cur.fetchone()
        cur.close()
        conn.close()
        
        # Se não encontrar aula ativa, retorna None
        if not row:
            return jsonify({"ok": True, "aula": None})
            
        # Converter datetime para string ISO
        if row.get("data_aula"):
            row["data_aula"] = row["data_aula"].isoformat()
        if row.get("encerrada_em"):
            row["encerrada_em"] = row["encerrada_em"].isoformat()
            
        return jsonify({"ok": True, "aula": row})
    except Exception as e:
        print("Erro em /api/aulas/ativa:", str(e))
        return api_error("Erro ao buscar aula ativa", 500, e)


@app.post("/api/aulas/iniciar")
@require_auth
def aulas_iniciar():
    """Inicia uma nova aula"""
    try:
        body = request.get_json(force=True, silent=True) or {}
        tema = (body.get("tema") or "").strip()
        professor = (body.get("professor") or "").strip()
        auxiliar = (body.get("auxiliar") or "").strip()

        if not tema:
            return api_error("Tema é obrigatório", 400)
        if not professor:
            return api_error("Professor é obrigatório", 400)

        professores = professor
        if auxiliar and auxiliar.lower() != "nenhum":
            professores = f"{professor} / Aux: {auxiliar}"

        conn = db()
        cur = conn.cursor()
        
        # Encerra qualquer aula ativa anterior
        cur.execute("UPDATE aulas SET encerrada_em = NOW() WHERE encerrada_em IS NULL")
        
        # Cria nova aula
        cur.execute(
            "INSERT INTO aulas (data_aula, tema, professores) VALUES (NOW(), %s, %s) RETURNING id",
            (tema, professores),
        )
        result = cur.fetchone()
        aula_id = result["id"] if result else None
        
        conn.commit()
        cur.close()
        conn.close()
        
        return jsonify({"ok": True, "aula_id": aula_id})
    except Exception as e:
        print("Erro em /api/aulas/iniciar:", str(e))
        return api_error("Erro ao iniciar aula", 500, e)


@app.post("/api/aulas/encerrar")
@require_auth
def aulas_encerrar():
    """Encerra uma aula ativa"""
    try:
        body = request.get_json(force=True, silent=True) or {}
        aula_id = body.get("aula_id")
        
        conn = db()
        cur = conn.cursor()
        
        if aula_id:
            # Encerra aula específica
            cur.execute("UPDATE aulas SET encerrada_em = NOW() WHERE id=%s RETURNING id", (aula_id,))
        else:
            # Encerra aula ativa
            cur.execute("UPDATE aulas SET encerrada_em = NOW() WHERE encerrada_em IS NULL RETURNING id")
            
        row = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        
        return jsonify({"ok": True, "aula_id": row["id"] if row else None})
    except Exception as e:
        print("Erro em /api/aulas/encerrar:", str(e))
        return api_error("Erro ao encerrar aula", 500, e)


@app.get("/api/aulas/presentes")
@require_auth
def aulas_presentes():
    """Lista os presentes em uma aula"""
    try:
        aula_id = request.args.get("aula_id")
        
        # Se não veio aula_id, tenta pegar a aula ativa
        if not aula_id:
            conn = db()
            cur = conn.cursor()
            cur.execute("SELECT id FROM aulas WHERE encerrada_em IS NULL ORDER BY data_aula DESC LIMIT 1")
            r = cur.fetchone()
            cur.close()
            conn.close()
            
            if r:
                aula_id = r["id"]
            else:
                return jsonify({"ok": True, "aula_id": None, "presentes": []})

        # Converte para inteiro
        try:
            aula_id = int(aula_id)
        except (TypeError, ValueError):
            return jsonify({"ok": True, "aula_id": None, "presentes": []})

        conn = db()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT f.id AS frequencia_id, a.id AS aluno_id, a.nome,
                   f.horario_entrada, f.horario_saida, f.retirado_por
            FROM frequencia f
            JOIN alunos a ON a.id = f.id_aluno
            WHERE f.id_aula = %s
            ORDER BY a.nome ASC
            """,
            (aula_id,),
        )
        presentes = cur.fetchall()
        cur.close()
        conn.close()
        
        # Converter datetime para string ISO
        for p in presentes:
            if p.get("horario_entrada"):
                p["horario_entrada"] = p["horario_entrada"].isoformat()
            if p.get("horario_saida"):
                p["horario_saida"] = p["horario_saida"].isoformat()
        
        return jsonify({"ok": True, "aula_id": aula_id, "presentes": presentes})
    except Exception as e:
        print("Erro em /api/aulas/presentes:", str(e))
        return api_error("Erro ao listar presença", 500, e)


@app.post("/api/aulas/entrada")
@require_auth
def aulas_entrada():
    """Registra entrada de um aluno"""
    try:
        body = request.get_json(force=True, silent=True) or {}
        aula_id = body.get("aula_id")
        aluno_id = body.get("aluno_id")

        if not aluno_id:
            return api_error("aluno_id é obrigatório", 400)

        # Se não veio aula_id, pega aula ativa
        if not aula_id:
            conn = db()
            cur = conn.cursor()
            cur.execute("SELECT id FROM aulas WHERE encerrada_em IS NULL ORDER BY data_aula DESC LIMIT 1")
            r = cur.fetchone()
            cur.close()
            conn.close()
            
            if not r:
                return api_error("Não há aula ativa", 400)
            aula_id = r["id"]

        conn = db()
        cur = conn.cursor()
        
        # Tenta inserir, se já existir não faz nada (ON CONFLICT)
        cur.execute(
            """
            INSERT INTO frequencia (id_aula, id_aluno, horario_entrada)
            VALUES (%s, %s, NOW())
            ON CONFLICT (id_aula, id_aluno) DO NOTHING
            RETURNING id
            """,
            (aula_id, aluno_id),
        )
        
        result = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        
        return jsonify({
            "ok": True, 
            "aula_id": int(aula_id), 
            "aluno_id": int(aluno_id),
            "frequencia_id": result["id"] if result else None
        })
    except Exception as e:
        print("Erro em /api/aulas/entrada:", str(e))
        return api_error("Erro ao dar entrada", 500, e)


@app.post("/api/aulas/saida")
@require_auth
def aulas_saida():
    """Registra saída de um aluno"""
    try:
        body = request.get_json(force=True, silent=True) or {}
        frequencia_id = body.get("frequencia_id")
        retirado_por = (body.get("retirado_por") or "").strip()

        if not frequencia_id:
            return api_error("frequencia_id é obrigatório", 400)
        if not retirado_por:
            return api_error("retirado_por é obrigatório", 400)

        conn = db()
        cur = conn.cursor()
        
        cur.execute(
            "UPDATE frequencia SET horario_saida = NOW(), retirado_por = %s WHERE id = %s",
            (retirado_por, frequencia_id),
        )
        
        conn.commit()
        cur.close()
        conn.close()
        
        return jsonify({"ok": True})
    except Exception as e:
        print("Erro em /api/aulas/saida:", str(e))
        return api_error("Erro ao registrar saída", 500, e)


@app.get("/api/historico")
@require_auth
def historico_listar():
    """Lista histórico de aulas encerradas"""
    try:
        conn = db()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT a.id, a.data_aula, a.tema, a.professores,
                   COUNT(f.id) AS total_criancas
            FROM aulas a
            LEFT JOIN frequencia f ON f.id_aula = a.id
            WHERE a.encerrada_em IS NOT NULL
            GROUP BY a.id
            ORDER BY a.data_aula DESC
            LIMIT 200
            """
        )
        rows = cur.fetchall()
        cur.close()
        conn.close()
        
        # Converter datetime para string ISO
        for r in rows:
            if r.get("data_aula"):
                r["data_aula"] = r["data_aula"].isoformat()
        
        return jsonify({"ok": True, "historico": rows})
    except Exception as e:
        print("Erro em /api/historico:", str(e))
        return api_error("Erro ao listar histórico", 500, e)


@app.get("/api/historico/<int:aula_id>")
@require_auth
def historico_detalhe(aula_id):
    """Detalhes de uma aula específica"""
    try:
        conn = db()
        cur = conn.cursor()
        
        # Busca dados da aula
        cur.execute("SELECT id, data_aula, tema, professores FROM aulas WHERE id=%s", (aula_id,))
        aula = cur.fetchone()
        
        if not aula:
            cur.close()
            conn.close()
            return api_error("Aula não encontrada", 404)
        
        # Converter datetime
        if aula.get("data_aula"):
            aula["data_aula"] = aula["data_aula"].isoformat()

        # Busca presenças
        cur.execute(
            """
            SELECT a.id AS aluno_id, a.nome, f.horario_entrada, f.horario_saida, f.retirado_por
            FROM frequencia f
            JOIN alunos a ON a.id = f.id_aluno
            WHERE f.id_aula = %s
            ORDER BY a.nome
            """,
            (aula_id,),
        )
        presencas = cur.fetchall()
        
        # Converter datetimes
        for p in presencas:
            if p.get("horario_entrada"):
                p["horario_entrada"] = p["horario_entrada"].isoformat()
            if p.get("horario_saida"):
                p["horario_saida"] = p["horario_saida"].isoformat()
        
        cur.close()
        conn.close()
        
        return jsonify({"ok": True, "aula": aula, "presencas": presencas})
    except Exception as e:
        print("Erro em /api/historico/<int:aula_id>:", str(e))
        return api_error("Erro ao buscar detalhes", 500, e)


if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
