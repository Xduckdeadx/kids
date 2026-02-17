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
# CONEXÃO COM BANCO (SUPABASE)
# =========================
def get_db_connection():
    """Conecta ao banco de dados Supabase"""
    database_url = os.environ.get("URL_DO_BANCO_DE_DADOS", "").strip()
    
    if database_url:
        logger.info("📌 Conectando ao Supabase...")
        if database_url.startswith("postgres://"):
            database_url = database_url.replace("postgres://", "postgresql://", 1)
        return psycopg2.connect(database_url, cursor_factory=RealDictCursor)
    
    # Configuração manual (fallback)
    return psycopg2.connect(
        host=os.environ.get("DB_HOST", ""),
        port=os.environ.get("DB_PORT", "5432"),
        dbname=os.environ.get("NOME_DO_BANCO_DE_DADOS", "postgres"),
        user=os.environ.get("USUÁRIO_DO_BANCO_DE_DADOS", ""),
        password=os.environ.get("DB_PASS", ""),
        cursor_factory=RealDictCursor
    )

# =========================
# MIGRAÇÃO - ADICIONA COLUNAS FALTANTES
# =========================
def migrate_database():
    """Adiciona colunas faltantes sem recriar tabelas"""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        logger.info("📦 Verificando e migrando banco de dados...")
        
        # 1. Adicionar coluna 'ativo' na tabela alunos se não existir
        cur.execute("""
            DO $$ 
            BEGIN 
                BEGIN
                    ALTER TABLE alunos ADD COLUMN ativo BOOLEAN DEFAULT TRUE;
                    logger.info('✅ Coluna ativo adicionada em alunos');
                EXCEPTION 
                    WHEN duplicate_column THEN 
                        logger.info('ℹ️ Coluna ativo já existe');
                END;
            END $$;
        """)
        
        # 2. Adicionar coluna 'iniciada_em' na tabela aulas se não existir
        cur.execute("""
            DO $$ 
            BEGIN 
                BEGIN
                    ALTER TABLE aulas ADD COLUMN iniciada_em TIMESTAMP DEFAULT NOW();
                    logger.info('✅ Coluna iniciada_em adicionada em aulas');
                EXCEPTION 
                    WHEN duplicate_column THEN 
                        logger.info('ℹ️ Coluna iniciada_em já existe');
                END;
            END $$;
        """)
        
        # 3. Adicionar coluna 'encerrada_em' se não existir
        cur.execute("""
            DO $$ 
            BEGIN 
                BEGIN
                    ALTER TABLE aulas ADD COLUMN encerrada_em TIMESTAMP;
                    logger.info('✅ Coluna encerrada_em adicionada em aulas');
                EXCEPTION 
                    WHEN duplicate_column THEN 
                        logger.info('ℹ️ Coluna encerrada_em já existe');
                END;
            END $$;
        """)
        
        # 4. Adicionar coluna 'created_at' em alunos se não existir
        cur.execute("""
            DO $$ 
            BEGIN 
                BEGIN
                    ALTER TABLE alunos ADD COLUMN created_at TIMESTAMP DEFAULT NOW();
                    logger.info('✅ Coluna created_at adicionada em alunos');
                EXCEPTION 
                    WHEN duplicate_column THEN 
                        logger.info('ℹ️ Coluna created_at já existe');
                END;
            END $$;
        """)
        
        conn.commit()
        logger.info("🎉 Migração concluída com sucesso!")
        
    except Exception as e:
        logger.error(f"❌ Erro na migração: {e}")
        logger.error(traceback.format_exc())
        if conn:
            conn.rollback()
    finally:
        if conn:
            cur.close()
            conn.close()
            logger.info("🔌 Conexão fechada")

# =========================
# EXECUTA MIGRAÇÃO
# =========================
try:
    migrate_database()
except Exception as e:
    logger.error(f"❌ Falha na migração: {e}")

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
        
        logger.info(f"Tentativa de login: {usuario}")
        
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
            logger.warning(f"Login falhou: {usuario}")
            return jsonify({"success": False, "error": "Usuário ou senha inválidos"}), 401
        
        token = base64.b64encode(json.dumps({
            "id": user["id"],
            "usuario": user["usuario"],
            "nome": user["nome"],
            "role": user["role"]
        }).encode()).decode()
        
        logger.info(f"Login bem-sucedido: {usuario}")
        
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
# ME
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
# DASHBOARD - VERSÃO SEGURA (SEM ativo)
# =========================
@app.route("/api/dashboard/stats", methods=["GET"])
def dashboard_stats():
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Tenta com ativo, se falhar, usa sem ativo
        try:
            cur.execute("SELECT COUNT(*) as total FROM alunos WHERE ativo = TRUE")
            total_alunos = cur.fetchone()["total"]
        except:
            cur.execute("SELECT COUNT(*) as total FROM alunos")
            total_alunos = cur.fetchone()["total"]
        
        cur.execute("SELECT COUNT(*) as total FROM usuarios")
        total_equipe = cur.fetchone()["total"]
        
        # Busca aula ativa
        try:
            cur.execute("""
                SELECT * FROM aulas 
                WHERE encerrada_em IS NULL 
                ORDER BY iniciada_em DESC 
                LIMIT 1
            """)
            aula_ativa = cur.fetchone()
        except:
            # Se não tiver as colunas, usa data_aula
            cur.execute("""
                SELECT * FROM aulas 
                WHERE encerrada_em IS NULL 
                ORDER BY data_aula DESC 
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
        logger.error(f"Erro no dashboard: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

# =========================
# ALUNOS - VERSÃO SEGURA
# =========================
@app.route("/api/alunos", methods=["GET"])
def listar_alunos():
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Tenta com ativo, se falhar, usa sem
        try:
            cur.execute("SELECT * FROM alunos WHERE ativo = TRUE ORDER BY nome")
        except:
            cur.execute("SELECT * FROM alunos ORDER BY nome")
        
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
        
        # Tenta com ativo, se falhar, usa sem
        try:
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
        except:
            cur.execute("""
                INSERT INTO alunos (nome, data_nascimento, responsavel, telefone, observacoes,
                                  autorizado_retirar, autorizado_2, autorizado_3, foto)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
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
        
        # Tenta soft delete, se falhar, faz hard delete
        try:
            cur.execute("UPDATE alunos SET ativo = FALSE WHERE id = %s", (id,))
        except:
            cur.execute("DELETE FROM alunos WHERE id = %s", (id,))
        
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
# AULAS - VERSÃO SEGURA
# =========================
@app.route("/api/aulas/iniciar", methods=["POST"])
def iniciar_aula():
    try:
        data = request.get_json()
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Tenta encerrar aula anterior
        try:
            cur.execute("UPDATE aulas SET encerrada_em = NOW() WHERE encerrada_em IS NULL")
        except:
            pass
        
        # Tenta inserir com iniciada_em
        try:
            cur.execute("""
                INSERT INTO aulas (tema, professores, iniciada_em, data_aula)
                VALUES (%s, %s, NOW(), NOW())
                RETURNING *
            """, (data.get("tema"), data.get("professores")))
        except:
            cur.execute("""
                INSERT INTO aulas (tema, professores, data_aula)
                VALUES (%s, %s, NOW())
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
        
        # Tenta com iniciada_em
        try:
            cur.execute("""
                SELECT * FROM aulas 
                WHERE encerrada_em IS NULL 
                ORDER BY iniciada_em DESC 
                LIMIT 1
            """)
        except:
            cur.execute("""
                SELECT * FROM aulas 
                WHERE encerrada_em IS NULL 
                ORDER BY data_aula DESC 
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

# =========================
# DEMAIS ROTAS (continuam iguais)
# =========================
# [As rotas de entrada, saída, encerrar, histórico, mural, config continuam iguais]

# =========================
# EXECUÇÃO
# =========================
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    debug = os.environ.get("DEBUG", "False").lower() == "true"
    
    print("\n" + "="*60)
    print("🚀 IEQ CENTRAL - SUPABASE")
    print("="*60)
    print(f"📌 Porta: {port}")
    print(f"📌 Login: admin / 1234")
    print(f"📌 URL: http://localhost:{port}")
    print("="*60 + "\n")
    
    app.run(host="0.0.0.0", port=port, debug=debug)
