# Caderno para Windows

O instalador cria uma aplicação local. A interface e as funções de estudo são as mesmas da versão web. A base de dados fica em `%APPDATA%\Caderno\Dados\product.db`; a chave local de proteção fica na mesma pasta. Os PDFs importados ou enviados são guardados em `%USERPROFILE%\Documents\Caderno\Materiais\<conta>\<cadeira>\`. O Windows pode redirecionar a pasta Documentos para OneDrive; nesse caso o Caderno usa a localização que o Windows indicar.

Os PDFs já guardados abrem sem internet. Sincronizar o Moodle e usar IA exigem ligação à internet. Resumos, perguntas, flashcards e simulados já criados permanecem disponíveis offline. A aplicação guarda os ficheiros por conta e cadeira; o nome original faz parte do nome do ficheiro, precedido de um identificador para evitar colisões. Por enquanto, a importação e o visualizador integrados aceitam PDF até 20 MB por envio manual.

## Instalar

Descarrega [Caderno-0.1.0-Windows-x64.exe](https://github.com/miguelaopt/caderno/releases/download/v0.1.0-preview/Caderno-0.1.0-Windows-x64.exe), executa-o e escolhe a pasta de instalação. É um instalador x64 sem assinatura de código; o Windows pode apresentar um aviso de editor desconhecido. O código e o processo de build estão neste repositório.

Ao abrir, cria uma conta local. Para ligar o Moodle, indica primeiro o endereço HTTPS da plataforma em **Cadeiras → Endereço do Moodle**, guarda e introduz as tuas credenciais. Também podes criar cadeiras manuais e enviar PDFs sem configurar o Moodle. Em **Definições**, podes adicionar a tua própria chave de IA; é opcional. Anthropic, OpenAI, DeepSeek e Groq têm ligação direta. Para outro fornecedor que use Chat Completions, indica a URL base HTTPS e os IDs dos modelos.

## Cópias de segurança e mudança de computador

Fecha a aplicação antes de copiar os dados. Guarda em conjunto a pasta `%APPDATA%\Caderno\Dados` e a pasta `Documentos\Caderno\Materiais`. A chave `encryption.key` é necessária para recuperar tokens Moodle e chaves de IA guardadas. Para mudar de computador, instala a mesma versão do Caderno e repõe as duas pastas nos caminhos correspondentes antes de abrir a aplicação.

Apagar a conta na aplicação elimina os dados associados a essa conta, incluindo os PDFs. Desinstalar a aplicação não deve ser tratado como cópia de segurança; guarda os dados antes de reinstalar o Windows.

## Compilar

É necessário Node 24. No Windows:

```powershell
npm ci
npm run build
npm test
npm run desktop:dist
```

O ficheiro final aparece em `release/`. O workflow [Windows desktop](../.github/workflows/windows.yml) executa o build numa máquina Windows e disponibiliza o instalador como artefacto. O build também foi gerado em Linux para Windows; a execução da interface em Windows ainda deve ser validada num computador real antes de uma versão estável.
