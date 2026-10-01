# Lançar o Caderno ao público

O que falta para divulgar o Caderno fora do círculo de colegas, por ordem. Os pontos 1 a 4 bloqueiam o lançamento; os restantes podem acontecer na primeira semana.

Estado a 2026-10-01: versão 0.3.0 publicada, atualizações automáticas a funcionar, site estático na Vercel.

## Lista

- [ ] **1. Criar a conta Ko-fi `miguelaopt`.** O botão «Paga-me um café» do site e da app já aponta para `https://ko-fi.com/miguelaopt`. Até a conta existir, o link dá erro. Se escolheres outro nome, muda-o em `web/product.js` (`links.kofi`) e em `site/index.html`.
- [ ] **2. Assinar o instalador com a SignPath Foundation.** Sem assinatura, o Windows mostra «O Windows protegeu o computador» e muita gente desiste. Passo a passo abaixo.
- [ ] **3. Testar com duas ou três pessoas de fora.** Ver [Teste com colegas](#teste-com-colegas).
- [ ] **4. Domínio.** Ver [Domínio](#domínio).
- [ ] **5. Criar a etiqueta `problema` no GitHub** (Issues → Labels → New label). O formulário «Reportar um problema» aplica-a; sem ela, a issue fica sem etiqueta.
- [ ] **6. Atualizar as capturas do site** com as Explicações novas e o painel da Groq: `node scripts/seed-screenshot.mjs` e `node scripts/capture-screenshots.mjs` (instruções no topo de cada script).
- [ ] **7. Rever `site/privacidade.html`**: acrescentar que o Ko-fi e o GitHub são serviços externos com as suas próprias políticas.
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

A [SignPath Foundation](https://signpath.org) assina gratuitamente projetos de código aberto com um certificado em nome da fundação. O Caderno cumpre as condições principais: licença MIT (aprovada pela OSI), sem código proprietário, releases públicas, compilado no GitHub Actions a partir do código do repositório.

### 1. Preparar o repositório

1. **Ativar a autenticação de dois fatores** no GitHub (obrigatório para todos os membros da equipa, também na SignPath).
2. **Publicar uma política de assinatura de código.** Acrescentar ao `README.md` uma secção «Code signing policy» com:
   - a frase exigida: «Free code signing provided by [SignPath.io](https://signpath.io), certificate by [SignPath Foundation](https://signpath.org)»;
   - os papéis: Miguel Ferreira como autor, revisor e aprovador (projeto de uma pessoa);
   - a declaração de privacidade: o programa só comunica com o Moodle e com o fornecedor de IA que a pessoa escolher, e só quando ela pede.
3. **Metadados do executável.** O electron-builder já preenche o nome do produto e a versão; confirmar no `Caderno.exe` (Propriedades → Detalhes) que aparecem «Caderno» e a versão certa.

### 2. Candidatura

1. Em [signpath.org](https://signpath.org), carregar em «Apply» e preencher com o link do repositório, o link das releases e a política de assinatura.
2. Esperar pela aprovação. A SignPath verifica o projeto manualmente; pode demorar algumas semanas.
3. Depois de aprovado, recebes uma organização no [SignPath.io](https://app.signpath.io) com um projeto, uma política de assinatura (`release-signing`) e uma configuração de artefactos.

### 3. Ligar ao GitHub Actions

A assinatura tem de acontecer **antes** de o electron-builder calcular o `latest.yml`: as atualizações automáticas verificam o SHA-512 do instalador, e um ficheiro assinado depois teria outro hash.

Abordagem recomendada, a confirmar com a SignPath durante a integração:

1. Em `.github/workflows/windows.yml`, compilar só a pasta da app: `npx electron-builder --win --x64 --dir`.
2. Enviar `release/win-unpacked/Caderno.exe` para assinar com a action oficial `signpath/github-action-submit-signing-request` (com `wait-for-completion: true`) e substituir o ficheiro pelo assinado.
3. Criar o instalador a partir da pasta já assinada: `npx electron-builder --win nsis --x64 --prepackaged release/win-unpacked --publish never`.
4. Assinar o instalador da mesma forma e voltar a gerar o `latest.yml` e o `.blockmap` com o hash do ficheiro assinado. Em alternativa, a SignPath pode ser chamada a partir do gancho de assinatura do electron-builder (`win.signtoolOptions.sign`), que corre antes do cálculo dos hashes. Escolhe a via que a SignPath aceitar como origem verificada.
5. Guardar o token da SignPath como segredo do repositório (`SIGNPATH_API_TOKEN`) e os IDs da organização e do projeto como variáveis.
6. Cada release passa a pedir a tua aprovação na SignPath antes de assinar (és o «approver»).

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

| Opção | Custo | Nota |
|---|---|---|
| `caderno.me` | Grátis no 1.º ano com o [GitHub Student Pack](https://education.github.com/pack), depois cerca de 20 $/ano | Livre a 2026-10-01. Pedir o pack com o email da escola e registar em nc.me. Recomendado. |
| `caderno.app` | Cerca de 12–15 €/ano (Cloudflare, Porkbun) | Livre a 2026-10-01. |
| `ocaderno.pt`, `meucaderno.pt` | A Amen faz promoções a 1 € no 1.º ano | A renovação na Amen custa 39,50 € + IVA/ano; noutros registadores o `.pt` fica por cerca de 10–15 €. |
| `<nome>.vercel.app` | Grátis | `caderno.vercel.app` e `caderno-site.vercel.app` já são de outras pessoas. |

Ligar o domínio à Vercel: Project → Settings → Domains → Add, e criar no registador os registos DNS que a Vercel indicar. Depois atualizar os links do `README.md`.

## Fora do lançamento

O trabalho de produto de fundo (SSO, OCR, macOS, mais formatos) está em [ROADMAP.md](ROADMAP.md).
