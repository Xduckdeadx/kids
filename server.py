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
# CONFIGURAÇÃO DE DEBUG
# =========================
print("="*60)
print("🚀 INICIANDO IEQ CENTRAL - SERVER")
print("="*60)

# Configuração de logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger('ieq-central')

# =========================
# CONFIGURAÇÃO DO APP
# =========================
APP_NAME = "IEQ Central • Ministério Infantil"
APP_VERSION = "2.0.0"

app = Flask(__name__, static_folder="static", static_url_path="/static")
CORS(app, supports_credentials=True)

# =========================
# FUNÇÃO DE CONEXÃO COM BANCO
# =========================
def get_db_connection():
    """Função robusta para conectar ao banco de dados"""
    
    # Tenta DATABASE_URL primeiro (Railway/Heroku)
    database_url = os.environ.get("DATABASE_URL", "").strip()
    
    if database_url:
        logger.info("📌 Usando DATABASE_URL para conexão")
        try:
            # Railway usa postgres:// mas psycopg2 espera postgresql://
            if database_url.startswith("postgres://"):
                database_url = database_url.replace("postgres://", "postgresql://", 1)
            
            conn = psycopg2.connect(
                database_url,
                cursor_factory=RealDictCursor,
                connect_timeout=10
            )
            logger.info("✅ Conexão com DATABASE_URL bem-sucedida!")
            return conn
        except Exception as e:
            logger.error(f"❌ Erro com DATABASE_URL: {e}")
            # Se falhar, tenta método manual
    
    # Configuração manual
    host = os.environ.get("DB_HOST", "").strip()
    password = os.environ.get("DB_PASSWORD", "").strip()
    
    if not host or not password:
        error_msg = "❌ ERRO: Configuração de banco incompleta!\n"
        error_msg += "Defina DATABASE_URL ou DB_HOST/DB_PASSWORD"
        logger.error(error_msg)
        
        # Mostra ajuda
        print("\n" + "="*60)
        print("🔧 PARA CONFIGURAR O BANCO:")
        print("="*60)
        print("Opção 1 - Railway (recomendado):")
        print("  DATABASE_URL=postgresql://usuario:senha@host:port/dbname")
        print("\nOpção 2 - Configuração manual:")
        print("  DB_HOST=seu-host")
        print("  DB_PASSWORD=sua-senha")
        print("  DB_PORT=5432 (opcional)")
        print("  DB_NAME=postgres (opcional)")
        print("  DB_USER=postgres (opcional)")
        print("="*60)
        
        raise RuntimeError("Configuração de banco incompleta")
    
    # Monta configuração manual
    config = {
        "host": host,
        "port": os.environ.get("DB_PORT", "5432"),
        "dbname": os.environ.get("DB_NAME", "postgres"),
        "user": os.environ.get("DB_USER", "postgres"),
        "password": password,
        "sslmode": os.environ.get("DB_SSLMODE", "require"),
        "cursor_factory": RealDictCursor,
        "connect_timeout": 10
    }
    
    logger.info(f"📌 Conectando ao banco {config['host']}...")
    
    try:
        conn = psycopg2.connect(**config)
        logger.info("✅ Conexão manual bem-sucedida!")
        return conn
    except Exception as e:
        logger.error(f"❌ Erro na conexão manual: {e}")
        logger.error(traceback.format_exc())
        raise

# =========================
# INICIALIZAÇÃO DO BANCO
# =========================
def init_database():
    """Cria tabelas e dados iniciais"""
    conn = None
    try:
        logger.info("📦 Inicializando banco de dados...")
        conn = get_db_connection()
        cur = conn.cursor()
        
        # 1. TABELA USUÁRIOS
        cur.execute("""
        CREATE TABLE IF NOT EXISTS usuarios (
            id SERIAL PRIMARY KEY,
            nome TEXT NOT NULL,
            usuario TEXT UNIQUE NOT NULL,
            senha TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'auxiliar',
            foto TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            last_login TIMESTAMP
        );
        """)
        logger.info("✅ Tabela usuarios criada/verificada")
        
        # 2. TABELA ALUNOS
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
        
        # 6. TABELA AULAS
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
            """, ("Administrador Master", "admin", "1234", "admin"))
            logger.info("✅ Usuário admin criado (senha: 1234)")
        
        conn.commit()
        logger.info("🎉 Banco de dados inicializado com sucesso!")
        
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
# INICIALIZA
# =========================
try:
    init_database()
except Exception as e:
    logger.error(f"❌ Falha crítica: {e}")
    # Não para a execução, apenas loga

# =========================
# UTILITÁRIOS DE RESPOSTA
# =========================
def success_response(data=None, message=None, status=200):
    """Resposta de sucesso padronizada"""
    response = {"success": True, "status": status}
    if data is not None:
        response["data"] = data
    if message:
        response["message"] = message
    return jsonify(response), status

def error_response(message, status=400, details=None):
    """Resposta de erro padronizada"""
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
    """Página principal"""
    return send_from_directory("templates", "index.html")

@app.route("/static/<path:filename>")
def static_files(filename):
    """Arquivos estáticos"""
    return send_from_directory("static", filename)

@app.route("/api/status")
def api_status():
    """Status da API para teste"""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT NOW() as time")
        db_time = cur.fetchone()
        cur.close()
        conn.close()
        
        return success_response({
            "app": APP_NAME,
            "version": APP_VERSION,
            "database": "connected",
            "time": str(db_time["time"]) if db_time else None,
            "env": os.environ.get("APP_ENV", "production")
        })
    except Exception as e:
        return error_response("Database offline", 500, str(e))

# =========================
# LOGIN
# =========================
@app.route("/api/login", methods=["POST"])
def login():
    """Login de usuários"""
    try:
        data = request.get_json()
        if not data:
            return error_response("Dados inválidos", 400)
        
        usuario = data.get("usuario", "").strip()
        senha = data.get("senha", "").strip()
        
        logger.info(f"Tentativa de login: {usuario}")
        
        if not usuario or not senha:
            return error_response("Usuário e senha obrigatórios", 400)
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            SELECT id, nome, usuario, role, foto 
            FROM usuarios 
            WHERE usuario = %s AND senha = %s
        """, (usuario, senha))
        
        user = cur.fetchone()
        
        if not user:
            logger.warning(f"Login falhou: {usuario}")
            return error_response("Usuário ou senha inválidos", 401)
        
        # Atualiza último login
        cur.execute("UPDATE usuarios SET last_login = NOW() WHERE id = %s", (user["id"],))
        conn.commit()
        
        cur.close()
        conn.close()
        
        # Token simples (em produção use JWT)
        token = base64.b64encode(json.dumps({
            "id": user["id"],
            "usuario": user["usuario"],
            "nome": user["nome"],
            "role": user["role"],
            "exp": (datetime.now() + timedelta(days=7)).timestamp()
        }).encode()).decode()
        
        logger.info(f"Login bem-sucedido: {usuario}")
        
        return success_response({
            "token": token,
            "user": {
                "id": user["id"],
                "nome": user["nome"],
                "usuario": user["usuario"],
                "role": user["role"],
                "foto": user.get("foto")
            }
        }, "Login realizado com sucesso")
        
    except Exception as e:
        logger.error(f"Erro no login: {e}")
        logger.error(traceback.format_exc())
        return error_response("Erro interno no servidor", 500)

# =========================
# ROTA DE TESTE
# =========================
@app.route("/api/test")
def test():
    """Rota de teste para verificar se API está funcionando"""
    return jsonify({
        "success": True,
        "message": "API funcionando!",
        "time": str(datetime.now())
    })

# =========================
# HEALTH CHECK
# =========================
@app.route("/health")
def health():
    """Health check para Railway"""
    return jsonify({"status": "healthy", "time": str(datetime.now())})

# =========================
# RUN
# =========================
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    debug = os.environ.get("DEBUG", "False").lower() == "true"
    
    print("\n" + "="*60)
    print(f"🚀 {APP_NAME} v{APP_VERSION}")
    print("="*60)
    print(f"📌 Porta: {port}")
    print(f"📌 Debug: {debug}")
    print(f"📌 Acesse: http://localhost:{port}")
    print("="*60 + "\n")
    
    app.run(host="0.0.0.0", port=port, debug=debug)
