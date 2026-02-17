# server.py - VERSÃO COM BANCO LOCAL (SQLite)
import os
import json
import base64
import sqlite3
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

app = Flask(__name__, static_folder="static", static_url_path="/static")
CORS(app)

# =========================
# BANCO SQLITE (não precisa de senha)
# =========================
def get_db():
    conn = sqlite3.connect('ieq.db')
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cur = conn.cursor()
    
    # Criar tabelas
    cur.execute('''
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            usuario TEXT UNIQUE NOT NULL,
            senha TEXT NOT NULL,
            role TEXT DEFAULT 'auxiliar'
        )
    ''')
    
    cur.execute('''
        CREATE TABLE IF NOT EXISTS alunos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            data_nascimento TEXT,
            responsavel TEXT,
            telefone TEXT,
            observacoes TEXT,
            autorizado_retirar TEXT,
            autorizado_2 TEXT,
            autorizado_3 TEXT,
            foto TEXT
        )
    ''')
    
    # Inserir admin se não existir
    cur.execute("SELECT * FROM usuarios WHERE usuario = 'admin'")
    if not cur.fetchone():
        cur.execute("INSERT INTO usuarios (nome, usuario, senha, role) VALUES (?, ?, ?, ?)",
                   ('Administrador', 'admin', '1234', 'admin'))
    
    conn.commit()
    conn.close()
    print("✅ Banco SQLite criado!")

init_db()

# =========================
# LOGIN
# =========================
@app.route("/api/login", methods=["POST"])
def login():
    try:
        data = request.get_json()
        usuario = data.get("usuario")
        senha = data.get("senha")
        
        print(f"Login: {usuario} / {senha}")
        
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT * FROM usuarios WHERE usuario = ? AND senha = ?", (usuario, senha))
        user = cur.fetchone()
        conn.close()
        
        if user:
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
            return jsonify({"success": False, "error": "Usuário ou senha inválidos"}), 401
            
    except Exception as e:
        print(f"Erro: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

# =========================
# ROTAS
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
    print("🚀 IEQ CENTRAL - MODO LOCAL")
    print("="*50)
    print("📌 URL: http://localhost:8080")
    print("📌 Login: admin / 1234")
    print("📌 Banco: SQLite (não precisa configurar)")
    print("="*50 + "\n")
    
    app.run(host="0.0.0.0", port=8080, debug=True)
