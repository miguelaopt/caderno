# Hyperframes Composition Brief: Caderno

## Objective
Vídeo de lançamento calmo do Caderno, em duas versões.

## Output
- `brag-output/composition/` → `brag-output/brag.mp4` (1920×1080, 42 s)
- `brag-output/composition-vertical/` → `brag-output/brag-vertical.mp4` (1080×1920, 30 s)
- As duas usam o mesmo HTML/CSS/JS; o CSS reenquadra com `@media (orientation: portrait)` e o timeline lê os tempos de cada cena do `data-start`/`data-duration` da própria cena.

## Source Material
- Project root: /home/miguelferreira/Desktop/App_Estudos
- Files read: site/index.html, site/styles.css, web/product.js (explanationPane, citationsHtml), web/product.css (.cite, .sources), docs/LANCAMENTO.md
- Copy verbatim (pedido pelo utilizador):
  - «Cada cadeira arrumada, o próximo passo à vista.»
  - «O material está espalhado. Por onde começo hoje?»
  - «Um plano à medida do tempo que tens.»
  - «Explicações que mostram a página de onde vieram.»
  - «Flashcards, treino e simulados a partir dos teus PDFs.»
  - «Grátis · Código aberto · Para Windows»
  - «Feito por Miguel Ferreira, estudante»

## Creative Direction
- Tone preset: polished; direction: estudante, profissional, suave
- Transições: fade e deslize curto; cenas sobrepõem-se 0.8 s em crossfade
- Avoid: hype, escalas grandes, flashes, Moodle real, nomes de escolas

## Visual Identity
- Background #111b1c / #1f3335, text #eef1ea, muted #a9bab5, accent #d8b56b (só destaques)
- Display: Newsreader (assets/newsreader.woff2, @font-face local); UI: sans-serif do sistema

## Storyboard
Ver brag-plan.md. Landscape: 0 / 5 / 12 / 20 / 28 / 35 → 42 s. Vertical: 0 / 4 / 9 / 14.5 / 20 / 25 → 30 s.

## Audio
- Music: assets/music/piano-bed.wav (landscape) e piano-bed-vertical.wav, geradas por `music/piano.py` com acordes nos inícios das cenas
- Volume ~0.5 no próprio ficheiro já normalizado (pico −3 dB, RMS baixo); fades na própria faixa
- Music cue guidance: composta à medida — acordes nos inícios das cenas, sem beat-sync adicional
- Audio-reactive: none
- SFX: `ui/rollover2.ogg` muito baixo na «p. 4»; `casino/card-slide-1.ogg` na troca Flashcards → Treino
