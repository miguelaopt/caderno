# Lançar o Caderno ao público

O que falta para divulgar o Caderno fora do círculo de colegas, por ordem. O site e o instalador podem continuar públicos na versão 0.3.1; a assinatura e os testes externos bloqueiam a versão 1.0.

Estado a 2026-10-01: versão 0.3.1 publicada, atualizações automáticas a funcionar, site estático na Vercel. A etiqueta `problema` já existe no GitHub. Esta atualização do site inclui nove capturas com dados fictícios e a política de assinatura.

## Quando usar 1.0

Esta atualização do site e da documentação não altera o instalador: manter `v0.3.1` como versão pública atual. Reservar `v1.0.0` para uma release que cumpra os seguintes critérios:

1. Instalador e executável assinados, com instalação e atualização automática verificadas num Windows real.
2. Duas ou três pessoas externas conseguem instalar, configurar uma cadeira e chegar ao primeiro plano sem ajuda, sem problemas bloqueantes por resolver.
3. A página de download, a privacidade e as notas da release descrevem corretamente a versão entregue.

Se surgir uma correção antes disso, publicar uma nova versão `0.3.x` com a alteração e respetivas notas.

## Lista

- [x] **1. Confirmar a conta Ko-fi `miguelaopt`.** O proprietário confirmou que está pronta; o botão «Paga-me um café» do site e da app aponta para `https://ko-fi.com/miguelaopt`.
- [ ] **2. Assinar o instalador com a SignPath Foundation.** A política de assinatura faz parte desta atualização. Falta candidatar o projeto e integrar a assinatura após aprovação. Passo a passo abaixo.
- [ ] **3. Testar com duas ou três pessoas de fora.** Ver [Teste com colegas](#teste-com-colegas).
- [x] **4. Domínio `caderno.me`.** O proprietário está a terminar a configuração; `https://caderno.me` e `/privacidade` já respondem por HTTPS e redirecionam para `www.caderno.me`.
- [x] **5. Criar a etiqueta `problema` no GitHub.** Confirmada na API do repositório; o formulário «Reportar um problema» aplica-a.
- [x] **6. Atualizar as capturas do site** com as Explicações novas e o painel da Groq. As nove imagens foram recriadas a partir de dados fictícios com `scripts/seed-screenshot.mjs` e `scripts/capture-screenshots.mjs`.
- [x] **7. Rever `site/privacidade.html`**: acrescentadas as ligações externas para o Ko-fi e o GitHub e a consulta de atualizações.
- [ ] **8. Falar com os serviços de informática** antes de divulgar a uma escola inteira. O Caderno usa o mesmo serviço que a app móvel oficial do Moodle; algumas instituições preferem saber.
- [ ] **9. Depois de lançar:** ver as Issues duas vezes por semana e escrever notas de versão curtas em cada release.

## IA gratuita com a Groq (feito na 0.3.1)

A Groq tem um plano gratuito sem cartão (30 pedidos e 6 a 8 mil tokens por minuto). O Caderno adapta-se a esse limite:

- A Groq aparece primeiro na lista de fornecedores, como «Groq (plano gratuito)», e o painel da chave mostra os três passos para criar a chave em console.groq.com.
- Os pedidos à Groq são mais pequenos: 10 mil caracteres do PDF por resumo e 4 páginas por explicação (`budget()` em `lib/product-ai.mjs`). Os outros fornecedores continuam com 42 mil caracteres e 12 páginas.
- Quando a Groq responde 429 (limite por minuto), o Caderno espera o tempo que ela indica (até 65 s) e tenta de novo, até duas vezes. Com isto, «Analisar PDFs pendentes» avança cerca de um PDF por minuto, sem erros.
- Modelos sugeridos: `openai/gpt-oss-20b` para resumos e `openai/gpt-oss-120b` para explicações.

Limite conhecido: quem pagar a Groq também recebe os pedidos pequenos. Se alguém pedir, separa-se por plano.

## SignPath Foundation, passo a passo

A [SignPath Foundation](https://signpath.org) assina gratuitamente projetos de código aberto com um certificado em nome da fundação. O Caderno já tem licença MIT, releases públicas e build no GitHub Actions. A aceitação depende da avaliação da SignPath, incluindo a reputação verificável do projeto.

Há dois pedidos diferentes: primeiro, a **candidatura ao programa gratuito** no [formulário Apply](https://signpath.org/apply.html); só depois da aprovação é possível enviar um **pedido de assinatura de uma release** pelo workflow do GitHub. O instalador v0.3.1 continua sem assinatura.

### Verificação para enviar a candidatura (2026-10-01)

- [x] Repositório público; a API do GitHub reconhece `LICENSE` como MIT.
- [x] Release v0.3.1 pública com instalador Windows; build e testes no GitHub Actions concluídos com sucesso.
- [x] «Code signing policy» publicada no [README](https://github.com/miguelaopt/caderno#code-signing-policy), ligada no [site](https://caderno.me) e nas [notas da release](https://github.com/miguelaopt/caderno/releases/tag/v0.3.1).
- [x] [Política de privacidade](https://caderno.me/privacidade) publicada, incluindo GitHub, Ko-fi e os fornecedores de IA.
- [x] No instalador público v0.3.1, os metadados do instalador e do `Caderno.exe` indicam produto `Caderno` e versão `0.3.1`.
- [ ] Confirmar manualmente a autenticação de dois fatores em [GitHub → Password and authentication](https://github.com/settings/security); a API usada nesta verificação não mostrou o estado. A SignPath também exige autenticação multifator na sua conta.
- [ ] Na candidatura, explicar que a aplicação consulta o GitHub para atualizações ao abrir e a cada quatro horas e perguntar se a SignPath exige aviso de privacidade no instalador e opção de desativar essa consulta.
- [ ] Juntar provas reais de adoção ou confiança externas: o projeto acaba de ser publicado e ainda não tem reputação pública verificável.
- [ ] Resolver a ambiguidade do nome `Caderno` nas pesquisas antes de afirmar que o nome identifica claramente este projeto.

Depois de confirmares o 2FA no GitHub, podes preencher o formulário com respostas verdadeiras. Recomenda-se esperar por provas de adoção e esclarecer o nome antes de o enviar, porque a SignPath avalia estes dois pontos e decide se aceita o projeto.

### 1. Preparar o repositório

1. **Ativar a autenticação de dois fatores** no GitHub (obrigatório para todos os membros da equipa, também na SignPath).
2. **Política de assinatura publicada.** A secção «Code signing policy» está no `README.md`, ligada na página inicial, na secção de download e nas notas da release v0.3.1. Inclui a frase exigida, os papéis da equipa e a ligação à política de privacidade. O workflow acrescenta a ligação às próximas releases.
3. **Metadados do executável.** No instalador v0.3.1, o nome de produto e a versão estão presentes no `Caderno.exe`. Confirmar também no Windows em Propriedades → Detalhes quando fizeres o teste de instalação.
4. **Esclarecer a consulta automática de atualizações.** A app instalada contacta o GitHub ao abrir. Confirmar com a SignPath se este comportamento exige mostrar a política de privacidade no instalador e oferecer uma opção para desativar a consulta, segundo as condições de privacidade da fundação.

### 2. Candidatura

1. Em [signpath.org/apply.html](https://signpath.org/apply.html), preencher o formulário com o [repositório](https://github.com/miguelaopt/caderno), as [releases](https://github.com/miguelaopt/caderno/releases), o [site](https://caderno.me), a [política de assinatura](https://github.com/miguelaopt/caderno#code-signing-policy) e a [política de privacidade](https://caderno.me/privacidade). Descrever a app como ferramenta de estudo Windows de código aberto, compilada no GitHub Actions, com Moodle e IA opcionais, dados locais e verificação de atualizações pelo GitHub. Incluir a pergunta de privacidade indicada acima.
2. Esperar pela aprovação. A SignPath verifica o projeto manualmente; pode demorar algumas semanas.
3. Depois de aprovado, configurar no [SignPath.io](https://app.signpath.io) uma organização, um projeto, uma política de assinatura e a configuração dos artefactos. Guardar os identificadores e o token da API para o workflow; os valores concretos só são conhecidos nessa fase.

**Valores para o formulário:**

| Campo | Valor |
| --- | --- |
| Project Name | `Caderno` (nome atual; ver ressalva abaixo). |
| Repository URL | `https://github.com/miguelaopt/caderno` |
| Homepage URL | `https://caderno.me` |
| Download URL | `https://caderno.me/#descarregar` |
| Privacy Policy URL | `https://caderno.me/privacidade` |
| Wikipedia URL | Deixar vazio; não existe artigo. |
| Tagline | `An open-source Windows app that organizes course materials, deadlines, and daily study plans.` |
| Description | `Caderno is an open-source Windows study application that helps students organize course materials and deadlines and plan what to study each day. It offers tools for reviewing and practicing course content while keeping study data on the user's computer.` |
| Maintainer Type | Individual / independent maintainer, se esta opção existir. |
| Build System | GitHub Actions. |

**Reputation:** em 2026-10-01, o repositório acabara de ser publicado e ainda não havia provas públicas de adoção ou cobertura independente. A única descarga do instalador registada no GitHub nessa data ocorreu durante esta verificação; não a apresentar como adoção. Texto honesto para o campo: `Caderno is a newly released open-source project and does not yet have independent coverage or meaningful adoption statistics. Its public source code, release, documentation, and GitHub Actions build are available at https://github.com/miguelaopt/caderno, https://github.com/miguelaopt/caderno/releases/tag/v0.3.1 and https://github.com/miguelaopt/caderno/actions.` Se houver provas reais de testes externos ou divulgação, juntar as ligações. A SignPath diz que pode recusar projetos sem reputação verificável.

**Project Name:** a pesquisa por `Caderno` mostra outras aplicações com esse nome. O formulário pede um nome cuja pesquisa identifique claramente este projeto. Decidir uma forma distintiva de apresentar a marca e confirmar com a SignPath se aceita um identificador adicional como `caderno.me` sem alterar o nome de produto dos binários. Não inventar um nome diferente apenas no formulário: a SignPath também exige consistência dos metadados assinados.

**Dados pessoais:** First Name, Last Name e Email têm de ser os dados do titular da conta SignPath. Company Name pode ficar vazio se não houver organização. Em Primary Discovery Channel, indicar a fonte verdadeira da descoberta (por exemplo, ChatGPT, se foi nesta conversa). A concordância com o Code of Conduct e com o tratamento de dados é obrigatória para enviar o pedido; as comunicações promocionais são opcionais.

### 3. Ligar ao GitHub Actions

A assinatura tem de acontecer **antes** de o electron-builder calcular o `latest.yml`: as atualizações automáticas verificam o SHA-512 do instalador, e um ficheiro assinado depois teria outro hash.

Depois da aprovação, definir com a SignPath a configuração que assina o executável e o instalador:

1. Ligar o GitHub.com à organização e instalar a SignPath GitHub App no repositório. O build tem de correr em agentes alojados pelo GitHub.
2. No workflow Windows, carregar o artefacto a assinar com `actions/upload-artifact@v4` ou superior. A action `signpath/github-action-submit-signing-request@v3` recebe o `artifact-id` desse passo, além do token, dos identificadores da organização e do projeto e da política de assinatura. Usar `wait-for-completion: true` e descarregar o artefacto assinado.
3. Integrar a assinatura no empacotamento do electron-builder para que `Caderno.exe` e o instalador final sejam assinados antes de gerar `latest.yml` e o `.blockmap`. Confirmar o fluxo com a SignPath; assinar o instalador depois de gerar esses ficheiros invalidaria o hash das atualizações.
4. Guardar o token como segredo do repositório (`SIGNPATH_API_TOKEN`). Confirmar a assinatura dos ficheiros no Windows e testar instalação e atualização a partir de uma versão anterior antes de publicar.
5. Aprovar manualmente cada pedido de assinatura na SignPath.

Quando o primeiro instalador assinado sair, retirar do site e do `docs/DESKTOP.md` a frase sobre o aviso de editor desconhecido. O SmartScreen ainda pode avisar nas primeiras semanas, até o certificado ganhar reputação.

Alternativa paga, se a SignPath recusar: certificado «Open Source Code Signing» da Certum, que exige verificação de identidade e um cartão ou chave na nuvem.

## Teste com colegas

Pede a duas ou três pessoas, idealmente uma de outra escola, que instalem a partir do site num Windows onde o Caderno nunca esteve. Sem as ajudar, observa:

- se percebem o aviso do Windows e conseguem instalar;
- se o guia de início chega para ligar o Moodle (e se o Moodle delas aceita a ligação, ou se usa SSO);
- se conseguem criar a chave gratuita da Groq só com as instruções do painel;
- quanto tempo demoram até ver o primeiro plano no Hoje;
- o que procuram e não encontram.

Cada problema vira uma issue com a etiqueta `problema`.

## Domínio

O domínio escolhido é [caderno.me](https://caderno.me), com redirecionamento para `www.caderno.me`. Em 2026-10-01, a página inicial e `/privacidade` responderam com HTTP 200 por HTTPS. O proprietário está a terminar a configuração. O `README.md` já usa o domínio.

## Fora do lançamento

O trabalho de produto de fundo (SSO, OCR, macOS, mais formatos) está em [ROADMAP.md](ROADMAP.md).
