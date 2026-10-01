# Divulgar o Caderno

Plano para dar a conhecer o Caderno sem gastar dinheiro. O tom é o de um estudante que fez uma ferramenta para si e a partilha: honesto, calmo, sem exageros.

## A quem se dirige

Estudantes do ensino superior em Portugal que usam Moodle e estudam no Windows. Sentem três coisas: o material está espalhado por cadeiras e secções, não sabem por onde começar a estudar hoje, e reler PDFs não fica.

Quem fica de fora, por agora: quem usa Mac, quem não usa Moodle e não quer enviar ficheiros à mão.

## A mensagem

**Numa frase:** o Caderno junta os materiais de cada cadeira e diz-te o que estudar a seguir.

**Em três provas:**

1. Liga o Moodle uma vez e os PDFs e prazos de cada cadeira chegam a uma pasta tua.
2. O Hoje mostra um plano à medida do tempo que tens, sem acumular tarefas em atraso.
3. Com IA (há uma opção gratuita), cada PDF ganha resumo, conceitos, flashcards e explicações com a página de onde vieram.

**O que nunca dizer:** «IA ilimitada grátis» (o plano gratuito da Groq tem limites), «funciona com qualquer Moodle» (contas só com SSO podem falhar), «oficial» ou ligado a uma escola.

## Canais, por ordem

1. **Colegas de curso.** O grupo de WhatsApp ou Discord da turma. É onde a primeira pessoa instala com confiança.
2. **LinkedIn.** Um post com o vídeo curto. Serve o CV tanto quanto a divulgação.
3. **Associação de estudantes e núcleos de Informática.** Pedir para partilharem na newsletter ou nas redes no início de um período de avaliação.
4. **r/devpt** (Reddit). Publicação do tipo «fiz isto», com foco técnico: Electron, SQLite local, sem servidor, código aberto.
5. **Professores.** Mostrar a um professor de uma cadeira prática pode trazer feedback e, às vezes, uma menção na aula.

Evitar: enviar a mesma mensagem para muitos grupos no mesmo dia, ou grupos onde não participas.

## Calendário

| Quando | O quê |
|---|---|
| Semana 0 | Pontos 1 a 4 de [LANCAMENTO.md](LANCAMENTO.md). Gravar o vídeo. |
| Semana 1 | Turma e amigos. Recolher problemas e corrigir numa release rápida. |
| Semana 2 | LinkedIn com o vídeo. Pedir a 2–3 colegas que comentem com a experiência real. |
| Semana 3 | Associação de estudantes e r/devpt. |
| Antes de cada época de exames | Lembrete curto nos mesmos sítios, com a novidade mais útil desde a última vez. |

## Textos prontos

### Turma (WhatsApp ou Discord)

> Malta, fiz uma app para Windows que vai buscar os PDFs e prazos das cadeiras ao Moodle e monta um plano para o dia. Também cria flashcards e explicações dos PDFs (há uma opção de IA gratuita). É grátis e de código aberto: <link do site>. Se der algum erro, digam-me, que estou a corrigir esta semana.

### LinkedIn

> Este semestre fiz o Caderno, uma aplicação para Windows que uso para estudar.
>
> Liga-se ao Moodle, junta os materiais e prazos de cada cadeira numa pasta local e monta um plano à medida do tempo que tenho em cada dia. Com IA, cada PDF ganha um resumo, conceitos e explicações que apontam para a página de onde vieram.
>
> Algumas decisões de que gosto: não há conta nem servidor, os dados ficam no computador, a IA só corre quando a pessoa pede e funciona com a chave dela (incluindo uma opção gratuita).
>
> Feito com Electron, Node e SQLite. O código é aberto e as atualizações chegam sozinhas pelas releases do GitHub.
>
> Se és estudante e usas Moodle, experimenta e diz-me o que falta: <link>
>
> #engenhariainformatica #opensource #estudantes

### r/devpt

> **Fiz uma app de estudo para Windows que sincroniza o Moodle (open source)**
>
> Sou estudante de Engenharia Informática e fiz o Caderno para as minhas cadeiras. Electron + Node 24 com `node:sqlite`, sem servidor: o Moodle é lido pelos Web Services da app móvel, os PDFs ficam numa pasta local, o texto é extraído com unpdf e a IA é opcional, com a chave da pessoa (Anthropic, OpenAI, DeepSeek, Groq).
>
> Coisas em que gostava de opinião: a extração de texto de PDFs digitalizados (ainda sem OCR) e a forma de ligar contas com SSO.
>
> Repo: <link do GitHub> · Site: <link>

## Vídeo curto com o `/brag`

Na raiz do projeto, corre `/brag` e cola este pedido:

> Cria um vídeo de lançamento curto (35 a 45 segundos, 16:9, 1920×1080) para o Caderno, uma aplicação Windows de estudo feita por um estudante de Engenharia Informática. Tom profissional, de estudante e suave: calmo, confiante, nada de hype nem de efeitos agressivos. Texto no ecrã em português de Portugal, frases curtas, sem narração; música de fundo suave (piano ou lo-fi leve) com fade no fim.
>
> Usa a identidade visual da app: fundo verde-petróleo escuro (#111b1c e #1f3335), texto creme (#eef1ea), dourado (#d8b56b) só para destaques, títulos em Newsreader (`web/fonts/newsreader.woff2`) e interface em sans-serif. Transições lentas (fade e deslize curto), um destaque de cada vez.
>
> Cenas:
> 1. (0–5 s) Título «Cada cadeira arrumada, o próximo passo à vista.» sobre o ícone do Caderno (`build/icon-1024.png`).
> 2. (5–12 s) O problema: várias janelas do Moodle e PDFs soltos a desaparecer em fade, frase «O material está espalhado. Por onde começo hoje?».
> 3. (12–20 s) O ecrã Hoje (`site/screenshots/hoje-hero.webp`) com o plano do dia em destaque: «Um plano à medida do tempo que tens.»
> 4. (20–28 s) As Explicações com as marcas «p. 4» em destaque dourado: «Explicações que mostram a página de onde vieram.»
> 5. (28–35 s) Flashcards e Treino em sequência rápida mas suave: «Flashcards, treino e simulados a partir dos teus PDFs.»
> 6. (35–42 s) Fecho: «Grátis · Código aberto · Para Windows», o link do site e, em pequeno, «Feito por Miguel Ferreira, estudante».
>
> Usa só capturas com dados fictícios (as de `site/screenshots/`); nada do Moodle real nem nomes de escolas. Exporta também uma versão 9:16 de 30 segundos para stories, com as mesmas cenas reenquadradas.

## Medir

Sem telemetria na app, os números vêm de fora:

- **Downloads por versão:** `gh api repos/miguelaopt/caderno/releases --jq '.[] | "\(.tag_name): \(.assets[] | select(.name | endswith(".exe")) | .download_count)"'`
- **Problemas reportados:** Issues com a etiqueta `problema`.
- **Apoio:** cafés no Ko-fi.
- **Visitas ao site:** ativar o Vercel Web Analytics, que não usa cookies.

Rever estes números uma vez por semana durante o primeiro mês. Mais do que o total, interessa saber se as pessoas voltam a instalar as atualizações e o que reportam.
