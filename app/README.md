# Orçamento Fácil — aplicativo Android

Aplicativo da Sprint 1 do Orçamento Fácil, em **React Native 0.86 (Expo SDK 57)**, empacotado só para
**Android** (R79). Consome a API RESTful de [`../backend`](../backend/docs/GUIA.md) e segue o visual do protótipo
[`../NavegVelOrAmentoFCil`](../NavegVelOrAmentoFCil) (Material Design 3, R80).

- Arquitetura, camadas e mapa de requisitos: [docs/ARQUITETURA.md](docs/ARQUITETURA.md)
- Testes de contrato com o backend: [tests/contract/README.md](tests/contract/README.md)

## Pré-requisitos

| Ferramenta | Versão |
|---|---|
| Node.js | 22.13+ ou 24 |
| JDK | 17 ou 21 (o do Android Studio serve: `C:\Program Files\Android\Android Studio\jbr`) |
| Android SDK | Platform 36, Build-Tools 36, NDK 27 (instale pelo Android Studio) |
| Backend | rodando localmente (veja `backend/docs/GUIA.md`) |

No **Expo Go** o app abre e funciona, **sem biometria e sem voz** (são módulos nativos que o Expo Go não traz).
Para ter tudo, instale um build de desenvolvimento ou o APK de release.

## Configuração

Copie `.env.example` para `.env` e ajuste a URL da API:

```bash
EXPO_PUBLIC_API_URL=http://10.0.2.2:3000   # emulador: 10.0.2.2 é o localhost do computador
```

Num aparelho físico, use o IP do computador na rede (ex.: `http://192.168.0.10:3000`; com a API no Docker, que
publica o Nginx na porta 80, use `http://192.168.0.10`). Com `http://`, o
build libera tráfego sem TLS; em produção, use `https://`.

## Rodando

```bash
npm install
npm run android          # gera o build de desenvolvimento, instala no emulador/aparelho e sobe o Metro
npm start                # nas próximas vezes, só o Metro (o app já instalado se conecta)
```

APK de release (JS embutido, sem Metro):

```bash
npm run prebuild                                   # gera android/ a partir do app.config.ts
cd android && ./gradlew assembleRelease            # APK em android/app/build/outputs/apk/release/
```

Para gerar só para o emulador (mais rápido): `./gradlew assembleRelease -PreactNativeArchitectures=x86_64`.

> **Windows: compile de uma pasta sem acentos.** O compilador C++ do NDK não abre arquivos em caminhos
> com caracteres não ASCII (como `Área de Trabalho`), e o plugin Android recusa essas pastas. Para gerar
> o APK, clone ou copie o projeto para um caminho só com ASCII (ex.: `C:\dev\orcamento-facil`). Os testes,
> o lint e a checagem de tipos funcionam em qualquer pasta.

A pasta `android/` é gerada (Continuous Native Generation) e não vai para o git: configurações nativas ficam
em `app.config.ts` e nos plugins.

## Scripts

| Comando | Para quê |
|---|---|
| `npm run android` | Build de desenvolvimento no Android |
| `npm start` | Metro para o build de desenvolvimento |
| `npm test` | Testes unitários e de telas (Jest + Testing Library) |
| `npm run test:coverage` | Testes com relatório de cobertura em `coverage/` |
| `npm run test:contract` | Testes de contrato contra o backend real (API precisa estar no ar) |
| `npm run typecheck` | Checagem de tipos (TypeScript estrito) |
| `npm run lint` | ESLint (inclui as regras do React Compiler) |
| `npm run icons:build` | Regera a fonte de ícones depois de mudar `src/ui/icons/icon-names.ts` |

## Recuperação de senha pelo app (R04)

Por padrão o link do e-mail abre a página de redefinição servida pelo backend. Para abrir direto no app,
configure no backend `PASSWORD_RESET_URL=orcamentofacil://reset-password`. A tela do app também aceita o
código do link colado manualmente.

## Estrutura

```text
src/
├── app/        rotas do Expo Router (finas: só apontam para as telas)
├── features/   telas e componentes por funcionalidade (auth, home, transactions, wallets, preferences, shell...)
├── data/       acesso à API: contrato (DTOs), cliente, sessão e hooks do React Query
├── domain/     regras puras: dinheiro, datas, senha, catálogo de ícones
├── core/       infraestrutura: HTTP, logs, armazenamento cifrado, configuração
├── ui/         design system Material 3 (tema claro/escuro, componentes, ícones)
└── test-utils/ backend falso, dados de exemplo e renderização com provedores
tests/
├── unit/       regras de arquitetura
└── contract/   app × backend real
```
