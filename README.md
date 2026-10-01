# Caderno

O Caderno é uma aplicação para Windows que junta os materiais e prazos de cada cadeira, monta o plano do dia e oferece flashcards, treino, folha de revisão, simulado, foco e explicações com fontes. Funciona com o Moodle ou com ficheiros enviados à mão. A IA é opcional e usa a chave de cada pessoa. O código é publicado sob a licença MIT.

Não há contas nem servidor: a aplicação usa um perfil local e guarda tudo no computador.

## Descarregar

O [site do Caderno](https://caderno.me) (pasta [`site/`](site/)) liga sempre ao instalador mais recente das [releases do GitHub](https://github.com/miguelaopt/caderno/releases), que também podem ser usadas diretamente. Instruções de instalação, cópias de segurança e compilação: [docs/DESKTOP.md](docs/DESKTOP.md).

O instalador ainda não está assinado; o Windows pode mostrar um aviso de editor desconhecido.

## Code signing policy

Esta política aplica-se às futuras versões assinadas. A versão 0.3.1 e as anteriores ainda não têm assinatura de código.

Free code signing provided by [SignPath.io](https://signpath.io), certificate by [SignPath Foundation](https://signpath.org).

- **Autor e responsável pelo código:** [Miguel Ferreira](https://github.com/miguelaopt).
- **Revisor de contribuições externas:** [Miguel Ferreira](https://github.com/miguelaopt).
- **Aprovador de cada pedido de assinatura:** [Miguel Ferreira](https://github.com/miguelaopt).

As versões são compiladas a partir do código público no [GitHub Actions](.github/workflows/windows.yml). Cada pedido de assinatura de uma release terá aprovação manual. A [política de privacidade](https://caderno.me/privacidade) explica quando a aplicação comunica com o Moodle, com o fornecedor de IA escolhido e com o GitHub, e identifica os serviços externos usados por ligações do site e da aplicação.

## Onde ficam os dados

- Materiais: `Documentos\Caderno\Materiais\<perfil>\<cadeira>\`. Se o Windows redirecionar Documentos para o OneDrive, o Caderno usa essa pasta.
- Base de dados, chave local de proteção e definições: `%APPDATA%\Caderno\Dados`.

Os PDFs importados abrem offline no visualizador da aplicação; os outros formatos abrem com o programa predefinido do Windows (**Abrir no Windows** e **Mostrar na pasta**). Sincronizar o Moodle e usar a IA precisam de internet. Nas Definições podes exportar os dados em JSON ou apagar tudo; a app recomeça com um perfil vazio.

## Primeiro arranque

Um guia de início em cinco passos explica a aplicação, liga o Moodle ou cria cadeiras manuais, define o tempo de estudo por dia e as datas de exame, configura a IA (opcional) e mostra o ciclo de estudo diário. Pode ser reaberto nas Definições ou no menu lateral. Quem atualiza uma instalação que já tinha cadeiras não vê o guia automaticamente.

## IA com a tua chave

Em **Definições → A tua chave de IA**, escolhe o fornecedor, cola a chave e indica os IDs dos modelos para resumos e explicações. Depois autoriza a análise em separado. A chave é cifrada com AES-256-GCM e não aparece na exportação. Mudar de fornecedor ou de modelos apaga os resumos anteriores para não misturar resultados.

| Fornecedor | Protocolo usado | URL base |
|---|---|---|
| Anthropic | Messages API | Gerida pelo SDK |
| OpenAI | Responses API | `https://api.openai.com/v1` |
| DeepSeek | Chat Completions | `https://api.deepseek.com` |
| Groq | Chat Completions | `https://api.groq.com/openai/v1` |
| Outro compatível | Chat Completions | URL HTTPS indicada nas Definições |

Nada é analisado automaticamente: os resumos só são criados quando escolhes **Criar resumo com IA** num PDF ou **Analisar PDFs pendentes** em Explicações. Cada pedido vai do computador para o fornecedor, que o pode cobrar e limitar. Só é enviado texto de PDFs que não foram classificados como sensíveis. Confirma modelos e preços diretamente junto do fornecedor.

## Ligação ao Moodle

Em **Cadeiras**, indica o endereço HTTPS da plataforma e depois o utilizador e a palavra-passe. A app pede a `<moodle>/login/token.php` uma chave do serviço `MOODLE_SERVICE` (por defeito `moodle_mobile_app`); a palavra-passe não é guardada. A ligação pode falhar em contas com SSO ou quando o serviço móvel está desativado. A app valida `core_webservice_get_site_info`, usa apenas as funções que a chave anuncia e, para as cadeiras selecionadas, lê `core_course_get_contents` e descarrega os ficheiros suportados. A sincronização repete-se a cada 6 horas enquanto a app estiver aberta.

A chave do Moodle fica cifrada. Desligar apaga a cópia local; a revogação no servidor faz-se em **Chaves de segurança** no perfil Moodle.

## Estudar

O ecrã **Hoje** mostra o plano do dia, os próximos prazos, o que mudou e a distribuição dos próximos dias. O plano funciona sem IA: estima tempo para os PDFs, usa as datas de exame e a disponibilidade de cada dia e recalcula quando um bloco é marcado como estudado.

- **Explicações**: perguntas sobre um PDF, com ligações às páginas usadas.
- **Flashcards**: revisão espaçada, com uma ou várias cadeiras.
- **Treino**: recuperação ativa com autoavaliação.
- **Folha de revisão**: resumos e conceitos por cadeira.
- **Simulado**: até dez perguntas em 20 minutos.
- **Foco**: blocos de tempo associados a um material.

Flashcards, Treino, Folha de revisão e Simulado usam os resumos e perguntas criados pela IA. São aceites PDF, DOCX, PPTX, XLSX, ODT, ODP, ODS, DOC, PPT, XLS, TXT, MD, CSV, RTF, EPUB e ZIP, até 20 MB; só os PDFs têm extração de texto, visualizador integrado e análise. PDFs digitalizados sem texto selecionável podem precisar de OCR.

## Desenvolvimento

É necessário Node 24.

```bash
npm ci
npm run desktop:dev   # abre a aplicação Electron a partir do código
```

`npm run serve` abre a mesma interface no browser em `http://localhost:4321`, em modo de desenvolvimento com contas (registo e entrada), útil para testes e capturas. Nesse modo, o endereço do Moodle vem de `MOODLE_URL` no `.env` (ver [.env.example](.env.example)) e os serviços compatíveis adicionais têm de estar em `AI_ALLOWED_BASE_URLS`.

```bash
npm run build       # sintaxe e referências da app e do site
npm run lint
npm run typecheck   # TypeScript em modo checkJs
npm test            # motor antigo, isolamento de contas, perfil local, guia, Moodle simulado
npm run desktop:dist
```

As capturas do site são reais, com dados fictícios: cria uma base temporária com `scripts/seed-screenshot.mjs`, arranca o servidor com `NODE_ENV=desktop` e corre `scripts/capture-screenshots.mjs` (instruções no próprio script). O Chromium do Playwright instala-se com `npx playwright-core install chromium`. Não uses dados de estudantes em material promocional.

## Site

A pasta `site/` é estática (HTML, CSS e um pequeno script) e não precisa de build. Na Vercel, cria um projeto ligado a este repositório com **Root Directory** = `site` e sem framework. `site/vercel.json` define URLs limpos e cabeçalhos de segurança. Os botões de download apontam para a última versão conhecida e são atualizados no browser pela API pública do GitHub. A fonte dos títulos é a Newsreader (SIL OFL 1.1, em `site/fonts/` e `web/fonts/`).

## Publicar uma versão

1. Atualiza `version` no `package.json` (por exemplo `0.2.0`).
2. Cria e envia a tag: `git tag v0.2.0 && git push origin v0.2.0`.
3. O workflow [Windows desktop](.github/workflows/windows.yml) testa, compila numa máquina Windows e cria a release com o instalador. Tags com hífen (`v0.2.0-preview`) ficam marcadas como pré-lançamento.

O site passa a oferecer a nova versão sem alterações.

## Sistema pessoal antigo

`scripts/analyze.mjs`, `scripts/sync.mjs` e `npm run legacy:serve` pertencem ao sistema pessoal inicial, que usa `data/estudo.db`, `material/` e `ANTHROPIC_API_KEY`. Não é migrado para a aplicação.

## Participar

Lê [CONTRIBUTING.md](CONTRIBUTING.md) para preparar alterações e [SECURITY.md](SECURITY.md) para comunicar problemas de segurança. O trabalho pendente está em [docs/ROADMAP.md](docs/ROADMAP.md). A licença está em [LICENSE](LICENSE).
