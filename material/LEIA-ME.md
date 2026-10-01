# material/

Uma pasta por cadeira, com um identificador curto — não com o nome
completo do Moodle, que pode incluir metadados adicionais.

Dentro de cada cadeira, cinco categorias:

| Pasta | O que lá vai |
|---|---|
| `teoria/` | slides, apontamentos, apresentações |
| `exercicios/` | fichas, guiões práticos, laboratórios |
| `exames/` | enunciados de exames, testes, frequências |
| `trabalhos/` | enunciados de projeto, entregas |
| `outros/` | tudo o que o sync não consegue classificar, e pautas |

Nomes de pastas sem acentos de propósito: o Moodle devolve os nomes de
ficheiro em NFD (acentos decompostos), e misturar isso com nomes de
pastas acentuados dá ficheiros que "existem" mas não abrem.

## Podes meter coisas à mão

O sync nunca apaga nada. PDFs que vieram por email, exames de anos
anteriores, apontamentos teus — mete-os na categoria certa e passam a
contar para os resumos e para o plano diário, como se tivessem vindo
do Moodle.

## Quais as cadeiras

Só as do semestre ativo, definidas com `npm run course` nos scripts pessoais
antigos. A aplicação web usa a seleção de cadeiras na interface.
