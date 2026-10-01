# Trabalho pendente

Este documento reúne limitações observadas no código. Não representa uma promessa de lançamento.

## Prioridade alta

- Rever a autenticação Moodle para contas com SSO e disponibilizar uma alternativa de ligação por token sem receber a palavra-passe do aluno.
- Identificar entidade responsável, contacto, base jurídica, retenção e condições finais nas páginas legais antes de uma instalação pública.
- Fazer uma revisão externa de segurança e testar restauro dos backups cifrados.
- Validar em ambiente real a integração de cada fornecedor de IA suportado e os modelos selecionados por utilizadores. Os testes automáticos usam respostas simuladas.

## Melhorias de produto

- Permitir mais de um servidor Moodle por instalação com validação de destinos e regras de acesso claras.
- Adicionar OCR para PDFs digitalizados sem texto selecionável.
- Tornar a sincronização e os resumos recuperáveis após reinício do processo, com progresso visível por ficheiro.
- Medir acessibilidade com utilizadores e completar uma auditoria WCAG AA.
- Disponibilizar importação da exportação de dados para facilitar migração entre instalações.

## Questões conhecidas

- O fornecedor compatível adicional tem de implementar Chat Completions; uma API proprietária requer um adaptador.
- As estimativas de custos da área de administração aplicam-se apenas à chave Anthropic do operador. Os custos de uma chave pessoal pertencem à conta do respetivo fornecedor.
- O plano de estudo funciona sem IA, mas PDFs sem texto extraível não geram resumos, perguntas ou flashcards.
- O modo de subscrição hospedada é legado e requer configuração Stripe, SMTP e revisão legal antes de uso real.
