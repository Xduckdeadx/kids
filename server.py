import os
import json
import base64
import psycopg2
from psycopg2.extras import RealDictCursor
from datetime import datetime
from functools import wraps
from io import StringIO
import csv

from flask import Flask, request, jsonify, send_from_directory, Response
from flask_cors import CORS

APP_NAME = "IEQ Central • Kid 2026"

app = Flask(__name__, static_folder="static", static_url_path="/static")
CORS(app)

# =========================
# Config / DB
# =========================

def _env(name: str, default: str = "") -> str:
    return (os.environ.get(name) or default).strip()

def db():
    """
    Suporta:
    - DATABASE_URL (Railway) -> recomendado
    - ou DB_HOST/DB_USER/...
    """
    database_url = _env("DATABASE_URL")
    if database_url:
        return psycopg2.connect(database_url.strip(), cursor_factory=RealDictCursor)

    host = _env("DB_HOST")
    password = _env("DB_PASSWORD")
    if not host or not password:
        raise RuntimeError("DATABASE_URL não configurada e DB_* incompleto.")

    cfg = {
        "host": host,
        "port": _env("DB_PORT", "5432"),
        "dbname": _env("DB_NAME", "postgres"),
        "user": _env("DB_USER", "postgres"),
        "password": password,
        "sslmode": (_env("DB_SSLMODE", "require") or "require").strip(),
        "cursor_factory": RealDictCursor,
    }
    return psycopg2.connect(**cfg)

def ensure_tables():
    conn = db()
    cur = conn.cursor()

    # 1) usuarios (igual seu SQL, com migração segura)
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
    cur.execute("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS foto TEXT;")

    # 2) alunos (igual seu SQL)
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
    # migração "se faltou alguma coluna"
    cur.execute("ALTER TABLE alunos ADD COLUMN IF NOT EXISTS data_nascimento TEXT;")
    cur.execute("ALTER TABLE alunos ADD COLUMN IF NOT EXISTS responsavel TEXT;")
    cur.execute("ALTER TABLE alunos ADD COLUMN IF NOT EXISTS telefone TEXT;")
    cur.execute("ALTER TABLE alunos ADD COLUMN IF NOT EXISTS observacoes TEXT;")
    cur.execute("ALTER TABLE alunos ADD COLUMN IF NOT EXISTS autorizado_retirar TEXT;")
    cur.execute("ALTER TABLE alunos ADD COLUMN IF NOT EXISTS autorizado_2 TEXT;")
    cur.execute("ALTER TABLE alunos ADD COLUMN IF NOT EXISTS autorizado_3 TEXT;")
    cur.execute("ALTER TABLE alunos ADD COLUMN IF NOT EXISTS foto TEXT;")
    cur.execute("ALTER TABLE alunos ADD COLUMN IF NOT EXISTS imagem_ficha TEXT;")

    # 3) avisos (igual seu SQL)
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
    cur.execute("ALTER TABLE avisos ADD COLUMN IF NOT EXISTS imagem TEXT;")
    cur.execute("ALTER TABLE avisos ADD COLUMN IF NOT EXISTS fixado BOOLEAN DEFAULT FALSE;")

    # ✅ NOVO: likes e comentários dos avisos
    cur.execute("""
    CREATE TABLE IF NOT EXISTS avisos_likes (
        id SERIAL PRIMARY KEY,
        aviso_id INTEGER NOT NULL REFERENCES avisos(id) ON DELETE CASCADE,
        usuario TEXT NOT NULL,
        criado_em TIMESTAMP NOT NULL DEFAULT NOW()
    );
    """)
    cur.execute("""
    CREATE UNIQUE INDEX IF NOT EXISTS ux_like_aviso_usuario
    ON avisos_likes(aviso_id, usuario);
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS avisos_comentarios (
        id SERIAL PRIMARY KEY,
        aviso_id INTEGER NOT NULL REFERENCES avisos(id) ON DELETE CASCADE,
        usuario TEXT NOT NULL,
        comentario TEXT NOT NULL,
        criado_em TIMESTAMP NOT NULL DEFAULT NOW()
    );
    """)

    # 4) aulas (igual seu SQL, mas vamos adicionar iniciada/encerrada pra “aula ativa”)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS aulas (
        id SERIAL PRIMARY KEY,
        data_aula TIMESTAMP,
        tema TEXT,
        professores TEXT
    );
    """)
    cur.execute("ALTER TABLE aulas ADD COLUMN IF NOT EXISTS iniciada_em TIMESTAMP;")
    cur.execute("ALTER TABLE aulas ADD COLUMN IF NOT EXISTS encerrada_em TIMESTAMP;")

    # 5) frequencia (igual seu SQL, mas vamos migrar pra TIMESTAMP (melhor) mantendo compatibilidade)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS frequencia (
        id SERIAL PRIMARY KEY,
        id_aula INTEGER REFERENCES aulas(id),
        id_aluno INTEGER REFERENCES alunos(id) ON DELETE CASCADE,
        horario_entrada TIME,
        horario_saida TIME,
        retirado_por TEXT
    );
    """)
    # adicionar colunas melhores (sem quebrar as TIME existentes)
    cur.execute("ALTER TABLE frequencia ADD COLUMN IF NOT EXISTS entrada_ts TIMESTAMP;")
    cur.execute("ALTER TABLE frequencia ADD COLUMN IF NOT EXISTS saida_ts TIMESTAMP;")
    cur.execute("ALTER TABLE frequencia ADD COLUMN IF NOT EXISTS retirado_por TEXT;")

    # unicidade (1 aluno por aula)
    cur.execute("""
    CREATE UNIQUE INDEX IF NOT EXISTS ux_freq_aula_aluno
    ON frequencia(id_aula, id_aluno);
    """)

    # ✅ admin default
    cur.execute("SELECT id FROM usuarios WHERE usuario=%s", ("admin",))
    if not cur.fetchone():
        cur.execute(
            "INSERT INTO usuarios (nome, usuario, senha, role) VALUES (%s,%s,%s,%s)",
            ("Administrador", "admin", "1234", "admin")
        )

    conn.commit()
    cur.close()
    conn.close()

# roda migração ao subir
try:
    ensure_tables()
except Exception as e:
    print("ensure_tables falhou:", e)

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
    data = {
        "id": user["id"],
        "usuario": user["usuario"],
        "nome": user.get("nome", ""),
        "role": user.get("role", ""),
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

def now_ts():
    return datetime.utcnow()

# =========================
# Static
# =========================

@app.get("/")
def index():
    return send_from_directory("templates", "index.html")

@app.get("/sw.js")
def sw():
    return send_from_directory("static", "sw.js")

@app.get("/api/diag")
def diag():
    try:
        base = os.path.join(os.getcwd(), "static")
        items = []
        for root, _, files in os.walk(base):
            for f in files:
                rel = os.path.relpath(os.path.join(root, f), base)
                items.append(rel.replace("\\", "/"))
        return jsonify({"ok": True, "static_files": sorted(items)})
    except Exception as e:
        return api_error("diag falhou", 500, e)

# =========================
# Auth endpoints
# =========================

@app.post("/api/login")
def login():
    try:
        data = request.get_json(force=True) or {}
        usuario = (data.get("usuario") or "").strip()
        senha = (data.get("senha") or "").strip()
        if not usuario or not senha:
            return api_error("Usuário e senha são obrigatórios", 400)

        conn = db()
        cur = conn.cursor()
        cur.execute("SELECT * FROM usuarios WHERE usuario=%s AND senha=%s", (usuario, senha))
        row = cur.fetchone()
        cur.close()
        conn.close()

        if not row:
            return api_error("Usuário ou senha inválidos", 401)

        token = make_token(row)
        return jsonify({"ok": True, "token": token, "user": {
            "id": row["id"], "usuario": row["usuario"], "nome": row["nome"], "role": row["role"]
        }})
    except Exception as e:
        return api_error("Erro no login", 500, e)

@app.get("/api/me")
@require_auth
def me():
    return jsonify({"ok": True, "user": {
        "id": request.user["id"],
        "usuario": request.user["usuario"],
        "nome": request.user.get("nome", ""),
        "role": request.user.get("role", "")
    }})

# =========================
# Stats / Home
# =========================

@app.get("/api/stats")
@require_auth
def stats():
    try:
        conn = db()
        cur = conn.cursor()

        cur.execute("SELECT COUNT(*) AS c FROM alunos")
        total_alunos = cur.fetchone()["c"]

        cur.execute("SELECT COUNT(*) AS c FROM usuarios")
        total_equipe = cur.fetchone()["c"]

        cur.execute("""
            SELECT * FROM aulas
            WHERE encerrada_em IS NULL
            ORDER BY COALESCE(iniciada_em, data_aula) DESC
            LIMIT 1
        """)
        aula = cur.fetchone()

        presentes = 0
        if aula:
            cur.execute("SELECT COUNT(*) AS c FROM frequencia WHERE id_aula=%s AND entrada_ts IS NOT NULL", (aula["id"],))
            presentes = cur.fetchone()["c"]

        cur.close()
        conn.close()

        return jsonify({
            "ok": True,
            "total_alunos": total_alunos,
            "total_equipe": total_equipe,
            "aula_ativa": True if aula else False,
            "presentes": presentes
        })
    except Exception as e:
        return api_error("Erro ao carregar stats", 500, e)

# =========================
# Alunos (cadastro completo)
# =========================

@app.get("/api/alunos")
@require_auth
def alunos_list():
    try:
        conn = db()
        cur = conn.cursor()
        cur.execute("SELECT * FROM alunos ORDER BY nome ASC")
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return jsonify({"ok": True, "alunos": rows})
    except Exception as e:
        return api_error("Erro ao listar alunos", 500, e)

@app.post("/api/alunos")
@require_auth
def alunos_create():
    try:
        data = request.get_json(force=True) or {}
        nome = (data.get("nome") or "").strip()
        if not nome:
            return api_error("Nome é obrigatório", 400)

        fields = {
            "data_nascimento": (data.get("data_nascimento") or "").strip(),
            "responsavel": (data.get("responsavel") or "").strip(),
            "telefone": (data.get("telefone") or "").strip(),
            "observacoes": (data.get("observacoes") or "").strip(),
            "autorizado_retirar": (data.get("autorizado_retirar") or "").strip(),
            "autorizado_2": (data.get("autorizado_2") or "").strip(),
            "autorizado_3": (data.get("autorizado_3") or "").strip(),
            "foto": data.get("foto") or "",
            "imagem_ficha": data.get("imagem_ficha") or "",
        }

        conn = db()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO alunos
            (nome, data_nascimento, responsavel, telefone, observacoes,
             autorizado_retirar, autorizado_2, autorizado_3, foto, imagem_ficha)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            RETURNING *
        """, (
            nome, fields["data_nascimento"], fields["responsavel"], fields["telefone"], fields["observacoes"],
            fields["autorizado_retirar"], fields["autorizado_2"], fields["autorizado_3"], fields["foto"], fields["imagem_ficha"]
        ))
        row = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"ok": True, "aluno": row})
    except Exception as e:
        return api_error("Erro ao cadastrar aluno", 500, e)

@app.put("/api/alunos/<int:aluno_id>")
@require_auth
def alunos_update(aluno_id):
    try:
        data = request.get_json(force=True) or {}
        conn = db()
        cur = conn.cursor()

        cur.execute("SELECT * FROM alunos WHERE id=%s", (aluno_id,))
        old = cur.fetchone()
        if not old:
            cur.close(); conn.close()
            return api_error("Aluno não encontrado", 404)

        # atualiza só o que veio
        cols = [
            "nome","data_nascimento","responsavel","telefone","observacoes",
            "autorizado_retirar","autorizado_2","autorizado_3","foto","imagem_ficha"
        ]
        upd = {}
        for c in cols:
            if c in data:
                upd[c] = data.get(c)

        if not upd:
            cur.close(); conn.close()
            return jsonify({"ok": True, "aluno": old})

        sets = ", ".join([f"{k}=%s" for k in upd.keys()])
        vals = list(upd.values()) + [aluno_id]

        cur.execute(f"UPDATE alunos SET {sets} WHERE id=%s RETURNING *", vals)
        row = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"ok": True, "aluno": row})
    except Exception as e:
        return api_error("Erro ao atualizar aluno", 500, e)

@app.delete("/api/alunos/<int:aluno_id>")
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

# =========================
# Equipe / Usuários
# =========================

@app.get("/api/usuarios")
@require_auth
@require_role("admin")
def usuarios_list():
    try:
        conn = db()
        cur = conn.cursor()
        cur.execute("SELECT id,nome,usuario,role,foto FROM usuarios ORDER BY nome ASC")
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return jsonify({"ok": True, "usuarios": rows})
    except Exception as e:
        return api_error("Erro ao listar usuários", 500, e)

@app.post("/api/equipe")
@require_auth
@require_role("admin")
def usuarios_create():
    try:
        data = request.get_json(force=True) or {}
        nome = (data.get("nome") or "").strip()
        usuario = (data.get("usuario") or "").strip()
        senha = (data.get("senha") or "").strip()
        role = (data.get("role") or "auxiliar").strip()
        foto = data.get("foto") or None

        if not nome or not usuario or not senha:
            return api_error("nome, usuario e senha são obrigatórios", 400)

        conn = db()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO usuarios (nome, usuario, senha, role, foto)
            VALUES (%s,%s,%s,%s,%s)
            RETURNING id,nome,usuario,role,foto
        """, (nome, usuario, senha, role, foto))
        row = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"ok": True, "usuario": row})
    except Exception as e:
        return api_error("Erro ao criar usuário", 500, e)

@app.delete("/api/equipe/<int:user_id>")
@require_auth
@require_role("admin")
def usuarios_delete(user_id):
    try:
        conn = db()
        cur = conn.cursor()
        cur.execute("DELETE FROM usuarios WHERE id=%s AND usuario <> 'admin'", (user_id,))
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"ok": True})
    except Exception as e:
        return api_error("Erro ao excluir usuário", 500, e)

# =========================
# Aulas / Presença
# =========================

@app.post("/api/aulas/iniciar")
@require_auth
def aulas_iniciar():
    """
    Aceita:
    - {professor_id, auxiliar_id, tema} (lista)
    - ou {professores, tema} (manual)
    """
    try:
        data = request.get_json(force=True) or {}
        tema = (data.get("tema") or "").strip()
        if not tema:
            return api_error("Tema é obrigatório", 400)

        professores = (data.get("professores") or "").strip()

        # se veio por IDs:
        professor_id = data.get("professor_id")
        auxiliar_id = data.get("auxiliar_id")

        conn = db()
        cur = conn.cursor()

        if professor_id:
            cur.execute("SELECT nome, role FROM usuarios WHERE id=%s", (professor_id,))
            p = cur.fetchone()
            if not p:
                cur.close(); conn.close()
                return api_error("Professor inválido", 400)

            nomes = [f"{p['nome']} (prof)"]
            if auxiliar_id:
                cur.execute("SELECT nome, role FROM usuarios WHERE id=%s", (auxiliar_id,))
                a = cur.fetchone()
                if a:
                    nomes.append(f"{a['nome']} (aux)")
            professores = " • ".join(nomes)

        if not professores:
            return api_error("Professor é obrigatório", 400)

        # encerra qualquer aula ativa anterior (segurança)
        cur.execute("UPDATE aulas SET encerrada_em=NOW() WHERE encerrada_em IS NULL")

        cur.execute("""
            INSERT INTO aulas (data_aula, tema, professores, iniciada_em, encerrada_em)
            VALUES (NOW(), %s, %s, NOW(), NULL)
            RETURNING *
        """, (tema, professores))
        aula = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()

        return jsonify({"ok": True, "aula": aula})
    except Exception as e:
        return api_error("Erro ao iniciar aula", 500, e)

@app.get("/api/aulas/ativa")
@require_auth
def aula_ativa():
    try:
        conn = db()
        cur = conn.cursor()

        cur.execute("""
            SELECT * FROM aulas
            WHERE encerrada_em IS NULL
            ORDER BY COALESCE(iniciada_em, data_aula) DESC
            LIMIT 1
        """)
        aula = cur.fetchone()

        presenca = []
        if aula:
            cur.execute("""
                SELECT f.id_aluno, a.nome AS aluno,
                       f.entrada_ts, f.saida_ts, COALESCE(f.retirado_por,'') AS retirado_por
                FROM frequencia f
                JOIN alunos a ON a.id = f.id_aluno
                WHERE f.id_aula=%s
                ORDER BY a.nome ASC
            """, (aula["id"],))
            rows = cur.fetchall()
            for r in rows:
                presenca.append({
                    "id_aluno": r["id_aluno"],
                    "aluno": r["aluno"],
                    "horario_entrada": r["entrada_ts"],
                    "horario_saida": r["saida_ts"],
                    "retirado_por": r["retirado_por"] or ""
                })

        cur.close()
        conn.close()

        return jsonify({"ok": True, "aula": aula, "presenca": presenca})
    except Exception as e:
        return api_error("Erro ao carregar aula ativa", 500, e)

@app.post("/api/aulas/encerrar")
@require_auth
def aula_encerrar():
    try:
        conn = db()
        cur = conn.cursor()
        cur.execute("""
            UPDATE aulas SET encerrada_em=NOW()
            WHERE encerrada_em IS NULL
            RETURNING *
        """)
        aula = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"ok": True, "aula": aula})
    except Exception as e:
        return api_error("Erro ao encerrar aula", 500, e)

@app.post("/api/aulas/entrada")
@require_auth
def aula_entrada():
    try:
        data = request.get_json(force=True) or {}
        aula_id = data.get("aula_id")
        aluno_id = data.get("aluno_id")
        if not aula_id or not aluno_id:
            return api_error("aula_id e aluno_id são obrigatórios", 400)

        conn = db()
        cur = conn.cursor()

        # upsert
        cur.execute("""
            INSERT INTO frequencia (id_aula, id_aluno, entrada_ts, retirado_por)
            VALUES (%s,%s,NOW(),'')
            ON CONFLICT (id_aula, id_aluno)
            DO UPDATE SET entrada_ts=COALESCE(frequencia.entrada_ts, NOW())
            RETURNING *
        """, (aula_id, aluno_id))
        row = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"ok": True, "frequencia": row})
    except Exception as e:
        return api_error("Erro ao registrar entrada", 500, e)

@app.post("/api/aulas/saida")
@require_auth
def aula_saida():
    try:
        data = request.get_json(force=True) or {}
        aula_id = data.get("aula_id")
        aluno_id = data.get("aluno_id")
        retirado_por = (data.get("retirado_por") or "").strip()

        if not aula_id or not aluno_id:
            return api_error("aula_id e aluno_id são obrigatórios", 400)
        if not retirado_por:
            return api_error("retirado_por é obrigatório", 400)

        conn = db()
        cur = conn.cursor()

        # validar autorizado do aluno (3 nomes)
        cur.execute("SELECT autorizado_retirar, autorizado_2, autorizado_3 FROM alunos WHERE id=%s", (aluno_id,))
        a = cur.fetchone()
        if not a:
            cur.close(); conn.close()
            return api_error("Aluno inválido", 400)

        autorizados = set()
        for k in ["autorizado_retirar", "autorizado_2", "autorizado_3"]:
            v = (a.get(k) or "").strip()
            if v:
                autorizados.add(v.lower())

        if autorizados and retirado_por.lower() not in autorizados:
            cur.close(); conn.close()
            return api_error("Saída bloqueada: responsável não autorizado no cadastro do aluno.", 403)

        cur.execute("""
            INSERT INTO frequencia (id_aula, id_aluno, saida_ts, retirado_por)
            VALUES (%s,%s,NOW(),%s)
            ON CONFLICT (id_aula, id_aluno)
            DO UPDATE SET saida_ts=NOW(), retirado_por=%s
            RETURNING *
        """, (aula_id, aluno_id, retirado_por, retirado_por))
        row = cur.fetchone()

        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"ok": True, "frequencia": row})
    except Exception as e:
        return api_error("Erro ao registrar saída", 500, e)

@app.get("/api/historico")
@require_auth
def historico():
    try:
        conn = db()
        cur = conn.cursor()
        cur.execute("""
            SELECT a.*,
              (SELECT COUNT(*) FROM frequencia f WHERE f.id_aula=a.id) AS total_criancas
            FROM aulas a
            WHERE a.encerrada_em IS NOT NULL
            ORDER BY COALESCE(a.encerrada_em, a.data_aula) DESC
            LIMIT 200
        """)
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return jsonify({"ok": True, "historico": rows})
    except Exception as e:
        return api_error("Erro ao carregar histórico", 500, e)

@app.get("/api/aulas/<int:aula_id>/relatorio")
@require_auth
def relatorio_json(aula_id):
    try:
        conn = db()
        cur = conn.cursor()
        cur.execute("SELECT * FROM aulas WHERE id=%s", (aula_id,))
        aula = cur.fetchone()
        if not aula:
            cur.close(); conn.close()
            return api_error("Aula não encontrada", 404)

        cur.execute("""
            SELECT a.nome AS aluno, f.entrada_ts, f.saida_ts, COALESCE(f.retirado_por,'') AS retirado_por
            FROM frequencia f
            JOIN alunos a ON a.id=f.id_aluno
            WHERE f.id_aula=%s
            ORDER BY a.nome ASC
        """, (aula_id,))
        pres = cur.fetchall()

        cur.close()
        conn.close()

        presenca = []
        for p in pres:
            presenca.append({
                "aluno": p["aluno"],
                "horario_entrada": p["entrada_ts"],
                "horario_saida": p["saida_ts"],
                "retirado_por": p["retirado_por"] or ""
            })

        return jsonify({"ok": True, "aula": aula, "presenca": presenca})
    except Exception as e:
        return api_error("Erro ao gerar relatório", 500, e)

@app.get("/api/aulas/<int:aula_id>/relatorio.csv")
@require_auth
def relatorio_csv(aula_id):
    try:
        conn = db()
        cur = conn.cursor()
        cur.execute("SELECT * FROM aulas WHERE id=%s", (aula_id,))
        aula = cur.fetchone()
        if not aula:
            cur.close(); conn.close()
            return api_error("Aula não encontrada", 404)

        cur.execute("""
            SELECT a.nome AS aluno, f.entrada_ts, f.saida_ts, COALESCE(f.retirado_por,'') AS retirado_por
            FROM frequencia f
            JOIN alunos a ON a.id=f.id_aluno
            WHERE f.id_aula=%s
            ORDER BY a.nome ASC
        """, (aula_id,))
        pres = cur.fetchall()
        cur.close()
        conn.close()

        output = StringIO()
        writer = csv.writer(output)
        writer.writerow(["Aula ID", aula_id])
        writer.writerow(["Tema", aula.get("tema", "")])
        writer.writerow(["Equipe", aula.get("professores", "")])
        writer.writerow(["Data", str(aula.get("data_aula", ""))])
        writer.writerow([])
        writer.writerow(["Aluno", "Entrada", "Saída", "Retirado por"])

        for p in pres:
            writer.writerow([
                p["aluno"],
                str(p["entrada_ts"] or ""),
                str(p["saida_ts"] or ""),
                p["retirado_por"] or ""
            ])

        csv_data = output.getvalue()
        return Response(
            csv_data,
            mimetype="text/csv",
            headers={"Content-Disposition": f"attachment; filename=relatorio-aula-{aula_id}.csv"}
        )
    except Exception as e:
        return api_error("Erro ao baixar CSV", 500, e)

# =========================
# Mural (com imagem + likes + comentários)
# =========================

@app.get("/api/avisos")
@require_auth
def avisos_list():
    try:
        conn = db()
        cur = conn.cursor()
        cur.execute("""
            SELECT * FROM avisos
            ORDER BY fixado DESC, data_criacao DESC NULLS LAST, id DESC
            LIMIT 200
        """)
        avisos = cur.fetchall()

        # likes count e se eu curti
        usuario = request.user.get("usuario", "")
        ids = [a["id"] for a in avisos]
        like_map = {}
        mine_map = {}
        if ids:
            cur.execute("""
                SELECT aviso_id, COUNT(*)::int AS c
                FROM avisos_likes
                WHERE aviso_id = ANY(%s)
                GROUP BY aviso_id
            """, (ids,))
            for r in cur.fetchall():
                like_map[r["aviso_id"]] = r["c"]

            cur.execute("""
                SELECT aviso_id
                FROM avisos_likes
                WHERE aviso_id = ANY(%s) AND usuario=%s
            """, (ids, usuario))
            for r in cur.fetchall():
                mine_map[r["aviso_id"]] = True

        # comentários (últimos 5 por aviso)
        com_map = {i: [] for i in ids}
        if ids:
            cur.execute("""
                SELECT * FROM avisos_comentarios
                WHERE aviso_id = ANY(%s)
                ORDER BY criado_em DESC
            """, (ids,))
            rows = cur.fetchall()
            for r in rows:
                if len(com_map.get(r["aviso_id"], [])) < 5:
                    com_map[r["aviso_id"]].append(r)

        cur.close()
        conn.close()

        out = []
        for a in avisos:
            aid = a["id"]
            out.append({
                **a,
                "likes": like_map.get(aid, 0),
                "liked_by_me": True if mine_map.get(aid) else False,
                "comentarios": list(reversed(com_map.get(aid, [])))  # volta ordem mais antiga->nova
            })

        return jsonify({"ok": True, "avisos": out})
    except Exception as e:
        return api_error("Erro ao listar avisos", 500, e)

@app.post("/api/avisos")
@require_auth
def aviso_create():
    try:
        data = request.get_json(force=True) or {}
        mensagem = (data.get("mensagem") or "").strip()
        imagem = data.get("imagem") or None

        if not mensagem and not imagem:
            return api_error("Mensagem ou imagem são obrigatórios", 400)

        conn = db()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO avisos (mensagem, data_criacao, autor, imagem, fixado)
            VALUES (%s, NOW(), %s, %s, FALSE)
            RETURNING *
        """, (mensagem, request.user.get("nome", request.user.get("usuario", "")), imagem))
        row = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"ok": True, "aviso": row})
    except Exception as e:
        return api_error("Erro ao criar aviso", 500, e)

@app.post("/api/avisos/<int:aviso_id>/fixar")
@require_auth
@require_role("admin")
def aviso_fixar(aviso_id):
    try:
        data = request.get_json(force=True) or {}
        fixado = bool(data.get("fixado", False))
        conn = db()
        cur = conn.cursor()
        cur.execute("UPDATE avisos SET fixado=%s WHERE id=%s RETURNING *", (fixado, aviso_id))
        row = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"ok": True, "aviso": row})
    except Exception as e:
        return api_error("Erro ao fixar aviso", 500, e)

@app.delete("/api/avisos/<int:aviso_id>")
@require_auth
@require_role("admin")
def aviso_delete(aviso_id):
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

@app.post("/api/avisos/<int:aviso_id>/like")
@require_auth
def aviso_like(aviso_id):
    try:
        usuario = request.user.get("usuario", "")
        conn = db()
        cur = conn.cursor()
        # toggle
        cur.execute("SELECT id FROM avisos_likes WHERE aviso_id=%s AND usuario=%s", (aviso_id, usuario))
        row = cur.fetchone()
        if row:
            cur.execute("DELETE FROM avisos_likes WHERE id=%s", (row["id"],))
            liked = False
        else:
            cur.execute("INSERT INTO avisos_likes (aviso_id, usuario) VALUES (%s,%s) ON CONFLICT DO NOTHING",
                        (aviso_id, usuario))
            liked = True

        conn.commit()
        cur.execute("SELECT COUNT(*)::int AS c FROM avisos_likes WHERE aviso_id=%s", (aviso_id,))
        c = cur.fetchone()["c"]
        cur.close()
        conn.close()
        return jsonify({"ok": True, "liked": liked, "likes": c})
    except Exception as e:
        return api_error("Erro no like", 500, e)

@app.post("/api/avisos/<int:aviso_id>/comentario")
@require_auth
def aviso_comentar(aviso_id):
    try:
        data = request.get_json(force=True) or {}
        comentario = (data.get("comentario") or "").strip()
        if not comentario:
            return api_error("Comentário vazio", 400)

        conn = db()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO avisos_comentarios (aviso_id, usuario, comentario)
            VALUES (%s,%s,%s)
            RETURNING *
        """, (aviso_id, request.user.get("usuario", ""), comentario))
        row = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"ok": True, "comentario": row})
    except Exception as e:
        return api_error("Erro ao comentar", 500, e)

# =========================
# Assistente (sem IA externa por enquanto)
# =========================

@app.get("/api/assistente/insights")
@require_auth
def assist_insights():
    """
    - alertas: alunos com entrada sem saída (na aula ativa)
    - frequência baixa: alunos abaixo do percentual mínimo nas últimas N aulas
    """
    try:
        limite = int(request.args.get("limite_aulas", "10"))
        min_pct = float(request.args.get("min_pct", "50"))

        conn = db()
        cur = conn.cursor()

        cur.execute("""
            SELECT * FROM aulas
            WHERE encerrada_em IS NULL
            ORDER BY COALESCE(iniciada_em, data_aula) DESC
            LIMIT 1
        """)
        aula = cur.fetchone()

        alertas = []
        if aula:
            cur.execute("""
                SELECT a.nome AS aluno, f.entrada_ts, f.saida_ts
                FROM frequencia f
                JOIN alunos a ON a.id=f.id_aluno
                WHERE f.id_aula=%s AND f.entrada_ts IS NOT NULL AND f.saida_ts IS NULL
                ORDER BY f.entrada_ts ASC
            """, (aula["id"],))
            pend = cur.fetchall()
            if pend:
                alertas.append({
                    "tipo": "pendente_saida",
                    "titulo": "Pendência de saída",
                    "qtd": len(pend),
                    "itens": [{"aluno": p["aluno"], "horario_entrada": p["entrada_ts"]} for p in pend]
                })

        # últimas aulas encerradas
        cur.execute("""
            SELECT id FROM aulas
            WHERE encerrada_em IS NOT NULL
            ORDER BY COALESCE(encerrada_em, data_aula) DESC
            LIMIT %s
        """, (limite,))
        aula_ids = [r["id"] for r in cur.fetchall()]

        freq_baixa = {"total_aulas": len(aula_ids), "min_pct": min_pct, "alunos": []}
        if aula_ids:
            # presença por aluno
            cur.execute("""
                SELECT a.id, a.nome,
                       COUNT(f.id)::int AS presentes
                FROM alunos a
                LEFT JOIN frequencia f
                  ON f.id_aluno=a.id AND f.id_aula = ANY(%s) AND f.entrada_ts IS NOT NULL
                GROUP BY a.id, a.nome
                ORDER BY a.nome ASC
            """, (aula_ids,))
            rows = cur.fetchall()
            total = len(aula_ids)
            for r in rows:
                presentes = int(r["presentes"] or 0)
                pct = 0 if total == 0 else round((presentes / total) * 100, 1)
                if pct < min_pct:
                    freq_baixa["alunos"].append({
                        "id": r["id"], "nome": r["nome"],
                        "presentes": presentes, "total_aulas": total, "pct": pct
                    })

        cur.close()
        conn.close()

        return jsonify({
            "ok": True,
            "aula_ativa": aula,
            "alertas": alertas,
            "frequencia_baixa": freq_baixa
        })
    except Exception as e:
        return api_error("Erro ao gerar insights", 500, e)

@app.get("/api/assistente/sugestao-tema")
@require_auth
def assist_tema():
    try:
        janela = int(request.args.get("janela", "8"))

        # base simples de temas (pode crescer depois)
        base = [
            ("O Bom Pastor", "João 10:11", "Jesus cuida, guia e protege."),
            ("A Arca de Noé", "Gênesis 6:9", "Obediência em tempos difíceis."),
            ("Davi e Golias", "1 Samuel 17:45", "Coragem com Deus."),
            ("O Filho Pródigo", "Lucas 15:20", "O Pai que perdoa."),
            ("A Criação", "Gênesis 1:1", "Deus criou tudo com propósito."),
            ("Jesus acalma a tempestade", "Marcos 4:39", "Paz em meio ao medo."),
            ("A armadura de Deus", "Efésios 6:11", "Proteção diária."),
            ("O bom samaritano", "Lucas 10:33", "Amor ao próximo."),
            ("Zaqueu", "Lucas 19:5", "Jesus nos chama pelo nome."),
        ]

        conn = db()
        cur = conn.cursor()
        cur.execute("""
            SELECT tema FROM aulas
            WHERE encerrada_em IS NOT NULL
            ORDER BY COALESCE(encerrada_em, data_aula) DESC
            LIMIT %s
        """, (janela,))
        recentes = [r["tema"] for r in cur.fetchall() if r.get("tema")]

        # filtra base para evitar repetidos
        rec_lower = set([t.lower() for t in recentes])
        sug = []
        for t, verso, ideia in base:
            if t.lower() not in rec_lower:
                sug.append({"tema": t, "verso": verso, "ideia": ideia})
            if len(sug) >= 3:
                break

        # se não sobrou, devolve as 3 primeiras
        if len(sug) < 3:
            sug = [{"tema": t, "verso": verso, "ideia": ideia} for t, verso, ideia in base[:3]]

        cur.close()
        conn.close()

        return jsonify({"ok": True, "sugestoes": sug, "evitando_ultimos": recentes})
    except Exception as e:
        return api_error("Erro ao sugerir tema", 500, e)

@app.get("/api/assistente/relatorio-narrativo")
@require_auth
def assist_relatorio():
    try:
        aula_id = request.args.get("aula_id")
        if not aula_id:
            return api_error("aula_id é obrigatório", 400)

        conn = db()
        cur = conn.cursor()
        cur.execute("SELECT * FROM aulas WHERE id=%s", (aula_id,))
        aula = cur.fetchone()
        if not aula:
            cur.close(); conn.close()
            return api_error("Aula não encontrada", 404)

        cur.execute("""
            SELECT a.nome AS aluno, f.entrada_ts, f.saida_ts, COALESCE(f.retirado_por,'') AS retirado_por
            FROM frequencia f
            JOIN alunos a ON a.id=f.id_aluno
            WHERE f.id_aula=%s
            ORDER BY a.nome ASC
        """, (aula_id,))
        pres = cur.fetchall()

        total = len(pres)
        presentes = sum(1 for p in pres if p["entrada_ts"])
        pend_saidas = [p for p in pres if p["entrada_ts"] and not p["saida_ts"]]

        linhas = []
        linhas.append(f"Relatório narrativo da aula {aula_id}")
        linhas.append(f"Tema: {aula.get('tema','-')}")
        linhas.append(f"Equipe: {aula.get('professores','-')}")
        linhas.append(f"Data: {str(aula.get('data_aula','-'))}")
        linhas.append("")
        linhas.append(f"Foram registrados {presentes} check-ins de um total de {total} crianças listadas nesta aula.")
        if pend_saidas:
            linhas.append(f"Atenção: {len(pend_saidas)} criança(s) ficaram com saída pendente no registro.")
        linhas.append("")
        linhas.append("Resumo de presença:")
        for p in pres:
            ent = str(p["entrada_ts"] or "")
            sai = str(p["saida_ts"] or "")
            ret = p["retirado_por"] or ""
            linhas.append(f"- {p['aluno']}: entrada {ent} | saída {sai} | retirado por {ret}")

        cur.close()
        conn.close()

        texto = "\n".join(linhas)
        return jsonify({"ok": True, "texto": texto})
    except Exception as e:
        return api_error("Erro ao gerar relatório narrativo", 500, e)

# =========================
# Run
# =========================

if __name__ == "__main__":
    port = int(_env("PORT", "8080"))
    app.run(host="0.0.0.0", port=port)
