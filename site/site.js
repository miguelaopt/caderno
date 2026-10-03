// Liga os botões de download ao instalador mais recente das releases do GitHub.
// Sem JavaScript ou sem resposta da API, os links abrem a página da última release.
const REPO = 'miguelaopt/caderno';

fetch(`https://api.github.com/repos/${REPO}/releases?per_page=10`, { headers: { accept: 'application/vnd.github+json' } })
  .then((response) => (response.ok ? response.json() : []))
  .then((releases) => {
    for (const release of releases) {
      const asset = !release.draft && release.assets.find((item) => /windows.*\.exe$/i.test(item.name));
      if (!asset) continue;
      for (const link of document.querySelectorAll('[data-download]')) link.href = asset.browser_download_url;
      const version = release.tag_name.replace(/^v/, '').replace(/-preview$/, '');
      for (const el of document.querySelectorAll('[data-release-info]'))
        el.textContent = `, versão ${version}${release.prerelease ? ' de pré-lançamento' : ''}`;
      for (const el of document.querySelectorAll('[data-release-size]'))
        el.textContent = ` (${Math.round(asset.size / 1048576)} MB)`;
      // As notas da release levam o SHA-256 do instalador (workflow Windows desktop); a página do
      // VirusTotal para esse hash mostra a análise feita quando a versão foi publicada.
      const sha = /SHA-256:\s*`([0-9a-f]{64})`/i.exec(release.body || '')?.[1];
      if (sha) {
        for (const link of document.querySelectorAll('[data-virustotal]')) link.href = `https://www.virustotal.com/gui/file/${sha.toLowerCase()}`;
        for (const el of document.querySelectorAll('[data-virustotal-version]')) el.textContent = ` da versão ${version}`;
      }
      return;
    }
  })
  .catch(() => {});

for (const button of document.querySelectorAll('[data-theme-toggle]')) {
  button.addEventListener('click', () => {
    const dark = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === 'dark'
      : !matchMedia('(prefers-color-scheme: light)').matches;
    const theme = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('caderno-theme', theme); } catch {}
  });
}
