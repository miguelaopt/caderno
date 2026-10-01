const root = document.querySelector('#root');
const live = document.querySelector('#live');
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (seconds) => new Date(seconds * 1000).toLocaleDateString('pt-PT', { day: 'numeric', month: 'long' });
const flash = (message) => { live.textContent = message; setTimeout(() => { if (live.textContent === message) live.textContent = ''; }, 6000); };
let state = null;
let publicConfig = { billingAvailable: false };
let screen = location.pathname === '/app' ? 'today' : 'landing';
let authMode = 'register';
let selectedCourse = null;
let fileDetail = null;
let cardDeck = null;
let cardIndex = 0;
let cardRevealed = false;
let cardCourseIds = new Set();
let answer = null;
let adminData = null;
let fileSearch = '';
let favoritesOnly = false;
let syncPoll = null;
let explanationAnswer = null;
let explanationCourse = null;
let explanationFile = null;
let practiceDeck = null;
let practiceCourse = null;
let practiceIndex = 0;
let practiceRevealed = false;
let practiceDraft = '';
let revisionCourse = null;
let examCourse = null;
let examQuestions = [];
let examAnswers = [];
let examGrades = {};
let examIndex = 0;
let examEndsAt = null;
let examCompleted = false;
let examTimer = null;
let focusFileId = null;
let focusDuration = 25 * 60;
let focusRemaining = focusDuration;
let focusEndsAt = null;
let focusTimer = null;

async function api(path, options = {}) {
  const res = await fetch(path, { credentials: 'same-origin', ...options });
  const result = await res.json();
  if (!res.ok) throw new Error(result.erro || 'Não foi possível concluir o pedido.');
  return result;
}
const post = (path, data) => api(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });

async function refresh() {
  publicConfig = await api('/api/public');
  try { state = await api('/api/state'); }
  catch (error) { if (error.message.includes('Inicia sessão')) state = null; else throw error; }
  render();
  clearTimeout(syncPoll);
  if (state?.sync?.status === 'running' || state?.analysis?.running) {
    const poll = () => {
      if (document.activeElement?.matches('input,textarea,select')) syncPoll = setTimeout(poll, 4000);
      else refresh().catch((error) => flash(error.message));
    };
    syncPoll = setTimeout(poll, 4000);
  }
}

function header() {
  return `<header class="site-header wrap"><a class="logo" href="/">caderno<span style="color:var(--accent)">.</span></a>
    <nav><a class="desktop" href="/#como">Como funciona</a><a class="desktop" href="/#precos">Preços</a>
    <button data-action="theme" aria-label="Alternar tema">◐</button><button class="primary" data-action="open-app">${state ? 'Abrir o Caderno' : 'Começar grátis'}</button></nav></header>`;
}

function footer() {
  return `<footer class="footer wrap"><div>© ${new Date().getFullYear()} Caderno. Aplicação independente, sem afiliação ao Moodle.</div>
    <div><a href="/privacidade" data-action="privacy">Privacidade</a><a href="/termos" data-action="terms">Termos</a></div></footer>`;
}

function landing() {
  root.innerHTML = `${header()}<main>
    <section class="hero wrap"><div><div class="eyebrow">O teu estudo, com rumo</div><h1>Chegas a casa e já sabes o que estudar.</h1>
      <p>O Caderno junta os materiais das tuas cadeiras, mostra o que mudou e ajuda-te a escolher um plano realista para hoje.</p>
      <div class="row"><button class="primary" data-action="open-app">Começar grátis →</button><a href="#como" class="button">Ver como funciona</a></div>
      <p><small>Também funciona sem ligação ao Moodle: podes enviar os teus PDFs.</small></p></div>
      <div class="hero-art" aria-label="Exemplo ilustrativo do ecrã Hoje"><div class="date">HOJE · PLANO ILUSTRATIVO</div><h2 style="margin:12px 0 26px">Uma coisa de cada vez.</h2>
        <div class="art-row"><div><b>Rever a matéria nova</b><span>Resumo e conceitos principais</span></div><strong>25 min</strong></div>
        <div class="art-row"><div><b>Resolver uma ficha</b><span>Começar pelos exercícios base</span></div><strong>30 min</strong></div>
        <div class="art-row"><div><b>Conferir o prazo</b><span>Entrega da próxima semana</span></div><strong>5 min</strong></div>
        <p><small>Ilustração. O plano real usa as tuas cadeiras e o tempo que tens.</small></p></div></section>
    <section id="como" class="section"><div class="wrap"><span class="eyebrow">Simples de começar</span><h2>Três passos, sem confusão.</h2><div class="grid">
      <div class="card"><span class="number">01</span><h3>Liga o Moodle</h3><p>Introduz o utilizador e a palavra-passe do Moodle para encontrar as tuas cadeiras.</p></div>
      <div class="card"><span class="number">02</span><h3>Escolhe as cadeiras</h3><p>Segue só as que te interessam. Sem Moodle, cria uma cadeira e envia PDFs.</p></div>
      <div class="card"><span class="number">03</span><h3>Abre o Hoje</h3><p>Vê os materiais, o que mudou e por onde começar a estudar.</p></div></div></div></section>
    <section class="section"><div class="wrap"><span class="eyebrow">Por dentro da aplicação</span><h2>Menos ruído. Mais tempo para estudar.</h2>
      <p class="muted">Ecrãs reais do Caderno com dados fictícios de demonstração.</p><div class="screenshot-grid">
      <figure><img src="/screenshots/hoje.png" alt="Ecrã Hoje com plano de estudo, alterações nas cadeiras e próximos prazos" loading="lazy" width="1280" height="1200"><figcaption>O Hoje reúne o essencial numa só página.</figcaption></figure>
      <figure><img src="/screenshots/materiais.png" alt="Ecrã Materiais com PDFs privados organizados por cadeira" loading="lazy" width="1280" height="1200"><figcaption>Os materiais ficam organizados por cadeira.</figcaption></figure>
      </div></div></section>
    <section class="section"><div class="wrap"><span class="eyebrow">Privacidade</span><h2>Os teus materiais ficam teus.</h2><div class="grid">
      <div class="card"><h3>Palavra-passe usada só na ligação</h3><p>O Moodle devolve uma chave de acesso, que guardamos cifrada no servidor. Podes desligar a ligação quando quiseres.</p></div>
      <div class="card"><h3>Por cadeira e por pessoa</h3><p>Os ficheiros e os resumos são privados. Não publicamos materiais de docentes.</p></div>
      <div class="card"><h3>Controlo dos dados</h3><p>Exporta os teus dados ou apaga a conta nas definições. A revogação da chave é feita no próprio Moodle.</p></div></div></div></section>
    ${publicConfig.hostedBilling ? `<section id="precos" class="section"><div class="wrap"><span class="eyebrow">Preços</span><h2>Feito para caber no orçamento de estudante.</h2><div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(250px,1fr))">
      <div class="card"><h3>Grátis</h3><div class="price">€0</div><p>Uma cadeira, PDFs manuais e plano de estudo.</p><button data-action="open-app">Começar</button></div>
      <div class="card"><h3>Estudante</h3><div class="price">€2,99 <small>/ mês</small></div><p>Todas as cadeiras, mais análises e gestão de assinatura no Stripe.</p>${publicConfig.billingAvailable ? '<button data-action="open-app">Escolher Estudante</button>' : '<button disabled>Em breve</button>'}</div></div></div></section>` : `<section id="precos" class="section"><div class="wrap"><span class="eyebrow">Código aberto</span><h2>Estuda com as tuas ferramentas.</h2><p>Cria as cadeiras de que precisas. A IA é opcional: usa a tua chave de API e escolhe o fornecedor nas Definições.</p><button class="primary" data-action="open-app">Abrir o Caderno</button></div></section>`}
    <section class="section"><div class="wrap"><span class="eyebrow">Perguntas frequentes</span><h2>Antes de começares</h2><div class="grid">
      <div class="card"><h3>É uma app oficial do Moodle?</h3><p>Não. O Caderno é independente e não tem afiliação ao Moodle.</p></div>
      <div class="card"><h3>Preciso de ligar o Moodle?</h3><p>Não. Podes criar uma cadeira e enviar os teus PDFs.</p></div>
      <div class="card"><h3>O que acontece se a ligação expirar?</h3><p>Os teus materiais continuam acessíveis. Podes voltar a ligar o Moodle quando quiseres.</p></div></div></div></section>
  </main>${footer()}`;
}

function auth() {
  root.innerHTML = `${header()}<main class="wrap"><div class="auth"><span class="eyebrow">Conta Caderno</span><h1>${authMode === 'register' ? 'Começar a estudar' : 'Bem-vindo de volta'}</h1>
    <div class="card"><form id="auth-form"><label>Email<input name="email" type="email" autocomplete="email" required></label>
      <label>Palavra-passe<input name="password" type="password" minlength="12" autocomplete="${authMode === 'register' ? 'new-password' : 'current-password'}" required></label>
      <button class="primary" type="submit">${authMode === 'register' ? 'Criar conta' : 'Entrar'}</button></form>
      <p class="swap"><button data-action="swap-auth">${authMode === 'register' ? 'Já tenho conta' : 'Criar uma conta'}</button></p></div></div></main>${footer()}`;
}

function shell(content) {
  root.innerHTML = `<div class="app-shell"><aside class="sidebar"><a class="logo" href="/">caderno<span style="color:var(--accent)">.</span></a>
    <span class="sidebar-label">Organizar</span>
    <button data-screen="today" aria-current="${screen === 'today'}">Hoje</button>
    <button data-screen="courses" aria-current="${screen === 'courses'}">Cadeiras</button>
    <button data-screen="files" aria-current="${screen === 'files'}">Materiais</button>
    <span class="sidebar-label">Estudar</span>
    <button data-screen="explain" aria-current="${screen === 'explain'}">Explicações</button>
    <button data-screen="cards" aria-current="${screen === 'cards'}">Flashcards</button>
    <button data-screen="practice" aria-current="${screen === 'practice'}">Treino</button>
    <button data-screen="revision" aria-current="${screen === 'revision'}">Revisão</button>
    <button data-screen="exam" aria-current="${screen === 'exam'}">Simulado</button>
    <button data-screen="focus" aria-current="${screen === 'focus'}">Foco</button>
    ${state?.admin ? `<button data-screen="admin" aria-current="${screen === 'admin'}">Administração</button>` : ''}
    <button data-screen="settings" aria-current="${screen === 'settings'}">Definições</button>
    <div class="bottom"><button data-action="theme">◐ Tema</button><button data-action="logout">Sair</button></div></aside>
    <main class="app-main">${content}<p class="muted" style="margin-top:55px;font-size:.85rem">Caderno é independente e não é afiliado ao Moodle.</p></main></div>`;
}

const courseName = (id) => state.courses.find((course) => course.id === id)?.name || 'Cadeira';
const isPdf = (file) => file.mime === 'application/pdf' || /\.pdf$/i.test(file.filename || '');
const materialStatus = (file) => file.text_status === 'ok'
  ? `${file.page_count || 0} páginas de texto extraído${file.summary ? ' · resumo pronto' : ' · resumo por criar'}`
  : file.text_status === 'vazio' ? 'PDF sem texto selecionável; pode precisar de OCR'
    : file.text_status === 'privado' ? 'Conteúdo sensível; excluído da IA'
      : file.text_status === 'sem-extracao' ? 'Guardado · análise por IA disponível para PDF'
      : 'Não foi possível extrair o texto; tenta sincronizar novamente';

function today() {
  const selected = state.courses.filter((course) => course.selected);
  const recent = state.files.filter((file) => selected.some((course) => course.id === file.course_id) && file.changed_at > (state.changesSince || Date.now() / 1000 - 7 * 86400)).slice(0, 5);
  const upcoming = state.deadlines.filter((deadline) => selected.some((course) => course.id === deadline.course_id)).slice(0, 5);
  const plan = state.plan;
  shell(`<div class="topline"><div><span class="eyebrow">${new Date().toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' })}</span><h1>Hoje</h1>
    <p class="muted">Um plano simples para avançares, ao teu ritmo.</p></div><button data-action="sync" ${!state.connection ? 'disabled' : ''}>Sincronizar</button></div>
    ${state.sync?.status === 'running' ? '<div class="notice" role="status">A importar materiais do Moodle e a extrair texto dos PDFs. Os materiais aparecem automaticamente quando estiverem prontos.</div>' : ''}
    ${state.connection?.last_error ? `<div class="notice error" role="alert">${esc(state.connection.last_error)}</div>` : ''}
    ${state.connection && selected.length && !state.files.length && state.sync?.status !== 'running' ? '<div class="notice"><strong>As cadeiras já estão ligadas, mas ainda não há PDFs importados.</strong><p>Inicia a sincronização para trazer os materiais do Moodle.</p><button class="primary" data-action="sync">Importar PDFs</button></div>' : ''}
    ${!selected.length ? `<div class="notice"><h2>Começa por uma cadeira</h2><p>Liga o Moodle ou cria uma cadeira para enviares PDFs.</p><button class="primary" data-screen="courses">Escolher cadeira</button></div>` : ''}
    <div class="two today-grid" style="margin-top:24px"><section class="card"><div class="topline" style="margin-bottom:16px"><h2>O que mudou</h2>${recent.length ? '<button data-action="seen">Marcar como visto</button>' : ''}</div>${recent.length ? recent.map((file) => `<div class="item">
      <small>${esc(courseName(file.course_id))} · ${fmt(file.changed_at)}</small><div><a href="/material?id=${encodeURIComponent(file.id)}" target="_blank" rel="noopener">${esc(file.filename)}</a></div>
      <p class="muted">${file.summary ? esc(file.summary) : file.text_status === 'vazio' ? 'PDF sem texto selecionável.' : file.text_status === 'sem-extracao' ? 'Documento guardado para consulta.' : 'Resumo ainda não disponível.'}</p></div>`).join('') : '<div class="empty">Ainda não há alterações recentes.</div>'}</section>
      <section class="stack"><div class="card"><h2>Próximos prazos</h2>${upcoming.length ? upcoming.map((d) => `<div class="item"><small>${esc(courseName(d.course_id))} · ${fmt(d.due_at)}</small><div>${esc(d.title)}</div></div>`).join('') : '<div class="empty">Ainda não há prazos registados.</div>'}</div>
      <div class="card"><h2>Plano de hoje</h2><p class="muted">${plan.studiedToday} min feitos · ${plan.minutes} min disponíveis hoje · ${plan.completed}/${plan.totalMaterials} materiais em dia</p>
      ${plan.blocks.length ? plan.blocks.map((block) => `<div class="item"><small>${esc(block.course)} · ${block.minutes} min · ${block.state === 'a-rever' ? 'revisão' : 'estudo'}</small>
        <div><button data-file="${block.id}" style="border:0;padding:0;text-align:left;font-weight:700">${esc(block.title)}</button></div>
        <p class="muted">${esc(block.summary || (block.questions.length ? `Experimenta: ${block.questions[0].pergunta}` : 'Lê e toma nota dos pontos principais.'))}</p>
        <div class="row"><a class="button" href="/material?id=${encodeURIComponent(block.id)}" target="_blank" rel="noopener">Abrir material</a>
        <button data-study="${block.id}" data-minutes="${block.minutes}" data-result="bem">Percebi</button>
        <button data-study="${block.id}" data-minutes="${block.minutes}" data-result="assim">Mais ou menos</button>
        <button data-study="${block.id}" data-minutes="${block.minutes}" data-result="mal">Preciso de rever</button></div></div>`).join('') : `<div class="empty">${plan.minutes === 0 ? 'Hoje marcaste um dia sem estudo. O plano retoma quando houver tempo.' : plan.totalMaterials ? 'Está tudo em dia. Aproveita para descansar ou rever uma carta.' : 'Adiciona materiais para veres o plano.'}</div>`}
      <p><small>O plano ajusta-se ao que fizeste. Dias sem estudo não criam tarefas em atraso.</small></p><button data-screen="settings">Ajustar tempo</button></div></section></div>
    <section class="card" style="margin-top:18px"><h2>O teu progresso</h2><p>${state.progress.daysThisWeek} dias com estudo nesta semana · ${state.progress.quizCorrect}/${state.progress.quizTotal} respostas de exercícios conseguidas</p>
      ${state.progress.topics.length ? `<div class="row">${state.progress.topics.slice(0, 8).map((topic) => `<span class="tag">${esc(topic)}</span>`).join('')}</div>` : '<p class="muted">Os conceitos estudados aparecem aqui à medida que avanças.</p>'}</section>
    <section class="card" style="margin-top:18px"><h2>Métodos de estudo</h2><div class="method-shortcuts">
      <button data-screen="explain"><strong>Explicações</strong><small>Entender um PDF com fontes</small></button>
      <button data-screen="cards"><strong>Flashcards</strong><small>Rever no momento certo</small></button>
      <button data-screen="practice"><strong>Treino</strong><small>Responder de memória</small></button>
      <button data-screen="revision"><strong>Revisão</strong><small>Resumos por cadeira</small></button>
      <button data-screen="exam"><strong>Simulado</strong><small>Testar sem consultar</small></button>
      <button data-screen="focus"><strong>Foco</strong><small>Estudar por blocos de tempo</small></button></div></section>
    ${plan.forecast?.some((day) => day.allocations.length) ? `<section class="card" style="margin-top:18px"><h2>Os próximos dias</h2><p class="muted">Distribuição indicativa até aos exames. Ajusta-se quando estudares ou mudares a disponibilidade.</p>
      <div class="grid">${plan.forecast.map((day) => `<div class="item"><strong>${new Date(`${day.date}T12:00:00`).toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric' })}</strong><br>
      <small>${day.minutes}/${day.capacity} min planeados</small><div>${day.allocations.map((part) => `<small>${esc(part.course)}: ${part.minutes} min<br></small>`).join('')}</div></div>`).join('')}</div></section>` : ''}
    ${state.sync ? `<p class="muted" style="margin-top:20px">Última sincronização: ${fmt(state.sync.started_at)} · ${esc(state.sync.status === 'ok' ? `${state.sync.new_count} ficheiros novos ou alterados` : state.sync.status)}</p>` : ''}`);
}

function courses() {
  const selected = state.courses.filter((course) => course.selected);
  shell(`<div class="topline"><div><span class="eyebrow">Organização</span><h1>Cadeiras</h1><p class="muted">Escolhe a cadeira que queres acompanhar.</p></div></div>
    ${state.sync?.status === 'running' ? '<div class="notice" role="status">A importar os materiais das cadeiras selecionadas. Esta página atualiza-se automaticamente.</div>' : ''}
    ${state.connection ? `<div class="notice">Moodle ligado: ${esc(state.connection.site_name)}. Os teus ficheiros ficam privados.</div>` : '<div class="notice">Sem ligação ao Moodle. Usa o teu utilizador e palavra-passe abaixo ou envia PDFs manualmente.</div>'}
    ${state.desktop ? `<section class="card" style="margin-top:24px"><h2>Endereço do Moodle</h2><p class="muted">Configura uma vez a raiz HTTPS da tua plataforma. É guardada neste computador.</p>
      <form id="desktop-moodle-form" class="row"><label style="flex:1;min-width:240px">URL do Moodle<input type="url" name="url" value="${esc(state.moodleUrl)}" placeholder="https://moodle.exemplo.pt" required></label><button class="primary" ${state.connection ? 'disabled title="Desliga primeiro o Moodle"' : ''}>Guardar endereço</button></form></section>` : ''}
    <div class="two" style="margin-top:24px"><section class="card"><h2>${state.connection ? 'Ligar ou renovar' : 'Ligar o Moodle'}</h2>
      <p>Usa as credenciais da tua conta Moodle. Se entras através de SSO, esta forma de ligação pode não funcionar.</p>
      <form id="connect-form"><label>Utilizador Moodle<input name="username" type="text" autocomplete="username" maxlength="254" required></label><label>Palavra-passe Moodle<input name="password" type="password" autocomplete="current-password" required></label><button class="primary">Ligar Moodle</button></form>
      <p><small>A palavra-passe é usada para obter uma chave de acesso e não fica guardada.</small></p></section>
      <section class="card"><h2>Sem Moodle</h2><p>Cria uma cadeira e começa com os teus PDFs.</p>
      <form id="manual-course-form"><label>Nome da cadeira<input name="name" maxlength="100" required placeholder="Ex.: Matemática"></label><button>Criar cadeira</button></form></section></div>
    <section class="card" style="margin-top:18px"><h2>As tuas cadeiras</h2>${state.courses.length ? `<form id="course-form">
      ${state.courses.map((course) => `<div class="course-choice"><input id="course-${course.id}" type="checkbox" name="course" value="${course.id}" ${course.selected ? 'checked' : ''}><label for="course-${course.id}">${esc(course.name)} <small>· ${course.source === 'manual' ? 'manual' : 'Moodle'}</small></label></div>`).join('')}
      <p><small>${state.hostedBilling && state.user.plan === 'free' ? 'Plano Grátis: uma cadeira de cada vez. ' : ''}${selected.length ? `Em acompanhamento: ${selected.map((course) => esc(course.name)).join(', ')}.` : ''} Guardar a seleção inicia a importação dos materiais.</small></p><button class="primary">Guardar seleção e importar</button></form>
      <div style="margin-top:28px"><h3>Datas de exame</h3><p class="muted">Ajuda o plano a distribuir o estudo até à prova.</p>
      ${selected.map((course) => `<form class="exam-form row" data-course="${course.id}" style="margin-bottom:12px"><label style="margin:0;flex:1;min-width:200px">${esc(course.name)}<input type="date" name="date" value="${course.exam_at ? new Date(course.exam_at * 1000).toISOString().slice(0, 10) : ''}"></label><button>Guardar data</button></form>`).join('')}</div>` : '<div class="empty">Ainda não tens cadeiras.</div>'}</section>`);
}

function files() {
  const courses = state.courses.filter((course) => course.selected);
  const course = courses.find((item) => item.id === selectedCourse) || courses[0];
  selectedCourse = course?.id || null;
  const files = state.files.filter((file) => file.course_id === selectedCourse);
  shell(`<div class="topline"><div><span class="eyebrow">Biblioteca privada</span><h1>Materiais</h1><p class="muted">Tudo o que tens disponível nesta cadeira.</p></div></div>
    ${state.sync?.status === 'running' ? '<div class="notice" role="status">A importar materiais e a extrair texto dos PDFs. Os ficheiros aparecem aqui quando terminarem.</div>' : ''}
    ${course ? `<div class="row"><label style="margin:0;min-width:220px">Cadeira<select id="file-course">${courses.map((c) => `<option value="${c.id}" ${c.id === selectedCourse ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label></div>
    <div class="two" style="margin-top:22px"><div class="card"><h2>${esc(course.name)}</h2>
      ${files.length ? `<div class="row material-filters"><label>Procurar material<input id="file-search" type="search" placeholder="Nome ou resumo" value="${esc(fileSearch)}"></label>
        <label class="checkbox-label"><input id="favorites-only" type="checkbox" ${favoritesOnly ? 'checked' : ''}> Só favoritos</label></div><div id="materials-no-results" class="empty" hidden>Nenhum material corresponde à pesquisa.</div>` : ''}
      ${files.length ? files.map((file) => `<div class="item material-item" data-favorite="${file.favorite ? 'true' : 'false'}"><div class="material-title-row"><button data-file="${file.id}" style="border:0;padding:0;text-align:left;font-weight:700">${esc(file.filename)}</button><a href="/material?id=${encodeURIComponent(file.id)}" target="_blank" rel="noopener" aria-label="${isPdf(file) ? 'Abrir PDF' : 'Descarregar documento'} ${esc(file.filename)}">↗</a>
      <button class="favorite-button" data-favorite-file="${file.id}" data-favorite="${file.favorite ? 'true' : 'false'}" aria-label="${file.favorite ? 'Retirar' : 'Adicionar'} ${esc(file.filename)} ${file.favorite ? 'dos' : 'aos'} favoritos" aria-pressed="${Boolean(file.favorite)}">${file.favorite ? '★' : '☆'}</button></div>
      <div><small>${Math.round(file.size / 1024)} kB · ${file.source === 'upload' ? 'Enviado por ti' : 'Moodle'} · ${esc(materialStatus(file))}</small></div>
      <p class="muted">${file.summary ? esc(file.summary) : file.text_status === 'privado' ? 'Conteúdo sensível: excluído da análise.' : file.text_status === 'sem-extracao' ? 'Documento guardado. A análise por IA está disponível para PDFs.' : 'Resumo ainda não disponível.'}</p></div>`).join('') : `<div class="empty">${state.sync?.status === 'running' ? 'A importar materiais desta cadeira…' : 'Ainda não há materiais nesta cadeira.'}${course.source === 'moodle' && state.sync?.status !== 'running' ? '<div style="margin-top:14px"><button class="primary" data-action="sync">Importar do Moodle</button></div>' : ''}</div>`}</div>
    <div class="stack"><div class="card"><h2>Enviar material</h2><p>Para apontamentos teus ou quando o Moodle não está disponível.</p><form id="upload-form"><label class="file-input"><span>Escolher ficheiro</span><input name="file" type="file" accept=".pdf,.docx,.pptx,.xlsx,.odt,.odp,.ods,.doc,.ppt,.xls,.txt,.md,.csv,.rtf,.epub,.zip" required><small data-selected-file>Nenhum ficheiro escolhido</small></label><button class="primary">Enviar</button></form><p><small>PDF, Office, OpenDocument, texto, EPUB ou ZIP · até 20 MB. Só os PDFs são analisados por IA.</small></p></div>
    <div class="card"><h2>Perguntar à cadeira</h2><p>Respostas só a partir dos PDFs, com indicação do ficheiro e página.</p>
      ${state.ai?.consented && state.ai?.configured ? `<form id="ask-form"><label>Pergunta<input name="question" required minlength="4" maxlength="1000" placeholder="Ex.: Como se aplica este conceito?"></label><button class="primary">Perguntar</button></form>
      ${answer ? `<div class="notice" style="margin-top:16px"><p>${esc(answer.answer)}</p>${answer.citations?.map((citation) => `<a href="/material?id=${encodeURIComponent(citation.fileId)}#page=${citation.page}" target="_blank" rel="noopener">${esc(citation.filename)}, p. ${citation.page}</a>`).join(' · ') || ''}</div>` : ''}` : '<p class="muted">Ativa a análise por IA nas Definições para fazer perguntas.</p>'}</div></div></div>` : '<div class="empty">Seleciona uma cadeira para ver os materiais. <button data-screen="courses">Escolher cadeira</button></div>'}`);
  updateMaterialFilter();
}

function updateMaterialFilter() {
  const normalize = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-PT');
  const query = normalize(fileSearch.trim());
  const items = [...document.querySelectorAll('.material-item')];
  let visible = 0;
  for (const item of items) {
    if (!(item instanceof HTMLElement)) continue;
    item.hidden = Boolean((favoritesOnly && item.dataset.favorite !== 'true') || (query && !normalize(item.textContent || '').includes(query)));
    if (!item.hidden) visible++;
  }
  const empty = document.querySelector('#materials-no-results');
  if (empty instanceof HTMLElement) empty.hidden = !items.length || visible > 0;
}

function detail() {
  if (!fileDetail) return shell('<div class="loading">A abrir o material…</div>');
  const file = fileDetail;
  shell(`<button data-screen="files">← Materiais</button><div class="topline" style="margin-top:30px"><div><span class="eyebrow">${esc(courseName(file.course_id))}</span><h1>${esc(file.filename)}</h1></div>
    <div class="row"><button data-favorite-file="${file.id}" data-favorite="${file.favorite ? 'true' : 'false'}" aria-pressed="${Boolean(file.favorite)}">${file.favorite ? '★ Guardado' : '☆ Guardar'}</button><a class="button primary" href="/material?id=${encodeURIComponent(file.id)}" target="_blank" rel="noopener">${isPdf(file) ? 'Abrir PDF' : 'Descarregar documento'}</a></div></div>
    ${file.text_status === 'privado' ? '<div class="notice error">Este ficheiro parece conter dados de pessoas e está excluído da análise por IA.</div>' : ''}
    ${file.text_status === 'vazio' ? '<div class="notice">Este PDF não tem texto selecionável. Pode ser uma digitalização que precisa de OCR.</div>' : ''}
    ${file.text_status === 'falhou' ? '<div class="notice error">Falhou a extração de texto. Tenta sincronizar novamente ou abre o PDF para estudar diretamente.</div>' : ''}
    ${file.text_status === 'sem-extracao' ? '<div class="notice">Este documento está guardado na tua pasta de materiais. Abre-o com uma aplicação compatível no teu computador. A extração de texto e a IA estão disponíveis para PDFs.</div>' : ''}
    <div class="two"><section class="card"><h2>Resumo</h2><p>${esc(file.summary || (isPdf(file) ? 'Ainda não há resumo. O PDF continua disponível para estudo.' : 'Este formato não tem resumo automático.'))}</p>
      ${file.text_status === 'ok' && state.ai?.consented && state.ai?.configured ? `<button data-simple="${file.id}" data-course="${file.course_id}">Explica isto de forma simples</button>` : ''}
      ${!file.summary && file.text_status === 'ok' && state.ai?.consented && state.ai?.configured ? `<button data-analyze="${file.id}">Criar resumo com IA</button>` : ''}
      ${file.topics?.length ? `<h3>Conceitos principais</h3><div class="row">${file.topics.map((topic) => `<span class="tag">${esc(topic)}</span>`).join('')}</div>` : ''}
      ${answer ? `<div class="notice" style="margin-top:18px"><p>${esc(answer.answer)}</p>${answer.citations?.map((citation) => `<a href="/material?id=${encodeURIComponent(citation.fileId)}#page=${citation.page}" target="_blank" rel="noopener">${esc(citation.filename)}, p. ${citation.page}</a>`).join(' · ') || ''}</div>` : ''}
      ${file.text_preview && file.text_status === 'ok' ? `<details class="extracted-text"><summary>Ver texto extraído · ${file.page_count || 0} páginas</summary><pre>${esc(file.text_preview)}${file.text_preview.length >= 8000 ? '\n…' : ''}</pre></details>` : ''}</section>
      <section class="card"><h2>Praticar</h2>${file.questions?.length ? file.questions.map((question, index) => `<details class="item"><summary>${esc(question.pergunta)}</summary><p><strong>Resposta:</strong> ${esc(question.resposta)}</p>
        ${question.explicacao ? `<p class="muted">${esc(question.explicacao)}</p>` : ''}
        <div class="row"><button data-quiz="${file.id}" data-index="${index}" data-correct="false">Preciso de rever</button><button data-quiz="${file.id}" data-index="${index}" data-correct="true">Consegui</button></div></details>`).join('') : '<p class="muted">As perguntas aparecem quando a análise estiver disponível.</p>'}</section></div>`);
}

async function loadCards() {
  const query = new URLSearchParams();
  for (const id of cardCourseIds) query.append('course', id);
  cardDeck = await api(`/api/cards${query.size ? `?${query}` : ''}`);
  cardIndex = 0; cardRevealed = false;
  render();
}

function cards() {
  const courses = state.courses.filter((course) => course.selected);
  cardCourseIds = new Set([...cardCourseIds].filter((id) => courses.some((course) => course.id === id)));
  const deck = cardDeck?.cards || [];
  const card = deck[cardIndex];
  shell(`<div class="topline"><div><span class="eyebrow">Revisão espaçada</span><h1>Flashcards</h1><p class="muted">${cardDeck?.totalDue || 0} para rever hoje. As cartas voltam quando for altura de as rever.</p></div></div>
    <section class="card" style="margin-bottom:18px"><h2 style="font-size:1.15rem">Cadeiras deste baralho</h2><div class="row"><button type="button" data-action="cards-all" aria-pressed="${cardCourseIds.size === 0}">Todas</button>
      ${courses.map((course) => `<label class="checkbox-label" style="margin:0"><input type="checkbox" data-card-course="${course.id}" ${cardCourseIds.has(course.id) ? 'checked' : ''}>${esc(course.name)}</label>`).join('')}</div><p class="muted" style="margin-top:12px">Escolhe uma ou várias cadeiras. A seleção não altera o teu progresso.</p></section>
    <div class="card" style="max-width:680px">${card ? `<small>${esc(card.course)} · ${esc(card.filename)} · ${cardIndex + 1}/${deck.length}</small>
      <h2 style="margin-top:22px">${esc(card.pergunta)}</h2>${cardRevealed ? `<div class="notice" style="margin:25px 0">${esc(card.resposta)}</div>
      ${card.explicacao ? `<p class="muted">${esc(card.explicacao)}</p>` : ''}<p><a href="/material?id=${encodeURIComponent(card.fileId)}" target="_blank" rel="noopener">Consultar PDF ↗</a></p>
      <div class="row"><button data-card="mal">Ainda não</button><button data-card="assim">Quase</button><button class="primary" data-card="bem">Percebi</button></div>` : '<button class="primary" data-action="reveal">Mostrar resposta</button>'}` : '<div class="empty">Não há cartas para hoje. Volta quando tiveres novos resumos.</div>'}</div>`);
}

const explainPrompts = {
  simples: 'Explica as ideias principais deste PDF de forma simples, sem perder os conceitos essenciais.',
  exemplo: 'Dá um exemplo prático e explica passo a passo como aplicar o conceito principal deste PDF.',
  feynman: 'Ajuda-me a estudar pelo método Feynman: explica a ideia principal de forma clara e faz uma pergunta para eu a ensinar por palavras minhas.',
  exame: 'Que pontos deste PDF devo dominar para uma prova e como os distinguir de erros comuns?',
};

function citationsHtml(result) {
  return result?.citations?.length ? `<div class="source-links"><strong>Fontes</strong>${result.citations.map((citation) =>
    `<a href="/material?id=${encodeURIComponent(citation.fileId)}#page=${citation.page}" target="_blank" rel="noopener">${esc(citation.filename)}, p. ${citation.page} ↗</a>`).join('')}</div>` : '';
}

function explanations() {
  const courses = state.courses.filter((course) => course.selected);
  const course = courses.find((item) => item.id === explanationCourse) || courses[0];
  explanationCourse = course?.id || null;
  const files = state.files.filter((file) => file.course_id === explanationCourse && file.text_status === 'ok');
  const canExplain = Boolean(state.ai?.configured && state.ai?.consented);
  if (!files.some((file) => file.id === explanationFile)) explanationFile = files[0]?.id || null;
  shell(`<div class="topline"><div><span class="eyebrow">Aprender com as fontes</span><h1>Explicações</h1><p class="muted">Escolhe um PDF, pede uma explicação e abre a página citada para conferir.</p></div></div>
    ${state.analysis?.running ? `<div class="notice" role="status">A criar resumos e perguntas. ${state.analysis.pending} PDF(s) ainda sem análise; esta página atualiza-se automaticamente.</div>` : ''}
    ${state.analysis?.pending && state.ai?.consented && state.ai?.configured && !state.analysis.running ? `<div class="notice"><p>${state.analysis.pending} PDF(s) com texto aguardam análise para gerar resumos e flashcards.</p><button data-action="analyze-pending" ${state.ai.remaining.summaries === 0 ? 'disabled' : ''}>Analisar PDFs pendentes</button></div>` : ''}
    ${!courses.length ? '<div class="empty">Seleciona primeiro uma cadeira. <button data-screen="courses">Escolher cadeira</button></div>' :
    `<div class="study-layout"><section class="card"><div class="row study-selectors"><label>Cadeira<select id="explain-course">${courses.map((item) => `<option value="${item.id}" ${item.id === explanationCourse ? 'selected' : ''}>${esc(item.name)}</option>`).join('')}</select></label>
      <label>PDF com texto<select id="explain-file">${files.map((file) => `<option value="${file.id}" ${file.id === explanationFile ? 'selected' : ''}>${esc(file.filename)}</option>`).join('')}</select></label></div>
      ${state.ai?.configured && !state.ai?.consented ? '<div class="notice"><p>Para criar explicações, permite a análise por IA dos PDFs não sensíveis.</p><button data-action="ai-consent">Permitir análise por IA</button></div>' : ''}
      ${!state.ai?.configured ? '<div class="notice">Configura a tua chave de IA nas Definições. Os PDFs e o texto extraído continuam disponíveis em Materiais.</div>' : ''}
      ${!files.length ? `<div class="empty">${state.sync?.status === 'running' ? 'A importar e extrair os PDFs…' : 'Ainda não há PDFs com texto extraído nesta cadeira.'}<div style="margin-top:14px"><button data-screen="files">Ver materiais</button></div></div>` :
      `<p class="muted">Experimenta uma destas abordagens:</p><div class="prompt-grid">${Object.entries({ simples: 'Explicação simples', exemplo: 'Exemplo prático', feynman: 'Método Feynman', exame: 'Preparar prova' }).map(([key, label]) => `<button data-explain-prompt="${key}" ${canExplain ? '' : 'disabled'}>${label}<span>↗</span></button>`).join('')}</div>
      <form id="explain-form"><label>Ou escreve a tua dúvida<textarea name="question" rows="4" minlength="4" maxlength="1000" required placeholder="Ex.: Como se relacionam os diagramas de casos de uso e os requisitos?"></textarea></label><button class="primary" ${canExplain ? '' : 'disabled'}>Pedir explicação</button></form>`}</section>
      <aside class="card answer-panel"><h2>Explicação</h2>${explanationAnswer ? `<p>${esc(explanationAnswer.answer)}</p>${citationsHtml(explanationAnswer)}` : '<p class="muted">A explicação aparece aqui, com referências às páginas do PDF.</p>'}
      <p><small>${state.ai?.settings ? 'Sem limite interno de perguntas; o fornecedor pode cobrar cada pedido.' : `${state.ai?.remaining?.questions ?? 0} explicações ou perguntas disponíveis este mês.`}</small></p></aside></div>`}`);
}

function practice() {
  const courses = state.courses.filter((course) => course.selected);
  if (!courses.some((course) => course.id === practiceCourse)) practiceCourse = courses[0]?.id || null;
  const questions = practiceDeck?.questions || [];
  const item = questions[practiceIndex];
  shell(`<div class="topline"><div><span class="eyebrow">Recuperação ativa</span><h1>Treino</h1><p class="muted">Tenta responder antes de veres a solução. Marca como correu para acompanhar o teu progresso.</p></div></div>
    ${courses.length ? `<label class="practice-filter">Cadeira<select id="practice-course">${courses.map((course) => `<option value="${course.id}" ${course.id === practiceCourse ? 'selected' : ''}>${esc(course.name)}</option>`).join('')}</select></label>` : ''}
    ${item ? `<div class="study-layout"><section class="card"><div class="row" style="justify-content:space-between"><small>${esc(item.course)} · ${esc(item.filename)}</small><span class="tag">${practiceIndex + 1} / ${questions.length}</span></div>
      <h2 class="study-question">${esc(item.pergunta)}</h2>${!practiceRevealed ? `<label>A tua resposta<textarea id="practice-answer" rows="5" placeholder="Escreve o que recordas, sem consultar o PDF.">${esc(practiceDraft)}</textarea></label><button class="primary" data-action="practice-reveal">Comparar resposta</button>` :
      `<div class="self-answer"><small>A tua resposta</small><p>${esc(practiceDraft || 'Não escreveste uma resposta.')}</p></div><div class="notice"><strong>Resposta de referência</strong><p>${esc(item.resposta)}</p>${item.explicacao ? `<p class="muted">${esc(item.explicacao)}</p>` : ''}</div>
      <div class="row" style="margin-top:18px"><button data-practice-grade="false">Preciso de rever</button><button class="primary" data-practice-grade="true">Consegui explicar</button></div>`}
      <p style="margin-top:20px"><a href="/material?id=${encodeURIComponent(item.fileId)}" target="_blank" rel="noopener">Conferir o PDF ↗</a></p></section>
      <aside class="card method-note"><h3>Como estudar</h3><ol><li>Responde de memória.</li><li>Compara com a solução.</li><li>Volta ao PDF se faltou alguma parte.</li></ol><p><small>Estas perguntas são geradas a partir dos PDFs analisados.</small></p></aside></div>` : `<div class="empty">${practiceDeck ? practiceIndex ? 'Terminaste as perguntas desta sessão.' : 'Ainda não há perguntas nesta cadeira. Analisa os PDFs para as criar.' : 'A carregar perguntas…'}<div style="margin-top:16px"><button data-screen="files">Ver materiais</button></div></div>`}`);
}

function revision() {
  const courses = state.courses.filter((course) => course.selected);
  if (!courses.some((course) => course.id === revisionCourse)) revisionCourse = courses[0]?.id || null;
  const files = state.files.filter((file) => file.course_id === revisionCourse);
  const ready = files.filter((file) => file.summary);
  shell(`<div class="topline"><div><span class="eyebrow">Antes da prova</span><h1>Folha de revisão</h1><p class="muted">Os resumos e conceitos dos teus materiais, reunidos por cadeira. Abre sempre o PDF para conferir detalhes.</p></div></div>
    ${courses.length ? `<label class="practice-filter">Cadeira<select id="revision-course">${courses.map((course) => `<option value="${course.id}" ${course.id === revisionCourse ? 'selected' : ''}>${esc(course.name)}</option>`).join('')}</select></label>` : '<div class="empty">Seleciona uma cadeira para começar.</div>'}
    ${courses.length ? `<p class="muted">${ready.length} de ${files.length} materiais com resumo disponível.</p>
    ${ready.length ? `<div class="stack">${ready.map((file) => {
      let topics = [];
      try { topics = JSON.parse(file.topics_json || '{}').topicos || []; } catch {}
      return `<section class="card revision-item"><div class="row" style="justify-content:space-between"><h2>${esc(file.filename)}</h2><a class="button" href="/material?id=${encodeURIComponent(file.id)}" target="_blank" rel="noopener">Abrir PDF ↗</a></div>
        <p>${esc(file.summary)}</p>${topics.length ? `<div class="row">${topics.map((topic) => `<span class="tag">${esc(topic)}</span>`).join('')}</div>` : ''}</section>`;
    }).join('')}</div>` : '<div class="empty">Ainda não há resumos nesta cadeira. Analisa os PDFs em Materiais para criar a folha de revisão.</div>'}` : ''}`);
}

const examTime = () => {
  const seconds = Math.max(0, Math.ceil(((examEndsAt || Date.now()) - Date.now()) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};

function finishExam() {
  if (!examEndsAt || examCompleted) return;
  const input = document.querySelector('#exam-answer');
  if (input instanceof HTMLTextAreaElement) examAnswers[examIndex] = input.value.trim();
  examCompleted = true; examEndsAt = null;
  clearInterval(examTimer); examTimer = null;
  if (screen === 'exam') render();
}

function exam() {
  const courses = state.courses.filter((course) => course.selected);
  if (!courses.some((course) => course.id === examCourse)) examCourse = courses[0]?.id || null;
  const current = examQuestions[examIndex];
  const graded = Object.values(examGrades).filter(Boolean).length;
  shell(`<div class="topline"><div><span class="eyebrow">Recuperação ativa</span><h1>Simulado</h1><p class="muted">Até 10 perguntas da cadeira. Escreve sem consultar, termina e compara as respostas. O tempo e as respostas desta sessão ficam apenas neste dispositivo.</p></div></div>
    ${courses.length ? `<label class="practice-filter">Cadeira<select id="exam-course" ${examEndsAt ? 'disabled' : ''}>${courses.map((course) => `<option value="${course.id}" ${course.id === examCourse ? 'selected' : ''}>${esc(course.name)}</option>`).join('')}</select></label>` : '<div class="empty">Seleciona uma cadeira para começar.</div>'}
    ${!courses.length ? '' : !examQuestions.length ? '<div class="empty">Ainda não há perguntas nesta cadeira. Analisa os PDFs primeiro.</div>' : !examEndsAt && !examCompleted ? `<section class="card"><h2>Pronto para começar?</h2><p>${examQuestions.length} perguntas · 20 minutos · sem respostas visíveis durante o simulado.</p><button class="primary" data-action="exam-start">Começar simulado</button></section>` :
    examCompleted ? `<p class="muted">${graded} respostas marcadas como conseguidas. Compara cada resposta e regista o que precisas de rever.</p><div class="stack">${examQuestions.map((item, index) => `<section class="card"><small>${index + 1}/${examQuestions.length} · ${esc(item.filename)}</small><h2 class="exam-question">${esc(item.pergunta)}</h2><div class="self-answer"><small>A tua resposta</small><p>${esc(examAnswers[index] || 'Sem resposta.')}</p></div><div class="notice"><strong>Resposta de referência</strong><p>${esc(item.resposta)}</p>${item.explicacao ? `<p>${esc(item.explicacao)}</p>` : ''}</div><p><a href="/material?id=${encodeURIComponent(item.fileId)}" target="_blank" rel="noopener">Conferir PDF ↗</a></p>${Object.hasOwn(examGrades, index) ? `<span class="tag">${examGrades[index] ? 'Consegui explicar' : 'Preciso de rever'}</span>` : `<div class="row"><button data-exam-grade="false" data-exam-index="${index}">Preciso de rever</button><button class="primary" data-exam-grade="true" data-exam-index="${index}">Consegui explicar</button></div>`}</section>`).join('')}</div><button data-action="exam-reset" style="margin-top:18px">Novo simulado</button>` :
    `<section class="card"><div class="row" style="justify-content:space-between"><small>${examIndex + 1}/${examQuestions.length} · ${esc(current.filename)}</small><strong id="exam-clock" aria-live="off">${examTime()}</strong></div><h2 class="study-question">${esc(current.pergunta)}</h2><label>A tua resposta<textarea id="exam-answer" rows="7" placeholder="Escreve o que te lembras, sem consultar o material.">${esc(examAnswers[examIndex] || '')}</textarea></label><div class="row"><button class="primary" data-action="exam-next">${examIndex + 1 === examQuestions.length ? 'Terminar e corrigir' : 'Próxima pergunta'}</button><button data-action="exam-finish">Terminar já</button></div></section>`}`);
}

async function loadExamQuestions() {
  clearInterval(examTimer); examTimer = null;
  examEndsAt = null; examCompleted = false; examIndex = 0; examAnswers = []; examGrades = {};
  if (!examCourse) { examQuestions = []; render(); return; }
  const deck = await api(`/api/practice?course=${encodeURIComponent(examCourse)}`);
  examQuestions = deck.questions.slice(0, 10);
  render();
}

const clockText = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
function tickFocus() {
  if (!focusEndsAt) return;
  focusRemaining = Math.max(0, Math.ceil((focusEndsAt - Date.now()) / 1000));
  const clock = document.querySelector('#focus-clock');
  if (clock) clock.textContent = clockText(focusRemaining);
  if (!focusRemaining) {
    clearInterval(focusTimer); focusTimer = null; focusEndsAt = null;
    if (screen === 'focus') focus();
    flash('Bloco de foco concluído. Regista como correu.');
  }
}

function focus() {
  const files = state.files.filter((file) => state.courses.some((course) => course.id === file.course_id && course.selected));
  if (!files.some((file) => file.id === focusFileId)) focusFileId = files[0]?.id || null;
  const elapsedMinutes = Math.max(5, Math.round((focusDuration - focusRemaining) / 60));
  shell(`<div class="topline"><div><span class="eyebrow">Estudo por blocos</span><h1>Foco</h1><p class="muted">Escolhe um material, estuda durante um bloco sem interrupções e regista o resultado.</p></div></div>
    ${!files.length ? '<div class="empty">Importa ou envia um PDF para iniciar um bloco de foco. <button data-screen="files">Ver materiais</button></div>' :
    `<div class="study-layout"><section class="card focus-card"><div class="row study-selectors"><label>Material<select id="focus-file">${files.map((file) => `<option value="${file.id}" ${file.id === focusFileId ? 'selected' : ''}>${esc(courseName(file.course_id))} · ${esc(file.filename)}</option>`).join('')}</select></label>
      <label>Duração<select id="focus-duration" ${focusEndsAt ? 'disabled' : ''}><option value="15" ${focusDuration === 900 ? 'selected' : ''}>15 minutos</option><option value="25" ${focusDuration === 1500 ? 'selected' : ''}>25 minutos</option><option value="45" ${focusDuration === 2700 ? 'selected' : ''}>45 minutos</option></select></label></div>
      <div id="focus-clock" class="focus-clock" aria-live="off">${clockText(focusRemaining)}</div><p class="muted">Lê, resume com as tuas palavras e anota uma dúvida concreta.</p>
      <div class="row"><button class="primary" data-action="focus-start" ${focusEndsAt ? 'disabled' : ''}>${focusRemaining === focusDuration ? 'Começar' : 'Continuar'}</button><button data-action="focus-pause" ${!focusEndsAt ? 'disabled' : ''}>Pausar</button><button data-action="focus-reset">Recomeçar</button></div>
      ${focusDuration - focusRemaining >= 5 * 60 ? `<div class="focus-log"><h3>Como correu o bloco?</h3><div class="row"><button data-focus-grade="mal" data-minutes="${elapsedMinutes}">Preciso de rever</button><button data-focus-grade="assim" data-minutes="${elapsedMinutes}">Mais ou menos</button><button class="primary" data-focus-grade="bem" data-minutes="${elapsedMinutes}">Percebi</button></div></div>` : ''}</section>
      <aside class="card method-note"><h3>Bloco de foco</h3><p>Trabalha numa tarefa de cada vez. Depois do bloco, faz uma pausa curta e usa o Treino ou os Flashcards para testar o que ficou.</p><button data-screen="practice">Abrir Treino</button></aside></div>`}`);
}

function settings() {
  let perDay;
  try { perDay = JSON.parse(state.preference?.minutes_by_weekday_json || 'null'); } catch { perDay = null; }
  if (!Array.isArray(perDay) || perDay.length !== 7) perDay = Array(7).fill(state.preference?.minutes_per_day ?? 45);
  const days = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  shell(`<div class="topline"><div><span class="eyebrow">A tua conta</span><h1>Definições</h1><p class="muted">${esc(state.user.email)}</p></div></div>
    <section class="card" style="margin-bottom:18px"><h2>Tempo para estudar</h2><p class="muted">Escolhe o tempo de cada dia. Se saltares um dia, o plano recalcula-se automaticamente.</p>
      <form id="time-form"><label>Tempo habitual (minutos)<input type="number" name="minutes" min="0" max="480" value="${state.preference?.minutes_per_day ?? 45}" required></label>
      <div class="grid">${days.map((day, index) => `<label>${day}<input type="number" name="day-${index}" min="0" max="480" value="${perDay[index]}" required></label>`).join('')}</div>
      <button class="primary">Guardar tempo</button></form></section>
    <section class="card" style="margin-bottom:18px"><h2>Análise por IA</h2><p>Resumos, perguntas e explicações usam o texto dos PDFs. PDFs marcados como sensíveis não são enviados. Podes retirar esta autorização a qualquer momento.</p>
      <p class="muted">${state.ai?.settings ? 'Usas a tua própria chave. O fornecedor cobra os pedidos segundo o teu contrato; a app não impõe uma quota de IA.' : state.ai?.configured ? `Este mês ainda tens ${state.ai.remaining.summaries} resumos e ${state.ai.remaining.questions} perguntas.` : 'Configura a tua chave abaixo para ativar a IA.'}</p>
      <button data-action="ai-consent">${state.ai?.consented ? 'Desativar análise' : 'Permitir análise por IA'}</button></section>
    <section class="card" style="margin-bottom:18px"><h2>A tua chave de IA</h2><p>Escolhe o fornecedor e os modelos. A chave fica cifrada no servidor e nunca volta a aparecer nesta página. Guardar uma configuração nova invalida os resumos anteriores; podes voltar a gerá-los.</p>
      <form id="ai-settings-form" autocomplete="off"><label>Fornecedor<select name="provider" required>
        ${[['anthropic','Anthropic'],['openai','OpenAI'],['deepseek','DeepSeek'],['groq','Groq'],['compatible','Outro compatível com OpenAI']].map(([value,label]) => `<option value="${value}" ${state.ai?.settings?.provider === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
        <label>Chave de API<input name="apiKey" type="password" minlength="8" maxlength="2048" placeholder="${state.ai?.settings ? 'Deixa vazio para manter a chave atual' : 'Chave do fornecedor'}" ${state.ai?.settings ? '' : 'required'} autocomplete="new-password"></label>
        <div class="grid"><label>Modelo para resumos<input name="summaryModel" value="${esc(state.ai?.settings?.summary_model || '')}" placeholder="ID do modelo" required maxlength="120"></label>
        <label>Modelo para explicações<input name="explainModel" value="${esc(state.ai?.settings?.explain_model || '')}" placeholder="ID do modelo" required maxlength="120"></label></div>
        <label>URL base do endpoint compatível<input name="baseUrl" type="url" value="${esc(state.ai?.settings?.base_url || '')}" placeholder="https://api.exemplo.com/v1"><small>${state.desktop ? 'Só é usada para “Outro compatível”. Introduz a URL HTTPS indicada pelo fornecedor.' : 'Só é usada para “Outro compatível”. O operador tem de autorizar esta URL em AI_ALLOWED_BASE_URLS.'}</small></label>
        <div class="row"><button class="primary">Guardar configuração</button>${state.ai?.settings ? '<button type="button" data-action="ai-key-delete">Remover chave</button>' : ''}</div></form></section>
    <section class="card" style="margin-bottom:18px"><h2>Email da conta e resumo diário</h2><p>Confirma o email e, se quiseres, recebe o plano e os próximos prazos à hora que escolheres.</p>
      ${state.digestAvailable && !state.user.email_verified_at ? `<p class="muted">Confirma primeiro o teu email.</p><button data-action="request-email-code">Enviar código de confirmação</button>
        <form id="verify-email-form" style="margin-top:16px"><label>Código de 6 dígitos<input name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required></label><button>Confirmar email</button></form>` : ''}
      ${state.digestAvailable && state.user.email_verified_at ? `<form id="digest-form" class="row"><label style="min-width:180px">Enviar<select name="channel"><option value="off" ${state.preference?.digest_channel !== 'email' ? 'selected' : ''}>Não enviar</option><option value="email" ${state.preference?.digest_channel === 'email' ? 'selected' : ''}>Por email</option></select></label>
      <label style="min-width:120px">Hora de Lisboa<select name="hour">${Array.from({ length: 24 }, (_, hour) => `<option value="${hour}" ${Number(state.preference?.digest_hour) === hour ? 'selected' : ''}>${String(hour).padStart(2, '0')}:00</option>`).join('')}</select></label><button>Guardar</button></form>` : state.digestAvailable ? '' : '<p class="muted">O envio de email ainda não está configurado neste servidor.</p>'}</section>
    ${state.hostedBilling ? `<section class="card" style="margin-bottom:18px"><h2>Plano</h2><p>${state.user.complimentary ? 'Estudante · acesso de cortesia, sem cobrança' : state.user.plan === 'student' ? 'Estudante · €2,99 por mês' : 'Grátis · uma cadeira'}</p>
      ${state.user.complimentaryPending ? `<p class="notice">Tens uma oferta Estudante reservada. Confirma o email da conta para a ativar.${state.digestAvailable ? ' Usa o código de confirmação na secção acima.' : ' O envio do código ainda não está configurado neste servidor.'}</p>` : ''}
      ${state.user.stripeSubscription ? '<button data-action="portal">Gerir assinatura no Stripe</button>' : state.user.complimentary ? '<p class="muted">Este acesso não é uma assinatura Stripe.</p>' : state.billingAvailable ? '<button class="primary" data-action="checkout">Aderir ao Estudante</button>' : '<p class="muted">O plano Estudante estará disponível depois de configurados os pagamentos.</p>'}</section>` : ''}
    <div class="two"><section class="card"><h2>Dados e privacidade</h2><p>Os PDFs e os dados de estudo são privados da tua conta.</p>
      <div class="row"><a class="button" href="/api/export" download>Exportar todos os dados</a>
      ${state.connection ? '<button data-action="disconnect">Desligar Moodle</button>' : ''}</div>
      <p><small>Desligar elimina a chave guardada aqui. Para a revogar no Moodle, usa a página de Chaves de segurança.</small></p></section>
      <section class="card"><h2>Apagar conta</h2><p>Elimina a conta, os PDFs, os resumos e o histórico de estudo. Esta ação é definitiva.</p>
      <form id="delete-form"><label>Confirma com a tua palavra-passe<input name="password" type="password" autocomplete="current-password" required></label><button class="danger">Apagar conta e dados</button></form></section></div>`);
}

function legal(kind) {
  const privacy = kind === 'privacy';
  root.innerHTML = `${header()}<main class="wrap legal"><span class="eyebrow">Caderno</span><h1>${privacy ? 'Privacidade' : 'Termos de utilização'}</h1>
    ${privacy ? `<p>O Caderno trata o email da conta, a chave Moodle cifrada, os PDFs que escolhes, os resumos e o progresso de estudo para prestar o serviço. Os materiais são privados da tua conta.</p>
      <h2>Ligação ao Moodle</h2><p>Recebemos o utilizador e a palavra-passe Moodle para obter uma chave de acesso. Não guardamos a palavra-passe; guardamos a chave cifrada para ler os cursos e ficheiros a que já tens acesso. Podes desligar a ligação; para revogar a chave, usa a página de Chaves de segurança no Moodle.</p>
      <h2>Os teus direitos</h2><p>Nas Definições podes exportar os dados e apagar a conta com os ficheiros. A aplicação deve ser alojada na UE antes de aceitar estudantes. O responsável pelo tratamento e o contacto devem ser preenchidos antes da publicação.</p>
      <h2>IA</h2><p>Só depois da tua autorização nas Definições enviamos texto extraível de PDFs não classificados como sensíveis ao fornecedor de IA escolhido. A tua chave fica cifrada no servidor, não aparece na exportação e é apagada quando a removes ou apagas a conta. O fornecedor pode cobrar os pedidos e tratar os dados segundo a sua política. Podes retirar a autorização quando quiseres.</p>
      ${publicConfig.hostedBilling ? '<h2>Pagamentos</h2><p>Se aderires ao plano Estudante, o Stripe trata os dados de pagamento. Guardamos apenas identificadores, estado da assinatura e eventos necessários para gerir o plano. Alguns registos de faturação poderão ter de ser conservados pelo prestador de pagamentos conforme a lei aplicável. O acesso de cortesia não cria uma cobrança.</p>' : ''}` : `<p>O Caderno é uma ferramenta de estudo independente, sem afiliação ao Moodle. O acesso aos materiais continua sujeito às permissões da tua conta Moodle.</p>
      <p>Usa apenas materiais a que tens direito de acesso. Os resumos ajudam a estudar, mas podem conter erros: confirma sempre a fonte.</p>
      <p>${publicConfig.hostedBilling ? publicConfig.billingAvailable ? 'O plano Estudante custa €2,99 por mês e é gerido no portal Stripe. Os limites dos planos aparecem nas Definições.' : 'Os pagamentos ainda não estão disponíveis.' : 'Esta instalação de código aberto não cobra assinatura. A tua chave de IA pode ter custos junto do fornecedor.'} Os termos finais, o responsável pelo serviço e os contactos devem ser revistos antes da publicação.</p>`}
    <p><a href="/">Voltar ao início</a></p></main>${footer()}`;
}

function admin() {
  const rows = adminData?.costs || [];
  shell(`<span class="eyebrow">Operação</span><h1>Custos de IA</h1><p class="muted">Estimativa com as tarifas configuradas no servidor; confirma os valores com a fatura do fornecedor.</p>
    <div class="card">${rows.length ? rows.map((row) => `<div class="item"><strong>${esc(row.email)}</strong> · ${esc(row.month)}<br>
      <small>${row.requests} pedidos · ${row.input_tokens} tokens entrada · ${row.output_tokens} saída · US$ ${Number(row.cost_usd).toFixed(4)}</small></div>`).join('') : '<div class="empty">Ainda não houve chamadas à IA.</div>'}</div>`);
}

function render() {
  document.documentElement.dataset.theme = localStorage.getItem('caderno-theme') || 'dark';
  if (screen === 'privacy' || screen === 'terms') return legal(screen);
  if (screen === 'landing') return landing();
  if (!state) return auth();
  if (screen === 'courses') return courses();
  if (screen === 'files') return files();
  if (screen === 'detail') return detail();
  if (screen === 'explain') return explanations();
  if (screen === 'cards') return cards();
  if (screen === 'practice') return practice();
  if (screen === 'revision') return revision();
  if (screen === 'exam') return exam();
  if (screen === 'focus') return focus();
  if (screen === 'admin') return admin();
  if (screen === 'settings') return settings();
  return today();
}

async function action(target) {
  const name = target.dataset.action;
  if (name === 'theme') {
    localStorage.setItem('caderno-theme', document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); render();
  } else if (name === 'open-app') {
    history.pushState({}, '', '/app'); screen = 'today'; render();
  } else if (name === 'swap-auth') {
    authMode = authMode === 'register' ? 'login' : 'register'; render();
  } else if (name === 'logout') {
    await post('/api/logout', {}); state = null; screen = 'today'; render();
  } else if (name === 'sync') {
    target.disabled = true; flash('A sincronizar com o Moodle…');
    try { const result = await post('/api/sync', {}); flash(result.status === 'running' ? 'Sincronização em curso.' : result.warning || `${result.newCount} ficheiros novos ou alterados.`); await refresh(); }
    finally { target.disabled = false; }
  } else if (name === 'seen') {
    await post('/api/seen', {}); await refresh();
  } else if (name === 'reveal') {
    cardRevealed = true; render();
  } else if (name === 'practice-reveal') {
    const input = document.querySelector('#practice-answer');
    practiceDraft = input instanceof HTMLTextAreaElement ? input.value.trim() : '';
    practiceRevealed = true; render();
  } else if (name === 'cards-all') {
    cardCourseIds.clear(); cardDeck = null; await loadCards();
  } else if (name === 'exam-start') {
    examAnswers = Array(examQuestions.length).fill(''); examGrades = {}; examIndex = 0;
    examCompleted = false; examEndsAt = Date.now() + 20 * 60 * 1000;
    clearInterval(examTimer);
    examTimer = setInterval(() => {
      if (Date.now() >= examEndsAt) return finishExam();
      const clock = document.querySelector('#exam-clock');
      if (clock) clock.textContent = examTime();
    }, 1000);
    render();
  } else if (name === 'exam-next') {
    const input = document.querySelector('#exam-answer');
    if (input instanceof HTMLTextAreaElement) examAnswers[examIndex] = input.value.trim();
    if (examIndex + 1 >= examQuestions.length) finishExam();
    else { examIndex++; render(); }
  } else if (name === 'exam-finish') {
    finishExam();
  } else if (name === 'exam-reset') {
    await loadExamQuestions();
  } else if (name === 'focus-start') {
    focusEndsAt = Date.now() + focusRemaining * 1000;
    focusTimer = setInterval(tickFocus, 1000);
    render();
  } else if (name === 'focus-pause') {
    tickFocus(); clearInterval(focusTimer); focusTimer = null; focusEndsAt = null; render();
  } else if (name === 'focus-reset') {
    clearInterval(focusTimer); focusTimer = null; focusEndsAt = null; focusRemaining = focusDuration; render();
  } else if (name === 'ai-consent') {
    const enabled = !state.ai.consented;
    await post('/api/ai-consent', { enabled });
    flash(enabled ? state.ai?.settings ? 'Análise autorizada. Escolhe os PDFs que queres analisar ou usa a fila de pendentes.' : 'Análise autorizada. Os PDFs com texto serão analisados dentro do limite mensal.' : 'Análise desativada.');
    await refresh();
  } else if (name === 'ai-key-delete') {
    if (!confirm('Remover a chave de IA desta conta? Os resumos anteriores serão eliminados.')) return;
    await api('/api/ai-settings', { method: 'DELETE' });
    flash('Chave removida.'); await refresh();
  } else if (name === 'analyze-pending') {
    await post('/api/analyze-pending', {});
    flash('A analisar os PDFs pendentes.'); await refresh();
  } else if (name === 'request-email-code') {
    await post('/api/request-email-code', {}); flash('Código enviado para o email da conta.');
  } else if (name === 'checkout' || name === 'portal') {
    const result = await post(name === 'checkout' ? '/api/checkout' : '/api/portal', {});
    location.assign(result.url);
  } else if (name === 'disconnect') {
    if (!confirm('Desligar o Moodle desta conta? Os materiais já guardados permanecem.')) return;
    const result = await post('/api/disconnect', {});
    flash('Ligação desligada. Revoga a chave na página de Chaves de segurança do Moodle.');
    window.open(result.revokeUrl, '_blank', 'noopener'); await refresh();
  } else if (name === 'privacy' || name === 'terms') {
    history.pushState({}, '', target.getAttribute('href')); screen = name; render();
  }
}

document.addEventListener('click', async (event) => {
  const target = event.target instanceof Element ? event.target.closest('[data-action],[data-screen],[data-file],[data-study],[data-card],[data-analyze],[data-quiz],[data-simple],[data-favorite-file],[data-explain-prompt],[data-practice-grade],[data-focus-grade],[data-exam-grade]') : null;
  if (!target) return;
  if (!(target instanceof HTMLElement)) return;
  event.preventDefault();
  try {
    if (target.dataset.examGrade) {
      const index = Number(target.dataset.examIndex);
      const item = examQuestions[index];
      if (!examCompleted || !item || Object.hasOwn(examGrades, index)) return;
      const correct = target.dataset.examGrade === 'true';
      await post('/api/quiz', { fileId: item.fileId, index: item.index, correct });
      examGrades[index] = correct;
      render();
    } else if (target.dataset.explainPrompt) {
      if (!(target instanceof HTMLButtonElement)) return;
      if (!state.ai?.configured || !state.ai?.consented) throw new Error('Ativa primeiro a análise por IA.');
      if (!explanationFile) throw new Error('Escolhe um PDF com texto extraído.');
      target.disabled = true;
      try { explanationAnswer = await post('/api/ask', { courseId: explanationCourse, fileId: explanationFile,
        question: explainPrompts[target.dataset.explainPrompt] }); }
      finally { target.disabled = false; }
      render();
    } else if (target.dataset.practiceGrade) {
      const item = practiceDeck?.questions?.[practiceIndex];
      if (!item) return;
      await post('/api/quiz', { fileId: item.fileId, index: item.index, correct: target.dataset.practiceGrade === 'true' });
      practiceIndex++; practiceRevealed = false; practiceDraft = '';
      await refresh();
    } else if (target.dataset.focusGrade) {
      if (!focusFileId) return;
      await post('/api/study', { fileId: focusFileId, minutes: Number(target.dataset.minutes), result: target.dataset.focusGrade });
      clearInterval(focusTimer); focusTimer = null; focusEndsAt = null; focusRemaining = focusDuration;
      flash('Bloco registado no plano de estudo.'); await refresh();
    } else if (target.dataset.favoriteFile) {
      const favorite = target.dataset.favorite !== 'true';
      await post('/api/favorite', { fileId: target.dataset.favoriteFile, favorite });
      if (fileDetail?.id === target.dataset.favoriteFile) fileDetail.favorite = favorite ? 1 : 0;
      await refresh();
    } else if (target.dataset.simple) {
      answer = await post('/api/ask', { courseId: target.dataset.course, fileId: target.dataset.simple,
        question: 'Explica de forma simples as ideias principais deste documento, com um exemplo prático.' });
      render();
    } else if (target.dataset.quiz) {
      await post('/api/quiz', { fileId: target.dataset.quiz, index: Number(target.dataset.index), correct: target.dataset.correct === 'true' });
      flash('Resposta registada.'); await refresh();
    } else if (target.dataset.analyze) {
      target.setAttribute('disabled', ''); flash('A criar o resumo…');
      await post('/api/analyze', { fileId: target.dataset.analyze });
      fileDetail = await api(`/api/file?id=${encodeURIComponent(target.dataset.analyze)}`); await refresh();
    } else if (target.dataset.file) {
      screen = 'detail'; fileDetail = null; answer = null; render();
      fileDetail = await api(`/api/file?id=${encodeURIComponent(target.dataset.file)}`); render();
    } else if (target.dataset.study) {
      await post('/api/study', { fileId: target.dataset.study, minutes: Number(target.dataset.minutes), result: target.dataset.result });
      flash('Estudo registado. O plano foi ajustado.'); await refresh();
    } else if (target.dataset.card) {
      const card = cardDeck.cards[cardIndex];
      await post('/api/card', { fileId: card.fileId, index: card.index, result: target.dataset.card });
      cardIndex++; cardRevealed = false; render();
    } else if (target.dataset.screen) {
      screen = target.dataset.screen; history.replaceState({}, '', '/app');
      if (screen === 'cards') await loadCards();
      if (screen === 'practice') {
        practiceCourse = state.courses.find((course) => course.selected)?.id || null;
        practiceDeck = await api(`/api/practice?course=${encodeURIComponent(practiceCourse || '')}`);
        practiceIndex = 0; practiceRevealed = false; practiceDraft = '';
      }
      if (screen === 'exam' && !examEndsAt && !examCompleted) {
        examCourse = state.courses.find((course) => course.selected)?.id || null;
        await loadExamQuestions();
      }
      if (screen === 'admin') adminData = await api('/api/admin');
      render();
    } else await action(target);
  }
  catch (error) { flash(error.message); }
});

document.addEventListener('submit', async (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();
  const button = form.querySelector('button[type=submit],button:not([type])');
  if (button instanceof HTMLButtonElement) button.disabled = true;
  try {
    const data = new FormData(form);
    if (form.id === 'auth-form') {
      await post(authMode === 'register' ? '/api/register' : '/api/login', { email: data.get('email'), password: data.get('password') });
      screen = 'today'; history.replaceState({}, '', '/app'); await refresh();
    } else if (form.id === 'desktop-moodle-form') {
      await post('/api/desktop/moodle-url', { url: data.get('url') }); flash('Endereço do Moodle guardado neste computador.'); await refresh();
    } else if (form.id === 'connect-form') {
      const result = await post('/api/connect', { username: data.get('username'), password: data.get('password') });
      form.reset(); flash(`${result.count} cadeiras encontradas. Escolhe a que queres seguir.`); await refresh();
    } else if (form.id === 'manual-course-form') {
      await post('/api/manual-course', { name: data.get('name') }); flash('Cadeira criada.'); await refresh();
    } else if (form.id === 'course-form') {
      await post('/api/courses', { selected: data.getAll('course') }); flash('Seleção guardada. A importar os materiais das cadeiras Moodle.'); await refresh();
    } else if (form.classList.contains('exam-form')) {
      await post('/api/exam', { courseId: form.dataset.course, date: data.get('date') }); flash('Data de exame guardada.'); await refresh();
    } else if (form.id === 'time-form') {
      await post('/api/preferences', { minutes: Number(data.get('minutes')),
        weekdays: Array.from({ length: 7 }, (_, index) => Number(data.get(`day-${index}`))) });
      flash('Tempo de estudo guardado.'); await refresh();
    } else if (form.id === 'ai-settings-form') {
      await post('/api/ai-settings', { provider: data.get('provider'), apiKey: data.get('apiKey'),
        summaryModel: data.get('summaryModel'), explainModel: data.get('explainModel'), baseUrl: data.get('baseUrl') });
      form.reset(); flash('Configuração de IA guardada.'); await refresh();
    } else if (form.id === 'ask-form') {
      answer = await post('/api/ask', { courseId: selectedCourse, question: data.get('question') });
      render();
    } else if (form.id === 'explain-form') {
      if (!state.ai?.configured || !state.ai?.consented) throw new Error('Ativa primeiro a análise por IA.');
      explanationAnswer = await post('/api/ask', { courseId: explanationCourse, fileId: explanationFile,
        question: data.get('question') });
      render();
    } else if (form.id === 'digest-form') {
      await post('/api/digest', { channel: data.get('channel'), hour: Number(data.get('hour')) });
      flash('Preferência de email guardada.'); await refresh();
    } else if (form.id === 'verify-email-form') {
      await post('/api/verify-email', { code: data.get('code') });
      flash('Email confirmado.'); await refresh();
    } else if (form.id === 'upload-form') {
      const file = data.get('file');
      if (!(file instanceof File) || file.size > 20 * 1024 * 1024) throw new Error('Escolhe um ficheiro até 20 MB.');
      await api(`/api/upload?course=${encodeURIComponent(selectedCourse)}`, { method: 'POST', headers: { 'content-type': 'application/octet-stream', 'x-filename': encodeURIComponent(file.name) }, body: file });
      flash('Material guardado.'); await refresh();
    } else if (form.id === 'delete-form') {
      if (!confirm('Apagar definitivamente a conta e todos os dados?')) return;
      await post('/api/delete-account', { password: data.get('password') }); state = null; screen = 'landing'; history.replaceState({}, '', '/'); render(); flash('Conta apagada.');
    }
  } catch (error) { flash(error.message); }
  finally { if (button instanceof HTMLButtonElement) button.disabled = false; }
});

document.addEventListener('input', (event) => {
  if (event.target instanceof HTMLInputElement && event.target.id === 'file-search') {
    fileSearch = event.target.value;
    updateMaterialFilter();
  }
});
document.addEventListener('change', async (event) => {
  if (event.target instanceof HTMLInputElement && event.target.dataset.cardCourse) {
    if (event.target.checked) cardCourseIds.add(event.target.dataset.cardCourse);
    else cardCourseIds.delete(event.target.dataset.cardCourse);
    cardDeck = null;
    try { await loadCards(); } catch (error) { flash(error.message); }
  }
  if (event.target instanceof HTMLSelectElement && event.target.id === 'file-course') { selectedCourse = event.target.value; render(); }
  if (event.target instanceof HTMLSelectElement && event.target.id === 'explain-course') {
    explanationCourse = event.target.value; explanationFile = null; explanationAnswer = null; render();
  }
  if (event.target instanceof HTMLSelectElement && event.target.id === 'explain-file') {
    explanationFile = event.target.value; explanationAnswer = null; render();
  }
  if (event.target instanceof HTMLSelectElement && event.target.id === 'practice-course') {
    practiceCourse = event.target.value; practiceDeck = null; practiceIndex = 0; practiceRevealed = false; practiceDraft = ''; render();
    try { practiceDeck = await api(`/api/practice?course=${encodeURIComponent(practiceCourse)}`); render(); }
    catch (error) { flash(error.message); }
  }
  if (event.target instanceof HTMLSelectElement && event.target.id === 'revision-course') {
    revisionCourse = event.target.value; render();
  }
  if (event.target instanceof HTMLSelectElement && event.target.id === 'exam-course') {
    examCourse = event.target.value;
    try { await loadExamQuestions(); } catch (error) { flash(error.message); }
  }
  if (event.target instanceof HTMLSelectElement && event.target.id === 'focus-file') focusFileId = event.target.value;
  if (event.target instanceof HTMLSelectElement && event.target.id === 'focus-duration') {
    focusDuration = Number(event.target.value) * 60; focusRemaining = focusDuration; render();
  }
  if (event.target instanceof HTMLInputElement && event.target.id === 'favorites-only') {
    favoritesOnly = event.target.checked;
    updateMaterialFilter();
  }
  if (event.target instanceof HTMLInputElement && event.target.type === 'file') {
    const label = event.target.closest('.file-input');
    const name = label?.querySelector('[data-selected-file]');
    if (name) name.textContent = event.target.files?.[0]?.name || 'Nenhum ficheiro escolhido';
  }
});
window.addEventListener('popstate', () => { screen = location.pathname === '/privacidade' ? 'privacy' : location.pathname === '/termos' ? 'terms' : location.pathname === '/app' ? 'today' : 'landing'; render(); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
if (location.pathname === '/privacidade') screen = 'privacy';
if (location.pathname === '/termos') screen = 'terms';
try { await refresh(); }
catch (error) { root.innerHTML = `<div class="wrap legal"><h1>Não foi possível abrir o Caderno.</h1><p>${esc(error.message)}</p><button onclick="location.reload()">Tentar novamente</button></div>`; }
