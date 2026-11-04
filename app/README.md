# Orçamento Fácil — aplicativo Android

Aplicativo do Orçamento Fácil (Sprints 1 e 2), em **React Native 0.86 (Expo SDK 57)**, empacotado só para
**Android** (R79). Consome a API RESTful de [`../backend`](../backend/docs/GUIA.md) e segue o Material Design 3
(R80), com tema claro e escuro (R42) e layout adaptado a tablets (R82).

- Arquitetura, camadas e mapa de requisitos: [docs/ARQUITETURA.md](docs/ARQUITETURA.md)
- Testes de contrato com o backend: [tests/contract/README.md](tests/contract/README.md)

## O que o app faz

- **Sprint 1**: cadastro, login (senha ou biometria) e recuperação de senha; carteiras em várias moedas,
  transferências e conversor; registro, edição, duplicação e exclusão de transações (também por voz), com
  categorias e tags; histórico, extrato em PDF, fluxo de caixa, arquivo de transações e desfazer.
- **Planejamento** (Sprint 2): orçamentos mensais e limites diários por categoria, histórico de orçamentos e metas
  de redução; metas de economia com receitas destinadas a elas; recorrências, parcelamentos e lembretes de contas.
- **Análises** (Sprint 2): indicadores do mês, maiores despesas, evolução do saldo, despesas por categoria (pizza ou
  anéis), resumo anual, projeção do saldo e compartilhamento dos cartões como imagem.
- **Notificações** (Sprint 2): central de avisos com contador no sino, preferências de aviso e push pelo Firebase
  Cloud Messaging.
- **Anexos** (Sprint 2): PDF e imagens nas transações, com foto pela câmera e comprovante de pagamento.

## Pré-requisitos

| Ferramenta  | Versão                                                                              |
| ----------- | ----------------------------------------------------------------------------------- |
| Node.js     | 22.13+ ou 24                                                                        |
| JDK         | 17 ou 21 (o do Android Studio serve: `C:\Program Files\Android\Android Studio\jbr`) |
| Android SDK | Platform 36, Build-Tools 36, NDK 27 (instale pelo Android Studio)                   |
| Backend     | rodando localmente (veja [`../backend/docs/GUIA.md`](../backend/docs/GUIA.md))      |
| Firebase    | opcional: só para receber push (veja "Push e Firebase")                             |
| Python      | opcional: só para `npm run icons:build` (`pip install fonttools`)                   |

No **Expo Go** o app abre, mas os recursos que dependem de módulos nativos ficam indisponíveis: biometria, voz,
push e o compartilhamento de cartões como imagem (a câmera e o seletor de arquivos também só funcionam quando o
módulo existe no app instalado). Para ter tudo, instale um build de desenvolvimento ou o APK de release.

## Variáveis de ambiente

Copie `.env.example` para `.env` (arquivo local, fora do git) e ajuste o que precisar:

| Variável               | Para quê                                                                                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EXPO_PUBLIC_API_URL`  | URL base da API, com `http://` ou `https://`. Vai embutida no build. Sem ela, em desenvolvimento o app usa o IP do computador que serve o Metro, na porta 3000, e por fim `http://10.0.2.2:3000`. |
| `GOOGLE_SERVICES_JSON` | Caminho do `google-services.json` do Firebase (fica fora do repositório). Só é lida no build (`expo prebuild` / Gradle); sem ela o app funciona, mas não recebe push.                             |

```bash
EXPO_PUBLIC_API_URL=http://10.0.2.2:3000   # emulador: 10.0.2.2 é o localhost do computador
```

Num aparelho físico, use o IP do computador na rede (ex.: `http://192.168.0.10:3000`; com a API no Docker, que
publica o Nginx na porta 80, use `http://192.168.0.10`). Com `http://`, o build libera tráfego sem TLS; em
produção, use `https://`. Na tela de login também dá para trocar o endereço do servidor sem gerar outro build.

## Rodando

```bash
npm install
npm run android          # gera o build de desenvolvimento, instala no emulador/aparelho e sobe o Metro
npm start                # nas próximas vezes, só o Metro (o app já instalado se conecta)
```

`npm run android` compila o cliente de desenvolvimento (dev client) com todos os módulos nativos. Depois de
instalado, `npm start` basta enquanto as dependências nativas não mudarem. Com o Expo Go, rode `npm start` e abra o
QR code (com as limitações descritas acima).

## Gerar o APK de release

JavaScript embutido, sem Metro:

```bash
npm run prebuild                                   # gera android/ a partir do app.config.ts
cd android && ./gradlew assembleRelease            # APK em android/app/build/outputs/apk/release/
```

Para gerar só para o emulador (mais rápido): `./gradlew assembleRelease -PreactNativeArchitectures=x86_64`.

Defina `EXPO_PUBLIC_API_URL` (e, se quiser push, `GOOGLE_SERVICES_JSON`) antes do `prebuild` e do Gradle: os dois
valores são lidos no build.

> **Windows: compile de uma pasta sem acentos.** O compilador C++ do NDK não abre arquivos em caminhos
> com caracteres não ASCII (como `Área de Trabalho`), e o plugin Android recusa essas pastas. Para gerar
> o APK, clone ou copie o projeto para um caminho só com ASCII (ex.: `C:\dev\orcamento-facil`). Os testes,
> o lint e a checagem de tipos funcionam em qualquer pasta.

A pasta `android/` é gerada (Continuous Native Generation) e não vai para o git: configurações nativas ficam
em `app.config.ts` e nos plugins.

## Push e Firebase

O push usa o token nativo do Firebase Cloud Messaging (FCM), não o serviço de push da Expo, e não funciona no
Expo Go. Para ativá-lo no build:

1. No console do Firebase, crie um projeto e registre um app Android com o pacote `app.orcamentofacil`.
2. Baixe o arquivo `google-services.json` e guarde-o **fora do repositório** (o git ignora esse nome).
3. Aponte a variável `GOOGLE_SERVICES_JSON` para o caminho do arquivo antes do `npm run prebuild` e do Gradle
   (por exemplo, `GOOGLE_SERVICES_JSON=C:/caminho/fora/do/projeto/google-services.json`).
4. No servidor, configure a credencial da conta de serviço do Firebase (`FCM_*`), como descrito no
   [README do backend](../backend/README.md). Sem ela, o servidor só registra o push no log, e a central de
   notificações do app continua funcionando.

## Testes e qualidade

```bash
npm run typecheck      # TypeScript estrito
npm run lint           # ESLint (inclui as regras do React Compiler)
npm run format:check   # Prettier (npm run format aplica a formatação)
npx jest               # unidade, telas e arquitetura (o mesmo que npm test)
npm run test:contract  # app x backend real (a API precisa estar no ar)
```

O `npm run test:contract` usa um banco isolado e a API local na porta 3100. O passo a passo (subir o PostgreSQL de
testes, a API e rodar com `CONTRACT_API_URL`) está em [tests/contract/README.md](tests/contract/README.md).

## Scripts

| Comando                 | Para quê                                                                     |
| ----------------------- | ---------------------------------------------------------------------------- |
| `npm run android`       | Build de desenvolvimento no Android                                          |
| `npm start`             | Metro para o build de desenvolvimento                                        |
| `npm run prebuild`      | Gera a pasta `android/` a partir do `app.config.ts`                          |
| `npm run build:apk`     | Roda o `gradlew assembleRelease` dentro de `android/` (depois do `prebuild`) |
| `npm test`              | Testes unitários e de telas (Jest + Testing Library)                         |
| `npm run test:coverage` | Testes com relatório de cobertura em `coverage/`                             |
| `npm run test:contract` | Testes de contrato contra o backend real (API precisa estar no ar)           |
| `npm run typecheck`     | Checagem de tipos (TypeScript estrito)                                       |
| `npm run lint`          | ESLint (inclui as regras do React Compiler)                                  |
| `npm run format:check`  | Confere a formatação com o Prettier                                          |
| `npm run icons:build`   | Regera a fonte de ícones depois de mudar `src/ui/icons/icon-names.ts`        |

## Recuperação de senha pelo app (R04)

Por padrão o link do e-mail abre a página de redefinição servida pelo backend. Para abrir direto no app,
configure no backend `PASSWORD_RESET_URL=orcamentofacil://reset-password`; a tela do app abre com o código
do link já preenchido.

## Estrutura

```text
src/
├── app/        rotas do Expo Router (finas: só apontam para as telas)
├── features/   telas e componentes por funcionalidade (auth, home, transactions, wallets, planning, analytics,
│               notifications, preferences, archive, shell...)
├── data/       acesso à API: contrato (DTOs), cliente, sessão e hooks do React Query
├── domain/     regras puras: dinheiro, datas, senha, orçamentos, metas, séries, anexos, catálogo de ícones
├── core/       infraestrutura: HTTP, logs, armazenamento cifrado, arquivos temporários, configuração
├── ui/         design system Material 3 (tema claro/escuro, componentes, gráficos, ícones)
└── test-utils/ backend falso, dados de exemplo e renderização com provedores
tests/
├── unit/       regras de arquitetura
└── contract/   app × backend real
```

A árvore completa, o fluxo de uma operação, as decisões de projeto e o mapa de requisitos estão em
[docs/ARQUITETURA.md](docs/ARQUITETURA.md).
