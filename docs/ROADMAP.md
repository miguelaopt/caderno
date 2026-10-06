# Trabalho pendente

Este documento reúne limitações observadas no código. Não representa uma promessa de lançamento.

## Prioridade alta

- Validar o login pelo browser (SSO) em Moodles reais com SAML, OIDC e OAuth 2. Os testes automáticos simulam o `launch.php` e a resposta `moodlemobile://`. Instituições com app própria (`forcedurlscheme`) devolvem a chave noutro protocolo e ainda não são suportadas.
- Fazer uma revisão externa de segurança e testar o restauro das cópias de segurança (pasta de dados e materiais).
- Validar em ambiente real a integração de cada fornecedor de IA suportado e os modelos selecionados por utilizadores. Os testes automáticos usam respostas simuladas.
- Validar o instalador e o visualizador PDF em Windows 10 e 11 reais.
- Assinar o instalador. A SignPath Foundation recusou a candidatura em outubro de 2026 por falta de reputação pública; voltar a candidatar quando o projeto tiver adoção visível.

## Melhorias de produto

- Versões para macOS (requer conta Apple Developer para assinar e notarizar) e Linux (AppImage).
- Permitir mais de um servidor Moodle por instalação com validação de destinos e regras de acesso claras.
- Adicionar OCR para PDFs digitalizados sem texto selecionável.
- Tornar a sincronização e os resumos recuperáveis após reinício do processo, com progresso visível por ficheiro.
- Medir acessibilidade com utilizadores e completar uma auditoria WCAG AA.
- Disponibilizar importação da exportação de dados para facilitar migração entre instalações.
- Adicionar pré-visualização e extração de texto para DOCX, PPTX e outros documentos. A versão atual guarda esses ficheiros, mas analisa apenas PDF.
- Guardar respostas e resultados completos dos simulados para retomar uma sessão interrompida e comparar tentativas.

## Questões conhecidas

- O fornecedor compatível adicional tem de implementar Chat Completions; uma API proprietária requer um adaptador.
- A app não estima custos de IA: os custos de cada pedido pertencem à conta do fornecedor escolhido.
- O plano de estudo funciona sem IA, mas PDFs sem texto extraível não geram resumos, perguntas ou flashcards.
