#!/usr/bin/env node
/** Self-check do que nao e trivial. Sem rede, sem frameworks: node test.mjs */

import { strictEqual as eq } from 'node:assert';
import { classifyMoodleError, nomeLimpo } from './lib/moodle.mjs';
import { openDb, getSetting, setSetting } from './lib/db.mjs';

// --- erros do Moodle: HTTP 200 em duas formas de corpo diferentes ----------
eq(classifyMoodleError(null), null);
eq(classifyMoodleError({ token: 'abc' }), null);
eq(classifyMoodleError([]), null);
eq(classifyMoodleError({ courses: [] }), null);
eq(classifyMoodleError({ errorcode: 'enablewsdescription', error: 'x' }).kind, 'WEBSERVICES_DESATIVADOS');
eq(classifyMoodleError({ errorcode: 'invalidlogin', error: 'x' }).kind, 'CREDENCIAIS_INVALIDAS');
eq(classifyMoodleError({ errorcode: 'servicenotavailable', error: 'x' }).kind, 'SERVICO_MOBILE_DESATIVADO');
eq(classifyMoodleError({ exception: 'moodle_exception', errorcode: 'invalidtoken' }).kind, 'TOKEN_INVALIDO');
eq(classifyMoodleError({ exception: 'moodle_exception', errorcode: 'invalidrecord' }).kind, 'CURSO_INEXISTENTE');
eq(classifyMoodleError({ exception: 'webservice_access_exception', errorcode: 'accessexception' }).kind, 'FUNCAO_NAO_AUTORIZADA');
eq(classifyMoodleError({ exception: 'webservice_access_exception', errorcode: 'zzz' }).kind, 'FUNCAO_NAO_AUTORIZADA');
eq(classifyMoodleError({ exception: 'moodle_exception', errorcode: 'zzz' }).kind, 'DESCONHECIDO');

// --- nomes Moodle com metadados opcionais --------------------------------
eq(nomeLimpo('Análise de Sistemas - [2026] - [Turma A]'), 'Análise de Sistemas');
eq(nomeLimpo('Licenciatura em Engenharia Informática'), 'Licenciatura em Engenharia Informática');
eq(nomeLimpo('Redes de Comunicação II - [2026] - [Turma B]'), 'Redes de Comunicação II');

// --- base de dados --------------------------------------------------------
const db = openDb(':memory:');
setSetting(db, 'active_semester', '2025/26-S1');
setSetting(db, 'active_semester', '2025/26-S2');
eq(getSetting(db, 'active_semester'), '2025/26-S2', 'upsert do setting');
eq(getSetting(db, 'nao_existe', 'x'), 'x');

const addCourse = db.prepare('INSERT INTO courses(id,shortname,fullname,slug,semester) VALUES(?,?,?,?,?)');
addCourse.run(543, 'AS', 'Análise de Sistemas', 'AS', '2025/26-S1');

let falhou = false;
try { addCourse.run(700, 'AS', 'AS nova', 'AS', '2025/26-S1'); } catch { falhou = true; }
eq(falhou, true, 'duas cadeiras nao podem partilhar o slug/pasta');

db.prepare('DELETE FROM courses WHERE id = ?').run(543);
addCourse.run(700, 'AS', 'AS nova', 'AS', '2025/26-S1');
eq(db.prepare('SELECT id FROM courses WHERE slug = ?').get('AS').id, 700, 'slug reutilizavel apos forget');

db.prepare('INSERT INTO modules(id,course_id,section_name,modname,name,category,category_source,first_seen_at) VALUES(?,?,?,?,?,?,?,?)')
  .run(1, 700, 'Aulas Teóricas', 'resource', 'Slides 1', 'teoria', 'seccao', 0);
db.prepare('INSERT INTO files(module_id,filename,fileurl,moodle_timemodified) VALUES(?,?,?,?)').run(1, 'a.pdf', 'u', 1);
db.prepare('INSERT INTO deadlines(course_id,module_id,kind,title,due_at,source) VALUES(?,?,?,?,?,?)').run(700, 1, 'entrega', 'TP', 9, 'moodle');
db.prepare('INSERT INTO analyses(file_id,model,prompt_version,summary,created_at) VALUES(?,?,?,?,?)').run(1, 'm', 1, 's', 0);

falhou = false;
try { db.prepare('INSERT INTO files(module_id,filename,fileurl,moodle_timemodified) VALUES(?,?,?,?)').run(1, 'a.pdf', 'u', 2); } catch { falhou = true; }
eq(falhou, true, 'o mesmo ficheiro no mesmo modulo nao duplica');

db.prepare('DELETE FROM courses WHERE id = ?').run(700);
for (const t of ['modules', 'files', 'deadlines', 'analyses'])
  eq(db.prepare(`SELECT count(*) c FROM ${t}`).get().c, 0, `esquecer o curso limpa ${t}`);

console.log('ok — erros do Moodle, nomes com metadados, schema e cascade');

// --- MoodleError nao pode perder a mensagem formatada -----------------------
// (info.message e a mensagem crua do Moodle; ja apagou a do Error uma vez)
const { MoodleError } = await import('./lib/moodle.mjs');
const err = new MoodleError(
  { kind: 'WEBSERVICES_DESATIVADOS', hint: 'liga os web services', errorcode: 'enablewsdescription', message: 'Web services desativados' },
  'obter token',
);
eq(err.message.includes('[WEBSERVICES_DESATIVADOS]'), true, 'a mensagem tem de trazer o kind');
eq(err.message.includes('liga os web services'), true, 'a mensagem tem de trazer o hint');
eq(err.moodleMessage, 'Web services desativados', 'a mensagem crua fica em moodleMessage');
eq(err.errorcode, 'enablewsdescription');
console.log('ok — MoodleError preserva a mensagem formatada');

// --- em que pasta cai cada material ----------------------------------------
const { categorizar, ehPauta, nomeFicheiroSeguro } = await import('./lib/categorize.mjs');
const cat = (s, m, f) => categorizar(s, m, f).categoria;

eq(cat('Aulas Teóricas', 'HTML 1 25 26'), 'teoria');
eq(cat('Aulas Práticas', 'Ficha1 25 26'), 'exercicios');
eq(cat('Trabalho Prático', 'Trabalho Pratico EI AI1'), 'trabalhos', '"Pratico" nao pode roubar isto para exercicios');
eq(cat('Aulas Práticas', 'Ficha 2'), 'exercicios', 'mas "Praticas" continua a ser exercicios');
eq(cat('General', 'Announcements'), 'outros');
eq(categorizar('Aulas Teóricas', 'Slide 1').origem, 'modulo');
eq(categorizar('Aulas Teóricas', 'Aula 1').origem, 'seccao', 'seccao entra quando o modulo nao diz nada');
eq(cat('Semana 3', 'Ficha 4'), 'exercicios', 'nome do modulo salva quando a seccao nao diz nada');
eq(cat('Aulas Teóricas'.normalize('NFD'), 'Aula 1'), 'teoria', 'NFD e NFC dao o mesmo');

// pautas ganham sempre, e vao para outros
eq(cat('Avaliações', 'Notas Epoca Normal AI1'), 'outros');
eq(categorizar('Avaliações', 'Notas Epoca Normal').origem, 'pauta');
eq(ehPauta('Notas Ficha7 25 26', 'Ficha7_25_26.pdf'), true, 'o modulo denuncia o que o ficheiro esconde');
eq(ehPauta('Ficha 7', 'Presencas_Final.pdf'), true, 'e o ficheiro denuncia o que o modulo esconde');
eq(ehPauta('Ficha 7', 'Ficha7_25_26.pdf'), false);
// falso positivo visto no Moodle real: instrucoes do trabalho, nao uma pauta
eq(ehPauta('Notas sobre o material a entregar e sobre o relatório', 'x.pdf'), false, '"Notas sobre" e materia');
eq(ehPauta('Notas de apoio à teórica', 'x.pdf'), false);
eq(ehPauta('Nota Época Normal', 'x.pdf'), true, 'mas "Nota Época" continua a ser pauta');
eq(cat('Trabalho Prático', 'Notas sobre o material a entregar'), 'trabalhos');
// tambem do Moodle real
eq(cat('Avaliações', 'AS P PROVA TIPO 25 26'), 'exames', '"prova tipo" e um exame');
eq(cat('Aulas Teóricas', 'Tarefa Orientada 1 - PD125'), 'exercicios', 'uma tarefa orientada e para fazer, nao para ler');
eq(cat('Avaliações', 'Exame Época Normal'), 'exames', 'um enunciado numa seccao de avaliacoes e um exame');

// --- nomes de ficheiro: input do Moodle, logo nao confiavel -----------------
eq(nomeFicheiroSeguro('Ficha8_1_EI_25_26  .pdf'), 'Ficha8_1_EI_25_26.pdf', 'espacos antes da extensao');
eq(nomeFicheiroSeguro('apresentação_AI1.pdf'.normalize('NFD')), 'apresentação_AI1.pdf'.normalize('NFC'), 'NFD -> NFC');
eq(nomeFicheiroSeguro('../../.ssh/authorized_keys'), 'authorized_keys', 'nada de sair da pasta');
eq(nomeFicheiroSeguro('/etc/passwd'), 'passwd');
eq(nomeFicheiroSeguro('..'), 'sem-nome');
eq(nomeFicheiroSeguro(''), 'sem-nome');
eq(nomeFicheiroSeguro('a:b*c?.pdf'), 'a_b_c_.pdf');
console.log('ok — categorias, pautas e nomes de ficheiro seguros');

// --- extracao de PDF --------------------------------------------------------
const { extrairTexto } = await import('./lib/extract.mjs');
eq((await extrairTexto(new Uint8Array(0), 'image/png', 'x.png')).status, 'ignorado');
eq((await extrairTexto(new Uint8Array([1, 2, 3]), 'application/pdf', 'x.pdf')).status, 'falhou', 'lixo nao pode passar por texto');
console.log('ok — extracao trata ficheiros nao-PDF e PDFs corrompidos');

// --- o que vai (e o que nunca vai) para o LLM -------------------------------
const { ficheirosPorAnalisar } = await import('./lib/db.mjs');
const d2 = openDb(':memory:');
d2.prepare('INSERT INTO courses(id,shortname,fullname,slug,semester) VALUES(1,?,?,?,?)').run('AS', 'Análise de Sistemas', 'AS', 'S1');
d2.prepare('INSERT INTO modules(id,course_id,section_name,modname,name,category,category_source,first_seen_at) VALUES(?,?,?,?,?,?,?,0)')
  .run(1, 1, 'Aulas Teóricas', 'resource', 'Slides', 'teoria', 'seccao');
const addF = d2.prepare('INSERT INTO files(id,module_id,filename,fileurl,moodle_timemodified,text,text_status,llm_ok) VALUES(?,?,?,?,?,?,?,?)');
addF.run(1, 1, 'slides.pdf', 'u', 1, 'matéria a sério', 'ok', 1);   // vai
addF.run(2, 1, 'pauta.pdf', 'u', 1, 'Aluno 12345 nota 14', 'ok', 0); // NUNCA vai
addF.run(3, 1, 'scan.pdf', 'u', 1, null, 'vazio', 1);                // sem texto
addF.run(4, 1, 'partido.pdf', 'u', 1, null, 'falhou', 1);            // extração falhou

let sel = ficheirosPorAnalisar(d2, 1);
eq(sel.length, 1, 'só o material com texto e autorizado');
eq(sel[0].filename, 'slides.pdf');
eq(sel.some((f) => f.llm_ok === 0 || f.filename === 'pauta.pdf'), false, 'uma pauta nunca pode entrar na seleção');

// ja analisado nao volta a ser analisado — nem se pagaria duas vezes
d2.prepare('INSERT INTO analyses(file_id,model,prompt_version,summary,created_at) VALUES(1,?,1,?,0)').run('claude-opus-5', 'resumo');
eq(ficheirosPorAnalisar(d2, 1).length, 0, 'nao se reanalisa o que ja tem analise');
// ...mas uma versao nova do prompt reabre tudo
eq(ficheirosPorAnalisar(d2, 2).length, 1, 'um prompt novo faz reanalisar');
console.log('ok — pautas nunca vao para o LLM, e nada se analisa duas vezes');

// --- custo -----------------------------------------------------------------
const { custo, PROMPT_VERSION } = await import('./lib/llm.mjs');
eq(custo(1_000_000, 0, { modelo: 'claude-opus-5' }), 5, 'entrada opus-5 a $5/M');
eq(custo(0, 1_000_000, { modelo: 'claude-opus-5' }), 25, 'saída opus-5 a $25/M');
eq(custo(1_000_000, 0, { modelo: 'claude-sonnet-5' }), 2, 'entrada sonnet-5 a $2/M');
eq(custo(1_000_000, 1_000_000, { modelo: 'claude-sonnet-5', batch: true }), 6, 'a batch cobra metade');
eq(typeof PROMPT_VERSION, 'number');
console.log('ok — estimativa de custo');

// --- a ordem de analise e por valor de estudo, nao por id -------------------
const d3 = openDb(':memory:');
d3.prepare('INSERT INTO courses(id,shortname,fullname,slug,semester) VALUES(1,?,?,?,?)').run('AS', 'AS', 'AS', 'S1');
const addM = d3.prepare('INSERT INTO modules(id,course_id,section_name,modname,name,category,category_source,first_seen_at) VALUES(?,?,?,?,?,?,?,0)');
const addF3 = d3.prepare('INSERT INTO files(id,module_id,filename,fileurl,moodle_timemodified,text,text_status,llm_ok) VALUES(?,?,?,?,1,?,?,1)');
// inseridos de proposito pela ordem errada: a papelada tem os ids mais baixos
for (const [id, cat] of [[1, 'outros'], [2, 'trabalhos'], [3, 'exames'], [4, 'exercicios'], [5, 'teoria']]) {
  addM.run(id, 1, 'sec', 'resource', `mod ${cat}`, cat, 'seccao');
  addF3.run(id, id, `${cat}.pdf`, 'u', 'texto', 'ok');
}
eq(ficheirosPorAnalisar(d3, 1).map((f) => f.category).join(','),
   'teoria,exercicios,exames,trabalhos,outros',
   'matéria primeiro, papelada por último — um --limit tem de testar o que interessa');
console.log('ok — ordem de análise por valor de estudo');

// --- listas de pessoas nunca saem da maquina --------------------------------
// Regressao: tres documentos com nomes e numeros de aluno passaram o filtro
// por nome ("Distrib_salas", "EXR_Final", "Atribuicao_esquemas") e foram
// enviados para a API. O nome mente; o texto nao.
const { ehListaDePessoas } = await import('./lib/categorize.mjs');
const pauta = 'Sala 9 Aluno Nome ' + Array.from({ length: 40 }, (_, i) => `${30000 + i} Nome Apelido ${i}`).join(' ');
eq(ehListaDePessoas(pauta), true, 'uma lista de 40 alunos tem de ser apanhada');
eq(ehListaDePessoas('Base de Dados: BD25 Esquema: sc25_X Password: DI@2025 ' + pauta), true, 'inclusive com password à mistura');
eq(ehListaDePessoas('O modelo E-R foi proposto em 1976. Ver RFC 12345 e a norma 67890.'), false, 'matéria com uns números soltos não é lista');
eq(ehListaDePessoas('Normalização 3FN. Exercício 12345.'), false);
eq(ehListaDePessoas(''), false);
eq(ehListaDePessoas(null), false);

// e a porta final barra-as mesmo que llm_ok tenha ficado a 1
const d4 = openDb(':memory:');
d4.prepare('INSERT INTO courses(id,shortname,fullname,slug,semester) VALUES(1,?,?,?,?)').run('AS', 'AS', 'AS', 'S1');
d4.prepare('INSERT INTO modules(id,course_id,section_name,modname,name,category,category_source,first_seen_at) VALUES(1,1,?,?,?,?,?,0)')
  .run('Avaliações', 'resource', 'Distribuição alunos por sala para exame', 'exames', 'seccao');
d4.prepare('INSERT INTO files(id,module_id,filename,fileurl,moodle_timemodified,text,text_status,llm_ok) VALUES(1,1,?,?,1,?,?,1)')
  .run('Distrib_salas_AS.pdf', 'u', pauta, 'ok');
eq(ficheirosPorAnalisar(d4, 1).length, 0, 'a porta final tem de barrar a lista de alunos');
eq(d4.prepare('SELECT llm_ok FROM files WHERE id=1').get().llm_ok, 0, 'e gravar a decisão, para não se repetir o risco');
console.log('ok — listas de pessoas barradas pelo conteúdo, não pelo nome');

// --- motor do plano ---------------------------------------------------------
const P = await import('./lib/plan.mjs');
const DIA = 86400;
const T = 1_700_000_000;                       // "agora" fixo, para os testes
const mat = (o) => ({ module_id: 1, minutos_estudo: 60, historico: [], dias_ate_prazo: null, ...o });

// urgência cresce com a proximidade do prazo, e nunca para trás
eq(P.urgencia(null), 1);
eq(P.urgencia(-3), 1, 'um prazo que já passou não puxa nada');
eq(P.urgencia(1) > P.urgencia(4), true);
eq(P.urgencia(4) > P.urgencia(20), true);
eq(P.urgencia(20) > P.urgencia(100), true);

// estados
eq(P.estadoDe(mat({}), T).estado, 'novo');
eq(P.estadoDe(mat({ historico: [{ studied_at: T - DIA, minutes: 20, resultado: 'bem' }] }), T).estado, 'a-meio');
eq(P.estadoDe(mat({ minutos_estudo: 0 }), T).estado, 'ignorar', 'material administrativo fica de fora');
// acabar o que se começou vale mais do que abrir outra frente
eq(P.estadoDe(mat({ historico: [{ studied_at: T - DIA, minutes: 20, resultado: 'bem' }] }), T).peso >
   P.estadoDe(mat({}), T).peso, true);

// repetição espaçada: os intervalos crescem com os "bem" e caem com um "mal"
const bem = (n, ate) => Array.from({ length: n }, (_, i) => ({ studied_at: ate - (n - 1 - i) * DIA, minutes: 60, resultado: 'bem' }));
const um = P.proximaRevisao(bem(1, T)), tres = P.proximaRevisao(bem(3, T));
eq(um - T, 1 * DIA, 'a primeira passagem bem sucedida volta no dia seguinte');
eq(tres - T, 7 * DIA, 'à terceira, só daqui a uma semana');
eq(P.proximaRevisao(bem(9, T)) - T, 35 * DIA, 'o intervalo tem tecto nos 35 dias');
eq(tres > um, true);
eq(P.proximaRevisao([...bem(3, T - DIA), { studied_at: T, minutes: 60, resultado: 'mal' }]) - T, 1 * DIA,
   'um "mal" põe o material a voltar amanhã');
eq(P.proximaRevisao([]), null);

// material estudado e ainda em dia não entra na sessão
const emDia = mat({ historico: bem(1, T - 2 * 3600) });
eq(P.estadoDe(emDia, T).estado, 'em-dia');
eq(P.planear([emDia], 60, T).sessao.length, 0, 'nada a fazer se está tudo em dia');
// ...mas volta quando passa o intervalo
eq(P.estadoDe(mat({ historico: bem(1, T - 5 * DIA) }), T).estado, 'a-rever');

// o prazo manda: mesma matéria, cadeira com exame à porta ganha
const plano = P.planear([
  mat({ module_id: 1, dias_ate_prazo: 60 }),
  mat({ module_id: 2, dias_ate_prazo: 2 }),
], 60, T);
eq(plano.sessao[0].module_id, 2, 'o que tem exame daqui a 2 dias vem primeiro');

// o tempo disponível é respeitado, e uma ficha grande entra em bocado
const p45 = P.planear([mat({ minutos_estudo: 180 })], 45, T);
eq(p45.sessao.length, 1);
eq(p45.sessao[0].minutos_sugeridos, 45, 'uma ficha de 180min entra em bocado de 45');
eq(p45.sessao[0].parcial, true);
eq(p45.sobram, 0);

// e a sessão não estoura o tempo
const p60 = P.planear([mat({ module_id: 1, minutos_estudo: 30 }), mat({ module_id: 2, minutos_estudo: 30 }),
                       mat({ module_id: 3, minutos_estudo: 30 })], 60, T);
eq(p60.sessao.reduce((s, x) => s + x.minutos_sugeridos, 0), 60, 'a sessão enche o tempo mas não passa');

// dias sem estudar não geram dívida: o plano é sempre para agora
const parado = P.planear([mat({ historico: [{ studied_at: T - 30 * DIA, minutes: 60, resultado: 'bem' }] })], 60, T);
eq(parado.sessao.length, 1, 'depois de 30 dias parado há uma revisão, não 30 planos por cumprir');
console.log('ok — motor do plano: urgência, repetição espaçada, tempo disponível');

// --- ordem pedagógica: teoria, exercícios, provas ---------------------------
// Regressão: sem prazos, o motor mandava fazer a prova tipo antes da matéria.
eq(P.pesoTipo('slides', null) > P.pesoTipo('ficha-exercicios', null), true, 'teoria antes de exercícios');
eq(P.pesoTipo('ficha-exercicios', null) > P.pesoTipo('exame', null), true, 'exercícios antes de provas');
eq(P.pesoTipo('exame', 5) > P.pesoTipo('slides', 5), true, 'mas a 5 dias do exame, a prova tipo passa à frente');
eq(P.pesoTipo('exame', 5) > P.pesoTipo('exame', 90) * 3, true);

const misto = [
  mat({ module_id: 1, tipo: 'exame', minutos_estudo: 60 }),
  mat({ module_id: 2, tipo: 'slides', minutos_estudo: 60 }),
  mat({ module_id: 3, tipo: 'ficha-exercicios', minutos_estudo: 60 }),
];
eq(P.planear(misto, 30, T).sessao[0].tipo, 'slides', 'sem exame à vista, começa-se pela teoria');
const comExame = misto.map((m) => ({ ...m, dias_ate_prazo: 4 }));
eq(P.planear(comExame, 30, T).sessao[0].tipo, 'exame', 'a 4 dias do exame, faz-se a prova tipo');
console.log('ok — ordem pedagógica e provas perto do exame');

// --- flashcards -------------------------------------------------------------
const C = await import('./lib/cards.mjs');
const d5 = openDb(':memory:');
d5.prepare('INSERT INTO courses(id,shortname,fullname,slug,semester) VALUES(1,?,?,?,?)').run('AS', 'Análise de Sistemas', 'AS', 'S1');
d5.prepare('INSERT INTO modules(id,course_id,section_name,modname,name,category,category_source,first_seen_at) VALUES(1,1,?,?,?,?,?,0)')
  .run('Aulas Teóricas', 'resource', 'MCD', 'teoria', 'seccao');
const addF5 = d5.prepare('INSERT INTO files(id,module_id,filename,fileurl,moodle_timemodified,text,text_status,llm_ok) VALUES(?,1,?,?,1,?,?,?)');
addF5.run(1, 'mcd.pdf', 'u', 'texto', 'ok', 1);
addF5.run(2, 'pauta.pdf', 'u', 'texto', 'ok', 0);   // barrada: não pode dar cartas
const perg = (n) => JSON.stringify({ perguntas: Array.from({ length: n }, (_, i) => ({ pergunta: `P${i}`, resposta: `R${i}` })) });
d5.prepare('INSERT INTO analyses(file_id,model,prompt_version,summary,topics,created_at) VALUES(1,?,2,?,?,0)').run('m', 's', perg(12));
d5.prepare('INSERT INTO analyses(file_id,model,prompt_version,summary,topics,created_at) VALUES(2,?,2,?,?,0)').run('m', 's', perg(5));

eq(C.todasAsCartas(d5, 'S1').length, 12, 'as cartas vêm das perguntas — e a pauta não dá nenhuma');

// o baralho não despeja tudo no primeiro dia
const b1 = C.baralhoDeHoje(d5, 'S1', { novasPorDia: 8, agora: T });
eq(b1.baralho.length, 8, 'um limite diário evita a avalanche que faz desistir');
eq(b1.novas, 8); eq(b1.devidas, 0); eq(b1.total, 12);

// uma carta feita hoje não volta hoje; uma falhada volta
C.registarCarta(d5, 1, 0, 'bem', T);
C.registarCarta(d5, 1, 1, 'mal', T);
const b2 = C.baralhoDeHoje(d5, 'S1', { novasPorDia: 8, agora: T + 3600 });
eq(b2.baralho.some((c) => c.idx === 0), false, 'a que correu bem não volta na mesma hora');
eq(b2.baralho.some((c) => c.idx === 1), true, 'a que falhou volta já');

// os rótulos dos botões dizem a verdade sobre quando volta
eq(C.quandoVolta([], 'mal', T), 'volta ainda hoje');
eq(C.quandoVolta([], 'bem', T), 'volta amanhã');
eq(C.quandoVolta([{ studied_at: T - 86400, resultado: 'bem' }], 'bem', T), 'volta em 3 dias');
eq(C.quandoVolta([], 'assim', T), 'volta amanhã');
// um material inteiro não se reestuda 10 minutos depois — só as cartas
eq(P.proximaRevisao([{ studied_at: T, minutes: 60, resultado: 'mal' }]) - T, 86400,
   'material falhado volta no dia seguinte');
eq(P.proximaRevisao([{ studied_at: T, minutes: 0, resultado: 'mal' }], 10) - T, 600,
   'carta falhada volta na mesma sessão');
console.log('ok — flashcards: baralho do dia, limite de novas, intervalos');
