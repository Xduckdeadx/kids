import os
import json
import base64
import psycopg2
from psycopg2.extras import RealDictCursor
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

app = Flask(__name__, static_folder="static", static_url_path="/static")
CORS(app)

# =========================
# CONEXÃO SUPABASE
# =========================
def get_db_connection():
    """Conecta ao Supabase"""
    database_url = "postgresql://postgres.phqsoznnrcjyezbyfht:Ieqcentral2026*@aws-1-us-east-2.pooler.supabase.com:5432/postgres"
    return psycopg2.connect(database_url, cursor_factory=RealDictCursor)

# =========================
# ROTA DE TESTE
# =========================
@app.route("/api/test")
def test():
    return jsonify({"message": "API funcionando!"})

# =========================
# LOGIN SIMPLES
# =========================
@app.route("/api/login", methods=["POST"])
def login():
    try:
        data = request.get_json()
        usuario = data.get("usuario", "").strip()
        senha = data.get("senha", "").strip()
        
        print(f"Tentando login: {usuario} / {senha}")
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Query direta
        cur.execute("SELECT id, nome, usuario, role FROM usuarios WHERE usuario = %s AND senha = %s", (usuario, senha))
        user = cur.fetchone()
        
        cur.close()
        conn.close()
        
        if user:
            print("✅ Login OK")
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
                        "role": user["role"]
                    }
                }
            })
        else:
            print("❌ Login falhou")
            return jsonify({"success": False, "error": "Usuário ou senha inválidos"}), 401
            
    except Exception as e:
        print(f"💥 ERRO: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

# =========================
# ROTA PRINCIPAL
# =========================
@app.route("/")
def index():
    return send_from_directory("templates", "index.html")

@app.route("/static/<path:filename>")
def static_files(filename):
    return send_from_directory("static", filename)

# =========================
# EXECUTAR
# =========================
if __name__ == "__main__":
    print("\n" + "="*50)
    print("🚀 SERVIDOR RODANDO")
    print("="*50)
    print("📌 URL: http://localhost:8080")
    print("📌 Login: admin / 1234")
    print("="*50 + "\n")
    
    app.run(host="0.0.0.0", port=8080, debug=True)
