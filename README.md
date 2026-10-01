# Caderno

O Caderno é uma aplicação de estudo para organizar PDFs, acompanhar prazos e estudar com apoio opcional de IA. Funciona no browser ou como aplicação Windows, com Moodle ou apenas com PDFs enviados manualmente. O código é publicado sob a licença MIT.

Cada pessoa pode configurar a sua própria chave de API nas Definições. A instalação open source não cobra uma subscrição nem limita o número de cadeiras. A integração comercial antiga continua disponível apenas quando o operador ativa `ENABLE_HOSTED_BILLING=true`.

> O código está pronto para desenvolvimento e uso local. Uma instalação pública ainda requer revisão das páginas legais, backups, HTTPS e validação com a instância Moodle escolhida. Ver [ROADMAP.md](docs/ROADMAP.md).

## Aplicação Windows

O instalador x64 e as instruções estão em [Caderno para Windows](docs/DESKTOP.md). A aplicação guarda a base de dados e a chave local em `%APPDATA%\Caderno\Dados` e os PDFs em `Documentos\Caderno\Materiais`, separados por conta e cadeira. Depois de importados, os PDFs abrem offline no visualizador da aplicação. A sincronização Moodle e os pedidos à IA precisam de internet. O instalador atual não está assinado; o workflow Windows publica um artefacto por build.

## Requisitos

- Node 24 ou superior
- Disco persistente para SQLite e PDFs
- Para produção: servidor na UE, HTTPS e uma chave `TOKEN_ENCRYPTION_KEY` guardada fora do repositório

```bash
npm install
cp .env.example .env
# preencher MOODLE_URL apenas se quiseres ligar o Moodle
npm run serve
# http://localhost:4321
```

O servidor escuta em `127.0.0.1` por defeito. Para uma implantação atrás de proxy HTTPS, configura `HOST`, `PORT` e `NODE_ENV=production`. O código usa Node, SQLite nativo e HTML/CSS/JS sem framework no frontend.

## IA com a tua chave

Depois de criar conta, abre **Definições → A tua chave de IA**. Escolhe Anthropic, OpenAI, DeepSeek, Groq ou **Outro compatível com OpenAI**, introduz a chave e os IDs dos modelos para resumos e explicações. Autoriza a análise em separado. A chave é cifrada com AES-256-GCM no servidor e não é devolvida pela API nem incluída na exportação de dados. Ao mudar de fornecedor ou modelos, os resumos anteriores são invalidados para evitar resultados de outra configuração.

| Fornecedor | Protocolo usado | URL base |
|---|---|---|
| Anthropic | Messages API | Gerida pelo SDK |
| OpenAI | Responses API | `https://api.openai.com/v1` |
| DeepSeek | Chat Completions | `https://api.deepseek.com` |
| Groq | Chat Completions | `https://api.groq.com/openai/v1` |
| Outro compatível | Chat Completions | URL autorizada pelo operador |

Na app Windows, para outro serviço compatível, indica a URL base HTTPS diretamente nas Definições. No servidor web, o operador define `AI_ALLOWED_BASE_URLS` com as URLs base exatas permitidas, separadas por vírgulas; isto impede que um utilizador aponte o servidor partilhado para um destino interno. “Compatível” refere-se ao formato HTTP de Chat Completions; fornecedores com um protocolo diferente precisam de um adaptador próprio. Confirma os modelos disponíveis e os preços diretamente junto do fornecedor. A app não impõe uma quota interna aos pedidos feitos com a tua chave, mas o fornecedor pode cobrar e limitar o uso. As estimativas de custo da área de administração cobrem apenas a chave Anthropic do operador; uso com chaves pessoais é registado com custo interno zero, não como fatura do fornecedor.

`ANTHROPIC_API_KEY` continua opcional como chave do operador para instalações existentes. Se uma conta configurar uma chave própria, essa configuração tem prioridade. O consentimento para enviar texto à IA continua obrigatório e pode ser retirado a qualquer momento.

Com uma chave pessoal, os resumos só são criados quando escolhes **Criar resumo com IA** num PDF ou **Analisar PDFs pendentes**. Cada pedido pode ter custos na tua conta do fornecedor; ativar o consentimento, importar PDFs ou sincronizar o Moodle não inicia uma análise automática nessa modalidade.

## Ligação ao Moodle

O utilizador introduz o utilizador e a palavra-passe Moodle na app. O servidor envia-os a `<MOODLE_URL>/login/token.php` para obter uma chave do serviço `MOODLE_SERVICE` (por defeito `moodle_mobile_app`). A palavra-passe não é guardada. A ligação direta pode falhar em contas com SSO ou quando o serviço móvel está desativado. O servidor valida `core_webservice_get_site_info`, verifica as funções anunciadas e só então lê as cadeiras. Para as cadeiras selecionadas usa `core_course_get_contents`; apenas PDFs são descarregados. Na web, cada instalação do Caderno liga-se a **um Moodle configurado pelo operador** em `MOODLE_URL`. Na app Windows, o utilizador configura esse endereço em Cadeiras. A escolha de vários servidores por conta ainda não está disponível.

O token fica cifrado com AES-256-GCM. Em desenvolvimento, a aplicação cria `data/product.key` com permissão 0600. Em produção, define `TOKEN_ENCRYPTION_KEY` com 32 bytes aleatórios em hexadecimal e mantém a chave estável em backups seguros. Perder a chave exige que os alunos voltem a ligar o Moodle. Desligar apaga a cópia local do token; a revogação no servidor Moodle é feita pelo aluno em **Chaves de segurança**, pois a função de revogação não está exposta por este serviço.

`core_webservice_get_site_info` foi testado em 27-09-2026 com o token local e confirmou `core_enrol_get_users_courses`, `core_course_get_contents`, `core_calendar_get_action_events_by_timesort`, `mod_assign_get_assignments` e `core_files_get_files`. A app usa apenas as funções que cada token anuncia; permissões podem mudar.

## Dados

`data/product.db` e `data/product-files/` são privados e ignorados pelo Git. Contas, cadeiras, ficheiros, prazos e sessões têm `user_id`. Cada pedido de PDF exige sessão e propriedade do ficheiro. A exportação inclui os dados da conta e os PDFs em base64; a eliminação remove a conta e os ficheiros. O sistema pessoal antigo usa `data/estudo.db` e `material/` e não é migrado para contas novas.

## Variáveis de ambiente

| Variável | Uso |
|---|---|
| `MOODLE_URL` | Raiz HTTPS da instalação Moodle configurada neste servidor; necessária para ligação |
| `TOKEN_ENCRYPTION_KEY` | Chave de 32 bytes em hexadecimal; obrigatória em produção |
| `PRODUCT_DB_PATH` | Caminho da SQLite do produto (por defeito `data/product.db`) |
| `PRODUCT_FILES_DIR` | Pasta privada de PDFs (por defeito `data/product-files`) |
| `HOST`, `PORT`, `NODE_ENV` | Interface, porta e modo de produção |
| `ANTHROPIC_API_KEY` | Opcional: chave Anthropic do operador para contas sem chave própria |
| `AI_ALLOWED_BASE_URLS` | URLs exatas autorizadas para fornecedores compatíveis adicionais |
| `ENABLE_HOSTED_BILLING` | `false` por defeito; ativa limites comerciais e Stripe quando `true` |
| `LLM_SUMMARY_MODEL`, `LLM_EXPLAIN_MODEL` | Modelos de resumo e explicação, respetivamente |
| `LLM_*_USD_PER_M` | Tarifas por modelo para estimativa; confirmar com o fornecedor |
| `ADMIN_USER_ID` | ID interno da conta que pode ver custos por estudante e mês; nunca usar apenas email não verificado |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Envio opcional do resumo diário por email |
| `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` | Checkout, portal e webhook verificado do plano Estudante |
| `PUBLIC_BASE_URL` | Origem pública HTTPS para os retornos do Stripe |

Não coloques passwords ou tokens Moodle no `.env`. O arquivo `data/legacy-token.enc` é uma migração cifrada para os scripts pessoais antigos. Guarda `TOKEN_ENCRYPTION_KEY` fora do repositório e faz backup da chave juntamente com a base de dados; perder a chave impede a leitura das chaves Moodle e das chaves de IA guardadas.

## Estudar

O ecrã Hoje mostra ficheiros recentes, prazos e blocos de estudo. O plano funciona mesmo antes de haver análise por IA: estima tempo para os PDFs, usa as datas de exame e a disponibilidade de cada dia e recalcula quando um bloco é marcado como estudado. Guardar a seleção de cadeiras inicia a importação dos PDFs do Moodle; uma instalação com cadeiras selecionadas mas ainda não sincronizadas recupera a importação ao arrancar. Materiais mostra o estado de extração por ficheiro e uma prévia do texto extraído. PDFs digitalizados sem texto selecionável podem precisar de OCR.

Os menus de estudo incluem **Explicações** com perguntas sobre um PDF e ligações às páginas usadas, **Flashcards** com revisão espaçada e seleção de uma ou várias cadeiras, **Treino** de recuperação ativa com autoavaliação, **Folha de revisão** por cadeira, **Simulado** de até dez perguntas com 20 minutos e **Foco** com blocos de tempo associados a um material. Resumos e perguntas gerados pela IA alimentam Flashcards, Treino, Folha de revisão e Simulado. O ecrã Explicações mostra a fila de PDFs por analisar e permite voltar a iniciá-la. As respostas do Simulado ficam apenas na sessão; a autoavaliação entra no progresso.

Na biblioteca, a pesquisa filtra nomes e resumos sem distinguir acentos; também podes guardar PDFs nos favoritos e mostrar apenas esses ficheiros. Favoritos são privados da conta e não geram pedidos de IA.

A análise por IA está desligada até o aluno a permitir nas Definições ou em Explicações. Só é feita com texto extraível que não foi classificado como sensível. Sem chave de IA, ficheiros, plano e progresso continuam disponíveis. O email diário também é opcional e só aparece depois de configurar SMTP; o processo do servidor tem de permanecer ligado para executar o agendamento.

O email da conta tem de ser confirmado com um código antes de aderir ao digest. O ID interno para `ADMIN_USER_ID` está no objeto `user.id` devolvido por `/api/state` depois de iniciar sessão; não atribuas administração apenas pelo endereço de email. Os preços de modelo por defeito foram conferidos nas páginas oficiais da [Haiku 4.5](https://www.anthropic.com/news/claude-haiku-4-5) e [Sonnet 5](https://www.anthropic.com/claude/sonnet) em 27-09-2026; a área de administração mostra estimativas, não faturas.

## Serviço hospedado opcional

No modo open source, `ENABLE_HOSTED_BILLING=false` e não há limite de cadeiras. Para operar o serviço hospedado antigo, define `ENABLE_HOSTED_BILLING=true` e cria no Stripe um preço recorrente de **€2,99 por mês**, em EUR. Configura as quatro variáveis Stripe/URL acima e um webhook HTTPS em `https://<domínio>/api/stripe/webhook` para `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid` e `invoice.payment_failed`. Ativa o portal de cliente no Stripe. O aluno tem de confirmar o email; por isso, SMTP também é necessário para abrir o Checkout.

O servidor verifica o preço antes de criar uma sessão de Checkout. Só webhooks com assinatura válida mudam o plano; o regresso do browser não concede acesso. No modo hospedado, o limite de cadeiras e as quotas da chave de IA do operador são impostos no servidor. As chaves pessoais não têm quota interna de IA. A eliminação de uma conta com assinatura ativa tenta cancelar essa assinatura antes de remover os dados. Testa este percurso em modo Stripe de teste e revê impostos, recibos e termos legais antes de ativar chaves reais.

Um operador pode atribuir acesso de cortesia ao plano Estudante com `node scripts/grant-complimentary.mjs <email-da-conta>`. Este comando não cria uma assinatura nem uma cobrança Stripe; guarda a oferta na base de dados configurada e só a ativa quando a conta confirmar o email. Para uso pessoal sem SMTP, `--activate-unverified` ativa a oferta sem marcar o email como confirmado. É idempotente e recusa contas com histórico de assinatura Stripe. Para confirmar o email pela aplicação é necessário configurar SMTP. Numa implantação nova, a oferta local não é transferida automaticamente: migra a base de dados ou executa o comando nesse ambiente.

As imagens em `web/screenshots/` são capturas reais da interface com dados fictícios. Para as reproduzir em desenvolvimento, usa `scripts/seed-screenshot.mjs` numa base temporária e `scripts/capture-screenshots.mjs` com Chromium instalado; não uses dados de estudantes em material promocional.

## Verificação

```bash
npm run build
npm run lint
npm run typecheck
npm test
```

O build verifica referências dos assets estáticos e sintaxe. O lint verifica sintaxe e proíbe padrões sensíveis no produto. O typecheck usa TypeScript em modo `checkJs`. Os testes cobrem o motor antigo, duas contas isoladas, PDF privado, limites, eliminação e webhooks Stripe locais assinados. O teste HTTP necessita de permissão para abrir uma porta local.

## Participar

Lê [CONTRIBUTING.md](CONTRIBUTING.md) para preparar alterações e [SECURITY.md](SECURITY.md) para comunicar problemas de segurança. O trabalho pendente está em [ROADMAP.md](docs/ROADMAP.md). A licença está em [LICENSE](LICENSE). Há também um [prompt para Claude](docs/PROMPT-LANDING-CLAUDE.md) para uma futura revisão da landing page com as skills de design indicadas.

## Publicação

Antes de abrir inscrições: escolher alojamento e backups na UE, configurar HTTPS, chave de cifra persistente, domínio e contacto/entidade responsável nas páginas legais; confirmar que a instalação Moodle configurada permite o uso operacional da API; validar um percurso real com uma conta de teste. Se ativares o modo hospedado, configura e testa também Stripe e SMTP. As tarefas pendentes estão em [ROADMAP.md](docs/ROADMAP.md).
