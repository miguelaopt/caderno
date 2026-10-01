# Contribuir para o Caderno

Obrigado pelo interesse. O projeto usa JavaScript nativo, Node 24+, SQLite e uma interface sem framework. Mantém as alterações pequenas e explica no pedido de integração qual o problema resolvido.

## Ambiente local

```bash
npm ci
cp .env.example .env
npm run serve
```

Não é preciso configurar Moodle ou uma chave de IA para trabalhar na maior parte da aplicação. Os testes HTTP usam serviços locais simulados e uma base de dados temporária.

Antes de enviar uma alteração, executa:

```bash
npm run build
npm run lint
npm run typecheck
npm test
```

Inclui um teste quando corrigires um comportamento que possa regredir, sobretudo isolamento entre contas, pagamentos, credenciais ou integração com fornecedores de IA. Não juntes PDFs, tokens, bases de dados ou capturas com dados reais ao repositório.

Para uma funcionalidade maior, abre primeiro uma issue com o problema, a proposta e o impacto na privacidade dos dados de estudo. Usa [SECURITY.md](SECURITY.md) para falhas de segurança.
