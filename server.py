/* =========================
   Professional Styles
   ========================= */

/* Dashboard */
.dashboard {
  padding: 20px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 20px;
  margin-bottom: 30px;
}

.stat-card {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 20px;
  padding: 24px;
  text-align: center;
  transition: transform 0.2s, box-shadow 0.2s;
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 30px rgba(0,0,0,0.1);
}

.stat-icon {
  font-size: 36px;
  margin-bottom: 12px;
}

.stat-value {
  font-size: 32px;
  font-weight: 800;
  color: var(--primary);
  line-height: 1.2;
}

.stat-label {
  color: var(--muted);
  font-weight: 600;
  font-size: 14px;
}

/* Quick Actions */
.quick-actions {
  margin-bottom: 30px;
}

.quick-actions h3 {
  margin-bottom: 16px;
  font-size: 18px;
}

.actions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 15px;
}

.action-card {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  transition: all 0.2s;
}

.action-card:hover {
  border-color: var(--primary);
  background: rgba(47, 109, 246, 0.02);
}

.action-icon {
  font-size: 32px;
}

.action-title {
  font-weight: 700;
  color: var(--text);
}

/* Fixed Notices */
.fixed-notices {
  margin-top: 30px;
}

.fixed-notices h3 {
  margin-bottom: 16px;
  font-size: 18px;
}

.notices-list {
  display: grid;
  gap: 15px;
}

.notice-card {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 16px;
  border-left: 4px solid var(--primary);
}

.notice-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
  color: var(--muted);
  font-size: 13px;
  font-weight: 600;
}

.notice-author {
  font-weight: 700;
  color: var(--primary);
}

.notice-message {
  white-space: pre-wrap;
  margin-bottom: 10px;
}

.notice-image {
  max-width: 100%;
  max-height: 300px;
  border-radius: 12px;
  margin-top: 10px;
}

/* Empty State */
.empty-state {
  text-align: center;
  padding: 60px 20px;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 24px;
}

.empty-icon {
  font-size: 64px;
  margin-bottom: 20px;
  opacity: 0.5;
}

.empty-state h3 {
  margin-bottom: 10px;
  font-size: 20px;
}

.empty-state p {
  color: var(--muted);
  margin-bottom: 20px;
}

/* Aula Ativa */
.aula-ativa {
  padding: 20px;
}

.aula-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 20px;
  padding: 24px;
  margin-bottom: 24px;
}

.aula-header h2 {
  margin: 0 0 8px 0;
  font-size: 24px;
}

.aula-time {
  color: var(--muted);
  font-size: 14px;
  font-weight: 600;
  margin-top: 8px;
}

.aula-actions {
  display: flex;
  gap: 10px;
}

/* Presença Grid */
.presenca-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 30px;
}

.presenca-card {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 20px;
  padding: 20px;
}

.presenca-card h3 {
  margin-bottom: 16px;
  font-size: 18px;
}

.search-box {
  position: relative;
}

.search-results {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 12px;
  margin-top: 4px;
  max-height: 250px;
  overflow-y: auto;
  z-index: 100;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}

.search-result-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  cursor: pointer;
  border-bottom: 1px solid var(--line);
}

.search-result-item:hover {
  background: rgba(47, 109, 246, 0.05);
}

.result-foto {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  object-fit: cover;
}

/* Presença Lista */
.presenca-lista {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 20px;
  padding: 20px;
  margin-bottom: 20px;
}

.presenca-lista h3 {
  margin-bottom: 16px;
  font-size: 18px;
}

.presenca-table {
  display: grid;
  gap: 10px;
}

.presenca-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: rgba(0,0,0,0.02);
}

.presenca-row.saida-ok {
  background: rgba(22, 163, 74, 0.05);
  border-color: rgba(22, 163, 74, 0.2);
}

.aluno-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.aluno-foto {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
}

.aluno-nome {
  font-weight: 700;
}

.aluno-status {
  display: flex;
  gap: 10px;
  align-items: center;
}

.badge-entrada, .badge-saida, .badge-retirado {
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}

.badge-entrada {
  background: rgba(47, 109, 246, 0.1);
  color: var(--primary);
}

.badge-saida {
  background: rgba(22, 163, 74, 0.1);
  color: #16a34a;
}

.badge-retirado {
  background: rgba(107, 114, 128, 0.1);
  color: var(--muted);
}

/* Relatório Actions */
.relatorio-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 20px;
}

.btn-secondary {
  background: transparent;
  border: 1px solid var(--line);
  padding: 8px 16px;
  border-radius: 12px;
  color: var(--text);
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-secondary:hover {
  border-color: var(--primary);
  background: rgba(47, 109, 246, 0.05);
}

/* Alunos Page */
.alunos-page {
  padding: 20px;
}

.alunos-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.alunos-header h2 {
  font-size: 24px;
}

.alunos-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 20px;
}

.aluno-card {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 20px;
  padding: 20px;
  display: flex;
  gap: 16px;
  position: relative;
  transition: all 0.2s;
}

.aluno-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.1);
}

.aluno-card-foto {
  width: 80px;
  height: 80px;
  border-radius: 16px;
  object-fit: cover;
}

.aluno-card-info {
  flex: 1;
}

.aluno-card-info h3 {
  margin: 0 0 8px 0;
  font-size: 16px;
}

.aluno-card-info p {
  margin: 4px 0;
  font-size: 13px;
  color: var(--muted);
}

.aluno-card-actions {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  gap: 5px;
  opacity: 0;
  transition: opacity 0.2s;
}

.aluno-card:hover .aluno-card-actions {
  opacity: 1;
}

.btn-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: var(--panel);
  cursor: pointer;
  transition: all 0.2s;
}

.btn-icon:hover {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}

.btn-icon.danger:hover {
  background: var(--danger);
  border-color: var(--danger);
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.modal {
  background: var(--panel);
  border-radius: 24px;
  max-width: 600px;
  width: 100%;
  max-height: 85vh;
  overflow-y: auto;
  box-shadow: 0 20px 40px rgba(0,0,0,0.2);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid var(--line);
}

.modal-header h3 {
  margin: 0;
  font-size: 18px;
}

.modal-close {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: var(--muted);
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
}

.modal-close:hover {
  background: rgba(0,0,0,0.05);
  color: var(--text);
}

.modal-content {
  padding: 20px;
}

/* Form */
.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-weight: 600;
  font-size: 13px;
  color: var(--muted);
}

.form-control {
  width: 100%;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--panel);
  color: var(--text);
  font-size: 14px;
}

.form-control:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(47, 109, 246, 0.1);
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 15px;
}

.form-actions {
  margin-top: 20px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.form-msg {
  color: var(--muted);
  font-size: 13px;
}

.btn-primary {
  background: var(--primary);
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

.btn-danger {
  background: var(--danger);
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-small {
  padding: 8px 16px;
  font-size: 13px;
}

/* Aluno View */
.aluno-view-header {
  display: flex;
  gap: 20px;
  margin-bottom: 24px;
}

.aluno-view-foto {
  width: 100px;
  height: 100px;
  border-radius: 20px;
  object-fit: cover;
}

.aluno-view-section {
  margin-bottom: 20px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--line);
}

.aluno-view-section h3 {
  margin-bottom: 12px;
  font-size: 16px;
  color: var(--muted);
}

.preview-foto {
  width: 60px;
  height: 60px;
  border-radius: 12px;
  object-fit: cover;
  margin-top: 10px;
}

/* Histórico */
.historico-page {
  padding: 20px;
}

.historico-page h2 {
  margin-bottom: 24px;
}

.historico-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
}

.historico-card {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 20px;
  padding: 20px;
  transition: all 0.2s;
}

.historico-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.1);
}

.historico-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
  font-size: 13px;
}

.historico-data {
  color: var(--muted);
  font-weight: 600;
}

.historico-total {
  background: var(--primary);
  color: white;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
}

.historico-card h3 {
  margin: 0 0 8px 0;
  font-size: 16px;
}

.historico-equipe {
  color: var(--muted);
  font-size: 13px;
  margin-bottom: 16px;
}

.historico-actions {
  display: flex;
  gap: 10px;
}

/* Assistente */
.assistente-page {
  padding: 20px;
}

.assistente-page h2 {
  margin-bottom: 24px;
}

.assistente-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 20px;
}

.assistente-card {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 20px;
  padding: 20px;
}

.assistente-card h3 {
  margin-bottom: 16px;
  font-size: 18px;
}

.assistente-out {
  margin-top: 16px;
  padding: 12px;
  background: rgba(0,0,0,0.02);
  border-radius: 12px;
  font-size: 14px;
}

.tema-sugestao {
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
  margin-bottom: 10px;
}

.tema-sugestao h5 {
  margin: 0 0 5px 0;
  color: var(--primary);
}

/* Mural */
.mural-page {
  padding: 20px;
}

.mural-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.mural-header h2 {
  font-size: 24px;
}

.avisos-list {
  display: grid;
  gap: 20px;
}

.aviso-card {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 20px;
  padding: 20px;
}

.aviso-card.fixado {
  border-left: 4px solid var(--primary);
}

.aviso-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.aviso-autor {
  font-weight: 700;
  color: var(--primary);
}

.aviso-data {
  color: var(--muted);
  font-size: 12px;
  margin-left: 10px;
}

.aviso-actions {
  display: flex;
  gap: 5px;
}

.badge-fixado {
  background: var(--primary);
  color: white;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 11px;
  margin-right: 8px;
}

.aviso-mensagem {
  white-space: pre-wrap;
  margin-bottom: 12px;
  line-height: 1.6;
}

.aviso-imagem {
  max-width: 100%;
  max-height: 400px;
  border-radius: 16px;
  margin: 12px 0;
}

.aviso-footer {
  margin: 12px 0;
}

.btn-like {
  background: none;
  border: 1px solid var(--line);
  padding: 6px 12px;
  border-radius: 999px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.btn-like:hover {
  border-color: #f43f5e;
  color: #f43f5e;
}

.comentarios {
  margin: 12px 0;
  padding-left: 16px;
  border-left: 2px solid var(--line);
}

.comentario {
  padding: 8px;
  margin-bottom: 8px;
  background: rgba(0,0,0,0.02);
  border-radius: 12px;
  font-size: 13px;
}

.comentario strong {
  color: var(--primary);
  margin-right: 8px;
}

.comentario small {
  color: var(--muted);
  display: block;
  margin-top: 4px;
}

.novo-comentario {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.novo-comentario input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--panel);
}

/* Equipe */
.equipe-page {
  padding: 20px;
}

.equipe-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.equipe-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}

.membro-card {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 20px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  position: relative;
}

.membro-avatar {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  background: linear-gradient(135deg, var(--primary), #1e4
