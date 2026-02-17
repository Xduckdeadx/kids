import os
import json
import base64
import psycopg2
from psycopg2.extras import RealDictCursor
from datetime import datetime, timedelta
from functools import wraps
from io import StringIO
import csv
import logging
import sys
import traceback

from flask import Flask, request, jsonify, send_from_directory, Response
from flask_cors import CORS

# =========================
# CONFIGURAÇÃO
# =========================
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger('ieq-central')

app = Flask(__name__, static_folder="static", static_url_path="/static")
CORS(app)

# =========================
# CONEXÃO COM BANCO
# =========================
def get_db_connection():
    """Conecta ao banco de dados"""
    database_url = os.environ.get("DATABASE_URL", "").strip()
    
    if database_url:
        if database_url.startswith("postgres://"):
            database_url = database_url.replace("postgres://", "postgresql://", 1)
        return psycopg2.connect(database_url, cursor_factory=RealDictCursor)
    
    # Configuração manual
    return psycopg2.connect(
        host=os.environ.get("DB_HOST", "localhost"),
        port=os.environ.get("DB_PORT", "5432"),
        dbname=os.environ.get("DB_NAME", "postgres"),
        user=os.environ.get("DB_USER", "postgres"),
        password=os.environ.get("DB_PASSWORD", ""),
        cursor_factory=RealDictCursor
    )

# =========================
# INICIALIZAÇÃO DO BANCO - VERSÃO CORRIGIDA
# =========================
def init_db():
    """Cria tabelas se não existirem - com todas as colunas necessárias"""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # 1. TABELA USUÁRIOS
        cur.execute("""
        CREATE TABLE IF NOT EXISTS usuarios (
            id SERIAL PRIMARY KEY,
            nome TEXT NOT NULL,
            usuario TEXT UNIQUE NOT NULL,
            senha TEXT NOT NULL,
            role TEXT DEFAULT 'auxiliar',
            foto TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            last_login TIMESTAMP
        );
        """)
        logger.info("✅ Tabela usuarios criada/verificada")
        
        # 2. TABELA ALUNOS - com coluna ativo
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
            imagem_ficha TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            ativo BOOLEAN DEFAULT TRUE
        );
        """)
        logger.info("✅ Tabela alunos criada/verificada")
        
        # 3. TABELA AVISOS
        cur.execute("""
        CREATE TABLE IF NOT EXISTS avisos (
            id SERIAL PRIMARY KEY,
            mensagem TEXT,
            data_criacao TIMESTAMP DEFAULT NOW(),
            autor TEXT,
            autor_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
            imagem TEXT,
            fixado BOOLEAN DEFAULT FALSE,
            curtidas INTEGER DEFAULT 0
        );
        """)
        logger.info("✅ Tabela avisos criada/verificada")
        
        # 4. TABELA LIKES
        cur.execute("""
        CREATE TABLE IF NOT EXISTS avisos_likes (
            id SERIAL PRIMARY KEY,
            aviso_id INTEGER REFERENCES avisos(id) ON DELETE CASCADE,
            usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
            usuario_nome TEXT,
            criado_em TIMESTAMP DEFAULT NOW(),
            UNIQUE(aviso_id, usuario_id)
        );
        """)
        logger.info("✅ Tabela likes criada/verificada")
        
        # 5. TABELA COMENTÁRIOS
        cur.execute("""
        CREATE TABLE IF NOT EXISTS avisos_comentarios (
            id SERIAL PRIMARY KEY,
            aviso_id INTEGER REFERENCES avisos(id) ON DELETE CASCADE,
            usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
            usuario_nome TEXT NOT NULL,
            comentario TEXT NOT NULL,
            criado_em TIMESTAMP DEFAULT NOW()
        );
        """)
        logger.info("✅ Tabela comentarios criada/verificada")
        
        # 6. TABELA AULAS - com todas as colunas necessárias
        cur.execute("""
        CREATE TABLE IF NOT EXISTS aulas (
            id SERIAL PRIMARY KEY,
            data_aula TIMESTAMP DEFAULT NOW(),
            tema TEXT NOT NULL,
            professores TEXT,
            professores_ids TEXT,
            iniciada_em TIMESTAMP DEFAULT NOW(),
            encerrada_em TIMESTAMP,
            observacoes TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        );
        """)
        logger.info("✅ Tabela aulas criada/verificada")
        
        # 7. TABELA FREQUÊNCIA
        cur.execute("""
        CREATE TABLE IF NOT EXISTS frequencia (
            id SERIAL PRIMARY KEY,
            id_aula INTEGER REFERENCES aulas(id) ON DELETE CASCADE,
            id_aluno INTEGER REFERENCES alunos(id) ON DELETE CASCADE,
            entrada_ts TIMESTAMP,
            saida_ts TIMESTAMP,
            retirado_por TEXT,
            retirado_por_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
            created_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(id_aula, id_aluno)
        );
        """)
        logger.info("✅ Tabela frequencia criada/verificada")
        
        # 8. CRIA USUÁRIO ADMIN SE NÃO EXISTIR
        cur.execute("SELECT id FROM usuarios WHERE usuario = 'admin'")
        if not cur.fetchone():
            cur.execute("""
                INSERT INTO usuarios (nome, usuario, senha, role, created_at)
                VALUES (%s, %s, %s, %s, NOW())
            """, ("Administrador", "admin", "1234", "admin"))
            logger.info("✅ Usuário admin criado (senha: 1234)")
        
        conn.commit()
        logger.info("🎉 Banco de dados inicializado com sucesso!")
        
        # Verifica se as colunas existem
        cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='alunos' AND column_name='ativo'")
        if not cur.fetchone():
            logger.error("❌ Coluna 'ativo' não foi criada!")
        
    except Exception as e:
        logger.error(f"❌ Erro na inicialização do banco: {e}")
        logger.error(traceback.format_exc())
        if conn:
            conn.rollback()
        raise
    finally:
        if conn:
            cur.close()
            conn.close()
            logger.info("🔌 Conexão fechada")

# =========================
# EXECUTA INICIALIZAÇÃO
# =========================
try:
    init_db()
    logger.info("✅ Banco de dados pronto!")
except Exception as e:
    logger.error(f"❌ Falha crítica: {e}")

# =========================
# UTILITÁRIOS DE RESPOSTA
# =========================
def success_response(data=None, message=None, status=200):
    response = {"success": True, "status": status}
    if data is not None:
        response["data"] = data
    if message:
        response["message"] = message
    return jsonify(response), status

def error_response(message, status=400, details=None):
    response = {
        "success": False,
        "error": message,
        "status": status
    }
    if details and os.environ.get("DEBUG"):
        response["details"] = str(details)
    return jsonify(response), status

# =========================
# ROTAS PÚBLICAS
# =========================
@app.route("/")
def index():
    return send_from_directory("templates", "index.html")

@app.route("/static/<path:filename>")
def static_files(filename):
    return send_from_directory("static", filename)

@app.route("/api/status")
def status():
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT NOW() as time")
        time = cur.fetchone()
        cur.close()
        conn.close()
        return jsonify({
            "success": True,
            "data": {
                "status": "online",
                "database": "connected",
                "time": str(time["time"]) if time else None
            }
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# =========================
# LOGIN
# =========================
@app.route("/api/login", methods=["POST"])
def login():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"success": False, "error": "Dados inválidos"}), 400
        
        usuario = data.get("usuario", "").strip()
        senha = data.get("senha", "").strip()
        
        if not usuario or not senha:
            return jsonify({"success": False, "error": "Usuário e senha obrigatórios"}), 400
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute(
            "SELECT id, nome, usuario, role, foto FROM usuarios WHERE usuario = %s AND senha = %s",
            (usuario, senha)
        )
        user = cur.fetchone()
        cur.close()
        conn.close()
        
        if not user:
            return jsonify({"success": False, "error": "Usuário ou senha inválidos"}), 401
        
        token = base64.b64encode(json.dumps({
            "id": user["id"],
            "usuario": user["usuario"],
            "nome": user["nome"],
            "role": user["role"]
        }).encode()).decode()
        
        return jsonify({
            "success": True,
            "data": {
                "token": token,
                "user": {
                    "id": user["id"],
                    "nome": user["nome"],
                    "usuario": user["usuario"],
                    "role": user["role"],
                    "foto": user.get("foto")
                }
            }
        })
        
    except Exception as e:
        logger.error(f"Erro no login: {e}")
        return jsonify({"success": False, "error": "Erro interno no servidor"}), 500

# =========================
# ME - DADOS DO USUÁRIO
# =========================
@app.route("/api/me", methods=["GET"])
def me():
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return jsonify({"success": False, "error": "Não autorizado"}), 401
    
    try:
        token = auth.split(" ")[1]
        user_data = json.loads(base64.b64decode(token).decode())
        return jsonify({"success": True, "data": {"user": user_data}})
    except:
        return jsonify({"success": False, "error": "Token inválido"}), 401

# =========================
# DASHBOARD
# =========================
@app.route("/api/dashboard/stats", methods=["GET"])
def dashboard_stats():
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("SELECT COUNT(*) as total FROM alunos WHERE ativo = TRUE")
        total_alunos = cur.fetchone()["total"]
        
        cur.execute("SELECT COUNT(*) as total FROM usuarios")
        total_equipe = cur.fetchone()["total"]
        
        cur.execute("""
            SELECT * FROM aulas 
            WHERE encerrada_em IS NULL 
            ORDER BY iniciada_em DESC 
            LIMIT 1
        """)
        aula_ativa = cur.fetchone()
        
        presentes = 0
        if aula_ativa:
            cur.execute(
                "SELECT COUNT(*) as total FROM frequencia WHERE id_aula = %s AND entrada_ts IS NOT NULL",
                (aula_ativa["id"],)
            )
            presentes = cur.fetchone()["total"]
        
        cur.close()
        conn.close()
        
        return jsonify({
            "success": True,
            "data": {
                "totais": {
                    "alunos": total_alunos,
                    "equipe": total_equipe,
                    "presentes_hoje": presentes
                },
                "aula_ativa": aula_ativa
            }
        })
        
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# =========================
# ALUNOS
# =========================
@app.route("/api/alunos", methods=["GET"])
def listar_alunos():
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT * FROM alunos WHERE ativo = TRUE ORDER BY nome")
        alunos = cur.fetchall()
        cur.close()
        conn.close()
        return jsonify({"success": True, "data": {"alunos": alunos}})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/alunos", methods=["POST"])
def criar_aluno():
    try:
        data = request.get_json()
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO alunos (nome, data_nascimento, responsavel, telefone, observacoes,
                              autorizado_retirar, autorizado_2, autorizado_3, foto, ativo)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, TRUE)
            RETURNING *
        """, (
            data.get("nome"), data.get("data_nascimento"), data.get("responsavel"),
            data.get("telefone"), data.get("observacoes"), data.get("autorizado_retirar"),
            data.get("autorizado_2"), data.get("autorizado_3"), data.get("foto")
        ))
        aluno = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"success": True, "data": {"aluno": aluno}})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/alunos/<int:id>", methods=["PUT"])
def atualizar_aluno(id):
    try:
        data = request.get_json()
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            UPDATE alunos SET 
                nome = %s, data_nascimento = %s, responsavel = %s, telefone = %s,
                observacoes = %s, autorizado_retirar = %s, autorizado_2 = %s,
                autorizado_3 = %s, foto = %s
            WHERE id = %s RETURNING *
        """, (
            data.get("nome"), data.get("data_nascimento"), data.get("responsavel"),
            data.get("telefone"), data.get("observacoes"), data.get("autorizado_retirar"),
            data.get("autorizado_2"), data.get("autorizado_3"), data.get("foto"), id
        ))
        aluno = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"success": True, "data": {"aluno": aluno}})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/alunos/<int:id>", methods=["DELETE"])
def deletar_aluno(id):
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("UPDATE alunos SET ativo = FALSE WHERE id = %s", (id,))
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# =========================
# EQUIPE
# =========================
@app.route("/api/equipe", methods=["GET"])
def listar_equipe():
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT id, nome, usuario, role, foto FROM usuarios ORDER BY nome")
        equipe = cur.fetchall()
        cur.close()
        conn.close()
        return jsonify({"success": True, "data": {"equipe": equipe}})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/equipe", methods=["POST"])
def criar_membro():
    try:
        data = request.get_json()
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO usuarios (nome, usuario, senha, role, foto)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id, nome, usuario, role, foto
        """, (
            data.get("nome"), data.get("usuario"), data.get("senha"),
            data.get("role", "auxiliar"), data.get("foto")
        ))
        membro = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"success": True, "data": {"usuario": membro}})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/equipe/<int:id>", methods=["DELETE"])
def deletar_membro(id):
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("DELETE FROM usuarios WHERE id = %s AND usuario != 'admin'", (id,))
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# =========================
# AULAS
# =========================
@app.route("/api/aulas/iniciar", methods=["POST"])
def iniciar_aula():
    try:
        data = request.get_json()
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Encerra aula anterior
        cur.execute("UPDATE aulas SET encerrada_em = NOW() WHERE encerrada_em IS NULL")
        
        cur.execute("""
            INSERT INTO aulas (tema, professores, iniciada_em, data_aula)
            VALUES (%s, %s, NOW(), NOW())
            RETURNING *
        """, (data.get("tema"), data.get("professores")))
        
        aula = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"success": True, "data": {"aula": aula}})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/aulas/ativa", methods=["GET"])
def aula_ativa():
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            SELECT * FROM aulas 
            WHERE encerrada_em IS NULL 
            ORDER BY iniciada_em DESC 
            LIMIT 1
        """)
        aula = cur.fetchone()
        
        presencas = []
        if aula:
            cur.execute("""
                SELECT f.*, a.nome as aluno_nome
                FROM frequencia f
                JOIN alunos a ON a.id = f.id_aluno
                WHERE f.id_aula = %s
                ORDER BY a.nome
            """, (aula["id"],))
            presencas = cur.fetchall()
        
        cur.close()
        conn.close()
        return jsonify({"success": True, "data": {"aula": aula, "presencas": presencas}})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/aulas/<int:aula_id>/entrada", methods=["POST"])
def registrar_entrada(aula_id):
    try:
        data = request.get_json()
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            INSERT INTO frequencia (id_aula, id_aluno, entrada_ts)
            VALUES (%s, %s, NOW())
            ON CONFLICT (id_aula, id_aluno) 
            DO UPDATE SET entrada_ts = NOW()
            RETURNING *
        """, (aula_id, data.get("aluno_id")))
        
        freq = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"success": True, "data": {"frequencia": freq}})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/aulas/<int:aula_id>/saida", methods=["POST"])
def registrar_saida(aula_id):
    try:
        data = request.get_json()
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            INSERT INTO frequencia (id_aula, id_aluno, saida_ts, retirado_por)
            VALUES (%s, %s, NOW(), %s)
            ON CONFLICT (id_aula, id_aluno) 
            DO UPDATE SET saida_ts = NOW(), retirado_por = %s
            RETURNING *
        """, (aula_id, data.get("aluno_id"), data.get("retirado_por"), data.get("retirado_por")))
        
        freq = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"success": True, "data": {"frequencia": freq}})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/aulas/<int:aula_id>/encerrar", methods=["POST"])
def encerrar_aula(aula_id):
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("UPDATE aulas SET encerrada_em = NOW() WHERE id = %s", (aula_id,))
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# =========================
# HISTÓRICO
# =========================
@app.route("/api/historico", methods=["GET"])
def historico():
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT a.*, COUNT(f.id) as total_presentes
            FROM aulas a
            LEFT JOIN frequencia f ON f.id_aula = a.id
            WHERE a.encerrada_em IS NOT NULL
            GROUP BY a.id
            ORDER BY a.encerrada_em DESC
            LIMIT 100
        """)
        historico = cur.fetchall()
        cur.close()
        conn.close()
        return jsonify({"success": True, "data": {"historico": historico}})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/aulas/<int:aula_id>/relatorio", methods=["GET"])
def relatorio_aula(aula_id):
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("SELECT * FROM aulas WHERE id = %s", (aula_id,))
        aula = cur.fetchone()
        
        cur.execute("""
            SELECT a.nome, a.data_nascimento, a.responsavel,
                   f.entrada_ts, f.saida_ts, f.retirado_por
            FROM frequencia f
            JOIN alunos a ON a.id = f.id_aluno
            WHERE f.id_aula = %s
            ORDER BY a.nome
        """, (aula_id,))
        presencas = cur.fetchall()
        
        cur.close()
        conn.close()
        
        return jsonify({
            "success": True,
            "data": {
                "aula": aula,
                "presencas": presencas
            }
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/aulas/<int:aula_id>/relatorio/csv", methods=["GET"])
def relatorio_csv(aula_id):
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("SELECT * FROM aulas WHERE id = %s", (aula_id,))
        aula = cur.fetchone()
        
        cur.execute("""
            SELECT a.nome, f.entrada_ts, f.saida_ts, f.retirado_por
            FROM frequencia f
            JOIN alunos a ON a.id = f.id_aluno
            WHERE f.id_aula = %s
            ORDER BY a.nome
        """, (aula_id,))
        presencas = cur.fetchall()
        
        cur.close()
        conn.close()
        
        output = StringIO()
        writer = csv.writer(output)
        writer.writerow(["Aluno", "Entrada", "Saída", "Retirado por"])
        
        for p in presencas:
            writer.writerow([
                p["nome"],
                p["entrada_ts"].strftime("%d/%m/%Y %H:%M") if p["entrada_ts"] else "",
                p["saida_ts"].strftime("%d/%m/%Y %H:%M") if p["saida_ts"] else "",
                p["retirado_por"] or ""
            ])
        
        return Response(
            output.getvalue(),
            mimetype="text/csv",
            headers={"Content-Disposition": f"attachment; filename=aula-{aula_id}.csv"}
        )
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# =========================
# MURAL
# =========================
@app.route("/api/mural", methods=["GET"])
def listar_mural():
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            SELECT a.*, u.nome as autor_nome,
                   (SELECT COUNT(*) FROM avisos_likes WHERE aviso_id = a.id) as total_likes,
                   (SELECT COUNT(*) FROM avisos_comentarios WHERE aviso_id = a.id) as total_comentarios
            FROM avisos a
            LEFT JOIN usuarios u ON u.id = a.autor_id
            ORDER BY a.fixado DESC, a.data_criacao DESC
            LIMIT 50
        """)
        avisos = cur.fetchall()
        
        for aviso in avisos:
            cur.execute("""
                SELECT c.*, u.nome as usuario_nome
                FROM avisos_comentarios c
                LEFT JOIN usuarios u ON u.id = c.usuario_id
                WHERE c.aviso_id = %s
                ORDER BY c.criado_em DESC
                LIMIT 5
            """, (aviso["id"],))
            aviso["comentarios"] = cur.fetchall()
        
        cur.close()
        conn.close()
        return jsonify({"success": True, "data": {"avisos": avisos}})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/mural", methods=["POST"])
def criar_aviso():
    try:
        data = request.get_json()
        auth = request.headers.get("Authorization", "")
        user_data = None
        
        if auth.startswith("Bearer "):
            try:
                token = auth.split(" ")[1]
                user_data = json.loads(base64.b64decode(token).decode())
            except:
                pass
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            INSERT INTO avisos (mensagem, imagem, autor, autor_id)
            VALUES (%s, %s, %s, %s)
            RETURNING *
        """, (
            data.get("mensagem"),
            data.get("imagem"),
            user_data.get("nome") if user_data else "Sistema",
            user_data.get("id") if user_data else None
        ))
        
        aviso = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"success": True, "data": {"aviso": aviso}})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/mural/<int:aviso_id>/like", methods=["POST"])
def toggle_like(aviso_id):
    try:
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return jsonify({"success": False, "error": "Não autorizado"}), 401
        
        token = auth.split(" ")[1]
        user_data = json.loads(base64.b64decode(token).decode())
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute(
            "SELECT id FROM avisos_likes WHERE aviso_id = %s AND usuario_id = %s",
            (aviso_id, user_data["id"])
        )
        like = cur.fetchone()
        
        if like:
            cur.execute("DELETE FROM avisos_likes WHERE id = %s", (like["id"],))
            liked = False
        else:
            cur.execute("""
                INSERT INTO avisos_likes (aviso_id, usuario_id, usuario_nome)
                VALUES (%s, %s, %s)
            """, (aviso_id, user_data["id"], user_data["nome"]))
            liked = True
        
        cur.execute("SELECT COUNT(*) as total FROM avisos_likes WHERE aviso_id = %s", (aviso_id,))
        total = cur.fetchone()["total"]
        
        conn.commit()
        cur.close()
        conn.close()
        
        return jsonify({"success": True, "data": {"liked": liked, "total_likes": total}})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/mural/<int:aviso_id>/comentario", methods=["POST"])
def comentar(aviso_id):
    try:
        data = request.get_json()
        auth = request.headers.get("Authorization", "")
        
        if not auth.startswith("Bearer "):
            return jsonify({"success": False, "error": "Não autorizado"}), 401
        
        token = auth.split(" ")[1]
        user_data = json.loads(base64.b64decode(token).decode())
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            INSERT INTO avisos_comentarios (aviso_id, usuario_id, usuario_nome, comentario)
            VALUES (%s, %s, %s, %s)
            RETURNING *
        """, (aviso_id, user_data["id"], user_data["nome"], data.get("comentario")))
        
        comentario = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        
        return jsonify({"success": True, "data": {"comentario": comentario}})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/mural/<int:aviso_id>/fixar", methods=["POST"])
def fixar_aviso(aviso_id):
    try:
        data = request.get_json()
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("UPDATE avisos SET fixado = %s WHERE id = %s", (data.get("fixado"), aviso_id))
        conn.commit()
        cur.close()
        conn.close()
        
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/mural/<int:aviso_id>", methods=["DELETE"])
def deletar_aviso(aviso_id):
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("DELETE FROM avisos WHERE id = %s", (aviso_id,))
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# =========================
# CONFIGURAÇÕES
# =========================
@app.route("/api/config/info", methods=["GET"])
def config_info():
    return jsonify({
        "success": True,
        "data": {
            "app": {
                "nome": "IEQ Central",
                "versao": "2.0.0",
                "ambiente": os.environ.get("APP_ENV", "production"),
                "desenvolvido_por": "Equipe IEQ Central"
            }
        }
    })

# =========================
# EXECUÇÃO
# =========================
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    debug = os.environ.get("DEBUG", "False").lower() == "true"
    
    print("\n" + "="*50)
    print("🚀 IEQ CENTRAL RODANDO")
    print("="*50)
    print(f"📌 Porta: {port}")
    print(f"📌 Login: admin / 1234")
    print(f"📌 URL: http://localhost:{port}")
    print("="*50 + "\n")
    
    app.run(host="0.0.0.0", port=port, debug=debug)
