#!/bin/sh
# Gera composition-vertical/index.html (1080×1920, 30 s) a partir da versão 16:9.
# Os tempos internos de cada cena esticam sozinhos com data-len / data-ref.
set -e
cd "$(dirname "$0")"
sed -e 's/content="width=1920, height=1080"/content="width=1080, height=1920"/' \
    -e 's/data-width="1920" data-height="1080" data-duration="42"/data-width="1080" data-height="1920" data-duration="30"/' \
    -e 's/id="s1" class="clip scene" data-layout-allow-overlap data-start="0" data-duration="5.8" data-len="5"/id="s1" class="clip scene" data-layout-allow-overlap data-start="0" data-duration="4.8" data-len="4"/' \
    -e 's/id="s2" class="clip scene" data-layout-allow-overlap data-start="5" data-duration="7.8" data-len="7"/id="s2" class="clip scene" data-layout-allow-overlap data-start="4" data-duration="5.8" data-len="5"/' \
    -e 's/id="s3" class="clip scene" data-layout-allow-overlap data-start="12" data-duration="8.8" data-len="8"/id="s3" class="clip scene" data-layout-allow-overlap data-start="9" data-duration="6.3" data-len="5.5"/' \
    -e 's/id="s4" class="clip scene" data-layout-allow-overlap data-start="20" data-duration="8.8" data-len="8"/id="s4" class="clip scene" data-layout-allow-overlap data-start="14.5" data-duration="6.3" data-len="5.5"/' \
    -e 's/id="s5" class="clip scene" data-layout-allow-overlap data-start="28" data-duration="7.8" data-len="7"/id="s5" class="clip scene" data-layout-allow-overlap data-start="20" data-duration="5.8" data-len="5"/' \
    -e 's/id="s6" class="clip scene" data-layout-allow-overlap data-start="35" data-duration="7" data-len="7"/id="s6" class="clip scene" data-layout-allow-overlap data-start="25" data-duration="5" data-len="5"/' \
    -e 's/id="music" src="assets\/music\/piano-bed.wav" data-start="0" data-duration="42"/id="music" src="assets\/music\/piano-bed.wav" data-start="0" data-duration="30"/' \
    -e 's/id="sfx-cite" src="assets\/sfx\/rollover2.ogg" data-start="23.6"/id="sfx-cite" src="assets\/sfx\/rollover2.ogg" data-start="16.975"/' \
    -e 's/id="sfx-card" src="assets\/sfx\/card-slide-1.ogg" data-start="31.5"/id="sfx-card" src="assets\/sfx\/card-slide-1.ogg" data-start="22.5"/' \
    composition/index.html > composition-vertical/index.html
# Todas as substituições têm de ter acontecido.
test "$(grep -c 'data-duration="42"\|data-start="23.6"\|data-start="31.5"\|data-len="8"\|data-len="7"' composition-vertical/index.html)" = 0
