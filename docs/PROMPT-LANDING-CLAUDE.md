# Prompt para criar a landing page com Claude

Cola o texto abaixo no Claude dentro de uma cópia do repositório. Instala previamente as skills indicadas no teu ambiente Claude.

```text
Trabalha neste repositório e implementa uma landing page profissional para o Caderno, uma aplicação open source de estudo para estudantes universitários portugueses. Antes de desenhar ou alterar código, lê o README, docs/ROADMAP.md, docs/DESKTOP.md e a landing atual em web/product.js e web/product.css. Usa explicitamente as skills UI UX Pro Max, frontend-design, Taste Skill e Impeccable; aplica as instruções de cada uma e explica no final as decisões que realmente influenciaram o resultado.

Objetivo: uma página clara, calorosa e credível, com personalidade de estudantes e qualidade editorial. Escreve em português de Portugal. O público está a gerir cadeiras, PDFs, exames e pouco tempo. Mostra o produto real: plano de hoje, materiais por cadeira, flashcards por cadeiras escolhidas, treino, simulados, revisão, foco e explicações com fontes. Destaca que funciona sem Moodle com PDFs manuais, que a versão Windows abre PDFs guardados offline e que cada pessoa pode usar a sua própria chave Anthropic, OpenAI, DeepSeek, Groq ou outro fornecedor compatível. Explica que os pedidos de IA podem ser cobrados pelo fornecedor.

Direção visual: tipografia expressiva mas legível, ritmo de página cuidado, muito espaço respirável, cor própria e pequenos detalhes inspirados em cadernos, apontamentos e calendário sem parecer uma plataforma infantil. Usa capturas reais em web/screenshots/ quando fizer sentido. Evita gradientes roxos genéricos, cartões repetitivos, mockups falsos, ícones sem função e texto promocional vazio. Não inventes números, testemunhos, instituições parceiras, avaliações, preços, funcionalidades ou garantias de privacidade.

Entrega código funcional integrado no HTML/CSS/JS existente, sem adicionar uma framework. Inclui hero com proposta clara e chamadas para experimentar a web e obter a app Windows, secções que expliquem o fluxo de estudo, demonstração das ferramentas, como funciona a chave própria, instalação Windows e contribuição open source. Liga os botões a destinos reais ou marca de forma honesta quando um artefacto ainda não estiver publicado. Mantém os percursos de login, app, privacidade e termos.

Cuida do responsivo desde 320 px, navegação por teclado, foco visível, contraste, reduced motion, semântica HTML e texto alternativo. Evita animação pesada. Confirma que a página funciona com e sem JS quando razoável para uma landing que hoje é renderizada em JS. Não carregues serviços externos de rastreio.

No fim, executa npm run build, npm run lint e npm run typecheck. Faz uma inspeção visual em desktop e mobile se houver browser disponível. Resume ficheiros alterados, decisões de design, testes e quaisquer limites reais. Não alteres as rotas da API nem a lógica de faturação sem necessidade.
```
