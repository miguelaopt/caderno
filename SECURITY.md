# Segurança

O Caderno guarda materiais privados e credenciais de acesso. Se encontrares uma vulnerabilidade, usa **Report a vulnerability** na página **Security** do repositório GitHub, quando disponível. Caso essa opção não esteja ativa, contacta o mantenedor em privado pelo perfil GitHub. Não publiques tokens, dados de alunos ou detalhes exploráveis numa issue.

Inclui uma descrição do impacto, passos mínimos para reproduzir e a versão ou commit afetado. O mantenedor confirmará a receção e combinará a divulgação depois de existir uma correção.

## Para operadores

- Define `TOKEN_ENCRYPTION_KEY` em produção e guarda-a fora do repositório. A chave também protege as chaves pessoais de IA.
- Usa HTTPS com proxy reverso e disco persistente para SQLite e PDFs.
- Faz backups da base de dados, ficheiros e chave de cifra. Testa a reposição.
- Configura `AI_ALLOWED_BASE_URLS` apenas com destinos em que confias. Não permitas destinos internos numa instalação pública.
- Revê as páginas legais e a política de retenção antes de aceitar contas reais.

O filtro de materiais sensíveis reduz envios acidentais à IA, mas não substitui uma revisão de privacidade dos dados e do fornecedor escolhido.
