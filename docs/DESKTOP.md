# Caderno para Windows

O instalador cria uma aplicação local, sem conta nem servidor: usa um perfil único neste computador. A base de dados fica em `%APPDATA%\Caderno\Dados\product.db`; a chave local de proteção fica na mesma pasta. Os materiais importados ou enviados são guardados em `%USERPROFILE%\Documents\Caderno\Materiais\<conta>\<cadeira>\`. O Windows pode redirecionar a pasta Documentos para OneDrive; nesse caso o Caderno usa a localização que o Windows indicar.

Os PDFs já guardados abrem sem internet. Outros ficheiros ficam na pasta Documentos e podem ser abertos com uma aplicação compatível instalada no computador. Sincronizar o Moodle e usar IA exigem ligação à internet. Resumos, perguntas, flashcards e simulados já criados permanecem disponíveis offline. A aplicação guarda os ficheiros por conta e cadeira; o nome original faz parte do nome do ficheiro, precedido de um identificador para evitar colisões. São aceites PDF, Office, OpenDocument, texto, EPUB e ZIP, até 20 MB por ficheiro. Só os PDFs têm visualizador integrado e análise por IA.

## Instalar

Descarrega o instalador mais recente em [Releases](https://github.com/miguelaopt/caderno/releases/latest) (ficheiro `Caderno-<versão>-Windows-x64.exe`), executa-o e escolhe a pasta de instalação. É um instalador x64 ainda não assinado; o código e o build são públicos no GitHub Actions. Na primeira instalação, o Windows mostra «O Windows protegeu o seu PC»: carrega em **Mais informações** e depois em **Executar mesmo assim**. Para confirmar que o ficheiro é o que o GitHub Actions compilou, compara o SHA-256 das notas da release com o resultado de `Get-FileHash` (ver [Instalador sem assinatura](../README.md#instalador-sem-assinatura)).

As versões seguintes chegam pela atualização automática: a app procura-as ao abrir e de 4 em 4 horas, descarrega-as em segundo plano e pergunta se queres reiniciar. Se escolheres mais tarde, a atualização instala-se quando fechares o Caderno. Os dados e os materiais não são tocados.

Ao abrir pela primeira vez, um guia de início ajuda a juntar as cadeiras, a definir o tempo de estudo e, se quiseres, a configurar a IA; podes reabri-lo nas Definições. Para ligar o Moodle, indica o endereço HTTPS da plataforma em **Cadeiras → Moodle**, guarda e introduz as tuas credenciais. Contas com SSO (entrada pela página da instituição ou com Microsoft ou Google) não conseguem ligar; nesse caso, cria as cadeiras à mão. Também podes criar cadeiras manuais e enviar materiais sem configurar o Moodle. Em **Definições**, podes adicionar a tua própria chave de IA; é opcional. Anthropic, OpenAI, DeepSeek e Groq têm ligação direta. Para outro fornecedor que use Chat Completions, indica a URL base HTTPS e os IDs dos modelos.

## Cópias de segurança e mudança de computador

Fecha a aplicação antes de copiar os dados. Guarda em conjunto a pasta `%APPDATA%\Caderno\Dados` e a pasta `Documentos\Caderno\Materiais`. A chave `encryption.key` é necessária para recuperar tokens Moodle e chaves de IA guardadas. Para mudar de computador, instala a mesma versão do Caderno e repõe as duas pastas nos caminhos correspondentes antes de abrir a aplicação.

**Definições → Apagar tudo** elimina as cadeiras, os ficheiros guardados pelo Caderno, os resumos e o histórico; a app recomeça com um perfil vazio. Desinstalar a aplicação não deve ser tratado como cópia de segurança; guarda os dados antes de reinstalar o Windows.

## Compilar

É necessário Node 24. No Windows:

```powershell
npm ci
npm run build
npm test
npm run desktop:dist
```

O ficheiro final aparece em `release/`. O workflow [Windows desktop](../.github/workflows/windows.yml) executa o build numa máquina Windows e disponibiliza o instalador como artefacto. O build também foi gerado em Linux para Windows; a execução da interface em Windows ainda deve ser validada num computador real antes de uma versão estável.
