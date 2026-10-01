const root = document.querySelector('#root');
const live = document.querySelector('#live');
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (seconds) => new Date(seconds * 1000).toLocaleDateString('pt-PT', { day: 'numeric', month: 'long' });
const flash = (message) => { live.textContent = message; setTimeout(() => { if (live.textContent === message) live.textContent = ''; }, 6000); };
let state = null;
let screen = 'today';
let authMode = 'register';
let guideStep = 0;
let selectedCourse = null;
let fileDetail = null;
let cardDeck = null;
let cardIndex = 0;
let cardRevealed = false;
let cardCourseIds = new Set();
let answer = null;
let fileSearch = '';
let favoritesOnly = false;
let syncPoll = null;
let explanationAnswer = null;
let explanationCourse = null;
let explanationFile = null;
let explanationLoading = null;
let explanationError = null;
// Pedidos demorados em curso (IA, análise) e quando começaram, para mostrar o tempo que já passou.
const busy = new Map();
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

// Na app Windows o tema fica no perfil: a porta local muda a cada arranque e o localStorage não persiste.
function currentTheme() {
  if (state?.preference?.theme) return state.preference.theme;
  try { return localStorage.getItem('caderno-theme') || 'dark'; } catch { return 'dark'; }
}

const pageHead = (title, lead = '', actions = '', kicker = '') => `<header class="page-head"><div>
  ${kicker ? `<p class="page-kicker">${kicker}</p>` : ''}<h1>${title}</h1>${lead ? `<p class="page-lead">${lead}</p>` : ''}</div>
  ${actions ? `<div class="page-actions">${actions}</div>` : ''}</header>`;
const courseName = (id) => state.courses.find((course) => course.id === id)?.name || 'Cadeira';
const fileById = (id) => state.files.find((file) => file.id === id);
const isPdf = (file) => file.mime === 'application/pdf' || /\.pdf$/i.test(file.filename || '');
const materialHref = (id, page) => `/material?id=${encodeURIComponent(id)}${page ? `#page=${page}` : ''}`;
const materialStatus = (file) => file.text_status === 'ok'
  ? `${file.page_count || 0} páginas de texto${file.summary ? ' · resumo pronto' : ' · sem resumo'}`
  : file.text_status === 'vazio' ? 'PDF sem texto selecionável; pode precisar de OCR'
    : file.text_status === 'privado' ? 'Conteúdo sensível; excluído da IA'
      : file.text_status === 'sem-extracao' ? 'Guardado na pasta da cadeira'
        : 'Não foi possível extrair o texto; tenta sincronizar novamente';

// PDFs abrem no visualizador do Caderno; os outros formatos abrem no programa do Windows.
function openButton(file, label = '', className = 'button') {
  if (state.desktop && file && !isPdf(file)) return `<button class="${className}" data-open-file="${file.id}">${label || 'Abrir no Windows'}</button>`;
  return `<a class="${className}" href="${materialHref(file?.id)}" target="_blank" rel="noopener">${label || (file && !isPdf(file) ? 'Descarregar' : 'Abrir PDF')}</a>`;
}
// Markdown simples das respostas da IA. O texto é escapado antes de qualquer marcação.
function md(text, citations = []) {
  const refs = new Map(citations.map((citation) => [citation.ref, citation]));
  const inline = (line) => line
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])[*_]([^*_\s][^*_]*?)[*_](?=[\s).,;:!?]|$)/g, '$1<em>$2</em>')
    .replace(/\s?\[(\d+(?:\s*[,;]\s*\d+)*)\]/g, (_, list) => list.split(/[,;]/).map((n) => refs.get(Number(n))).filter(Boolean)
      .map((citation) => ` <a class="cite" href="${materialHref(citation.fileId, citation.page)}" target="_blank" rel="noopener" title="Abrir ${esc(citation.filename)} na página ${citation.page}">p.&nbsp;${citation.page}</a>`).join(''));
  const html = [];
  let list = null, code = null, para = [];
  const closePara = () => { if (para.length) html.push(`<p>${inline(para.join(' '))}</p>`); para = []; };
  const closeList = () => { if (list) html.push(`</${list}>`); list = null; };
  for (const raw of esc(text).split('\n')) {
    if (code) { if (raw.trim().startsWith('```')) { html.push(`<pre><code>${code.slice(1).join('\n')}</code></pre>`); code = null; } else code.push(raw); continue; }
    const line = raw.trim();
    const heading = line.match(/^#{1,4}\s+(.*)/), bullet = line.match(/^[-*•]\s+(.*)/), numbered = line.match(/^\d+[.)]\s+(.*)/);
    if (line.startsWith('```')) { closePara(); closeList(); code = ['']; }
    else if (!line) { closePara(); closeList(); }
    else if (heading) { closePara(); closeList(); html.push(`<h3>${inline(heading[1].replace(/\*\*/g, ''))}</h3>`); }
    else if (bullet || numbered) {
      const tag = bullet ? 'ul' : 'ol';
      closePara();
      if (list !== tag) { closeList(); html.push(`<${tag}>`); list = tag; }
      html.push(`<li>${inline((bullet || numbered)[1])}</li>`);
    } else { closeList(); para.push(line); }
  }
  if (code) html.push(`<pre><code>${code.slice(1).join('\n')}</code></pre>`);
  closePara(); closeList();
  return html.join('');
}
const plainAnswer = (text) => String(text).replace(/\s?\[\d+(?:\s*[,;]\s*\d+)*\]/g, '');

const typeLabels = { slides: 'Diapositivos', 'ficha-exercicios': 'Ficha de exercícios', apontamentos: 'Apontamentos', exame: 'Exame', outro: 'Documento' };
function analysisOf(file) {
  let data = {};
  try { data = JSON.parse(file?.topics_json || '{}') || {}; } catch {}
  return { topics: data.topicos || [], keyPoints: data.pontos_chave || [], concepts: data.conceitos || [], minutes: data.minutos_estudo, type: data.tipo };
}

// O resumo de um PDF: frase de abertura, o que reter, conceitos com definição e tópicos.
function digest(file, { topicButtons = false, redoHint = true } = {}) {
  const info = analysisOf(file);
  const meta = [typeLabels[info.type], file.page_count ? `${file.page_count} páginas` : '', info.minutes ? `cerca de ${info.minutes} min de estudo` : ''].filter(Boolean);
  const canRedo = redoHint && state.ai?.configured && state.ai?.consented;
  return `<div class="digest">${meta.length ? `<p class="meta">${meta.join(' · ')}</p>` : ''}
    <p class="digest-lead">${esc(file.summary)}</p>
    ${info.keyPoints.length || info.concepts.length ? `<div class="digest-grid">
      ${info.keyPoints.length ? `<section><h3>A reter</h3><ul class="keypoints">${info.keyPoints.map((point) => `<li>${esc(point)}</li>`).join('')}</ul></section>` : ''}
      ${info.concepts.length ? `<section><h3>Conceitos</h3><dl class="concepts">${info.concepts.map((concept) => `<div><dt>${esc(concept.termo)}</dt><dd>${esc(concept.definicao)}</dd></div>`).join('')}</dl></section>` : ''}</div>`
      : canRedo ? `<p class="hint">Este resumo é da versão anterior. <button class="link-button" data-analyze="${file.id}" data-force="true">Refazer o resumo</button> para teres os pontos a reter e os conceitos com definição.</p>` : ''}
    ${info.topics.length ? `<div class="tags">${info.topics.map((topic) => topicButtons
      ? `<button class="tag" data-explain-topic="${esc(topic)}" title="Pedir uma explicação deste tópico">${esc(topic)}</button>`
      : `<span class="tag">${esc(topic)}</span>`).join('')}</div>` : ''}</div>`;
}

async function whileBusy(key, work) {
  if (busy.has(key)) return;
  busy.set(key, Date.now()); render();
  try { return await work(); }
  finally { busy.delete(key); render(); }
}
const loadingBlock = (text, key, lines = 3) => `<div class="loading-block" role="status"><p class="loading-line">${text}<span class="elapsed" aria-hidden="true" data-since="${busy.get(key) || Date.now()}"></span></p>
  <div class="skeleton" aria-hidden="true">${'<span></span>'.repeat(lines)}</div></div>`;
setInterval(() => {
  for (const element of document.querySelectorAll('[data-since]')) {
    const seconds = Math.floor((Date.now() - Number(element.getAttribute('data-since'))) / 1000);
    element.textContent = seconds >= 2 ? `${seconds} s` : '';
  }
}, 1000);
const analyzing = (id) => busy.has(`analyze:${id}`);
const summaryLoading = (id) => loadingBlock('A ler o PDF e a criar o resumo, os conceitos e as perguntas. Costuma demorar 10 a 40 segundos.', `analyze:${id}`, 4);

const links = {
  issues: () => `https://github.com/miguelaopt/caderno/issues/new?template=problema.yml${state.version ? `&versao=${encodeURIComponent(state.version)}` : ''}`,
  kofi: 'https://ko-fi.com/miguelaopt',
  author: 'https://github.com/miguelaopt',
};
const aboutPanel = () => `<section class="panel about"><h2>Sobre o Caderno</h2>
  <p class="muted">Feito por <a href="${links.author}" target="_blank" rel="noopener">Miguel Ferreira</a>, estudante de Engenharia Informática, para estudar as próprias cadeiras. É gratuito e de código aberto.</p>
  <div class="about-actions"><a class="button" href="${links.issues()}" target="_blank" rel="noopener">Reportar um problema</a>
    <a class="button coffee" href="${links.kofi}" target="_blank" rel="noopener">☕ Paga-me um café</a></div>
  <p class="hint">Ao reportar, diz o que estavas a fazer e o que apareceu. Não incluas a tua chave de IA nem dados de colegas.</p></section>`;

const helpNote = (title, items) => `<details class="help"><summary>${title}</summary><ul>${items.map((item) => `<li>${item}</li>`).join('')}</ul></details>`;

const revealButton = (file) => state.desktop ? `<button data-open-file="${file.id}" data-reveal="true">Mostrar na pasta</button>` : '';

function auth() {
  root.innerHTML = `<main class="auth"><p class="logo">caderno<span class="logo-dot">.</span></p>
    <h1>${authMode === 'register' ? 'Criar conta' : 'Entrar'}</h1>
    <p class="page-lead">Modo de desenvolvimento no browser. A aplicação Windows usa um perfil local, sem conta.</p>
    <form id="auth-form" class="panel"><label>Email<input name="email" type="email" autocomplete="email" required></label>
      <label>Palavra-passe<input name="password" type="password" minlength="12" autocomplete="${authMode === 'register' ? 'new-password' : 'current-password'}" required></label>
      <button class="primary" type="submit">${authMode === 'register' ? 'Criar conta' : 'Entrar'}</button></form>
    <button class="link-button" data-action="swap-auth">${authMode === 'register' ? 'Já tenho conta' : 'Criar uma conta'}</button></main>`;
}

/** @type {[string, [string, string][]][]} */
const navigation = [
  ['Organizar', [['today', 'Hoje'], ['courses', 'Cadeiras'], ['files', 'Materiais']]],
  ['Estudar', [['explain', 'Explicações'], ['cards', 'Flashcards'], ['practice', 'Treino'], ['revision', 'Revisão'], ['exam', 'Simulado'], ['focus', 'Foco']]],
];
const navButton = (id, label) => `<button data-screen="${id}" ${screen === id || (id === 'files' && screen === 'detail') ? 'aria-current="page"' : ''}>${label}</button>`;

function shell(content) {
  root.innerHTML = `<div class="app-shell"><aside class="sidebar">
    <button class="logo" data-screen="today" aria-label="Caderno, ir para Hoje">caderno<span class="logo-dot">.</span></button>
    <nav aria-label="Secções">${navigation.map(([group, items]) => `<p class="sidebar-label">${group}</p>${items.map(([id, label]) => navButton(id, label)).join('')}`).join('')}</nav>
    <div class="sidebar-bottom"><a class="sidebar-link" href="${links.issues()}" target="_blank" rel="noopener">Reportar um problema</a><a class="sidebar-link" href="${links.kofi}" target="_blank" rel="noopener">☕ Paga-me um café</a>${navButton('settings', 'Definições')}<button data-action="guide">Guia de início</button>
      <button data-action="theme">${currentTheme() === 'dark' ? 'Tema claro' : 'Tema escuro'}</button>${state.desktop ? '' : '<button data-action="logout">Sair</button>'}</div></aside>
    <main class="app-main" tabindex="-1">${content}</main></div>`;
}

const syncNotice = (text) => state.sync?.status === 'running' ? `<div class="notice" role="status"><p class="loading-line">${text}</p></div>` : '';
const dayLabel = (seconds) => {
  const date = new Date(seconds * 1000);
  return `<time datetime="${date.toISOString().slice(0, 10)}"><b>${date.getDate()}</b>${date.toLocaleDateString('pt-PT', { month: 'short' }).replace('.', '')}</time>`;
};

function today() {
  const selected = state.courses.filter((course) => course.selected);
  const recent = state.files.filter((file) => selected.some((course) => course.id === file.course_id) && file.changed_at > (state.changesSince || Date.now() / 1000 - 7 * 86400)).slice(0, 5);
  const upcoming = state.deadlines.filter((deadline) => selected.some((course) => course.id === deadline.course_id)).slice(0, 5);
  const plan = state.plan;
  const date = new Date().toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' });
  shell(`${pageHead('Hoje', `${plan.studiedToday} de ${plan.minutes} min feitos · ${plan.completed} de ${plan.totalMaterials} materiais em dia`,
    state.connection ? '<button data-action="sync">Sincronizar Moodle</button>' : '', date)}
    ${syncNotice('A importar materiais do Moodle e a extrair o texto dos PDFs. Os ficheiros aparecem quando estiverem prontos.')}
    ${state.connection?.last_error ? `<p class="notice error" role="alert">${esc(state.connection.last_error)}</p>` : ''}
    ${state.connection && selected.length && !state.files.length && state.sync?.status !== 'running' ? '<div class="notice"><p><strong>As cadeiras estão ligadas, mas ainda não há ficheiros.</strong> Importa os materiais do Moodle para criar o plano.</p><button class="primary" data-action="sync">Importar do Moodle</button></div>' : ''}
    ${!selected.length ? '<div class="notice"><p><strong>Ainda não tens cadeiras.</strong> Liga o Moodle ou cria uma cadeira para enviares ficheiros.</p><button class="primary" data-screen="courses">Adicionar cadeiras</button></div>' : ''}
    <div class="today-grid">
      <section class="panel" aria-labelledby="plan-title"><div class="panel-head"><h2 id="plan-title">Plano de hoje</h2><button class="link-button" data-screen="settings">Ajustar tempo</button></div>
        ${plan.blocks.length ? `<ol class="blocks">${plan.blocks.map((block) => `<li class="block">
          <div class="block-main"><p class="meta">${esc(block.course)} · ${block.state === 'a-rever' ? 'revisão' : 'estudo'}</p>
            <button class="title-button" data-file="${block.id}">${esc(block.title)}</button>
            <p class="muted">${esc(block.summary || (block.questions.length ? `Experimenta: ${block.questions[0].pergunta}` : 'Lê e toma nota dos pontos principais.'))}</p></div>
          <p class="block-minutes"><strong>${block.minutes}</strong> min</p>
          <div class="block-actions">${openButton(fileById(block.id) || { id: block.id, mime: 'application/pdf' }, 'Abrir material')}
            <span class="meta">Como correu?</span>
            <button data-study="${block.id}" data-minutes="${block.minutes}" data-result="bem">Percebi</button>
            <button data-study="${block.id}" data-minutes="${block.minutes}" data-result="assim">Mais ou menos</button>
            <button data-study="${block.id}" data-minutes="${block.minutes}" data-result="mal">Preciso de rever</button></div></li>`).join('')}</ol>`
          : `<p class="empty">${plan.minutes === 0 ? 'Hoje marcaste um dia sem estudo. O plano retoma quando houver tempo.' : plan.totalMaterials ? 'Está tudo em dia. Aproveita para descansar ou rever umas cartas.' : 'Adiciona materiais às cadeiras para veres o plano.'}</p>`}
        <p class="panel-foot">O plano ajusta-se ao que fizeste. Dias sem estudo não criam tarefas em atraso.</p></section>
      <div class="today-side">
        <section class="panel"><h2>Próximos prazos</h2>${upcoming.length ? `<ul class="dates">${upcoming.map((deadline) => `<li>${dayLabel(deadline.due_at)}<div><strong>${esc(deadline.title)}</strong><span class="meta">${esc(courseName(deadline.course_id))}</span></div></li>`).join('')}</ul>`
          : '<p class="empty-inline">Sem prazos registados. Adiciona as datas de exame em Cadeiras.</p>'}</section>
        <section class="panel"><div class="panel-head"><h2>O que mudou</h2>${recent.length ? '<button class="link-button" data-action="seen">Marcar como visto</button>' : ''}</div>
          ${recent.length ? `<ul class="changes">${recent.map((file) => `<li><button class="title-button" data-file="${file.id}">${esc(file.filename)}</button><span class="meta">${esc(courseName(file.course_id))} · ${fmt(file.changed_at)}</span></li>`).join('')}</ul>`
            : '<p class="empty-inline">Sem ficheiros novos desde a última visita.</p>'}</section>
        <section class="panel"><h2>Esta semana</h2><p class="stats"><span><strong>${state.progress.daysThisWeek}</strong> dias com estudo</span><span><strong>${state.progress.quizCorrect}/${state.progress.quizTotal}</strong> respostas conseguidas</span></p>
          ${state.progress.topics.length ? `<div class="tags">${state.progress.topics.slice(0, 8).map((topic) => `<span class="tag">${esc(topic)}</span>`).join('')}</div>` : ''}</section>
      </div></div>
    ${plan.forecast?.some((day) => day.allocations.length) ? `<section class="panel week-panel"><div class="panel-head"><h2>Próximos dias</h2><p class="meta">Distribuição indicativa até aos exames.</p></div>
      <ol class="week">${plan.forecast.map((day) => {
        const date = new Date(`${day.date}T12:00:00`);
        return `<li><p class="week-day">${date.toLocaleDateString('pt-PT', { weekday: 'short' }).replace('.', '')} <b>${date.getDate()}</b></p><p><strong>${day.minutes}</strong>/${day.capacity} min</p>${day.allocations.map((part) => `<p class="meta">${esc(part.course)} · ${part.minutes} min</p>`).join('')}</li>`;
      }).join('')}</ol></section>` : ''}
    ${state.sync ? `<p class="page-foot">Última sincronização a ${fmt(state.sync.started_at)}: ${esc(state.sync.status === 'ok' ? `${state.sync.new_count} ficheiros novos ou alterados` : state.sync.status)}.</p>` : ''}`);
}

function moodlePanel() {
  const canConnect = !state.desktop || state.moodleUrl;
  return `<section class="panel"><h2>Moodle</h2>
    <p class="muted">${state.connection ? `Ligado a ${esc(state.connection.site_name)}. Podes renovar a ligação se a chave expirar.` : 'Importa ficheiros e prazos das tuas cadeiras.'}</p>
    ${state.desktop ? `<form id="desktop-moodle-form" class="field-row"><label>Endereço do Moodle<input type="url" name="url" value="${esc(state.moodleUrl)}" placeholder="https://moodle.exemplo.pt" required ${state.connection ? 'disabled' : ''}></label><button ${state.connection ? 'disabled' : ''}>Guardar endereço</button></form>
      ${state.connection ? '<p class="hint">Para mudar o endereço, desliga primeiro o Moodle nas Definições.</p>' : '<p class="hint">A página inicial da plataforma da tua instituição, por exemplo https://moodle.escola.pt.</p>'}` : ''}
    ${canConnect ? `<form id="connect-form"><label>Utilizador Moodle<input name="username" type="text" autocomplete="username" maxlength="254" required></label>
      <label>Palavra-passe Moodle<input name="password" type="password" autocomplete="current-password" required></label><button class="primary">${state.connection ? 'Renovar ligação' : 'Ligar Moodle'}</button></form>
      <p class="hint">A palavra-passe serve só para obter uma chave de acesso e não fica guardada. Contas com autenticação única (SSO) podem não conseguir ligar.</p>` : ''}</section>`;
}

const manualPanel = () => `<section class="panel"><h2>Cadeira sem Moodle</h2><p class="muted">Cria a cadeira e envia os ficheiros em Materiais.</p>
  <form id="manual-course-form" class="field-row"><label>Nome da cadeira<input name="name" maxlength="100" required placeholder="Ex.: Matemática"></label><button>Criar cadeira</button></form></section>`;

const courseSelection = () => state.courses.length ? `<form id="course-form"><ul class="choices">${state.courses.map((course) => `<li><input id="course-${course.id}" type="checkbox" name="course" value="${course.id}" ${course.selected ? 'checked' : ''}>
  <label for="course-${course.id}">${esc(course.name)}<span class="meta">${course.source === 'manual' ? 'Manual' : 'Moodle'}</span></label></li>`).join('')}</ul>
  <button class="primary">Guardar seleção</button><p class="hint">Guardar a seleção começa a importar os ficheiros das cadeiras do Moodle.</p></form>`
  : '<p class="empty-inline">Ainda não tens cadeiras. Liga o Moodle ou cria uma cadeira.</p>';

const examDates = () => {
  const selected = state.courses.filter((course) => course.selected);
  return selected.length ? `<div class="exam-dates">${selected.map((course) => `<form class="exam-form field-row" data-course="${course.id}"><label>${esc(course.name)}<input type="date" name="date" value="${course.exam_at ? new Date(course.exam_at * 1000).toISOString().slice(0, 10) : ''}"></label><button>Guardar data</button></form>`).join('')}</div>`
    : '<p class="empty-inline">Escolhe primeiro as cadeiras que queres acompanhar.</p>';
};

function courses() {
  shell(`${pageHead('Cadeiras', 'Escolhe as cadeiras que queres acompanhar e indica as datas de exame.')}
    ${syncNotice('A importar os materiais das cadeiras selecionadas. Esta página atualiza-se sozinha.')}
    <div class="split"><div class="stack"><section class="panel"><h2>As tuas cadeiras</h2>${courseSelection()}</section>
      <section class="panel"><h2>Datas de exame</h2><p class="muted">O plano aproxima as revisões destas datas.</p>${examDates()}</section></div>
      <div class="stack">${moodlePanel()}${manualPanel()}</div></div>`);
}

function files() {
  const courses = state.courses.filter((course) => course.selected);
  const course = courses.find((item) => item.id === selectedCourse) || courses[0];
  selectedCourse = course?.id || null;
  const files = state.files.filter((file) => file.course_id === selectedCourse);
  const picker = course ? `<label class="inline-select">Cadeira<select id="file-course">${courses.map((c) => `<option value="${c.id}" ${c.id === selectedCourse ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>` : '';
  shell(`${pageHead('Materiais', course ? 'Os ficheiros desta cadeira, com o estado do texto e do resumo.' : '', picker)}
    ${syncNotice('A importar materiais e a extrair o texto dos PDFs. Os ficheiros aparecem aqui quando terminarem.')}
    ${!course ? '<div class="notice"><p><strong>Escolhe primeiro uma cadeira.</strong> Os materiais ficam organizados por cadeira.</p><button class="primary" data-screen="courses">Adicionar cadeiras</button></div>' :
    `<div class="split split-wide"><section class="panel"><h2>${esc(course.name)}</h2>
      ${files.length ? `<div class="filters"><label>Procurar<input id="file-search" type="search" placeholder="Nome ou resumo" value="${esc(fileSearch)}"></label>
        <label class="checkbox-label"><input id="favorites-only" type="checkbox" ${favoritesOnly ? 'checked' : ''}>Só favoritos</label></div>
        <p id="materials-no-results" class="empty-inline" hidden>Nenhum material corresponde à pesquisa.</p>
        <ul class="materials">${files.map((file) => `<li class="material-item" data-favorite="${file.favorite ? 'true' : 'false'}">
          <div class="material-title"><button class="title-button" data-file="${file.id}">${esc(file.filename)}</button>
            <button class="favorite-button" data-favorite-file="${file.id}" data-favorite="${file.favorite ? 'true' : 'false'}" aria-label="${file.favorite ? 'Retirar' : 'Adicionar'} ${esc(file.filename)} ${file.favorite ? 'dos' : 'aos'} favoritos" aria-pressed="${Boolean(file.favorite)}">${file.favorite ? '★' : '☆'}</button></div>
          <p class="meta">${Math.max(1, Math.round(file.size / 1024))} kB · ${file.source === 'upload' ? 'Enviado por ti' : 'Moodle'} · ${esc(materialStatus(file))}</p>
          ${file.summary ? `<p class="muted">${esc(file.summary)}</p>` : ''}
          <div class="row">${openButton(file, '', 'button small')}</div></li>`).join('')}</ul>`
        : `<p class="empty">${state.sync?.status === 'running' ? 'A importar os materiais desta cadeira…' : 'Ainda não há materiais nesta cadeira.'}</p>${course.source === 'moodle' && state.sync?.status !== 'running' ? '<button class="primary" data-action="sync">Importar do Moodle</button>' : ''}`}</section>
    <div class="stack"><section class="panel"><h2>Enviar material</h2><p class="muted">Apontamentos teus ou ficheiros que não estão no Moodle.</p>
      <form id="upload-form"><label class="file-input"><span>Escolher ficheiro</span><input name="file" type="file" accept=".pdf,.docx,.pptx,.xlsx,.odt,.odp,.ods,.doc,.ppt,.xls,.txt,.md,.csv,.rtf,.epub,.zip" required><small data-selected-file>Nenhum ficheiro escolhido</small></label><button class="primary">Enviar</button></form>
      <p class="hint">PDF, Office, OpenDocument, texto, EPUB ou ZIP, até 20 MB. Só os PDFs são analisados pela IA.</p></section>
    <section class="panel"><h2>Perguntar à cadeira</h2><p class="muted">Respostas só a partir dos PDFs, com o ficheiro e a página.</p>
      ${state.ai?.consented && state.ai?.configured ? `<form id="ask-form"><label>Pergunta<input name="question" required minlength="4" maxlength="1000" placeholder="Ex.: Como se aplica este conceito?"></label><button class="primary">Perguntar</button></form>
      ${busy.has('ask') ? loadingBlock('A procurar nos PDFs da cadeira e a preparar a resposta…', 'ask') : answer ? answerHtml(answer) : ''}` : '<p class="hint">Configura a IA nas Definições para fazer perguntas.</p>'}</section>
    ${state.desktop ? `<section class="panel"><h2>No computador</h2><p class="muted">Os ficheiros estão em <span class="path">${esc(state.materialsDir)}</span>, numa pasta por cadeira.</p></section>` : ''}</div></div>`}`);
  updateMaterialFilter();
}

function updateMaterialFilter() {
  const normalize = (value) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-PT');
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
  if (!fileDetail) return shell('<p class="loading">A abrir o material…</p>');
  const file = fileDetail;
  const canAsk = file.text_status === 'ok' && state.ai?.consented && state.ai?.configured;
  shell(`<button class="link-button back" data-screen="files">← Materiais</button>
    ${pageHead(esc(file.filename), esc(courseName(file.course_id)), `<button data-favorite-file="${file.id}" data-favorite="${file.favorite ? 'true' : 'false'}" aria-pressed="${Boolean(file.favorite)}">${file.favorite ? '★ Nos favoritos' : '☆ Favorito'}</button>${revealButton(file)}${openButton(file, '', 'button primary')}`)}
    ${file.text_status === 'privado' ? '<p class="notice error">Este ficheiro parece conter dados de pessoas e está excluído da análise por IA.</p>' : ''}
    ${file.text_status === 'vazio' ? '<p class="notice">Este PDF não tem texto selecionável. Pode ser uma digitalização que precisa de OCR.</p>' : ''}
    ${file.text_status === 'falhou' ? '<p class="notice error">Falhou a extração de texto. Tenta sincronizar novamente ou abre o PDF para estudar diretamente.</p>' : ''}
    ${file.text_status === 'sem-extracao' ? `<p class="notice">Este documento está guardado na pasta da cadeira. ${state.desktop ? 'Usa Abrir no Windows para o abrir com o programa do computador.' : 'Descarrega-o para o abrir.'} A extração de texto e a IA só existem para PDFs.</p>` : ''}
    <section class="panel summary-panel"><div class="panel-head"><h2>Resumo</h2>
      ${canAsk && file.summary ? `<div class="row tight"><button class="small" data-explain-file="${file.id}">Pedir uma explicação</button><button class="small" data-analyze="${file.id}" data-force="true" ${analyzing(file.id) ? 'disabled' : ''}>Refazer resumo</button></div>` : ''}</div>
      ${analyzing(file.id) ? summaryLoading(file.id) : file.summary ? digest(file) : `<p class="muted">${isPdf(file) ? 'Ainda não há resumo. O PDF continua disponível para estudar.' : 'Este formato não tem resumo automático.'}</p>
        ${canAsk ? `<p class="hint">O resumo traz o essencial do PDF, os conceitos com definição e perguntas para o Treino e os Flashcards.</p><button class="primary" data-analyze="${file.id}">Criar resumo com IA</button>` : ''}`}
      ${file.text_preview && file.text_status === 'ok' ? `<details class="extracted-text"><summary>Ver texto extraído (${file.page_count || 0} páginas)</summary><pre>${esc(file.text_preview)}${file.text_preview.length >= 8000 ? '\n…' : ''}</pre></details>` : ''}</section>
    <div class="split"><section class="panel"><h2>Praticar</h2>${file.questions?.length ? `<p class="muted">Tenta responder antes de abrires a resposta.</p><div class="questions">${file.questions.map((question, index) => `<details><summary>${esc(question.pergunta)}</summary><p><strong>Resposta:</strong> ${esc(question.resposta)}</p>
        ${question.explicacao ? `<p class="muted">${esc(question.explicacao)}</p>` : ''}
        <div class="row"><button data-quiz="${file.id}" data-index="${index}" data-correct="false">Preciso de rever</button><button data-quiz="${file.id}" data-index="${index}" data-correct="true">Consegui</button></div></details>`).join('')}</div>` : '<p class="empty-inline">As perguntas aparecem depois de criares o resumo com IA.</p>'}</section>
      <section class="panel"><h2>Perguntar a este PDF</h2>${canAsk ? `<form id="detail-ask-form"><label>A tua dúvida<textarea name="question" rows="3" required minlength="4" maxlength="1000" placeholder="Ex.: Porque é que esta regra é necessária?"></textarea></label>
        <button class="primary" ${busy.has('detail-ask') ? 'disabled' : ''}>Perguntar</button></form>
        ${busy.has('detail-ask') ? loadingBlock('A ler as páginas deste PDF e a preparar a resposta…', 'detail-ask') : answer ? answerHtml(answer) : '<p class="hint">A resposta usa só este PDF e indica as páginas. Para resumos por partes, glossários ou exemplos, usa Explicações.</p>'}`
        : '<p class="hint">Configura e autoriza a IA nas Definições para fazer perguntas sobre este PDF.</p>'}</section></div>`);
}

async function loadCards() {
  const query = new URLSearchParams();
  for (const id of cardCourseIds) query.append('course', id);
  cardDeck = await api(`/api/cards${query.size ? `?${query}` : ''}`);
  cardIndex = 0; cardRevealed = false;
  render();
}

const needsAnalysis = (text) => `<div class="empty"><p>${text}</p><p class="hint">As perguntas são criadas quando analisas os PDFs com IA, em Explicações ou na página de cada material.</p><button data-screen="explain">Ir para Explicações</button></div>`;

function cards() {
  const courses = state.courses.filter((course) => course.selected);
  cardCourseIds = new Set([...cardCourseIds].filter((id) => courses.some((course) => course.id === id)));
  const deck = cardDeck?.cards || [];
  const card = deck[cardIndex];
  shell(`${pageHead('Flashcards', `${cardDeck?.totalDue || 0} cartas para rever hoje. Cada carta volta quando for altura de a rever.`)}
    ${helpNote('Como funcionam os flashcards', ['Lê a pergunta e responde de cabeça, em voz alta ou num papel, antes de mostrares a resposta.',
      '<strong>Percebi</strong> afasta a carta cada vez mais: 1, 3, 7, 16 e depois 35 dias. <strong>Quase</strong> e <strong>Ainda não</strong> trazem-na de volta amanhã.',
      'Poucas cartas todos os dias rendem mais do que muitas na véspera do exame.'])}
    <fieldset class="chips"><legend>Cadeiras deste baralho</legend><button type="button" data-action="cards-all" aria-pressed="${cardCourseIds.size === 0}">Todas</button>
      ${courses.map((course) => `<label class="checkbox-label"><input type="checkbox" data-card-course="${course.id}" ${cardCourseIds.has(course.id) ? 'checked' : ''}>${esc(course.name)}</label>`).join('')}</fieldset>
    ${card ? `<section class="panel study-card"><p class="meta">${esc(card.course)} · ${esc(card.filename)} · ${cardIndex + 1} de ${deck.length}</p>
      <h2 class="study-question">${esc(card.pergunta)}</h2>${cardRevealed ? `<div class="answer"><p>${esc(card.resposta)}</p>${card.explicacao ? `<p class="muted">${esc(card.explicacao)}</p>` : ''}</div>
      <p><a href="${materialHref(card.fileId)}" target="_blank" rel="noopener">Consultar o PDF</a></p>
      <div class="row"><button data-card="mal">Ainda não</button><button data-card="assim">Quase</button><button class="primary" data-card="bem">Percebi</button></div>` : '<button class="primary" data-action="reveal">Mostrar resposta</button>'}</section>`
      : needsAnalysis(cardDeck?.totalDue === 0 && deck.length === 0 ? 'Não há cartas para rever hoje.' : 'Ainda não há cartas.')}`);
}

// [título, quando usar, pedido enviado à IA]
const explainApproaches = {
  resumo: ['Resumo por partes', 'O PDF pela ordem das páginas, com o essencial de cada parte.',
    'Faz um resumo estruturado deste PDF pela ordem das páginas: um título (##) por parte, os pontos essenciais em lista e os termos-chave a negrito. Termina com uma secção «Para recordar» com 3 ideias.'],
  simples: ['Explicação simples', 'As ideias principais sem jargão, como a um colega.',
    'Explica as ideias principais deste PDF de forma simples, sem perder os conceitos essenciais. Usa uma analogia do dia a dia quando ajudar.'],
  exemplo: ['Exemplo prático', 'Um caso concreto, resolvido passo a passo.',
    'Dá um exemplo prático e explica passo a passo, numa lista numerada, como aplicar o conceito principal deste PDF.'],
  glossario: ['Glossário', 'Os termos técnicos com uma definição curta e como se ligam.',
    'Faz um glossário dos termos técnicos deste PDF: cada termo a negrito com uma definição de uma frase. No fim, explica numa secção curta como os termos se relacionam.'],
  exame: ['Preparar a prova', 'O que deves dominar e os erros mais comuns.',
    'Que pontos deste PDF devo dominar para uma prova? Para cada um, indica o que costuma ser pedido e um erro comum a evitar.'],
  feynman: ['Método Feynman', 'Uma explicação clara e uma pergunta para explicares tu.',
    'Ajuda-me a estudar pelo método Feynman: explica a ideia principal de forma clara e termina com uma pergunta para eu a ensinar por palavras minhas.'],
};

function citationsHtml(result) {
  const seen = new Set();
  const pages = (result?.citations || []).filter((citation) => !seen.has(`${citation.fileId}:${citation.page}`) && seen.add(`${citation.fileId}:${citation.page}`));
  const oneFile = pages.every((citation) => citation.fileId === pages[0]?.fileId);
  return pages.length ? `<div class="sources"><h3>Páginas citadas${oneFile ? ` de ${esc(pages[0].filename)}` : ''}</h3><ul>${pages.map((citation) =>
    `<li><a href="${materialHref(citation.fileId, citation.page)}" target="_blank" rel="noopener"><b>p. ${citation.page}</b>${oneFile ? '' : ` ${esc(citation.filename)}`}</a></li>`).join('')}</ul></div>` : '';
}
const answerHtml = (result) => `<div class="answer prose">${md(result.answer, result.citations)}${citationsHtml(result)}</div>`;

function explanationPane(file) {
  if (busy.has('explain')) return `<section class="panel reading" id="explanation" aria-busy="true">
    <div class="reading-head"><div><p class="meta">${esc(file?.filename)}</p><h2>${esc(explanationLoading)}</h2></div></div>
    ${loadingBlock('A ler as páginas do PDF e a preparar a explicação. Pode demorar até um minuto.', 'explain', 6)}</section>`;
  if (explanationError) return `<section class="panel reading" id="explanation" tabindex="-1">
    <div class="reading-head"><div><p class="meta">${esc(file?.filename)}</p><h2>${esc(explanationError.label)}</h2></div></div>
    <p class="notice error" role="alert">${esc(explanationError.message)}</p>
    <p class="hint">Se o erro fala da chave, do modelo ou do saldo, confirma-os nas Definições. Se a resposta ficou cortada, tenta uma pergunta mais pequena.</p>
    <div class="row"><button data-screen="settings">Abrir Definições</button></div></section>`;
  if (explanationAnswer) return `<section class="panel reading" id="explanation" tabindex="-1">
    <div class="reading-head"><div><p class="meta">${esc(explanationAnswer.filename)}</p><h2>${esc(explanationAnswer.label)}</h2></div>
      <button class="small" data-action="copy-explanation">Copiar texto</button></div>
    <div class="prose">${md(explanationAnswer.answer, explanationAnswer.citations)}</div>${citationsHtml(explanationAnswer)}
    <p class="hint">As marcas «p.» abrem o PDF na página de onde veio cada parte. Confirma no material antes de estudares por aqui.</p></section>`;
  return `<section class="panel reading reading-empty"><h2>A explicação aparece aqui</h2>
    <ol class="tips"><li><span><strong>Começa pelo resumo por partes</strong> para teres o mapa do PDF.</span></li>
      <li><span><strong>Usa o exemplo prático ou o glossário</strong> quando um conceito não fizer sentido.</span></li>
      <li><span><strong>Acaba com o método Feynman</strong> e responde por palavras tuas no Treino.</span></li></ol>
    <p class="hint">Cada explicação usa só as páginas deste PDF e indica de onde veio cada parte.</p></section>`;
}

function explanations() {
  const courses = state.courses.filter((course) => course.selected);
  const course = courses.find((item) => item.id === explanationCourse) || courses[0];
  explanationCourse = course?.id || null;
  const files = state.files.filter((file) => file.course_id === explanationCourse && file.text_status === 'ok');
  const canExplain = Boolean(state.ai?.configured && state.ai?.consented);
  if (!files.some((file) => file.id === explanationFile)) explanationFile = files[0]?.id || null;
  const file = fileById(explanationFile);
  const disabled = canExplain && !busy.has('explain') ? '' : 'disabled';
  shell(`${pageHead('Explicações', 'Escolhe um PDF e a forma de explicação. A resposta usa só esse PDF e liga cada parte à página de onde veio.')}
    ${state.analysis?.running ? `<div class="notice" role="status"><p class="loading-line">A criar resumos e perguntas. Faltam ${state.analysis.pending} PDF(s); esta página atualiza-se sozinha.</p></div>` : ''}
    ${state.analysis?.pending && canExplain && !state.analysis.running ? `<div class="notice"><p>${state.analysis.pending} PDF(s) com texto ainda sem resumo nem perguntas. Cada pedido usa a tua chave de IA.</p><button class="primary" data-action="analyze-pending">Analisar PDFs pendentes</button></div>` : ''}
    ${state.ai?.configured && !state.ai?.consented ? '<div class="notice"><p>Para criar explicações, autoriza o envio do texto dos PDFs ao teu fornecedor de IA.</p><button data-action="ai-consent">Autorizar análise</button></div>' : ''}
    ${!state.ai?.configured ? '<div class="notice"><p>Configura a tua chave de IA nas Definições. Os PDFs e o texto extraído continuam disponíveis em Materiais.</p><button data-screen="settings">Abrir Definições</button></div>' : ''}
    ${!courses.length ? '<div class="notice"><p><strong>Escolhe primeiro uma cadeira.</strong></p><button class="primary" data-screen="courses">Adicionar cadeiras</button></div>' :
    `<div class="toolbar"><label>Cadeira<select id="explain-course">${courses.map((item) => `<option value="${item.id}" ${item.id === explanationCourse ? 'selected' : ''}>${esc(item.name)}</option>`).join('')}</select></label>
      ${files.length ? `<label class="grow">PDF<select id="explain-file">${files.map((item) => `<option value="${item.id}" ${item.id === explanationFile ? 'selected' : ''}>${esc(item.filename)}</option>`).join('')}</select></label>` : ''}</div>
    ${!files.length ? `<p class="empty">${state.sync?.status === 'running' ? 'A importar e a extrair os PDFs…' : 'Ainda não há PDFs com texto nesta cadeira. Importa do Moodle ou envia um PDF em Materiais.'}</p>` :
    `<div class="explain-layout"><section class="panel"><h2>Que explicação queres?</h2>
        <div class="approaches">${Object.entries(explainApproaches).map(([key, [label, when]]) => `<button data-explain-prompt="${key}" ${disabled}><strong>${label}</strong><span>${when}</span></button>`).join('')}</div>
        <form id="explain-form"><label>Ou escreve a tua dúvida<textarea name="question" rows="3" minlength="4" maxlength="1000" required placeholder="Ex.: Qual é a diferença entre um ator e um caso de uso?"></textarea></label>
          <button class="primary" ${disabled}>Pedir explicação</button></form>
        <p class="hint">Dúvidas concretas dão melhores respostas: diz o que já percebeste e onde te perdes. Cada pedido usa a tua chave; o fornecedor pode cobrar.</p></section>
      <aside class="panel pdf-card"><div class="panel-head"><h2>Este PDF</h2>${openButton(file, 'Abrir PDF', 'button small')}</div>
        ${file && analyzing(file.id) ? summaryLoading(file.id) : file?.summary ? `${digest(file, { topicButtons: canExplain })}${analysisOf(file).topics.length && canExplain ? '<p class="hint">Carrega num tópico para o explicar.</p>' : ''}`
          : `<p class="muted">Ainda sem resumo. ${canExplain ? 'Cria-o para veres o essencial do PDF e teres perguntas para o Treino.' : ''}</p>${canExplain ? `<button data-analyze="${file?.id}">Criar resumo com IA</button>` : ''}`}</aside></div>
    ${explanationPane(file)}`}`}`);
}

const coursePicker = (id, value, disabled = false) => {
  const courses = state.courses.filter((course) => course.selected);
  return courses.length ? `<label class="inline-select">Cadeira<select id="${id}" ${disabled ? 'disabled' : ''}>${courses.map((course) => `<option value="${course.id}" ${course.id === value ? 'selected' : ''}>${esc(course.name)}</option>`).join('')}</select></label>` : '';
};

function practice() {
  const courses = state.courses.filter((course) => course.selected);
  if (!courses.some((course) => course.id === practiceCourse)) practiceCourse = courses[0]?.id || null;
  const questions = practiceDeck?.questions || [];
  const item = questions[practiceIndex];
  shell(`${pageHead('Treino', 'Responde de memória antes de veres a solução e marca como correu.', coursePicker('practice-course', practiceCourse))}
    ${item ? `<div class="study-layout"><section class="panel"><div class="row between"><p class="meta">${esc(item.course)} · ${esc(item.filename)}</p><span class="tag">${practiceIndex + 1} de ${questions.length}</span></div>
      <h2 class="study-question">${esc(item.pergunta)}</h2>${!practiceRevealed ? `<label>A tua resposta<textarea id="practice-answer" rows="5" placeholder="Escreve o que recordas, sem consultar o PDF.">${esc(practiceDraft)}</textarea></label><button class="primary" data-action="practice-reveal">Comparar resposta</button>` :
      `<div class="self-answer"><p class="meta">A tua resposta</p><p>${esc(practiceDraft || 'Não escreveste uma resposta.')}</p></div><div class="answer"><p><strong>Resposta de referência</strong></p><p>${esc(item.resposta)}</p>${item.explicacao ? `<p class="muted">${esc(item.explicacao)}</p>` : ''}</div>
      <div class="row"><button data-practice-grade="false">Preciso de rever</button><button class="primary" data-practice-grade="true">Consegui explicar</button></div>`}
      <p class="panel-foot"><a href="${materialHref(item.fileId)}" target="_blank" rel="noopener">Confirmar no PDF</a></p></section>
      <aside class="panel method-note"><h2>Como estudar</h2><ol><li>Responde de memória, mesmo que seja só uma parte.</li><li>Compara com a resposta de referência e repara no que faltou.</li><li>Marca <strong>Preciso de rever</strong> sem culpa: a pergunta volta ao Treino e aos Flashcards.</li><li>Volta ao PDF na página que te falhou.</li></ol>
        <p class="hint">Escrever a resposta, mesmo incompleta, fixa melhor do que reler o material.</p></aside></div>`
      : practiceDeck ? practiceIndex ? '<div class="empty"><p>Terminaste as perguntas desta sessão.</p><button data-screen="cards">Rever flashcards</button></div>' : needsAnalysis('Ainda não há perguntas nesta cadeira.') : '<p class="loading">A carregar perguntas…</p>'}`);
}

function revision() {
  const courses = state.courses.filter((course) => course.selected);
  if (!courses.some((course) => course.id === revisionCourse)) revisionCourse = courses[0]?.id || null;
  const files = state.files.filter((file) => file.course_id === revisionCourse);
  const ready = files.filter((file) => file.summary);
  shell(`${pageHead('Folha de revisão', courses.length ? `${ready.length} de ${files.length} materiais com resumo. Abre sempre o PDF para confirmar os detalhes.` : '', coursePicker('revision-course', revisionCourse))}
    ${!courses.length ? '<div class="notice"><p><strong>Escolhe primeiro uma cadeira.</strong></p><button class="primary" data-screen="courses">Adicionar cadeiras</button></div>' :
    ready.length ? `${helpNote('Como usar a folha de revisão', ['Lê cada resumo e tenta lembrar-te dos exemplos do PDF antes de abrires o material.',
      'Os pontos a reter são o mínimo para uma prova; os conceitos servem de glossário rápido.',
      'Se um resumo não te diz nada, abre o PDF ou pede uma explicação nesse material.'])}
      <div class="revision">${ready.map((file) => `<section class="revision-item"><div class="row between"><h2>${esc(file.filename)}</h2>
        <div class="row tight">${state.ai?.configured && state.ai?.consented ? `<button class="small" data-explain-file="${file.id}">Explicar</button>` : ''}${openButton(file, 'Abrir PDF', 'button small')}</div></div>
        ${digest(file, { redoHint: false })}</section>`).join('')}</div>` : needsAnalysis('Ainda não há resumos nesta cadeira.')}`);
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
  shell(`${pageHead('Simulado', 'Até 10 perguntas da cadeira em 20 minutos. Escreve sem consultar e compara no fim.', coursePicker('exam-course', examCourse, Boolean(examEndsAt)))}
    ${!courses.length ? '<div class="notice"><p><strong>Escolhe primeiro uma cadeira.</strong></p><button class="primary" data-screen="courses">Adicionar cadeiras</button></div>' : !examQuestions.length ? needsAnalysis('Ainda não há perguntas nesta cadeira.') : !examEndsAt && !examCompleted ? `<section class="panel study-card"><h2>Pronto para começar?</h2><p>${examQuestions.length} perguntas, 20 minutos e nenhuma resposta visível até terminares. As respostas ficam só nesta sessão.</p>
      <ul class="checklist"><li>Fecha os PDFs e as notas: o objetivo é ver o que já sabes.</li><li>Se não souberes uma pergunta, escreve o que te lembras e avança.</li><li>No fim, compara cada resposta e marca o que precisas de rever.</li></ul>
      <button class="primary" data-action="exam-start">Começar simulado</button></section>` :
    examCompleted ? `<p class="page-lead">${graded} respostas marcadas como conseguidas. Compara cada resposta e regista o que precisas de rever.</p><div class="stack">${examQuestions.map((item, index) => `<section class="panel"><p class="meta">${index + 1} de ${examQuestions.length} · ${esc(item.filename)}</p><h2 class="study-question">${esc(item.pergunta)}</h2><div class="self-answer"><p class="meta">A tua resposta</p><p>${esc(examAnswers[index] || 'Sem resposta.')}</p></div><div class="answer"><p><strong>Resposta de referência</strong></p><p>${esc(item.resposta)}</p>${item.explicacao ? `<p class="muted">${esc(item.explicacao)}</p>` : ''}</div><p><a href="${materialHref(item.fileId)}" target="_blank" rel="noopener">Confirmar no PDF</a></p>${Object.hasOwn(examGrades, index) ? `<span class="tag">${examGrades[index] ? 'Consegui explicar' : 'Preciso de rever'}</span>` : `<div class="row"><button data-exam-grade="false" data-exam-index="${index}">Preciso de rever</button><button class="primary" data-exam-grade="true" data-exam-index="${index}">Consegui explicar</button></div>`}</section>`).join('')}</div><button data-action="exam-reset">Novo simulado</button>` :
    `<section class="panel study-card"><div class="row between"><p class="meta">${examIndex + 1} de ${examQuestions.length} · ${esc(current.filename)}</p><strong id="exam-clock" class="exam-clock" aria-live="off">${examTime()}</strong></div><h2 class="study-question">${esc(current.pergunta)}</h2><label>A tua resposta<textarea id="exam-answer" rows="7" placeholder="Escreve o que te lembras, sem consultar o material.">${esc(examAnswers[examIndex] || '')}</textarea></label><div class="row"><button class="primary" data-action="exam-next">${examIndex + 1 === examQuestions.length ? 'Terminar e corrigir' : 'Próxima pergunta'}</button><button data-action="exam-finish">Terminar já</button></div></section>`}`);
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
  shell(`${pageHead('Foco', 'Escolhe um material, estuda durante um bloco sem interrupções e regista o resultado.')}
    ${!files.length ? '<div class="notice"><p><strong>Ainda não há materiais.</strong> Importa ou envia um ficheiro para iniciar um bloco.</p><button class="primary" data-screen="files">Ver materiais</button></div>' :
    `<div class="study-layout"><section class="panel focus-card"><div class="field-row"><label>Material<select id="focus-file">${files.map((file) => `<option value="${file.id}" ${file.id === focusFileId ? 'selected' : ''}>${esc(courseName(file.course_id))} · ${esc(file.filename)}</option>`).join('')}</select></label>
      <label>Duração<select id="focus-duration" ${focusEndsAt ? 'disabled' : ''}><option value="15" ${focusDuration === 900 ? 'selected' : ''}>15 minutos</option><option value="25" ${focusDuration === 1500 ? 'selected' : ''}>25 minutos</option><option value="45" ${focusDuration === 2700 ? 'selected' : ''}>45 minutos</option></select></label></div>
      <div id="focus-clock" class="focus-clock" aria-live="off">${clockText(focusRemaining)}</div><p class="muted">Lê, resume com as tuas palavras e anota uma dúvida concreta.</p>
      <div class="row center"><button class="primary" data-action="focus-start" ${focusEndsAt ? 'disabled' : ''}>${focusRemaining === focusDuration ? 'Começar' : 'Continuar'}</button><button data-action="focus-pause" ${!focusEndsAt ? 'disabled' : ''}>Pausar</button><button data-action="focus-reset">Recomeçar</button></div>
      ${focusDuration - focusRemaining >= 5 * 60 ? `<div class="focus-log"><h3>Como correu o bloco?</h3><div class="row center"><button data-focus-grade="mal" data-minutes="${elapsedMinutes}">Preciso de rever</button><button data-focus-grade="assim" data-minutes="${elapsedMinutes}">Mais ou menos</button><button class="primary" data-focus-grade="bem" data-minutes="${elapsedMinutes}">Percebi</button></div></div>` : ''}</section>
      <aside class="panel method-note"><h2>Bloco de foco</h2><p class="muted">Trabalha numa tarefa de cada vez. Depois do bloco, faz uma pausa curta e usa o Treino ou os Flashcards para testar o que ficou.</p><button data-screen="practice">Abrir Treino</button></aside></div>`}`);
}

function timeForm() {
  let perDay;
  try { perDay = JSON.parse(state.preference?.minutes_by_weekday_json || 'null'); } catch { perDay = null; }
  if (!Array.isArray(perDay) || perDay.length !== 7) perDay = Array(7).fill(state.preference?.minutes_per_day ?? 45);
  const days = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  return `<form id="time-form"><label class="narrow">Tempo habitual por dia (minutos)<input type="number" name="minutes" min="0" max="480" value="${state.preference?.minutes_per_day ?? 45}" required></label>
    <fieldset class="weekdays"><legend>Minutos em cada dia</legend>${days.map((day, index) => `<label>${day}<input type="number" name="day-${index}" min="0" max="480" value="${perDay[index]}" required></label>`).join('')}</fieldset>
    <button class="primary">Guardar tempo</button><p class="hint">Põe 0 nos dias em que não estudas. Se saltares um dia, o plano recalcula-se.</p></form>`;
}

// Sugestões confirmadas na documentação de cada fornecedor a 2026-10-01. Os IDs mudam: o texto aponta sempre para a página de modelos.
const aiProviders = {
  groq: { label: 'Groq (plano gratuito)', keys: 'https://console.groq.com/keys', models: 'https://console.groq.com/docs/models',
    key: 'Começa por <code>gsk_</code>. O plano gratuito não pede cartão; tem um limite por minuto, por isso a análise de vários PDFs faz-se devagar, cerca de um por minuto.', summary: 'openai/gpt-oss-20b', explain: 'openai/gpt-oss-120b',
    list: [['openai/gpt-oss-20b', 'Muito rápido e barato'], ['openai/gpt-oss-120b', 'Mais capaz; melhor para explicações']] },
  anthropic: { label: 'Anthropic (Claude)', keys: 'https://platform.claude.com/settings/keys', models: 'https://platform.claude.com/docs/en/about-claude/models/overview',
    key: 'Começa por <code>sk-ant-</code>. Precisa de crédito pré-pago na conta.', summary: 'claude-sonnet-5-5', explain: 'claude-sonnet-5-5',
    list: [['claude-sonnet-5-5', 'Equilibrado; bom para resumos e explicações'], ['claude-haiku-4-5', 'Mais barato e rápido; a Anthropic pode retirá-lo a partir de 15 de outubro de 2026'], ['claude-opus-5-5', 'Mais capaz e cerca do dobro do preço']] },
  openai: { label: 'OpenAI', keys: 'https://platform.openai.com/api-keys', models: 'https://developers.openai.com/api/docs/models',
    key: 'Começa por <code>sk-</code>. A API é paga à parte do ChatGPT Plus.', summary: 'gpt-6-luna', explain: 'gpt-6.1-sol',
    list: [['gpt-6-luna', 'O mais barato; chega para resumos'], ['gpt-6.1-sol', 'Equilibrado; bom para explicações'], ['gpt-6-astra', 'O mais capaz e o mais caro']] },
  deepseek: { label: 'DeepSeek', keys: 'https://platform.deepseek.com/api_keys', models: 'https://api-docs.deepseek.com/quick_start/pricing',
    key: 'Começa por <code>sk-</code>. Muito barato; fora das horas de ponta fica a metade do preço.', summary: 'deepseek-flash', explain: 'deepseek-flash',
    list: [['deepseek-flash', 'Muito barato; serve para resumos e explicações'], ['deepseek-v4-pro', 'Mais capaz e mais caro']] },
  compatible: { label: 'Outro compatível com Chat Completions', key: 'A chave do serviço que escolheres.', list: [],
    note: 'Para serviços que aceitam o formato Chat Completions da OpenAI, como o OpenRouter (URL base <code>https://openrouter.ai/api/v1</code>). Copia o URL base e o ID do modelo exatamente como aparecem na documentação do serviço.' },
};

function aiHelp(provider) {
  const info = aiProviders[provider] || aiProviders.anthropic;
  return `<div id="ai-help" class="ai-help">
    <p>${info.keys ? `<a href="${info.keys}" target="_blank" rel="noopener">Criar a chave em ${esc(info.label.split(' (')[0])}</a>. ` : ''}${info.key}</p>
    ${info.list.length ? `<p class="meta">IDs de modelo que podes colar:</p><ul class="model-list">${info.list.map(([model, note]) => `<li><code>${model}</code><span>${note}</span></li>`).join('')}</ul>
      <div class="row tight"><button type="button" class="small" data-action="ai-suggest">Usar ${info.summary === info.explain ? `<code>${info.summary}</code> nos dois` : 'os sugeridos'}</button>
      <a class="link-button" href="${info.models}" target="_blank" rel="noopener">Ver todos os modelos</a></div>` : `<p class="muted">${info.note}</p>`}
    <datalist id="ai-models">${info.list.map(([model]) => `<option value="${model}">`).join('')}</datalist></div>`;
}

const freeAiSteps = () => `<div class="free-ai"><h3>Começar grátis, sem cartão</h3>
  <ol><li>Cria conta em <a href="https://console.groq.com" target="_blank" rel="noopener">console.groq.com</a> com o email ou a conta Google.</li>
    <li>Em <a href="https://console.groq.com/keys" target="_blank" rel="noopener">API Keys</a>, carrega em <strong>Create API Key</strong> e copia a chave.</li>
    <li>Cola-a aqui com o fornecedor Groq e carrega em <strong>Usar os sugeridos</strong>.</li></ol>
  <p class="hint">O plano gratuito dá para dezenas de PDFs por dia, um de cada vez. Se quiseres mais rapidez, os outros fornecedores da lista funcionam com crédito pago.</p></div>`;

const aiPanel = () => {
  const provider = state.ai?.settings?.provider || 'groq';
  return `<section class="panel"><h2>A tua chave de IA</h2>
  <p class="muted">${state.ai?.settings ? `Configurado: ${esc(aiProviders[provider]?.label || provider)}. A chave fica cifrada neste computador e não volta a aparecer.` : 'Três passos: escolhe o fornecedor, cria lá uma chave de API e cola-a aqui com os IDs dos modelos.'}</p>
  ${state.ai?.settings ? '' : freeAiSteps()}
  <form id="ai-settings-form" autocomplete="off"><label>Fornecedor<select name="provider" required>
    ${Object.entries(aiProviders).map(([value, info]) => `<option value="${value}" ${provider === value ? 'selected' : ''}>${info.label}</option>`).join('')}</select></label>
    ${aiHelp(provider)}
    <label>Chave de API<input name="apiKey" type="password" minlength="8" maxlength="2048" placeholder="${state.ai?.settings ? 'Deixa vazio para manter a chave atual' : 'Cola aqui a chave do fornecedor'}" ${state.ai?.settings ? '' : 'required'} autocomplete="new-password"></label>
    <div class="field-row"><label>Modelo para resumos<input name="summaryModel" list="ai-models" value="${esc(state.ai?.settings?.summary_model || '')}" placeholder="${aiProviders[provider]?.summary || 'ID do modelo'}" required maxlength="120"><small>Corre uma vez por PDF. Um modelo barato chega.</small></label>
    <label>Modelo para explicações<input name="explainModel" list="ai-models" value="${esc(state.ai?.settings?.explain_model || '')}" placeholder="${aiProviders[provider]?.explain || 'ID do modelo'}" required maxlength="120"><small>Corre a cada pergunta. Um modelo mais capaz explica melhor.</small></label></div>
    <label data-base-url ${provider === 'compatible' ? '' : 'hidden'}>URL base<input name="baseUrl" type="url" value="${esc(state.ai?.settings?.base_url || '')}" placeholder="https://api.exemplo.com/v1"></label>
    <div class="row"><button class="primary">Guardar chave</button>${state.ai?.settings ? '<button type="button" data-action="ai-key-delete">Remover chave</button>' : ''}</div></form>
  <p class="hint">O ID do modelo é o nome técnico, sem espaços, tal como aparece na página de modelos do fornecedor, por exemplo <code>${aiProviders.anthropic.summary}</code>. Se o fornecedor recusar o pedido, o Caderno mostra a razão. Mudar de fornecedor ou de modelos apaga os resumos anteriores, para não misturar resultados.</p></section>`;
};

const consentPanel = () => `<section class="panel"><h2>Autorização de análise</h2>
  <p class="muted">Resumos, perguntas e explicações enviam o texto dos PDFs ao fornecedor que escolheste. PDFs com dados de pessoas não são enviados. Nada é analisado sem pedires.</p>
  <p class="status-line">${state.ai?.consented ? 'Autorizado.' : 'Ainda não autorizado.'}</p>
  <button data-action="ai-consent" ${state.ai?.configured ? '' : 'disabled'}>${state.ai?.consented ? 'Retirar autorização' : 'Autorizar análise'}</button>
  ${state.ai?.configured ? '' : '<p class="hint">Guarda primeiro uma chave de IA.</p>'}</section>`;

function settings() {
  shell(`${pageHead('Definições', state.desktop ? 'Perfil local deste computador.' : esc(state.user.email || ''))}
    <div class="split"><div class="stack">
      <section class="panel"><h2>Tempo para estudar</h2>${timeForm()}</section>
      ${aiPanel()}${consentPanel()}</div>
    <div class="stack">
      <section class="panel"><h2>Moodle</h2>${state.connection ? `<p class="muted">Ligado a ${esc(state.connection.site_name)}. Desligar apaga a chave guardada aqui; os materiais ficam.</p><button data-action="disconnect">Desligar Moodle</button><p class="hint">Para revogar a chave no próprio Moodle, usa a página Chaves de segurança do teu perfil.</p>` : '<p class="muted">Sem ligação.</p><button data-screen="courses">Ligar em Cadeiras</button>'}</section>
      <section class="panel"><h2>Os teus dados</h2>
        ${state.desktop ? `<p class="muted">Tudo fica neste computador.</p><dl class="paths"><dt>Materiais</dt><dd class="path">${esc(state.materialsDir)}</dd><dt>Base de dados e chave local</dt><dd class="path">${esc(state.dataDir)}</dd></dl>
          <p class="hint">Para uma cópia de segurança, fecha o Caderno e copia as duas pastas. A chave local é necessária para recuperar as ligações e a chave de IA.</p>` : ''}
        <a class="button" href="/api/export" download>Exportar dados (JSON)</a></section>
      ${aboutPanel()}
      <section class="panel"><h2>Guia de início</h2><p class="muted">Volta a ver como configurar o Caderno e como estudar com ele.</p><button data-action="guide">Abrir o guia</button></section>
      <section class="panel danger-zone"><h2>Apagar tudo</h2><p class="muted">Elimina as cadeiras, os ficheiros guardados pelo Caderno, os resumos e o histórico de estudo. ${state.desktop ? 'A app recomeça com um perfil vazio.' : ''}</p>
        <form id="delete-form"><label>Escreve APAGAR para confirmar<input name="confirm" autocomplete="off" required pattern="APAGAR"></label><button class="danger">Apagar todos os dados</button></form></section>
      <p class="page-foot">${state.version ? `Caderno ${esc(state.version)}. As atualizações chegam sozinhas a partir das releases do GitHub. ` : ''}Caderno é independente e não é afiliado ao Moodle. Código aberto sob licença MIT.</p></div></div>`);
}

const guideSteps = ['Boas-vindas', 'Cadeiras', 'Tempo e exames', 'IA opcional', 'Como estudar'];

function guideContent(step) {
  if (step === 0) return `<h1>Bem-vindo ao Caderno</h1>
    <p class="page-lead">O Caderno junta os materiais de cada cadeira e diz-te o que estudar a seguir. Este guia demora uns três minutos; podes saltar passos e voltar a ele nas Definições.</p>
    <dl class="guide-facts"><div><dt>Fica neste computador</dt><dd>${state.desktop ? `Os ficheiros ficam em <span class="path">${esc(state.materialsDir)}</span>, numa pasta por cadeira. Não há conta nem servidor.` : 'Os ficheiros ficam na pasta de dados desta instalação.'}</dd></div>
      <div><dt>Funciona sem internet</dt><dd>Os PDFs já importados abrem no visualizador do Caderno. Sincronizar o Moodle e usar a IA precisam de internet.</dd></div>
      <div><dt>A IA é opcional</dt><dd>Cadeiras, plano, prazos e foco funcionam sem IA. Com a tua chave, os PDFs ganham resumos, flashcards e perguntas.</dd></div></dl>`;
  if (step === 1) return `<h1>Junta as tuas cadeiras</h1>
    <p class="page-lead">Liga o Moodle para importar ficheiros e prazos, ou cria cadeiras e envia os ficheiros à mão. Podes usar as duas formas.</p>
    <div class="split">${moodlePanel()}${manualPanel()}</div>
    <section class="panel"><h2>Escolhe o que acompanhar</h2>${courseSelection()}</section>
    ${syncNotice('A importar os ficheiros. Podes continuar o guia enquanto isso acontece.')}`;
  if (step === 2) return `<h1>Quanto tempo tens?</h1>
    <p class="page-lead">O plano distribui o estudo pelo tempo de cada dia e aproxima as revisões das datas de exame.</p>
    <div class="split"><section class="panel"><h2>Tempo para estudar</h2>${timeForm()}</section>
    <section class="panel"><h2>Datas de exame</h2>${examDates()}</section></div>`;
  if (step === 3) return `<h1>IA com a tua chave</h1>
    <p class="page-lead">Opcional. Com uma chave de IA, o Caderno cria resumos, conceitos e perguntas a partir dos PDFs. A Groq tem um plano gratuito sem cartão; Anthropic, OpenAI e DeepSeek cobram cada pedido na tua conta.</p>
    <div class="split">${aiPanel()}${consentPanel()}</div>`;
  return `<h1>Como estudar com o Caderno</h1>
    <p class="page-lead">Um ciclo curto, todos os dias.</p>
    <ol class="guide-loop">
      <li><h2>Abre o Hoje</h2><p>Vês o plano do dia, os próximos prazos e os ficheiros que mudaram nas cadeiras.</p></li>
      <li><h2>Estuda um bloco</h2><p>Abre o material, estuda e marca <strong>Percebi</strong>, <strong>Mais ou menos</strong> ou <strong>Preciso de rever</strong>. O plano ajusta os dias seguintes.</p></li>
      <li><h2>Testa o que ficou</h2><p>Flashcards, Treino e Simulado usam as perguntas criadas pela IA. Em Explicações, pedes ajuda sobre um PDF e confirmas nas páginas citadas.</p></li>
      <li><h2>Mantém tudo em dia</h2><p>Sincroniza o Moodle no Hoje, envia ficheiros em Materiais e usa o Foco para blocos sem interrupções.</p></li></ol>
    <p class="hint">Faz cópias de segurança de vez em quando: as pastas estão indicadas em Definições, na secção Os teus dados.</p>`;
}

function onboarding() {
  const last = guideSteps.length - 1;
  guideStep = Math.min(Math.max(guideStep, 0), last);
  root.innerHTML = `<div class="guide"><aside class="guide-index"><p class="logo">caderno<span class="logo-dot">.</span></p><p class="guide-label">Guia de início</p>
    <ol>${guideSteps.map((label, index) => `<li ${index === guideStep ? 'aria-current="step"' : ''} class="${index < guideStep ? 'done' : ''}"><button data-guide-step="${index}"><span class="guide-n">${index + 1}</span>${label}</button></li>`).join('')}</ol>
    <button class="link-button" data-action="guide-done">${state.onboarded ? 'Fechar o guia' : 'Saltar o guia'}</button></aside>
    <main class="guide-main"><div class="guide-body">${guideContent(guideStep)}</div>
    <nav class="guide-nav" aria-label="Passos do guia">${guideStep ? '<button data-action="guide-back">Voltar</button>' : '<span></span>'}
      ${guideStep < last ? `<button class="primary" data-action="guide-next">${guideStep === 0 ? 'Começar' : 'Continuar'}</button>` : '<button class="primary" data-action="guide-done">Abrir o Hoje</button>'}</nav></main></div>`;
}

function render() {
  document.documentElement.dataset.theme = currentTheme();
  if (!state) return auth();
  if (screen === 'guide' || !state.onboarded) return onboarding();
  if (screen === 'courses') return courses();
  if (screen === 'files') return files();
  if (screen === 'detail') return detail();
  if (screen === 'explain') return explanations();
  if (screen === 'cards') return cards();
  if (screen === 'practice') return practice();
  if (screen === 'revision') return revision();
  if (screen === 'exam') return exam();
  if (screen === 'focus') return focus();
  if (screen === 'settings') return settings();
  return today();
}

async function action(target) {
  const name = target.dataset.action;
  if (name === 'theme') {
    const theme = currentTheme() === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('caderno-theme', theme); } catch {}
    if (state) { await post('/api/theme', { theme }); state.preference.theme = theme; }
    render();
  } else if (name === 'swap-auth') {
    authMode = authMode === 'register' ? 'login' : 'register'; render();
  } else if (name === 'logout') {
    await post('/api/logout', {}); state = null; screen = 'today'; render();
  } else if (name === 'guide') {
    screen = 'guide'; guideStep = 0; render();
  } else if (name === 'guide-next' || name === 'guide-back') {
    guideStep += name === 'guide-next' ? 1 : -1; render(); root.querySelector('.guide-main')?.scrollTo(0, 0);
  } else if (name === 'guide-done') {
    if (!state.onboarded) await post('/api/onboarding', { done: true });
    screen = 'today'; await refresh();
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
    flash(enabled ? 'Análise autorizada. Pede o resumo de um PDF ou analisa os pendentes em Explicações.' : 'Autorização retirada.');
    await refresh();
  } else if (name === 'ai-key-delete') {
    if (!confirm('Remover a chave de IA? Os resumos criados com ela serão apagados.')) return;
    await api('/api/ai-settings', { method: 'DELETE' });
    flash('Chave removida.'); await refresh();
  } else if (name === 'copy-explanation') {
    if (!explanationAnswer) return;
    await navigator.clipboard.writeText(plainAnswer(explanationAnswer.answer));
    flash('Explicação copiada.');
  } else if (name === 'ai-suggest') {
    const form = target.closest('form');
    const info = aiProviders[form?.querySelector('[name=provider]')?.value];
    if (!form || !info?.summary) return;
    for (const [name, value] of [['summaryModel', info.summary], ['explainModel', info.explain]]) {
      const input = form.querySelector(`[name=${name}]`);
      if (input instanceof HTMLInputElement) input.value = value;
    }
  } else if (name === 'analyze-pending') {
    await post('/api/analyze-pending', {});
    flash('A analisar os PDFs pendentes.'); await refresh();
  } else if (name === 'disconnect') {
    if (!confirm('Desligar o Moodle? Os materiais já guardados ficam no computador.')) return;
    const result = await post('/api/disconnect', {});
    flash('Moodle desligado. Revoga a chave na página Chaves de segurança do Moodle.');
    window.open(result.revokeUrl, '_blank', 'noopener'); await refresh();
  }
}

async function requestExplanation(label, question) {
  if (!state.ai?.configured || !state.ai?.consented) throw new Error('Configura e autoriza primeiro a IA nas Definições.');
  if (!explanationFile) throw new Error('Escolhe um PDF com texto extraído.');
  if (busy.has('explain')) return;
  const filename = fileById(explanationFile)?.filename || '';
  explanationLoading = label; explanationAnswer = null; explanationError = null;
  try {
    await whileBusy('explain', async () => {
      document.querySelector('#explanation')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      explanationAnswer = { ...await post('/api/ask', { courseId: explanationCourse, fileId: explanationFile, question }), label, filename };
    });
  } catch (error) { explanationError = { label, message: error.message }; render(); }
  finally { explanationLoading = null; }
  const pane = document.querySelector('#explanation');
  if (pane instanceof HTMLElement) { pane.focus({ preventScroll: true }); pane.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
}

document.addEventListener('click', async (event) => {
  const target = event.target instanceof Element ? event.target.closest('[data-action],[data-screen],[data-file],[data-study],[data-card],[data-analyze],[data-quiz],[data-favorite-file],[data-explain-prompt],[data-explain-topic],[data-explain-file],[data-practice-grade],[data-focus-grade],[data-exam-grade],[data-open-file],[data-guide-step]') : null;
  if (!target) return;
  if (!(target instanceof HTMLElement)) return;
  event.preventDefault();
  // Qualquer botão que espere pelo servidor mostra que está a trabalhar (o CSS só o mostra após um instante).
  if (target instanceof HTMLButtonElement) target.setAttribute('aria-busy', 'true');
  try {
    if (target.dataset.guideStep) {
      guideStep = Number(target.dataset.guideStep); render();
    } else if (target.dataset.openFile) {
      await post('/api/open-file', { fileId: target.dataset.openFile, reveal: target.dataset.reveal === 'true' });
    } else if (target.dataset.examGrade) {
      const index = Number(target.dataset.examIndex);
      const item = examQuestions[index];
      if (!examCompleted || !item || Object.hasOwn(examGrades, index)) return;
      const correct = target.dataset.examGrade === 'true';
      await post('/api/quiz', { fileId: item.fileId, index: item.index, correct });
      examGrades[index] = correct;
      render();
    } else if (target.dataset.explainPrompt) {
      const [label, , question] = explainApproaches[target.dataset.explainPrompt];
      await requestExplanation(label, question);
    } else if (target.dataset.explainTopic) {
      const topic = target.dataset.explainTopic;
      await requestExplanation(`Tópico: ${topic}`, `Explica o tópico «${topic}» com base neste PDF: o que é, como funciona e um exemplo. Indica também com que outros conceitos do PDF se relaciona.`);
    } else if (target.dataset.explainFile) {
      const file = fileById(target.dataset.explainFile);
      if (!file) return;
      screen = 'explain'; explanationCourse = file.course_id; explanationFile = file.id; explanationAnswer = null;
      render(); window.scrollTo(0, 0);
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
    } else if (target.dataset.quiz) {
      await post('/api/quiz', { fileId: target.dataset.quiz, index: Number(target.dataset.index), correct: target.dataset.correct === 'true' });
      flash('Resposta registada.'); await refresh();
    } else if (target.dataset.analyze) {
      const fileId = target.dataset.analyze;
      await whileBusy(`analyze:${fileId}`, async () => {
        await post('/api/analyze', { fileId, force: target.dataset.force === 'true' });
        if (fileDetail?.id === fileId) fileDetail = await api(`/api/file?id=${encodeURIComponent(fileId)}`);
        await refresh();
      });
      flash('Resumo pronto.');
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
      screen = target.dataset.screen;
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
      render();
      root.querySelector('main')?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    } else await action(target);
  }
  catch (error) { flash(error.message); }
  finally { target.removeAttribute('aria-busy'); }
});

document.addEventListener('submit', async (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();
  const button = form.querySelector('button[type=submit],button:not([type])');
  if (button instanceof HTMLButtonElement) { button.disabled = true; button.setAttribute('aria-busy', 'true'); }
  try {
    const data = new FormData(form);
    if (form.id === 'auth-form') {
      await post(authMode === 'register' ? '/api/register' : '/api/login', { email: data.get('email'), password: data.get('password') });
      screen = 'today'; await refresh();
    } else if (form.id === 'desktop-moodle-form') {
      await post('/api/desktop/moodle-url', { url: data.get('url') }); flash('Endereço do Moodle guardado.'); await refresh();
    } else if (form.id === 'connect-form') {
      const result = await post('/api/connect', { username: data.get('username'), password: data.get('password') });
      form.reset(); flash(`${result.count} cadeiras encontradas. Escolhe as que queres acompanhar.`); await refresh();
    } else if (form.id === 'manual-course-form') {
      await post('/api/manual-course', { name: data.get('name') }); flash('Cadeira criada.'); await refresh();
    } else if (form.id === 'course-form') {
      await post('/api/courses', { selected: data.getAll('course') }); flash('Seleção guardada.'); await refresh();
    } else if (form.classList.contains('exam-form')) {
      await post('/api/exam', { courseId: form.dataset.course, date: data.get('date') }); flash('Data de exame guardada.'); await refresh();
    } else if (form.id === 'time-form') {
      await post('/api/preferences', { minutes: Number(data.get('minutes')),
        weekdays: Array.from({ length: 7 }, (_, index) => Number(data.get(`day-${index}`))) });
      flash('Tempo de estudo guardado.'); await refresh();
    } else if (form.id === 'ai-settings-form') {
      await post('/api/ai-settings', { provider: data.get('provider'), apiKey: data.get('apiKey'),
        summaryModel: data.get('summaryModel'), explainModel: data.get('explainModel'), baseUrl: data.get('baseUrl') });
      form.reset(); flash('Chave de IA guardada.'); await refresh();
    } else if (form.id === 'ask-form') {
      answer = null;
      await whileBusy('ask', async () => { answer = await post('/api/ask', { courseId: selectedCourse, question: data.get('question') }); });
    } else if (form.id === 'explain-form') {
      const question = String(data.get('question') || '').trim();
      await requestExplanation(question.length > 90 ? `${question.slice(0, 90)}…` : question, question);
    } else if (form.id === 'detail-ask-form') {
      if (!fileDetail) return;
      const { course_id: courseId, id: fileId } = fileDetail;
      answer = null;
      await whileBusy('detail-ask', async () => { answer = await post('/api/ask', { courseId, fileId, question: data.get('question') }); });
    } else if (form.id === 'upload-form') {
      const file = data.get('file');
      if (!(file instanceof File) || file.size > 20 * 1024 * 1024) throw new Error('Escolhe um ficheiro até 20 MB.');
      await api(`/api/upload?course=${encodeURIComponent(selectedCourse)}`, { method: 'POST', headers: { 'content-type': 'application/octet-stream', 'x-filename': encodeURIComponent(file.name) }, body: file });
      flash('Material guardado.'); await refresh();
    } else if (form.id === 'delete-form') {
      if (!confirm('Apagar definitivamente todos os dados do Caderno?')) return;
      await post('/api/delete-account', { confirm: data.get('confirm') });
      screen = 'today'; guideStep = 0; flash('Dados apagados.'); await refresh();
    }
  } catch (error) { flash(error.message); }
  finally { if (button instanceof HTMLButtonElement) { button.disabled = false; button.removeAttribute('aria-busy'); } }
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
  if (event.target instanceof HTMLSelectElement && event.target.name === 'provider' && event.target.form?.id === 'ai-settings-form') {
    const form = event.target.form;
    const info = aiProviders[event.target.value];
    form.querySelector('#ai-help')?.replaceWith(document.createRange().createContextualFragment(aiHelp(event.target.value)));
    const baseUrl = form.querySelector('[data-base-url]');
    if (baseUrl instanceof HTMLElement) baseUrl.hidden = event.target.value !== 'compatible';
    for (const [name, value] of [['summaryModel', info?.summary], ['explainModel', info?.explain]]) {
      const input = form.querySelector(`[name=${name}]`);
      if (input instanceof HTMLInputElement) input.placeholder = value || 'ID do modelo';
    }
  }
  if (event.target instanceof HTMLSelectElement && event.target.id === 'file-course') { selectedCourse = event.target.value; render(); }
  if (event.target instanceof HTMLSelectElement && event.target.id === 'explain-course') {
    explanationCourse = event.target.value; explanationFile = null; explanationAnswer = null; explanationError = null; render();
  }
  if (event.target instanceof HTMLSelectElement && event.target.id === 'explain-file') {
    explanationFile = event.target.value; explanationAnswer = null; explanationError = null; render();
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
if (location.pathname !== '/app') history.replaceState({}, '', '/app');
try {
  await refresh();
  // Na app Windows a origem muda a cada arranque; um service worker só acumularia caches.
  if (!state?.desktop && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
}
catch (error) { root.innerHTML = `<main class="auth"><h1>Não foi possível abrir o Caderno.</h1><p>${esc(error.message)}</p><button onclick="location.reload()">Tentar novamente</button></main>`; }
