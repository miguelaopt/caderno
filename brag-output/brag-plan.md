# Brag Plan: Caderno

## What is this app?
Aplicação Windows, gratuita e de código aberto, que junta os materiais e prazos de cada cadeira, monta o plano do dia e gera explicações com fontes, flashcards, treino e simulados a partir dos PDFs.

## The angle
Um estudante mostra a ferramenta que fez para si. Nada de hype: o vídeo é tão arrumado como a app. O conflito é real e pequeno (material espalhado, «por onde começo hoje?») e a resposta é o ecrã Hoje. O pormenor de confiança, a marca «p. 4» dourada, mostra que as explicações não inventam.

## Hook (0–5 s)
O ícone do Caderno (livro creme com fita dourada) sobre verde-petróleo, e a frase do site em Newsreader: «Cada cadeira arrumada, o próximo passo à vista.» Lento, calmo e com tempo para ler.

## Key moments
- As janelas do Moodle e os PDFs soltos a sair de cena em fade (genéricos, sem Moodle real).
- O ecrã Hoje com o cartão «Plano de hoje» em foco (bloco de 20 min, «Introdução ao modelo relacional»).
- Uma explicação com as marcas «p. 2» e «p. 4»; a «p. 4» acende em dourado.
- Flashcards → Treino, um de cada vez.

## Outro
«Grátis · Código aberto · Para Windows», o link e «Feito por Miguel Ferreira, estudante».

## User flow worth showing
Abrir o Hoje e ver o plano → pedir uma explicação e confirmar a página → rever com flashcards e treino.

## Tone
- Preset: polished
- Creative direction: estudante, profissional e suave: calmo, confiante, sem hype
- Interpretation: holds longos, um destaque de cada vez, fades e deslizes curtos (≤ 24 px), nada de escalas grandes, flashes ou cortes secos.

## Format: landscape — 1920×1080 (+ vertical 1080×1920, 30 s)
## Duration: 42 s (pedido do utilizador: 35–45 s; substitui o limite de 15–25 s do /brag)

## Visual identity (from the project)
- Background: #111b1c, superfície #1f3335 / #172324, linhas #2b3c3e
- Accent: #d8b56b (só destaques)
- Text: #eef1ea, secundário #a9bab5
- Display font: Newsreader (web/fonts/newsreader.woff2)
- Body font: sans-serif do sistema (Segoe UI / Noto Sans)
- Strongest visual element: o cartão «Plano de hoje» e as marcas `.cite` «p. 4» da app

## Fonte do material (dados fictícios)
- Capturas: site/screenshots/hoje-hero.webp, flashcards.webp, treino.webp (base fictícia de scripts/seed-screenshot.mjs).
- A captura explicacoes.webp mostra o estado vazio (sem chave), sem marcas «p.». A cena 4 recria em HTML o painel de explicação da app (mesmas classes `.cite` e `.sources` de web/product.css) com texto fictício sobre o modelo relacional.
- Moodle: janelas genéricas desenhadas em HTML, sem logótipo, sem nomes de escolas.
- Link: ainda sem domínio decidido (docs/LANCAMENTO.md); usa-se `github.com/miguelaopt/caderno` como variável `siteUrl`.

## Share copy (draft)
Fiz o Caderno para as minhas cadeiras: junta materiais e prazos, monta o plano do dia e explica os PDFs a indicar a página de onde veio cada parte. Grátis, código aberto, para Windows.

## Audio direction
- Role: tapete quente e discreto
- Music: piano suave original, gerado localmente (sem faixa do catálogo: heygen indisponível e as faixas incluídas são animadas)
- Music treatment: fade-in de 1 s, volume baixo, fade-out nos últimos 3 s
- Music cue guidance: a música é composta à medida; cada cena começa num acorde novo (0, 5, 12, 20, 28, 35 s; vertical: 0, 4, 9, 14.5, 20, 25 s)
- Audio-reactive treatment: none (o tom pede quietude)
- SFX posture: mínimo, 2 sinais muito baixos
- Audio-coupled moments: «p. 4» acende (toque suave), troca Flashcards → Treino (carta a deslizar)
- Restraint rule: nada de impactos, sinos ou whooshes

## Storyboard

### Scene 1 — Título — 0–5 s
Ícone centrado sobe 16 px e aparece em fade; o título em Newsreader aparece por baixo.
Sequential/interaction: none
Audio intent: primeiro acorde, abre o espaço
Transition mood: soft → Scene 2

### Scene 2 — O problema — 5–12 s
Cinco janelas/ficheiros sobrepostos («Moodle · Página da cadeira», «Moodle · Prazos», «Ficha 04 — normalização.pdf», «Casos de uso.pdf», «Resumo_final_v3.pdf»). Desaparecem um a um em fade. Depois aparece «O material está espalhado.» e, a seguir, «Por onde começo hoje?», ambas em creme (o dourado fica para os destaques do produto).
Sequential/interaction: as janelas saem uma a uma (≈0.35 s entre si); as frases ficam ≥2.5 s
Audio intent: acorde menor, ligeira tensão
Transition mood: soft → Scene 3

### Scene 3 — Hoje — 12–20 s
Captura do Hoje a entrar com deslize curto. Uma máscara escurece o resto e o cartão «Plano de hoje» fica em foco com contorno dourado fino. Legenda: «Um plano à medida do tempo que tens.»
Sequential/interaction: foco no cartão depois de a captura assentar
Audio intent: resolve para maior
Transition mood: soft → Scene 4

### Scene 4 — Explicações — 20–28 s
Painel recriado «Explicação simples» com três frases e marcas «p. 2», «p. 4». A «p. 4» acende em dourado (só uma). Legenda: «Explicações que mostram a página de onde vieram.»
Sequential/interaction: os parágrafos aparecem; depois o destaque da «p. 4»
Audio-coupled idea: toque muito leve quando a «p. 4» acende
Transition mood: soft → Scene 5

### Scene 5 — Flashcards e Treino — 28–35 s
Flashcards (3.5 s) dá lugar a Treino (3.5 s) com deslize lateral curto. Legenda fixa: «Flashcards, treino e simulados a partir dos teus PDFs.»
Sequential/interaction: duas capturas, uma de cada vez
Audio-coupled idea: carta a deslizar na troca
Transition mood: soft → Scene 6

### Scene 6 — Fecho — 35–42 s
Ícone pequeno + «caderno.», «Grátis · Código aberto · Para Windows», o link, e em pequeno «Feito por Miguel Ferreira, estudante». A música desce até 0.
Audio intent: acorde final a soar e fade

**Music mood for this video:** calmo, piano
**Audio summary:** piano suave que muda de acorde em cada cena e se apaga no fecho, com dois toques quase inaudíveis.
