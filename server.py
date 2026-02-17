import os
import json
import base64
import psycopg2
from psycopg2.extras import RealDictCursor
from datetime import datetime
from functools import wraps
from io import StringIO
import csv
import logging
from logging.handlers import RotatingFileHandler

from flask import Flask, request, jsonify, send_from_directory, Response, render_template_string
from flask_cors import CORS

# =========================
# Configuração Profissional
# =========================
APP_NAME = "IEQ Central • Ministério Infantil"
APP_VERSION = "2.0.0"
APP_ENV = os.environ.get("APP_ENV", "production")

# Configuração de logging
log_handler = RotatingFileHandler('app.log', maxBytes=10000, backupCount=3)
log_handler.setFormatter(logging.Formatter(
    '%(asctime)s %(levelname)s: %(message)s [in %(pathname)s:%(lineno)d]'
))
log_handler.setLevel(logging.INFO)

app = Flask(__name__, static_folder="static", static_url_path="/static")
app.logger.addHandler(log_handler)
app.logger.setLevel(logging.INFO)

CORS(app)

# =========================
# Configuração do Banco
# =========================
def get_db_config():
    """Configuração profissional com fallbacks e validação"""
    database_url = os.environ.get("DATABASE_URL", "").strip()
    
    if database_url:
        # Railway / Heroku style
        return {"url": database_url, "type": "url"}
    
    # Config manual com validação
    config = {
        "host": os.environ.get("DB_HOST", "").strip(),
        "port": os.environ.get("DB_PORT", "5432").strip(),
        "dbname": os.environ.get("DB_NAME", "postgres").strip(),
        "user": os.environ.get("DB_USER", "postgres").strip(),
        "password": os.environ.get("DB_PASSWORD", "").strip(),
        "sslmode": os.environ.get("DB_SSLMODE", "require").strip() or "require",
    }
    
    # Validação crítica
    if not config["host"] or not config["password"]:
        missing = []
        if not config["host"]: missing.append("DB_HOST")
        if not config["password"]: missing.append("DB_PASSWORD")
        raise RuntimeError(f"Configuração incompleta: {', '.join(missing)}")
    
    return {"config": config, "type": "manual"}

def get_db_connection():
    """Retorna conexão com tratamento de erro profissional"""
    try:
        db_config = get_db_config()
        
        if db_config["type"] == "url":
            conn = psycopg2.connect(
                db_config["url"], 
                cursor_factory=RealDictCursor,
                connect_timeout=10
            )
        else:
            conn = psycopg2.connect(
                **db_config["config"],
                cursor_factory=RealDictCursor,
                connect_timeout=10
            )
        
        # Testa a conexão
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
        
        app.logger.info("Conexão com banco estabelecida com sucesso")
        return conn
        
    except Exception as e:
        app.logger.error(f"Falha na conexão com banco: {str(e)}")
        raise

# =========================
# Inicialização do Banco
# =========================
def init_database():
    """Cria tabelas e dados iniciais com migrations seguras"""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # ===== TABELA USUÁRIOS =====
        cur.execute("""
        CREATE TABLE IF NOT EXISTS usuarios (
            id SERIAL PRIMARY KEY,
            nome TEXT NOT NULL,
            usuario TEXT UNIQUE NOT NULL,
            senha TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'auxiliar',
            foto TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW(),
            last_login TIMESTAMP,
            ativo BOOLEAN DEFAULT TRUE
        );
        """)
        
        # Migrações seguras
        for col in ['foto', 'created_at', 'updated_at', 'last_login', 'ativo']:
            cur.execute(f"""
                DO $$ 
                BEGIN 
                    BEGIN
                        ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS {col} TEXT;
                    EXCEPTION 
                        WHEN duplicate_column THEN 
                            NULL;
                    END;
                END $$;
            """)
        
        # ===== TABELA ALUNOS =====
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
            updated_at TIMESTAMP DEFAULT NOW(),
            ativo BOOLEAN DEFAULT TRUE
        );
        """)
        
        for col in ['created_at', 'updated_at', 'ativo']:
            cur.execute(f"""
                DO $$ 
                BEGIN 
                    BEGIN
                        ALTER TABLE alunos ADD COLUMN IF NOT EXISTS {col} TIMESTAMP;
                    EXCEPTION 
                        WHEN duplicate_column THEN 
                            NULL;
                    END;
                END $$;
            """)
        
        # ===== TABELA AVISOS (MURAL) =====
        cur.execute("""
        CREATE TABLE IF NOT EXISTS avisos (
            id SERIAL PRIMARY KEY,
            mensagem TEXT,
            data_criacao TIMESTAMP DEFAULT NOW(),
            autor TEXT,
            autor_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
            imagem TEXT,
            fixado BOOLEAN DEFAULT FALSE,
            curtidas INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT NOW()
        );
        """)
        
        # Likes e comentários
        cur.execute("""
        CREATE TABLE IF NOT EXISTS avisos_likes (
            id SERIAL PRIMARY KEY,
            aviso_id INTEGER NOT NULL REFERENCES avisos(id) ON DELETE CASCADE,
            usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
            usuario_nome TEXT,
            criado_em TIMESTAMP DEFAULT NOW()
        );
        """)
        
        cur.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS ux_like_aviso_usuario 
        ON avisos_likes(aviso_id, usuario_id) 
        WHERE usuario_id IS NOT NULL;
        """)
        
        cur.execute("""
        CREATE TABLE IF NOT EXISTS avisos_comentarios (
            id SERIAL PRIMARY KEY,
            aviso_id INTEGER NOT NULL REFERENCES avisos(id) ON DELETE CASCADE,
            usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
            usuario_nome TEXT NOT NULL,
            comentario TEXT NOT NULL,
            criado_em TIMESTAMP DEFAULT NOW()
        );
        """)
        
        # ===== TABELA AULAS =====
        cur.execute("""
        CREATE TABLE IF NOT EXISTS aulas (
            id SERIAL PRIMARY KEY,
            data_aula TIMESTAMP DEFAULT NOW(),
            tema TEXT NOT NULL,
            professores TEXT,
            professores_ids TEXT,
            iniciada_em TIMESTAMP DEFAULT NOW(),
            encerrada_em TIMESTAMP,
            created_at TIMESTAMP DEFAULT NOW(),
            observacoes TEXT
        );
        """)
        
        # ===== TABELA FREQUÊNCIA =====
        cur.execute("""
        CREATE TABLE IF NOT EXISTS frequencia (
            id SERIAL PRIMARY KEY,
            id_aula INTEGER REFERENCES aulas(id) ON DELETE CASCADE,
            id_aluno INTEGER REFERENCES alunos(id) ON DELETE CASCADE,
            entrada_ts TIMESTAMP,
            saida_ts TIMESTAMP,
            retirado_por TEXT,
            retirado_por_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
            observacoes TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        );
        """)
        
        cur.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS ux_frequencia_aula_aluno 
        ON frequencia(id_aula, id_aluno);
        """)
        
        # ===== ADMIN PADRÃO =====
        cur.execute("SELECT id FROM usuarios WHERE usuario=%s", ("admin",))
        if not cur.fetchone():
            cur.execute("""
                INSERT INTO usuarios (nome, usuario, senha, role, created_at) 
                VALUES (%s, %s, %s, %s, NOW())
            """, ("Administrador Master", "admin", "1234", "admin"))
            app.logger.info("Usuário admin criado")
        
        conn.commit()
        cur.close()
        conn.close()
        app.logger.info("Banco de dados inicializado com sucesso")
        
    except Exception as e:
        app.logger.error(f"Falha na inicialização do banco: {str(e)}")
        raise

# Inicializa banco na subida
try:
    init_database()
except Exception as e:
    app.logger.error(f"Falha crítica no banco: {str(e)}")

# =========================
# Utilitários de Resposta
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
        "status": status,
        "timestamp": datetime.utcnow().isoformat()
    }
    if details and os.environ.get("DEBUG", "0") == "1":
        response["details"] = str(details)
    return jsonify(response), status

# =========================
# Autenticação
# =========================
SECRET_KEY = os.environ.get("APP_SECRET", "dev-secret-key-change-in-production")

def generate_token(user):
    """Gera token simples (em produção usar JWT)"""
    import hashlib
    import hmac
    
    payload = {
        "id": user["id"],
        "usuario": user["usuario"],
        "nome": user.get("nome", ""),
        "role": user.get("role", ""),
        "timestamp": datetime.utcnow().timestamp()
    }
    
    # Assinatura simples
    message = json.dumps(payload, sort_keys=True)
    signature = hmac.new(
        SECRET_KEY.encode(), 
        message.encode(), 
        hashlib.sha256
    ).hexdigest()
    
    return base64.b64encode(f"{message}|{signature}".encode()).decode()

def verify_token(token):
    """Verifica token"""
    import hashlib
    import hmac
    
    try:
        decoded = base64.b64decode(token.encode()).decode()
        message, signature = decoded.rsplit("|", 1)
        
        expected = hmac.new(
            SECRET_KEY.encode(), 
            message.encode(), 
            hashlib.sha256
        ).hexdigest()
        
        if not hmac.compare_digest(signature, expected):
            return None
        
        return json.loads(message)
    except Exception:
        return None

def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        
        if not auth_header.startswith("Bearer "):
            return error_response("Token não fornecido", 401)
        
        token = auth_header.split(" ", 1)[1].strip()
        user_data = verify_token(token)
        
        if not user_data:
            return error_response("Token inválido ou expirado", 401)
        
        request.user = user_data
        return f(*args, **kwargs)
    
    return decorated

def require_role(*roles):
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            user = getattr(request, "user", None)
            if not user:
                return error_response("Não autenticado", 401)
            
            if user.get("role") not in roles:
                return error_response(f"Acesso negado. Role necessário: {', '.join(roles)}", 403)
            
            return f(*args, **kwargs)
        return decorated
    return decorator

# =========================
# Rotas Públicas
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
    """Status da API para monitoramento"""
    try:
        # Testa banco
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT NOW() as time")
            db_time = cur.fetchone()["time"]
        conn.close()
        
        return success_response({
            "app": APP_NAME,
            "version": APP_VERSION,
            "environment": APP_ENV,
            "database": "connected",
            "database_time": db_time.isoformat() if db_time else None,
            "timestamp": datetime.utcnow().isoformat()
        })
    except Exception as e:
        return error_response("Status indisponível", 500, str(e))

# =========================
# Autenticação
# =========================
@app.route("/api/login", methods=["POST"])
def login():
    """Login de usuários"""
    try:
        data = request.get_json() or {}
        usuario = data.get("usuario", "").strip()
        senha = data.get("senha", "").strip()
        
        if not usuario or not senha:
            return error_response("Usuário e senha obrigatórios", 400)
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            SELECT id, nome, usuario, role, foto 
            FROM usuarios 
            WHERE usuario = %s AND senha = %s AND ativo = TRUE
        """, (usuario, senha))
        
        user = cur.fetchone()
        
        if not user:
            return error_response("Usuário ou senha inválidos", 401)
        
        # Atualiza último login
        cur.execute("UPDATE usuarios SET last_login = NOW() WHERE id = %s", (user["id"],))
        conn.commit()
        cur.close()
        conn.close()
        
        token = generate_token(user)
        
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
        app.logger.error(f"Erro no login: {str(e)}")
        return error_response("Erro interno no login", 500, str(e))

@app.route("/api/me", methods=["GET"])
@require_auth
def me():
    """Dados do usuário atual"""
    return success_response({"user": request.user})

# =========================
# Dashboard / Estatísticas
# =========================
@app.route("/api/dashboard/stats", methods=["GET"])
@require_auth
def dashboard_stats():
    """Estatísticas completas para dashboard"""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Totais gerais
        cur.execute("SELECT COUNT(*) as total FROM alunos WHERE ativo = TRUE")
        total_alunos = cur.fetchone()["total"]
        
        cur.execute("SELECT COUNT(*) as total FROM usuarios WHERE ativo = TRUE")
        total_equipe = cur.fetchone()["total"]
        
        # Aula ativa
        cur.execute("""
            SELECT * FROM aulas 
            WHERE encerrada_em IS NULL 
            ORDER BY iniciada_em DESC 
            LIMIT 1
        """)
        aula_ativa = cur.fetchone()
        
        presentes = 0
        if aula_ativa:
            cur.execute("""
                SELECT COUNT(*) as total 
                FROM frequencia 
                WHERE id_aula = %s AND entrada_ts IS NOT NULL
            """, (aula_ativa["id"],))
            presentes = cur.fetchone()["total"]
        
        # Aniversariantes do mês
        cur.execute("""
            SELECT id, nome, data_nascimento 
            FROM alunos 
            WHERE ativo = TRUE 
            AND data_nascimento IS NOT NULL 
            AND EXTRACT(MONTH FROM TO_DATE(data_nascimento, 'DD/MM/YYYY')) = EXTRACT(MONTH FROM NOW())
            ORDER BY EXTRACT(DAY FROM TO_DATE(data_nascimento, 'DD/MM/YYYY'))
            LIMIT 5
        """)
        aniversariantes = cur.fetchall()
        
        # Últimas aulas
        cur.execute("""
            SELECT id, tema, data_aula, 
                   (SELECT COUNT(*) FROM frequencia WHERE id_aula = aulas.id) as total_presentes
            FROM aulas 
            WHERE encerrada_em IS NOT NULL 
            ORDER BY data_aula DESC 
            LIMIT 5
        """)
        ultimas_aulas = cur.fetchall()
        
        cur.close()
        conn.close()
        
        return success_response({
            "totais": {
                "alunos": total_alunos,
                "equipe": total_equipe,
                "presentes_hoje": presentes
            },
            "aula_ativa": aula_ativa,
            "aniversariantes": aniversariantes,
            "ultimas_aulas": ultimas_aulas
        })
        
    except Exception as e:
        app.logger.error(f"Erro no dashboard: {str(e)}")
        return error_response("Erro ao carregar dashboard", 500, str(e))

# =========================
# Alunos (CRUD Completo)
# =========================
@app.route("/api/alunos", methods=["GET"])
@require_auth
def listar_alunos():
    """Lista todos os alunos com filtros opcionais"""
    try:
        search = request.args.get("search", "").strip()
        ativo = request.args.get("ativo", "true").lower() == "true"
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        if search:
            cur.execute("""
                SELECT * FROM alunos 
                WHERE ativo = %s 
                AND (
                    LOWER(nome) LIKE LOWER(%s) 
                    OR LOWER(responsavel) LIKE LOWER(%s)
                    OR telefone LIKE %s
                )
                ORDER BY nome ASC
            """, (ativo, f"%{search}%", f"%{search}%", f"%{search}%"))
        else:
            cur.execute("""
                SELECT * FROM alunos 
                WHERE ativo = %s 
                ORDER BY nome ASC
            """, (ativo,))
        
        alunos = cur.fetchall()
        cur.close()
        conn.close()
        
        return success_response({"alunos": alunos})
        
    except Exception as e:
        app.logger.error(f"Erro ao listar alunos: {str(e)}")
        return error_response("Erro ao listar alunos", 500, str(e))

@app.route("/api/alunos/<int:id>", methods=["GET"])
@require_auth
def get_aluno(id):
    """Busca aluno por ID"""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("SELECT * FROM alunos WHERE id = %s", (id,))
        aluno = cur.fetchone()
        
        cur.close()
        conn.close()
        
        if not aluno:
            return error_response("Aluno não encontrado", 404)
        
        return success_response({"aluno": aluno})
        
    except Exception as e:
        app.logger.error(f"Erro ao buscar aluno: {str(e)}")
        return error_response("Erro ao buscar aluno", 500, str(e))

@app.route("/api/alunos", methods=["POST"])
@require_auth
def criar_aluno():
    """Cria novo aluno"""
    try:
        data = request.get_json() or {}
        
        # Validações
        nome = data.get("nome", "").strip()
        if not nome:
            return error_response("Nome é obrigatório", 400)
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            INSERT INTO alunos (
                nome, data_nascimento, responsavel, telefone, 
                observacoes, autorizado_retirar, autorizado_2, 
                autorizado_3, foto, imagem_ficha, created_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
            RETURNING *
        """, (
            nome,
            data.get("data_nascimento", ""),
            data.get("responsavel", ""),
            data.get("telefone", ""),
            data.get("observacoes", ""),
            data.get("autorizado_retirar", ""),
            data.get("autorizado_2", ""),
            data.get("autorizado_3", ""),
            data.get("foto"),
            data.get("imagem_ficha")
        ))
        
        aluno = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        
        app.logger.info(f"Aluno criado: {nome} (ID: {aluno['id']})")
        return success_response({"aluno": aluno}, "Aluno cadastrado com sucesso", 201)
        
    except Exception as e:
        app.logger.error(f"Erro ao criar aluno: {str(e)}")
        return error_response("Erro ao cadastrar aluno", 500, str(e))

@app.route("/api/alunos/<int:id>", methods=["PUT"])
@require_auth
def atualizar_aluno(id):
    """Atualiza aluno existente"""
    try:
        data = request.get_json() or {}
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Verifica se existe
        cur.execute("SELECT id FROM alunos WHERE id = %s", (id,))
        if not cur.fetchone():
            cur.close()
            conn.close()
            return error_response("Aluno não encontrado", 404)
        
        # Campos permitidos para atualização
        campos_permitidos = [
            "nome", "data_nascimento", "responsavel", "telefone",
            "observacoes", "autorizado_retirar", "autorizado_2",
            "autorizado_3", "foto", "imagem_ficha", "ativo"
        ]
        
        updates = []
        valores = []
        for campo in campos_permitidos:
            if campo in data:
                updates.append(f"{campo} = %s")
                valores.append(data.get(campo))
        
        if not updates:
            cur.close()
            conn.close()
            return error_response("Nenhum dado para atualizar", 400)
        
        updates.append("updated_at = NOW()")
        query = f"UPDATE alunos SET {', '.join(updates)} WHERE id = %s RETURNING *"
        valores.append(id)
        
        cur.execute(query, valores)
        aluno = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        
        app.logger.info(f"Aluno atualizado: ID {id}")
        return success_response({"aluno": aluno}, "Aluno atualizado com sucesso")
        
    except Exception as e:
        app.logger.error(f"Erro ao atualizar aluno: {str(e)}")
        return error_response("Erro ao atualizar aluno", 500, str(e))

@app.route("/api/alunos/<int:id>", methods=["DELETE"])
@require_auth
@require_role("admin")
def deletar_aluno(id):
    """Deleta (ou inativa) aluno"""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Soft delete
        cur.execute("UPDATE alunos SET ativo = FALSE WHERE id = %s RETURNING id", (id,))
        result = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        
        if not result:
            return error_response("Aluno não encontrado", 404)
        
        app.logger.info(f"Aluno inativado: ID {id}")
        return success_response(message="Aluno removido com sucesso")
        
    except Exception as e:
        app.logger.error(f"Erro ao deletar aluno: {str(e)}")
        return error_response("Erro ao remover aluno", 500, str(e))

# =========================
# Equipe / Usuários
# =========================
@app.route("/api/equipe", methods=["GET"])
@require_auth
def listar_equipe():
    """Lista equipe (menos senhas)"""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            SELECT id, nome, usuario, role, foto, last_login, ativo 
            FROM usuarios 
            WHERE ativo = TRUE 
            ORDER BY 
                CASE role 
                    WHEN 'admin' THEN 1 
                    WHEN 'professor' THEN 2 
                    ELSE 3 
                END, nome ASC
        """)
        
        usuarios = cur.fetchall()
        cur.close()
        conn.close()
        
        return success_response({"equipe": usuarios})
        
    except Exception as e:
        app.logger.error(f"Erro ao listar equipe: {str(e)}")
        return error_response("Erro ao listar equipe", 500, str(e))

@app.route("/api/equipe", methods=["POST"])
@require_auth
@require_role("admin")
def criar_membro():
    """Cria novo membro da equipe"""
    try:
        data = request.get_json() or {}
        
        nome = data.get("nome", "").strip()
        usuario = data.get("usuario", "").strip()
        senha = data.get("senha", "").strip()
        role = data.get("role", "auxiliar").strip()
        foto = data.get("foto")
        
        if not all([nome, usuario, senha]):
            return error_response("Nome, usuário e senha são obrigatórios", 400)
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Verifica se usuário já existe
        cur.execute("SELECT id FROM usuarios WHERE usuario = %s", (usuario,))
        if cur.fetchone():
            cur.close()
            conn.close()
            return error_response("Nome de usuário já existe", 400)
        
        cur.execute("""
            INSERT INTO usuarios (nome, usuario, senha, role, foto, created_at)
            VALUES (%s, %s, %s, %s, %s, NOW())
            RETURNING id, nome, usuario, role, foto
        """, (nome, usuario, senha, role, foto))
        
        novo_usuario = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        
        app.logger.info(f"Novo membro criado: {usuario}")
        return success_response({"usuario": novo_usuario}, "Membro cadastrado com sucesso", 201)
        
    except Exception as e:
        app.logger.error(f"Erro ao criar membro: {str(e)}")
        return error_response("Erro ao cadastrar membro", 500, str(e))

@app.route("/api/equipe/<int:id>", methods=["DELETE"])
@require_auth
@require_role("admin")
def deletar_membro(id):
    """Remove membro da equipe"""
    try:
        if id == request.user["id"]:
            return error_response("Você não pode remover seu próprio usuário", 400)
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Verifica se é admin
        cur.execute("SELECT role FROM usuarios WHERE id = %s", (id,))
        user = cur.fetchone()
        
        if user and user["role"] == "admin":
            # Conta admins restantes
            cur.execute("SELECT COUNT(*) as total FROM usuarios WHERE role = 'admin' AND ativo = TRUE")
            total_admins = cur.fetchone()["total"]
            
            if total_admins <= 1:
                cur.close()
                conn.close()
                return error_response("Não é possível remover o último administrador", 400)
        
        # Soft delete
        cur.execute("UPDATE usuarios SET ativo = FALSE WHERE id = %s RETURNING id", (id,))
        result = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        
        if not result:
            return error_response("Usuário não encontrado", 404)
        
        app.logger.info(f"Membro removido: ID {id}")
        return success_response(message="Membro removido com sucesso")
        
    except Exception as e:
        app.logger.error(f"Erro ao remover membro: {str(e)}")
        return error_response("Erro ao remover membro", 500, str(e))

# =========================
# Aulas e Presença
# =========================
@app.route("/api/aulas/iniciar", methods=["POST"])
@require_auth
def iniciar_aula():
    """Inicia uma nova aula"""
    try:
        data = request.get_json() or {}
        
        tema = data.get("tema", "").strip()
        if not tema:
            return error_response("Tema é obrigatório", 400)
        
        professores_ids = data.get("professores_ids", [])
        professores_nomes = []
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Verifica se já existe aula ativa
        cur.execute("SELECT id FROM aulas WHERE encerrada_em IS NULL")
        aula_existente = cur.fetchone()
        if aula_existente:
            # Encerra automaticamente
            cur.execute("UPDATE aulas SET encerrada_em = NOW() WHERE encerrada_em IS NULL")
            app.logger.info("Aula anterior encerrada automaticamente")
        
        # Busca nomes dos professores
        if professores_ids:
            cur.execute("SELECT nome FROM usuarios WHERE id = ANY(%s) AND ativo = TRUE", (professores_ids,))
            for row in cur.fetchall():
                professores_nomes.append(row["nome"])
        
        professores_str = " • ".join(professores_nomes) if professores_nomes else data.get("professores", "")
        professores_ids_str = ",".join(str(id) for id in professores_ids) if professores_ids else None
        
        cur.execute("""
            INSERT INTO aulas (tema, professores, professores_ids, iniciada_em, data_aula, created_at)
            VALUES (%s, %s, %s, NOW(), NOW(), NOW())
            RETURNING *
        """, (tema, professores_str, professores_ids_str))
        
        aula = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        
        app.logger.info(f"Aula iniciada: ID {aula['id']} - Tema: {tema}")
        return success_response({"aula": aula}, "Aula iniciada com sucesso")
        
    except Exception as e:
        app.logger.error(f"Erro ao iniciar aula: {str(e)}")
        return error_response("Erro ao iniciar aula", 500, str(e))

@app.route("/api/aulas/ativa", methods=["GET"])
@require_auth
def aula_ativa():
    """Retorna aula ativa e presenças"""
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
                SELECT 
                    f.*,
                    a.nome as aluno_nome,
                    a.foto as aluno_foto,
                    a.autorizado_retirar,
                    a.autorizado_2,
                    a.autorizado_3
                FROM frequencia f
                JOIN alunos a ON a.id = f.id_aluno
                WHERE f.id_aula = %s
                ORDER BY a.nome ASC
            """, (aula["id"],))
            presencas = cur.fetchall()
        
        cur.close()
        conn.close()
        
        return success_response({
            "aula": aula,
            "presencas": presencas,
            "total_presentes": len([p for p in presencas if p.get("entrada_ts")])
        })
        
    except Exception as e:
        app.logger.error(f"Erro ao buscar aula ativa: {str(e)}")
        return error_response("Erro ao carregar aula ativa", 500, str(e))

@app.route("/api/aulas/<int:aula_id>/entrada", methods=["POST"])
@require_auth
def registrar_entrada(aula_id):
    """Registra entrada de aluno"""
    try:
        data = request.get_json() or {}
        aluno_id = data.get("aluno_id")
        
        if not aluno_id:
            return error_response("ID do aluno é obrigatório", 400)
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Verifica se aula está ativa
        cur.execute("SELECT id FROM aulas WHERE id = %s AND encerrada_em IS NULL", (aula_id,))
        if not cur.fetchone():
            cur.close()
            conn.close()
            return error_response("Aula não está ativa", 400)
        
        # Registra entrada (upsert)
        cur.execute("""
            INSERT INTO frequencia (id_aula, id_aluno, entrada_ts, created_at)
            VALUES (%s, %s, NOW(), NOW())
            ON CONFLICT (id_aula, id_aluno) 
            DO UPDATE SET entrada_ts = COALESCE(frequencia.entrada_ts, NOW())
            RETURNING *
        """, (aula_id, aluno_id))
        
        frequencia = cur.fetchone()
        conn.commit()
        
        # Busca nome do aluno para log
        cur.execute("SELECT nome FROM alunos WHERE id = %s", (aluno_id,))
        aluno = cur.fetchone()
        
        cur.close()
        conn.close()
        
        app.logger.info(f"Entrada registrada: {aluno['nome']} na aula {aula_id}")
        return success_response({"frequencia": frequencia}, "Entrada registrada com sucesso")
        
    except Exception as e:
        app.logger.error(f"Erro ao registrar entrada: {str(e)}")
        return error_response("Erro ao registrar entrada", 500, str(e))

@app.route("/api/aulas/<int:aula_id>/saida", methods=["POST"])
@require_auth
def registrar_saida(aula_id):
    """Registra saída de aluno com validação de responsável"""
    try:
        data = request.get_json() or {}
        aluno_id = data.get("aluno_id")
        retirado_por = data.get("retirado_por", "").strip()
        retirado_por_id = request.user.get("id")
        
        if not aluno_id:
            return error_response("ID do aluno é obrigatório", 400)
        
        if not retirado_por:
            return error_response("Nome de quem retirou é obrigatório", 400)
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Verifica se aula está ativa
        cur.execute("SELECT id FROM aulas WHERE id = %s AND encerrada_em IS NULL", (aula_id,))
        if not cur.fetchone():
            cur.close()
            conn.close()
            return error_response("Aula não está ativa", 400)
        
        # Busca autorizados do aluno
        cur.execute("""
            SELECT nome, autorizado_retirar, autorizado_2, autorizado_3 
            FROM alunos WHERE id = %s
        """, (aluno_id,))
        aluno = cur.fetchone()
        
        if not aluno:
            cur.close()
            conn.close()
            return error_response("Aluno não encontrado", 404)
        
        # Valida responsável autorizado
        autorizados = []
        for campo in ["autorizado_retirar", "autorizado_2", "autorizado_3"]:
            if aluno.get(campo):
                autorizados.append(aluno[campo].strip().lower())
        
        if autorizados and retirado_por.lower() not in autorizados:
            # Se não está na lista, verifica se é admin
            if request.user.get("role") != "admin":
                cur.close()
                conn.close()
                return error_response(
                    f"Saída não autorizada. Responsáveis permitidos: {', '.join(autorizados[:3])}", 
                    403
                )
        
        # Registra saída
        cur.execute("""
            INSERT INTO frequencia (id_aula, id_aluno, saida_ts, retirado_por, retirado_por_id)
            VALUES (%s, %s, NOW(), %s, %s)
            ON CONFLICT (id_aula, id_aluno) 
            DO UPDATE SET 
                saida_ts = NOW(),
                retirado_por = EXCLUDED.retirado_por,
                retirado_por_id = EXCLUDED.retirado_por_id
            RETURNING *
        """, (aula_id, aluno_id, retirado_por, retirado_por_id))
        
        frequencia = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        
        app.logger.info(f"Saída registrada: {aluno['nome']} - Retirado por: {retirado_por}")
        return success_response({"frequencia": frequencia}, "Saída registrada com sucesso")
        
    except Exception as e:
        app.logger.error(f"Erro ao registrar saída: {str(e)}")
        return error_response("Erro ao registrar saída", 500, str(e))

@app.route("/api/aulas/<int:aula_id>/encerrar", methods=["POST"])
@require_auth
def encerrar_aula(aula_id):
    """Encerra uma aula ativa"""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            UPDATE aulas 
            SET encerrada_em = NOW() 
            WHERE id = %s AND encerrada_em IS NULL
            RETURNING *
        """, (aula_id,))
        
        aula = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        
        if not aula:
            return error_response("Aula não encontrada ou já encerrada", 404)
        
        app.logger.info(f"Aula encerrada: ID {aula_id}")
        return success_response({"aula": aula}, "Aula encerrada com sucesso")
        
    except Exception as e:
        app.logger.error(f"Erro ao encerrar aula: {str(e)}")
        return error_response("Erro ao encerrar aula", 500, str(e))

# =========================
# Histórico e Relatórios
# =========================
@app.route("/api/historico", methods=["GET"])
@require_auth
def listar_historico():
    """Lista histórico de aulas encerradas"""
    try:
        limit = int(request.args.get("limit", 100))
        offset = int(request.args.get("offset", 0))
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Total para paginação
        cur.execute("SELECT COUNT(*) as total FROM aulas WHERE encerrada_em IS NOT NULL")
        total = cur.fetchone()["total"]
        
        # Lista com estatísticas
        cur.execute("""
            SELECT 
                a.*,
                COUNT(f.id) as total_presentes,
                COUNT(f.saida_ts) as total_saidas,
                json_agg(
                    json_build_object(
                        'aluno_id', f.id_aluno,
                        'aluno_nome', al.nome,
                        'entrada', f.entrada_ts,
                        'saida', f.saida_ts,
                        'retirado_por', f.retirado_por
                    )
                ) FILTER (WHERE f.id IS NOT NULL) as presencas_detalhadas
            FROM aulas a
            LEFT JOIN frequencia f ON f.id_aula = a.id
            LEFT JOIN alunos al ON al.id = f.id_aluno
            WHERE a.encerrada_em IS NOT NULL
            GROUP BY a.id
            ORDER BY a.encerrada_em DESC
            LIMIT %s OFFSET %s
        """, (limit, offset))
        
        historico = cur.fetchall()
        cur.close()
        conn.close()
        
        return success_response({
            "historico": historico,
            "total": total,
            "limit": limit,
            "offset": offset
        })
        
    except Exception as e:
        app.logger.error(f"Erro ao listar histórico: {str(e)}")
        return error_response("Erro ao carregar histórico", 500, str(e))

@app.route("/api/aulas/<int:aula_id>/relatorio", methods=["GET"])
@require_auth
def relatorio_aula(aula_id):
    """Relatório detalhado de uma aula (HTML/JSON)"""
    try:
        formato = request.args.get("formato", "json")
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Dados da aula
        cur.execute("SELECT * FROM aulas WHERE id = %s", (aula_id,))
        aula = cur.fetchone()
        
        if not aula:
            cur.close()
            conn.close()
            return error_response("Aula não encontrada", 404)
        
        # Presenças
        cur.execute("""
            SELECT 
                a.id as aluno_id,
                a.nome as aluno_nome,
                a.data_nascimento,
                a.responsavel,
                a.telefone,
                f.entrada_ts,
                f.saida_ts,
                f.retirado_por,
                EXTRACT(EPOCH FROM (f.saida_ts - f.entrada_ts))/3600 as tempo_permanencia
            FROM frequencia f
            JOIN alunos a ON a.id = f.id_aluno
            WHERE f.id_aula = %s
            ORDER BY a.nome ASC
        """, (aula_id,))
        
        presencas = cur.fetchall()
        
        # Estatísticas
        total_alunos = len(presencas)
        presentes = sum(1 for p in presencas if p["entrada_ts"])
        saidas = sum(1 for p in presencas if p["saida_ts"])
        pendentes = presentes - saidas
        
        cur.close()
        conn.close()
        
        if formato == "html":
            # Template HTML profissional para o relatório
            html_template = """
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Relatório de Aula - IEQ Central</title>
                <style>
                    * {
                        margin: 0;
                        padding: 0;
                        box-sizing: border-box;
                    }
                    
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
                        background: #f3f4f6;
                        padding: 20px;
                    }
                    
                    .container {
                        max-width: 1200px;
                        margin: 0 auto;
                    }
                    
                    .header {
                        background: linear-gradient(135deg, #0b1220 0%, #1a2639 100%);
                        color: white;
                        padding: 30px;
                        border-radius: 20px 20px 0 0;
                    }
                    
                    .header h1 {
                        font-size: 28px;
                        margin-bottom: 10px;
                    }
                    
                    .header .meta {
                        color: #9ca3af;
                        font-size: 14px;
                    }
                    
                    .stats-grid {
                        display: grid;
                        grid-template-columns: repeat(4, 1fr);
                        gap: 20px;
                        margin: 30px 0;
                    }
                    
                    .stat-card {
                        background: white;
                        padding: 20px;
                        border-radius: 15px;
                        box-shadow: 0 4px 6px rgba(0,0,0,0.05);
                        border: 1px solid #e5e7eb;
                    }
                    
                    .stat-value {
                        font-size: 32px;
                        font-weight: bold;
                        color: #0b1220;
                    }
                    
                    .stat-label {
                        color: #6b7280;
                        font-size: 14px;
                        margin-top: 5px;
                    }
                    
                    .table {
                        background: white;
                        border-radius: 15px;
                        overflow: hidden;
                        border: 1px solid #e5e7eb;
                        margin-top: 20px;
                    }
                    
                    .table-header {
                        display: grid;
                        grid-template-columns: 2fr 1fr 1fr 1fr 1fr;
                        background: #f9fafb;
                        padding: 15px;
                        font-weight: 600;
                        color: #374151;
                        border-bottom: 2px solid #e5e7eb;
                    }
                    
                    .table-row {
                        display: grid;
                        grid-template-columns: 2fr 1fr 1fr 1fr 1fr;
                        padding: 15px;
                        border-bottom: 1px solid #e5e7eb;
                    }
                    
                    .table-row:last-child {
                        border-bottom: none;
                    }
                    
                    .badge {
                        display: inline-block;
                        padding: 4px 8px;
                        border-radius: 9999px;
                        font-size: 12px;
                        font-weight: 500;
                    }
                    
                    .badge-success {
                        background: #d1fae5;
                        color: #065f46;
                    }
                    
                    .badge-warning {
                        background: #fed7aa;
                        color: #92400e;
                    }
                    
                    .footer {
                        margin-top: 40px;
                        text-align: center;
                        color: #6b7280;
                        font-size: 12px;
                    }
                    
                    @media print {
                        body { background: white; }
                        .header { background: #0b1220; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>📋 Relatório de Aula</h1>
                        <div class="meta">
                            <div>ID da Aula: {{ aula_id }}</div>
                            <div>Data: {{ data_aula }}</div>
                            <div>Tema: {{ tema }}</div>
                            <div>Equipe: {{ professores }}</div>
                        </div>
                    </div>
                    
                    <div class="stats-grid">
                        <div class="stat-card">
                            <div class="stat-value">{{ total_alunos }}</div>
                            <div class="stat-label">Total de Alunos</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value">{{ presentes }}</div>
                            <div class="stat-label">Check-ins</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value">{{ saidas }}</div>
                            <div class="stat-label">Check-outs</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value">{{ pendentes }}</div>
                            <div class="stat-label">Pendentes</div>
                        </div>
                    </div>
                    
                    <div class="table">
                        <div class="table-header">
                            <div>Aluno</div>
                            <div>Entrada</div>
                            <div>Saída</div>
                            <div>Retirado por</div>
                            <div>Tempo</div>
                        </div>
                        
                        {% for p in presencas %}
                        <div class="table-row">
                            <div>{{ p.aluno_nome }}</div>
                            <div>
                                {% if p.entrada_ts %}
                                <span class="badge badge-success">{{ p.entrada_ts }}</span>
                                {% else %}
                                <span class="badge badge-warning">Não registrado</span>
                                {% endif %}
                            </div>
                            <div>
                                {% if p.saida_ts %}
                                <span class="badge badge-success">{{ p.saida_ts }}</span>
                                {% else %}
                                <span class="badge badge-warning">Pendente</span>
                                {% endif %}
                            </div>
                            <div>{{ p.retirado_por or '-' }}</div>
                            <div>
                                {% if p.tempo_permanencia %}
                                {{ "%.1f"|format(p.tempo_permanencia) }}h
                                {% else %}
                                -
                                {% endif %}
                            </div>
                        </div>
                        {% endfor %}
                    </div>
                    
                    <div class="footer">
                        <p>Relatório gerado por IEQ Central • Ministério Infantil v2.0</p>
                        <p>Desenvolvido pela Equipe IEQ Central</p>
                    </div>
                </div>
            </body>
            </html>
            """
            
            from jinja2 import Template
            template = Template(html_template)
            rendered = template.render(
                aula_id=aula_id,
                data_aula=aula["data_aula"].strftime("%d/%m/%Y %H:%M") if aula["data_aula"] else "-",
                tema=aula["tema"],
                professores=aula["professores"] or "-",
                total_alunos=total_alunos,
                presentes=presentes,
                saidas=saidas,
                pendentes=pendentes,
                presencas=presencas
            )
            
            return Response(rendered, mimetype="text/html")
        
        # JSON
        return success_response({
            "aula": aula,
            "presencas": presencas,
            "estatisticas": {
                "total_alunos": total_alunos,
                "presentes": presentes,
                "saidas": saidas,
                "pendentes": pendentes
            }
        })
        
    except Exception as e:
        app.logger.error(f"Erro ao gerar relatório: {str(e)}")
        return error_response("Erro ao gerar relatório", 500, str(e))

@app.route("/api/aulas/<int:aula_id>/relatorio/csv", methods=["GET"])
@require_auth
def relatorio_csv(aula_id):
    """Exporta relatório em CSV"""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Dados da aula
        cur.execute("SELECT * FROM aulas WHERE id = %s", (aula_id,))
        aula = cur.fetchone()
        
        if not aula:
            cur.close()
            conn.close()
            return error_response("Aula não encontrada", 404)
        
        # Presenças
        cur.execute("""
            SELECT 
                a.nome as aluno,
                a.data_nascimento,
                a.responsavel,
                a.telefone,
                f.entrada_ts,
                f.saida_ts,
                f.retirado_por
            FROM frequencia f
            JOIN alunos a ON a.id = f.id_aluno
            WHERE f.id_aula = %s
            ORDER BY a.nome ASC
        """, (aula_id,))
        
        presencas = cur.fetchall()
        cur.close()
        conn.close()
        
        # Gera CSV
        output = StringIO()
        writer = csv.writer(output)
        
        # Cabeçalho
        writer.writerow(["RELATÓRIO DE AULA - IEQ CENTRAL"])
        writer.writerow(["ID da Aula:", aula_id])
        writer.writerow(["Data:", aula["data_aula"].strftime("%d/%m/%Y %H:%M") if aula["data_aula"] else "-"])
        writer.writerow(["Tema:", aula["tema"]])
        writer.writerow(["Equipe:", aula["professores"] or "-"])
        writer.writerow([])
        writer.writerow(["Aluno", "Data Nasc.", "Responsável", "Telefone", "Entrada", "Saída", "Retirado por"])
        
        for p in presencas:
            writer.writerow([
                p["aluno"],
                p["data_nascimento"] or "-",
                p["responsavel"] or "-",
                p["telefone"] or "-",
                p["entrada_ts"].strftime("%d/%m/%Y %H:%M") if p["entrada_ts"] else "-",
                p["saida_ts"].strftime("%d/%m/%Y %H:%M") if p["saida_ts"] else "-",
                p["retirado_por"] or "-"
            ])
        
        writer.writerow([])
        writer.writerow([f"Total de Alunos: {len(presencas)}"])
        writer.writerow([f"Presentes: {sum(1 for p in presencas if p['entrada_ts'])}"])
        writer.writerow([f"Saídas Registradas: {sum(1 for p in presencas if p['saida_ts'])}"])
        
        csv_data = output.getvalue()
        
        return Response(
            csv_data,
            mimetype="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=relatorio-aula-{aula_id}-{datetime.now().strftime('%Y%m%d')}.csv"
            }
        )
        
    except Exception as e:
        app.logger.error(f"Erro ao gerar CSV: {str(e)}")
        return error_response("Erro ao gerar CSV", 500, str(e))

# =========================
# Mural de Avisos
# =========================
@app.route("/api/mural", methods=["GET"])
@require_auth
def listar_mural():
    """Lista avisos do mural com likes e comentários"""
    try:
        limit = int(request.args.get("limit", 50))
        offset = int(request.args.get("offset", 0))
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Total
        cur.execute("SELECT COUNT(*) as total FROM avisos")
        total = cur.fetchone()["total"]
        
        # Avisos com estatísticas
        cur.execute("""
            SELECT 
                a.*,
                u.nome as autor_nome,
                COUNT(DISTINCT al.id) as total_likes,
                COUNT(DISTINCT ac.id) as total_comentarios,
                BOOL_OR(al.usuario_id = %s) as liked_by_me
            FROM avisos a
            LEFT JOIN usuarios u ON u.id = a.autor_id
            LEFT JOIN avisos_likes al ON al.aviso_id = a.id
            LEFT JOIN avisos_comentarios ac ON ac.aviso_id = a.id
            GROUP BY a.id, u.nome
            ORDER BY a.fixado DESC, a.data_criacao DESC
            LIMIT %s OFFSET %s
        """, (request.user["id"], limit, offset))
        
        avisos = cur.fetchall()
        
        # Busca comentários para cada aviso
        for aviso in avisos:
            cur.execute("""
                SELECT 
                    ac.*,
                    u.nome as usuario_nome,
                    u.foto as usuario_foto
                FROM avisos_comentarios ac
                LEFT JOIN usuarios u ON u.id = ac.usuario_id
                WHERE ac.aviso_id = %s
                ORDER BY ac.criado_em DESC
                LIMIT 10
            """, (aviso["id"],))
            aviso["comentarios"] = cur.fetchall()
        
        cur.close()
        conn.close()
        
        return success_response({
            "avisos": avisos,
            "total": total,
            "limit": limit,
            "offset": offset
        })
        
    except Exception as e:
        app.logger.error(f"Erro ao listar mural: {str(e)}")
        return error_response("Erro ao carregar mural", 500, str(e))

@app.route("/api/mural", methods=["POST"])
@require_auth
def criar_aviso():
    """Cria novo aviso no mural"""
    try:
        data = request.get_json() or {}
        
        mensagem = data.get("mensagem", "").strip()
        imagem = data.get("imagem")
        
        if not mensagem and not imagem:
            return error_response("Mensagem ou imagem é obrigatória", 400)
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            INSERT INTO avisos (mensagem, imagem, autor, autor_id, data_criacao, created_at)
            VALUES (%s, %s, %s, %s, NOW(), NOW())
            RETURNING *
        """, (
            mensagem,
            imagem,
            request.user["nome"],
            request.user["id"]
        ))
        
        aviso = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        
        app.logger.info(f"Novo aviso criado por {request.user['nome']}")
        return success_response({"aviso": aviso}, "Aviso publicado com sucesso", 201)
        
    except Exception as e:
        app.logger.error(f"Erro ao criar aviso: {str(e)}")
        return error_response("Erro ao publicar aviso", 500, str(e))

@app.route("/api/mural/<int:aviso_id>/like", methods=["POST"])
@require_auth
def toggle_like(aviso_id):
    """Adiciona ou remove like de um aviso"""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Verifica se já deu like
        cur.execute("""
            SELECT id FROM avisos_likes 
            WHERE aviso_id = %s AND usuario_id = %s
        """, (aviso_id, request.user["id"]))
        
        existing = cur.fetchone()
        
        if existing:
            # Remove like
            cur.execute("DELETE FROM avisos_likes WHERE id = %s", (existing["id"],))
            liked = False
            app.logger.info(f"Like removido: aviso {aviso_id} por {request.user['nome']}")
        else:
            # Adiciona like
            cur.execute("""
                INSERT INTO avisos_likes (aviso_id, usuario_id, usuario_nome, criado_em)
                VALUES (%s, %s, %s, NOW())
            """, (aviso_id, request.user["id"], request.user["nome"]))
            liked = True
            app.logger.info(f"Like adicionado: aviso {aviso_id} por {request.user['nome']}")
        
        # Atualiza contador no aviso
        cur.execute("""
            UPDATE avisos 
            SET curtidas = (SELECT COUNT(*) FROM avisos_likes WHERE aviso_id = %s)
            WHERE id = %s
        """, (aviso_id, aviso_id))
        
        # Busca total atualizado
        cur.execute("SELECT COUNT(*) as total FROM avisos_likes WHERE aviso_id = %s", (aviso_id,))
        total_likes = cur.fetchone()["total"]
        
        conn.commit()
        cur.close()
        conn.close()
        
        return success_response({
            "liked": liked,
            "total_likes": total_likes
        }, "Like atualizado com sucesso")
        
    except Exception as e:
        app.logger.error(f"Erro no like: {str(e)}")
        return error_response("Erro ao processar like", 500, str(e))

@app.route("/api/mural/<int:aviso_id>/comentario", methods=["POST"])
@require_auth
def comentar(aviso_id):
    """Adiciona comentário a um aviso"""
    try:
        data = request.get_json() or {}
        comentario = data.get("comentario", "").strip()
        
        if not comentario:
            return error_response("Comentário não pode estar vazio", 400)
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            INSERT INTO avisos_comentarios (aviso_id, usuario_id, usuario_nome, comentario, criado_em)
            VALUES (%s, %s, %s, %s, NOW())
            RETURNING *
        """, (aviso_id, request.user["id"], request.user["nome"], comentario))
        
        novo_comentario = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        
        app.logger.info(f"Comentário adicionado: aviso {aviso_id} por {request.user['nome']}")
        return success_response({"comentario": novo_comentario}, "Comentário adicionado", 201)
        
    except Exception as e:
        app.logger.error(f"Erro ao comentar: {str(e)}")
        return error_response("Erro ao adicionar comentário", 500, str(e))

@app.route("/api/mural/<int:aviso_id>/fixar", methods=["POST"])
@require_auth
@require_role("admin")
def fixar_aviso(aviso_id):
    """Fixa ou desafixa um aviso (apenas admin)"""
    try:
        data = request.get_json() or {}
        fixado = data.get("fixado", False)
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("UPDATE avisos SET fixado = %s WHERE id = %s RETURNING *", (fixado, aviso_id))
        aviso = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        
        if not aviso:
            return error_response("Aviso não encontrado", 404)
        
        status = "fixado" if fixado else "desfixado"
        app.logger.info(f"Aviso {aviso_id} {status} por admin {request.user['nome']}")
        return success_response({"aviso": aviso}, f"Aviso {status} com sucesso")
        
    except Exception as e:
        app.logger.error(f"Erro ao fixar aviso: {str(e)}")
        return error_response("Erro ao fixar aviso", 500, str(e))

@app.route("/api/mural/<int:aviso_id>", methods=["DELETE"])
@require_auth
@require_role("admin")
def deletar_aviso(aviso_id):
    """Deleta um aviso (apenas admin)"""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("DELETE FROM avisos WHERE id = %s RETURNING id", (aviso_id,))
        result = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        
        if not result:
            return error_response("Aviso não encontrado", 404)
        
        app.logger.info(f"Aviso {aviso_id} deletado por admin {request.user['nome']}")
        return success_response(message="Aviso removido com sucesso")
        
    except Exception as e:
        app.logger.error(f"Erro ao deletar aviso: {str(e)}")
        return error_response("Erro ao remover aviso", 500, str(e))

# =========================
# Assistente Inteligente
# =========================
@app.route("/api/assistente/dashboard", methods=["GET"])
@require_auth
def assistente_dashboard():
    """Painel do assistente com informações úteis"""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Aniversariantes da semana
        cur.execute("""
            SELECT id, nome, data_nascimento,
                   EXTRACT(DAY FROM TO_DATE(data_nascimento, 'DD/MM/YYYY')) as dia,
                   EXTRACT(MONTH FROM TO_DATE(data_nascimento, 'DD/MM/YYYY')) as mes
            FROM alunos 
            WHERE ativo = TRUE 
            AND data_nascimento IS NOT NULL
            AND TO_DATE(data_nascimento, 'DD/MM/YYYY') BETWEEN 
                DATE_TRUNC('week', NOW()) AND 
                DATE_TRUNC('week', NOW()) + INTERVAL '6 days'
            ORDER BY EXTRACT(DAY FROM TO_DATE(data_nascimento, 'DD/MM/YYYY'))
        """)
        aniversariantes_semana = cur.fetchall()
        
        # Alunos sem presença nas últimas 4 aulas
        cur.execute("""
            WITH ultimas_aulas AS (
                SELECT id FROM aulas 
                WHERE encerrada_em IS NOT NULL 
                ORDER BY data_aula DESC 
                LIMIT 4
            )
            SELECT 
                a.id,
                a.nome,
                COUNT(f.id) as presencas,
                array_agg(DISTINCT a.telefone) as telefones
            FROM alunos a
            CROSS JOIN ultimas_aulas ua
            LEFT JOIN frequencia f ON f.id_aluno = a.id AND f.id_aula = ua.id
            WHERE a.ativo = TRUE
            GROUP BY a.id, a.nome
            HAVING COUNT(f.id) = 0
            ORDER BY a.nome
        """)
        alunos_faltosos = cur.fetchall()
        
        # Sugestão de tema baseado em temas recentes
        cur.execute("""
            SELECT tema, COUNT(*) as frequencia
            FROM aulas
            WHERE encerrada_em IS NOT NULL
            AND data_aula > NOW() - INTERVAL '30 days'
            GROUP BY tema
            ORDER BY frequencia DESC
            LIMIT 5
        """)
        temas_recentes = cur.fetchall()
        
        temas_sugeridos = [
            {"tema": "O Amor de Deus", "versiculo": "1 João 4:19", "atividade": "Dinâmica do abraço"},
            {"tema": "A Criação", "versiculo": "Gênesis 1:1", "atividade": "Desenho livre"},
            {"tema": "A Arca de Noé", "versiculo": "Gênesis 6:22", "atividade": "Quebra-cabeça"},
            {"tema": "Davi e Golias", "versiculo": "1 Samuel 17:45", "atividade": "Teatro de fantoches"},
            {"tema": "O Bom Pastor", "versiculo": "João 10:11", "atividade": "Caça ao tesouro"},
        ]
        
        # Filtra temas já usados recentemente
        temas_usados = [t["tema"].lower() for t in temas_recentes if t["tema"]]
        temas_filtrados = [t for t in temas_sugeridos 
                          if t["tema"].lower() not in temas_usados][:3]
        
        cur.close()
        conn.close()
        
        return success_response({
            "aniversariantes_semana": aniversariantes_semana,
            "alunos_faltosos": alunos_faltosos,
            "sugestoes_tema": temas_filtrados,
            "temas_recentes": temas_recentes,
            "data": datetime.now().strftime("%d/%m/%Y"),
            "semana": f"{datetime.now().strftime('%d/%m')} - {(datetime.now() + timedelta(days=6)).strftime('%d/%m/%Y')}"
        })
        
    except Exception as e:
        app.logger.error(f"Erro no assistente: {str(e)}")
        return error_response("Erro ao carregar assistente", 500, str(e))

@app.route("/api/assistente/checklist", methods=["GET"])
@require_auth
def assistente_checklist():
    """Checklist de segurança para aula"""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Verifica se há aula ativa
        cur.execute("SELECT id FROM aulas WHERE encerrada_em IS NULL")
        aula_ativa = cur.fetchone()
        
        # Alunos sem autorizados cadastrados
        cur.execute("""
            SELECT COUNT(*) as total
            FROM alunos 
            WHERE ativo = TRUE 
            AND (
                autorizado_retirar IS NULL 
                OR autorizado_retirar = ''
            )
        """)
        alunos_sem_autorizado = cur.fetchone()["total"]
        
        # Equipe presente hoje
        if aula_ativa:
            cur.execute("""
                SELECT COUNT(DISTINCT f.retirado_por_id) as total
                FROM frequencia f
                WHERE f.id_aula = %s AND f.retirado_por_id IS NOT NULL
            """, (aula_ativa["id"],))
            equipe_presente = cur.fetchone()["total"]
        else:
            equipe_presente = 0
        
        cur.close()
        conn.close()
        
        checklist = [
            {
                "item": "Aula iniciada",
                "status": bool(aula_ativa),
                "tipo": "success" if aula_ativa else "warning",
                "mensagem": "Iniciar aula" if not aula_ativa else "Aula em andamento"
            },
            {
                "item": "Cadastro de alunos",
                "status": alunos_sem_autorizado == 0,
                "tipo": "success" if alunos_sem_autorizado == 0 else "danger",
                "mensagem": f"{alunos_sem_autorizado} aluno(s) sem responsável cadastrado"
            },
            {
                "item": "Equipe presente",
                "status": equipe_presente > 0,
                "tipo": "success" if equipe_presente > 0 else "info",
                "mensagem": f"{equipe_presente} membro(s) registrado(s) hoje"
            },
            {
                "item": "Lista de presença",
                "status": True,
                "tipo": "info",
                "mensagem": "Disponível no menu Aula Ativa"
            }
        ]
        
        return success_response({"checklist": checklist})
        
    except Exception as e:
        app.logger.error(f"Erro no checklist: {str(e)}")
        return error_response("Erro ao gerar checklist", 500, str(e))

# =========================
# Configurações e Sobre
# =========================
@app.route("/api/config/info", methods=["GET"])
@require_auth
def config_info():
    """Informações do sistema"""
    return success_response({
        "app": {
            "nome": APP_NAME,
            "versao": APP_VERSION,
            "ambiente": APP_ENV,
            "desenvolvido_por": "Equipe IEQ Central",
            "ano": datetime.now().year,
            "contato": "suporte@ieqcentral.com"
        },
        "estatisticas": {
            "python_version": os.sys.version.split()[0],
            "flask_version": "2.3.0",
            "database": "PostgreSQL"
        },
        "links": {
            "manual": "/static/docs/manual.pdf",
            "suporte": "mailto:suporte@ieqcentral.com",
            "site": "https://ieqcentral.com"
        }
    })

@app.route("/api/config/backup", methods=["GET"])
@require_auth
@require_role("admin")
def gerar_backup():
    """Gera backup dos dados (apenas admin)"""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        backup_data = {
            "gerado_em": datetime.now().isoformat(),
            "versao": APP_VERSION,
            "alunos": [],
            "usuarios": [],
            "aulas": [],
            "frequencias": []
        }
        
        # Exporta alunos
        cur.execute("SELECT * FROM alunos WHERE ativo = TRUE")
        backup_data["alunos"] = cur.fetchall()
        
        # Exporta usuários (sem senhas)
        cur.execute("SELECT id, nome, usuario, role, foto, created_at FROM usuarios WHERE ativo = TRUE")
        backup_data["usuarios"] = cur.fetchall()
        
        # Exporta aulas
        cur.execute("SELECT * FROM aulas ORDER BY data_aula DESC LIMIT 1000")
        backup_data["aulas"] = cur.fetchall()
        
        cur.close()
        conn.close()
        
        # Gera arquivo JSON
        json_data = json.dumps(backup_data, indent=2, default=str)
        
        return Response(
            json_data,
            mimetype="application/json",
            headers={
                "Content-Disposition": f"attachment; filename=backup-ieq-{datetime.now().strftime('%Y%m%d-%H%M')}.json"
            }
        )
        
    except Exception as e:
        app.logger.error(f"Erro ao gerar backup: {str(e)}")
        return error_response("Erro ao gerar backup", 500, str(e))

# =========================
# Error Handlers
# =========================
@app.errorhandler(404)
def not_found(e):
    return error_response("Recurso não encontrado", 404)

@app.errorhandler(405)
def method_not_allowed(e):
    return error_response("Método não permitido", 405)

@app.errorhandler(500)
def internal_error(e):
    app.logger.error(f"Erro interno: {str(e)}")
    return error_response("Erro interno do servidor", 500)

# =========================
# Run
# =========================
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    debug = os.environ.get("DEBUG", "0") == "1"
    
    app.logger.info(f"Iniciando {APP_NAME} v{APP_VERSION} na porta {port}")
    app.run(host="0.0.0.0", port=port, debug=debug)
