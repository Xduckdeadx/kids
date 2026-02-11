import os
import json
import psycopg2
from psycopg2.extras import RealDictCursor
from datetime import datetime
from functools import wraps

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

APP_NAME = "Kid IEQ 2026"

app = Flask(__name__, static_folder="static", static_url_path="/static")
CORS(app)

# =========================
# Config / DB
# =========================

def _env(name: str, default: str = "") -> str:
    return (os.environ.get(name) or default).strip()

DB_CONFIG = {
    "host": _env("DB_HOST"),
    "port": _env("DB_PORT", "5432"),
    "dbname": _env("DB_NAME", "postgres"),
    "user": _env("DB_USER", "postgres"),
    "password": _env("DB_PASSWORD"),
    "sslmode": _env("DB_SSLMODE", "require"),
}

def db():
    """
    Suporta:
    - DATABASE_URL (Railway/Supabase)  -> recomendado
    - ou variáveis DB_HOST/DB_USER/...
    """
    database_url = _env("DATABASE_URL")
    if database_url:
        # Importantíssimo: tirar \n e espaços (teu erro do sslmode veio disso)
        return psycopg2.connect(database_url.strip(), cursor_factory=RealDictCursor)

    if not DB_CONFIG["host"] or not DB_CONFIG["password"]:
        raise RuntimeError("DATABASE_URL não configurada e DB_* incompleto.")

    # psycopg2 não aceita sslmode com quebra de linha, então strip
    cfg = DB_CONFIG.copy()
    cfg["sslmode"] = (cfg.get("sslmode") or "require").strip()
    return psycopg2.connect(cursor_factory=RealDictCursor, **cfg)


def ensure_tables():
    conn = db()
    cur = conn.cursor()

    # Usuarios
    cur.execute("""
    CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        usuario TEXT UNIQUE NOT NULL,
        senha TEXT NOT NULL,
        nome TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'auxiliar',
        criado_em TIMESTAMP NOT NULL DEFAULT NOW()
    );
    """)

    # Alunos
    cur.execute("""
    CREATE TABLE IF NOT EXISTS alunos (
        id SERIAL PRIMARY KEY,
        nome TEXT UNIQUE NOT NULL,
        criado_em TIMESTAMP NOT NULL DEFAULT NOW()
    );
    """)

    # Aulas
    cur.execute("""
    CREATE TABLE IF NOT EXISTS aulas (
        id SERIAL PRIMARY KEY,
        data_aula DATE NOT NULL DEFAULT CURRENT_DATE,
        tema TEXT NOT NULL,
        professores TEXT NOT NULL,
        iniciada_em TIMESTAMP NOT NULL DEFAULT NOW(),
        encerrada_em TIMESTAMP NULL
    );
    """)

    # Frequencia
    cur.execute("""
    CREATE TABLE IF NOT EXISTS frequencia (
        id SERIAL PRIMARY KEY,
        id_aula INT NOT NULL REFERENCES aulas(id) ON DELETE CASCADE,
        id_aluno INT NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
        horario_entrada TIMESTAMP NULL,
        horario_saida TIMESTAMP NULL,
        retirado_por TEXT DEFAULT ''
    );
    """)

    # Garantir unicidade para ON CONFLICT do front
    cur.execute("""
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE schemaname = 'public' AND indexname = 'ux_frequencia_aula_aluno'
        ) THEN
            CREATE UNIQUE INDEX ux_frequencia_aula_aluno ON frequencia (id_aula, id_aluno);
        END IF;
    END $$;
    """)

    # Usuário default
    cur.execute("SELECT id FROM usuarios WHERE usuario='admin'")
    if not cur.fetchone():
        cur.execute(
            "INSERT INTO usuarios (usuario, senha, nome, role) VALUES (%s,%s,%s,%s)",
            ("admin", "1234", "Administrador", "admin"),
        )

    conn.commit()
    cur.close()
    conn.close()


# =========================
# Helpers / Auth
# =========================

SECRET = _env("APP_SECRET", "dev-secret-change-me")

def api_error(msg, status=400, exc=None):
    payload = {"ok": False, "error": msg}
    if exc and _env("DEBUG_API", "0") == "1":
        payload["detail"] = str(exc)
    return jsonify(payload), status

def make_token(user):
    # token simples (não-JWT) para não depender de libs
    data = {
        "id": user["id"],
        "usuario": user["usuario"],
        "nome": user["nome"],
        "role": user["role"],
        "ts": int(datetime.utcnow().timestamp()),
        "secret": SECRET,
    }
    return json.dumps(data)

def parse_token(token: str):
    try:
        data = json.loads(token)
        if data.get("secret") != SECRET:
            return None
        return data
    except Exception:
        return None

def require_auth(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        auth = request.headers.get("Authorization") or ""
        if not auth.startswith("Bearer "):
            return api_error("Não autenticado", 401)
        token = auth.split(" ", 1)[1].strip()
        user = parse_token(token)
        if not user:
            return api_error("Token inválido", 401)
        request.user = user
        return fn(*args, **kwargs)
    return wrapper

def require_role(*roles):
    def deco(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            user = getattr(request, "user", None)
            if not user:
                return api_error("Não autenticado", 401)
            if user.get("role") not in roles:
                return api_error("Sem permissão", 403)
            return fn(*args, **kwargs)
        return wrapper
    return deco


# =========================
# Static / Home
# =========================

@app.get("/")
def index():
    # templates/index.html
    return send_from_directory("templates", "index.html")

@app.get("/sw.js")
def sw():
    return send_from_directory("static", "sw.js")

@app.get("/api/diag")
def diag():
    try:
        base = os.path.join(os.getcwd(), "static")
        items = []
        for root, dirs, files in os.walk(base):
            for f in files:
                rel = os.path.relpath(os.path.join(root, f), base)
                items.append(rel.replace("\\", "/"))
        return jsonify({"ok": True, "static_files": sorted(items)})
    except Exception as e:
        return api_error("diag falhou", 500, e)


# =========================
# Auth
# =========================

@app.post("/api/login")
def login():
    try:
        body = request.get_json(force=True, silent=True) or {}
        usuario = (body.get("usuario") or "").strip()
        senha = (body.get("senha") or "").strip()
        if not usuario or not senha:
            return api_error("Usuário e senha obrigatórios")

        conn = db()
        cur = conn.cursor()
        cur.execute("SELECT * FROM usuarios WHERE usuario=%s AND senha=%s", (usuario, senha))
        user = cur.fetchone()
        cur.close()
        conn.close()

        if not user:
            return api_error("Login inválido", 401)

        token = make_token(user)
        return jsonify({"ok": True, "token": token, "user": {
            "id": user["id"],
            "usuario": user["usuario"],
            "nome": user["nome"],
            "role": user["role"],
        }})
    except Exception as e:
        return api_error("Erro no login", 500, e)


# =========================
# Estatísticas (orig)
# =========================

@app.get("/api/estatisticas")
@require_auth
def estatisticas():
    try:
        conn = db()
        cur = conn.cursor()

        cur.execute("SELECT COUNT(*)::int AS n FROM alunos")
        total_alunos = cur.fetchone()["n"]

        cur.execute("SELECT COUNT(*)::int AS n FROM usuarios")
        total_equipe = cur.fetchone()["n"]

        cur.execute("SELECT * FROM aulas WHERE encerrada_em IS NULL ORDER BY iniciada_em DESC LIMIT 1")
        aula_ativa = cur.fetchone()

        presentes = 0
        if aula_ativa:
            cur.execute("SELECT COUNT(*)::int AS n FROM frequencia WHERE id_aula=%s AND horario_entrada IS NOT NULL", (aula_ativa["id"],))
            presentes = cur.fetchone()["n"]

        cur.close()
        conn.close()

        return jsonify({
            "ok": True,
            "total_alunos": total_alunos,
            "total_equipe": total_equipe,
            "aula_ativa": aula_ativa,
            "presentes": presentes,
        })
    except Exception as e:
        return api_error("Erro ao carregar estatísticas", 500, e)

# ✅ Alias que seu front pede
@app.get("/api/stats")
@require_auth
def stats_alias():
    return estatisticas()


# =========================
# Alunos
# =========================

@app.get("/api/alunos")
@require_auth
def alunos_listar():
    try:
        conn = db()
        cur = conn.cursor()
        cur.execute("SELECT id, nome FROM alunos ORDER BY nome ASC")
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return jsonify({"ok": True, "alunos": rows})
    except Exception as e:
        return api_error("Erro ao listar alunos", 500, e)

@app.post("/api/alunos")
@require_auth
@require_role("admin", "professor", "auxiliar")
def alunos_criar():
    try:
        body = request.get_json(force=True, silent=True) or {}
        nome = (body.get("nome") or "").strip()
        if not nome:
            return api_error("Nome obrigatório")

        conn = db()
        cur = conn.cursor()
        cur.execute("INSERT INTO alunos (nome) VALUES (%s) ON CONFLICT (nome) DO NOTHING RETURNING id", (nome,))
        row = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"ok": True, "id": row["id"] if row else None})
    except Exception as e:
        return api_error("Erro ao cadastrar aluno", 500, e)

@app.delete("/api/alunos/<int:aluno_id>")
@require_auth
@require_role("admin")
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


# =========================
# Equipe (orig) + Alias /usuarios (front)
# =========================

@app.get("/api/equipe")
@require_auth
def equipe_listar():
    try:
        conn = db()
        cur = conn.cursor()
        cur.execute("SELECT id, usuario, nome, role FROM usuarios ORDER BY nome ASC")
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return jsonify({"ok": True, "equipe": rows})
    except Exception as e:
        return api_error("Erro ao listar equipe", 500, e)

@app.post("/api/equipe")
@require_auth
@require_role("admin")
def equipe_criar():
    try:
        body = request.get_json(force=True, silent=True) or {}
        usuario = (body.get("usuario") or "").strip()
        senha = (body.get("senha") or "").strip()
        nome = (body.get("nome") or "").strip()
        role = (body.get("role") or "auxiliar").strip()

        if not usuario or not senha or not nome:
            return api_error("usuario, senha e nome obrigatórios")

        if role not in ("admin", "professor", "auxiliar"):
            return api_error("role inválida")

        conn = db()
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO usuarios (usuario, senha, nome, role)
            VALUES (%s,%s,%s,%s)
            ON CONFLICT (usuario) DO NOTHING
            RETURNING id
            """,
            (usuario, senha, nome, role),
        )
        row = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()

        return jsonify({"ok": True, "id": row["id"] if row else None})
    except Exception as e:
        return api_error("Erro ao cadastrar equipe", 500, e)

@app.delete("/api/equipe/<int:user_id>")
@require_auth
@require_role("admin")
def equipe_delete(user_id):
    try:
        conn = db()
        cur = conn.cursor()
        cur.execute("DELETE FROM usuarios WHERE id=%s AND usuario<>'admin'", (user_id,))
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"ok": True})
    except Exception as e:
        return api_error("Erro ao excluir usuário", 500, e)

# ✅ Aliases para casar com /api/usuarios do teu app.js
@app.get("/api/usuarios")
@require_auth
def usuarios_alias_list():
    return equipe_listar()

@app.post("/api/usuarios")
@require_auth
@require_role("admin")
def usuarios_alias_create():
    return equipe_criar()

@app.delete("/api/usuarios/<int:user_id>")
@require_auth
@require_role("admin")
def usuarios_alias_delete(user_id):
    return equipe_delete(user_id)


# =========================
# Aulas
# =========================

@app.get("/api/aulas/ativa")
@require_auth
def aula_ativa():
    try:
        conn = db()
        cur = conn.cursor()
        cur.execute("SELECT * FROM aulas WHERE encerrada_em IS NULL ORDER BY iniciada_em DESC LIMIT 1")
        row = cur.fetchone()
        cur.close()
        conn.close()
        return jsonify({"ok": True, "aula": row})
    except Exception as e:
        return api_error("Erro ao carregar aula ativa", 500, e)

@app.post("/api/aulas/iniciar")
@require_auth
@require_role("admin", "professor", "auxiliar")
def aula_iniciar():
    try:
        body = request.get_json(force=True, silent=True) or {}
        professores = (body.get("professores") or "").strip()
        tema = (body.get("tema") or "").strip()

        if not professores or not tema:
            return api_error("Tema e professor são obrigatórios", 400)

        conn = db()
        cur = conn.cursor()

        # Fecha alguma ativa (se existir) para não ficar duas abertas
        cur.execute("UPDATE aulas SET encerrada_em = NOW() WHERE encerrada_em IS NULL")

        cur.execute(
            "INSERT INTO aulas (tema, professores) VALUES (%s,%s) RETURNING id",
            (tema, professores),
        )
        aula_id = cur.fetchone()["id"]
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"ok": True, "aula_id": int(aula_id)})
    except Exception as e:
        return api_error("Erro ao iniciar aula", 500, e)

@app.post("/api/aulas/encerrar")
@require_auth
@require_role("admin", "professor", "auxiliar")
def aula_encerrar():
    try:
        conn = db()
        cur = conn.cursor()
        cur.execute("UPDATE aulas SET encerrada_em = NOW() WHERE encerrada_em IS NULL")
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"ok": True})
    except Exception as e:
        return api_error("Erro ao encerrar aula", 500, e)

@app.post("/api/aulas/entrada")
@require_auth
def aulas_entrada():
    """Entrada por (aula_id, aluno_id)"""
    try:
        body = request.get_json(force=True, silent=True) or {}
        aula_id = body.get("aula_id")
        aluno_id = body.get("aluno_id")
        if not aula_id or not aluno_id:
            return api_error("aula_id e aluno_id são obrigatórios")

        conn = db()
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO frequencia (id_aula, id_aluno, horario_entrada)
            VALUES (%s,%s,NOW())
            ON CONFLICT (id_aula, id_aluno)
            DO UPDATE SET horario_entrada = COALESCE(frequencia.horario_entrada, NOW())
            """,
            (aula_id, aluno_id),
        )
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"ok": True})
    except Exception as e:
        return api_error("Erro ao dar entrada", 500, e)

@app.post("/api/aulas/saida")
@require_auth
def aulas_saida():
    """
    ✅ Aceita:
    - frequencia_id (modo antigo)
    OU
    - aula_id + aluno_id (modo do teu front)
    """
    try:
        body = request.get_json(force=True, silent=True) or {}
        retirado_por = (body.get("retirado_por") or "").strip()

        frequencia_id = body.get("frequencia_id")
        aula_id = body.get("aula_id")
        aluno_id = body.get("aluno_id")

        if not frequencia_id and (not aula_id or not aluno_id):
            return api_error("Envie frequencia_id OU aula_id + aluno_id", 400)

        conn = db()
        cur = conn.cursor()

        if frequencia_id:
            cur.execute(
                "UPDATE frequencia SET horario_saida=NOW(), retirado_por=%s WHERE id=%s",
                (retirado_por, frequencia_id),
            )
        else:
            cur.execute(
                """
                UPDATE frequencia
                SET horario_saida=NOW(), retirado_por=%s
                WHERE id_aula=%s AND id_aluno=%s
                """,
                (retirado_por, aula_id, aluno_id),
            )
            if cur.rowcount == 0:
                cur.execute(
                    """
                    INSERT INTO frequencia (id_aula,id_aluno,horario_entrada,horario_saida,retirado_por)
                    VALUES (%s,%s,NOW(),NOW(),%s)
                    ON CONFLICT (id_aula,id_aluno)
                    DO UPDATE SET horario_saida=EXCLUDED.horario_saida, retirado_por=EXCLUDED.retirado_por
                    """,
                    (aula_id, aluno_id, retirado_por),
                )

        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"ok": True})
    except Exception as e:
        return api_error("Erro ao registrar saída", 500, e)


# =========================
# Frequência / Presença
# =========================

@app.get("/api/aulas/<int:aula_id>/frequencia")
@require_auth
def aulas_frequencia(aula_id):
    try:
        conn = db()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT f.id, f.id_aluno, a.nome as aluno,
                   f.horario_entrada, f.horario_saida, COALESCE(f.retirado_por,'') as retirado_por
            FROM frequencia f
            JOIN alunos a ON a.id = f.id_aluno
            WHERE f.id_aula = %s
            ORDER BY a.nome ASC
            """,
            (aula_id,),
        )
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return jsonify({"ok": True, "frequencia": rows})
    except Exception as e:
        return api_error("Erro ao carregar frequência", 500, e)

# ✅ Alias: teu front chama /presenca
@app.get("/api/aulas/<int:aula_id>/presenca")
@require_auth
def aulas_presenca_alias(aula_id):
    # devolve no mesmo shape mas com chave "presenca"
    resp = aulas_frequencia(aula_id)
    data = resp[0].get_json()
    return jsonify({"ok": True, "presenca": data.get("frequencia", [])})

# ✅ Relatório simples (teu front chama /relatorio)
@app.get("/api/aulas/<int:aula_id>/relatorio")
@require_auth
def aulas_relatorio(aula_id):
    try:
        conn = db()
        cur = conn.cursor()
        cur.execute("SELECT * FROM aulas WHERE id=%s", (aula_id,))
        aula = cur.fetchone()
        if not aula:
            cur.close(); conn.close()
            return api_error("Aula não encontrada", 404)

        cur.execute(
            """
            SELECT a.nome as aluno,
                   f.horario_entrada, f.horario_saida, COALESCE(f.retirado_por,'') as retirado_por
            FROM frequencia f
            JOIN alunos a ON a.id = f.id_aluno
            WHERE f.id_aula=%s
            ORDER BY a.nome ASC
            """,
            (aula_id,),
        )
        presenca = cur.fetchall()
        cur.close()
        conn.close()
        return jsonify({"ok": True, "aula": aula, "presenca": presenca})
    except Exception as e:
        return api_error("Erro ao gerar relatório", 500, e)


# =========================
# Histórico
# =========================

@app.get("/api/historico")
@require_auth
def historico_listar():
    try:
        conn = db()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT a.id, a.data_aula, a.tema, a.professores,
                   COUNT(f.id)::int AS total_criancas
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
        return jsonify({"ok": True, "historico": rows})
    except Exception as e:
        return api_error("Erro ao listar histórico", 500, e)

# ✅ Alias que teu front chama
@app.get("/api/aulas/historico")
@require_auth
def historico_alias():
    return historico_listar()


# =========================
# Boot
# =========================

try:
    ensure_tables()
except Exception as e:
    # não derruba o app em deploy se o DB ainda não está ok (mas loga)
    print("ensure_tables falhou:", str(e))

if __name__ == "__main__":
    port = int(_env("PORT", "8080"))
    app.run(host="0.0.0.0", port=port)
