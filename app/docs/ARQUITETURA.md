# Arquitetura do aplicativo

Este documento descreve como o app é organizado, como os dados fluem até a API e onde cada requisito das
Sprints 1 e 2 está implementado e testado (R84, R88). As duas sprints estão implementadas e testadas; os
requisitos de cada sprint estão no backlog do `README.md` da raiz do repositório. Para rodar, testar e gerar o
APK, veja o [README do app](../README.md).

## 1. Camadas

```text
app (rotas Expo Router)
  └─► features (telas por funcionalidade)
        ├─► ui (design system e gráficos) ─ não conhece dados nem telas
        ├─► domain (regras puras)         ─ só importa tipos
        └─► data (API, consultas, sessão)
              └─► core (HTTP, logs, armazenamento, arquivos, configuração)
```

| Camada         | Pasta            | Responsabilidade                                                                                       | Não pode                                             |
| -------------- | ---------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| Rotas          | `src/app`        | Declarar a navegação (Expo Router) e apontar cada rota para uma tela                                   | Ter lógica                                           |
| Telas          | `src/features/*` | Compor componentes, ler hooks de dados, tratar interação                                               | Importar rotas                                       |
| Design system  | `src/ui`         | Tema Material 3 claro/escuro, componentes, gráficos, ícones, responsividade                            | Importar core, dados, domínio ou telas               |
| Domínio        | `src/domain`     | Regras puras: dinheiro, datas, política de senha, orçamentos, metas, séries, anexos, dados de gráficos | Depender de React/RN; importar valores de data ou ui |
| Dados          | `src/data`       | Contrato da API (DTOs), cliente, hooks do React Query, sessão JWT, estado global                       | Importar telas, rotas, UI ou domínio                 |
| Infraestrutura | `src/core`       | Cliente HTTP, erros, logger, SecureStore, limpeza de arquivos temporários, configuração                | Conhecer dados, domínio, telas ou UI                 |

As regras são verificadas por `tests/unit/architecture.test.ts`: um import que pule camada faz o teste falhar.
O mesmo arquivo garante que `src/data/api` é TypeScript puro (roda também nos testes de contrato, em Node) e que
cada rota de `src/app` tem menos de 10 linhas e só importa de `features`.

## 2. Estrutura de pastas

```text
src/
├── app/                     rotas do Expo Router (cada arquivo só aponta para uma tela)
│   ├── _layout.tsx          provedores, splash e tela de erro global (R85)
│   ├── (auth)/              login, register, forgot-password
│   ├── (app)/               área logada: index, transactions, planning, wallets, preferences
│   │                        e as rotas ocultas archive, analytics e notifications
│   └── reset-password.tsx   link de redefinição de senha (R04)
├── features/
│   ├── shell/               raiz do app, barra superior (sino), navegação, folhas globais
│   ├── auth/                login, cadastro, recuperação de senha, biometria (R40)
│   ├── home/                Início em uma requisição (R83)
│   ├── transactions/        histórico, extrato, fluxo de caixa, formulário e detalhes
│   │   ├── attachments/     anexos: lista, seletor de arquivo, câmera, abrir no cache
│   │   ├── goals/           destinar uma receita já registrada a uma meta
│   │   ├── components/      campos: valor, tags, repetir, parcelar, meta de destino
│   │   └── voice/           registro por voz (R65)
│   ├── wallets/             carteiras, saldo mínimo, transferência, conversor
│   ├── planning/            Planejamento: Orçamentos · Metas · Contas
│   │   ├── budgets/         orçamentos mensais e diários, histórico, metas de redução
│   │   ├── goals/           metas de economia
│   │   └── accounts/        recorrências, parcelamentos e lembretes de contas
│   ├── analytics/           Análises: indicadores, gráficos, resumo anual, projeção, compartilhar
│   ├── notifications/       central de notificações e push (FCM)
│   ├── preferences/         tema, moeda, notificações, conta e biometria
│   ├── archive/             transações arquivadas
│   ├── feedback/            snackbar, desfazer, confirmação animada (R77)
│   └── system/              aviso de manutenção (R72)
├── data/
│   ├── api/                 contrato: DTOs (types.ts) e um módulo por recurso; TypeScript puro
│   ├── queries/             hooks do React Query por área (finance, reports, planning, notifications,
│   │                        attachments, account) e as chaves de cache (keys.ts)
│   ├── session/             sessão JWT: token em memória, refresh token no Keystore, tarefas de saída
│   ├── system/              estado global da manutenção
│   └── client.ts            raiz de composição: cliente HTTP + sessão + cache
├── domain/                  money, dates, password-policy, catalog, charts, annual-summary,
│                            budgets, goals, series, attachments
├── core/
│   ├── config/              URL da API e endereço do servidor escolhido no login
│   ├── http/                cliente HTTP e ApiError
│   ├── files/               temp-files.ts: limpeza de PDFs e imagens do cache (R81)
│   ├── logging/             logger com mascaramento, tratador global de erros, métrica de telas
│   ├── query/               QueryClient e foco do app
│   ├── storage/             SecureStore
│   └── hooks/               use-debounced-value
├── ui/
│   ├── theme/               tokens Material 3 claro/escuro, tipografia, classes de janela
│   ├── components/          botões, campos, cards, folhas, diálogos, Badge...
│   ├── charts/              pizza, anéis, linha, barras agrupadas e legenda
│   └── icons/               Material Symbols Rounded reduzida aos ícones usados
└── test-utils/              backend falso, dados de exemplo, módulos nativos simulados, render com provedores
tests/
├── unit/                    regras de arquitetura
└── contract/                app × backend real (Sprints 1 e 2)
```

## 3. Navegação

- **Cinco destinos** na barra inferior (celulares) ou no trilho lateral (tablets e telas largas): Início,
  Transações, **Planejamento** (entre Transações e Carteiras), Carteiras e Preferências. Ficam em
  `features/shell/navigation.tsx` (`DESTINATIONS`).
- **Rotas ocultas**, dentro de `(app)` e sem item na barra (`href: null`): `archive` (aberta pelas Preferências),
  `analytics` (aberta pelo cartão "Análises do mês" do Início e pelo botão "Ver análises" da aba Fluxo) e
  `notifications` (aberta pelo sino da barra superior).
- **Parâmetros de rota**: `/planning?section=budgets|goals|accounts` escolhe a seção, e `goalId` abre o detalhe de
  uma meta. É assim que os avisos levam à tela certa.
- **Rotas protegidas** com `Stack.Protected`: sem sessão, só as telas de acesso existem.

## 4. Caminho de uma operação

Registrar uma despesa:

```text
TransactionFormSheet (features/transactions)
  │ validação local (transaction-form.ts) — mesmas regras do DTO do backend
  ▼
useCreateTransaction (data/queries/finance.ts) — mutação do React Query
  ▼
api.transactions.create (data/api/finance.ts) — contrato tipado (data/api/types.ts)
  ▼
http-client (core/http) — JWT no cabeçalho; 401 TOKEN_EXPIRED → renova uma vez e repete;
  │                       503 MAINTENANCE_MODE → avisa a manutenção; erro → ApiError { code, details }
  ▼
POST /api/transactions
  ▼
sucesso → invalida saldos, listas e relatórios → confirmação animada (R77)
erro    → `details[].path` vira mensagem embaixo do campo; demais erros, aviso na folha
```

Com "Repetir" ou "Parcelar" marcados, a criação usa a rota de recorrência ou de parcelamento em vez da de
transação simples (`scheduleMode` em `transaction-form.ts`); se a receita for destinada a uma meta, o vínculo é
criado depois da transação e a conquista da meta só é celebrada quando o servidor informa que aquele vínculo a
completou (`achievedNow`).

Um aviso de push:

```text
servidor (alerta ou lembrete) ─► FCM ─► aparelho
  ├─ app aberto  → banner do sistema + invalida ["notifications"] → o contador do sino atualiza
  └─ toque       → parsePushData (valida os campos) → marca como lida → notificationTarget
                   → rota (Planejamento, Carteiras) ou detalhes da transação ou novo registro
```

O registro do aparelho (`POST /api/notifications/devices`) acontece quando há sessão e permissão concedida; o
descadastro roda no "Sair" por uma tarefa registrada em `session.onBeforeSignOut`, antes de a sessão ser
revogada (assim o token ainda vale). A tarefa tem limite de 5 s e uma falha não impede a saída.

## 5. Decisões principais

- **Expo (CNG) + Expo Router**: a pasta `android/` é gerada a partir de `app.config.ts`; rotas protegidas
  com `Stack.Protected` (sem sessão, só as telas de acesso existem).
- **React Query** para dados do servidor: cache, paginação por cursor (`useInfiniteQuery`), invalidação
  após cada alteração. **Zustand** para estado do cliente (sessão, tema, manutenção, endereço do servidor).
- **Sessão JWT**: access token só em memória; refresh token cifrado pelo Android Keystore
  (`expo-secure-store`). A renovação é feita uma única vez por vez (voo único), porque o backend rotaciona
  o refresh token e trata reuso como roubo.
- **Biometria (R40)**: `@sbaiahmed1/react-native-biometrics`, sucessor mantido do `react-native-biometrics`
  (sem suporte à Nova Arquitetura do RN 0.86). Mesmo modelo: chave EC P-256 no Keystore protegida pela
  digital, chave pública (SPKI/base64) cadastrada no servidor, assinatura SHA256withECDSA do desafio.
- **Voz (R65)**: o requisito cita `expo-speech`, que só faz texto → fala. A captura (fala → texto) usa
  `expo-speech-recognition` (serviço de reconhecimento do Android, pt-BR); a frase vai para
  `POST /api/transactions/parse`; o `expo-speech` lê a confirmação em voz alta.
- **Módulos nativos opcionais**: biometria, voz, notificações, câmera, seletor de arquivos, redução de imagem e
  captura de imagem dos cartões só são carregados se o módulo nativo existir no app instalado
  (`requireOptionalNativeModule` ou `TurboModuleRegistry.get`). Sem ele, o recurso fica escondido ou indisponível
  em vez de derrubar o app.
- **Ícones**: Material Symbols Rounded, reduzida aos ícones usados (`npm run icons:build`, ~27 KB por variante,
  contorno e preenchido).
- **Formatação**: valores em pt-BR com o símbolo da moeda de cada carteira (`R$ 1.234,56`, `US$ 908,00`).
- **Cor das carteiras**: o backend não guarda cor/ícone; ambos derivam do tipo da carteira.
- **Carregamento sob demanda (R83, R86)**: nas Análises, o resumo anual e a projeção só consultam a API quando o
  cartão entra (ou quase entra) na área visível; a lista de metas dos formulários, os anexos e as vinculações de
  metas só são consultados com a folha aberta; o anexo só é baixado quando a pessoa toca nele.

## 6. Decisões e desvios (Sprint 2)

- **Categoria de meta e de orçamento**: orçamentos (mensais e diários), metas de redução e metas de economia
  aceitam categorias de **despesa ou de ambos os tipos**; categorias só de receita não aparecem na escolha
  (`spendingCategories`, em `features/planning/components/category-chips.tsx`).
- **Meses passados do Planejamento**: o seletor de mês de Planejamento › Orçamentos não passa do mês atual. Ao
  consultar um mês anterior, as linhas dos orçamentos não abrem a edição e os limites diários, que valem para
  hoje, não são exibidos. Criar ou alterar um orçamento vale a partir do mês atual.
- **Push com o token nativo do FCM**: o app obtém o token do Firebase Cloud Messaging
  (`getDevicePushTokenAsync`) e o registra no backend, que envia pelo FCM; o serviço de push da Expo não é usado.
  O push **não funciona no Expo Go**: `loadNativeNotifications()` devolve `null`, nada é pedido nem registrado, e as
  Preferências avisam que o recurso existe no app instalado (degrada sem erro). No build é preciso o
  `google-services.json` do projeto Firebase (veja o README); sem ele o app funciona, só não recebe push. A caixa
  de notificações funciona do mesmo jeito, pois é alimentada pela API.
- **Anexos baixados ficam sem cifra no cache (R81)**: o servidor guarda os anexos cifrados, mas o arquivo baixado
  para abrir, o extrato em PDF, a foto da câmera e a imagem de um cartão compartilhado ficam no cache do app sem
  cifra. `purgeTempFiles` (`core/files/temp-files.ts`) apaga todos os PDFs e imagens (`.pdf`, `.jpg`, `.jpeg`,
  `.png`, `.webp`) do cache, em todas as subpastas, ao abrir o app logado (`AppShell`) e ao sair da conta
  (`onSignedOut`, em `data/client.ts`). Se o sistema encerrar o app antes disso, os arquivos ficam até a
  próxima abertura.
- **Gráficos com design system próprio**: `src/ui/charts` oferece pizza, anéis, linha, barras agrupadas e legenda.
  Pizza, anéis e linha usam o `react-native-chart-kit` por baixo; as barras e a legenda são `View`s. Os gráficos
  usam as cores do tema, medem a largura do cartão (R82) e trazem um resumo em texto para leitores de tela. As
  telas passam dados prontos e só importam de `@/ui`; a biblioteca é usada apenas dentro de `ui/charts`.
- **Cobertura que depende do aparelho**: push com o app fechado (o toque que abre o app), câmera, compartilhar
  cartão como imagem, biometria e voz não têm teste automatizado completo. Os testes usam módulos nativos
  simulados (`jest.setup-env.js`) e verificam o fluxo das telas e as chamadas à API, mas não o comportamento real
  do Android, do FCM nem da folha de compartilhamento; esses pontos são validados à mão em emulador ou aparelho.

## 7. Componentes reutilizáveis (`src/ui`)

| Componente                                                           | Uso                                                                                                  |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `ThemeProvider`, `palettes`, `useTheme`                              | Tokens Material Design 3, claro e escuro (R42, R80)                                                  |
| `useResponsiveLayout`, `ContentContainer`, `Grid`                    | Classes de janela MD3, largura máxima e grade em tablets (R82)                                       |
| `Text`, `Icon`                                                       | Escala tipográfica (Roboto/Roboto Mono) e ícones Material Symbols                                    |
| `Button`, `IconButton`, `FAB`, `Chip`, `SegmentedControl`, `Switch`  | Controles MD3 com estados acessíveis                                                                 |
| `TextField`, `DateField`                                             | Campos com rótulo, erro por campo e seletor nativo de data                                           |
| `Card`, `Banner`, `EmptyState`, `Skeleton`, `ProgressBar`, `Divider` | Estrutura e feedback de carregamento                                                                 |
| `Badge`                                                              | Selo numérico (contador de avisos não lidos no sino); some com zero e é só visual (R22)              |
| `Sheet`, `Dialog`, `Snackbar`                                        | Folha inferior (mede a área segura dentro do próprio Modal), diálogo de confirmação e aviso com ação |
| `PieChartCard`, `RingChart`, `LineChartCard`, `GroupedBarChart`      | Gráficos de pizza, anéis, linha e barras agrupadas; `ChartLegend` monta a legenda                    |

## 8. Mapa de requisitos

Os caminhos da coluna "Onde" são relativos a `src/`. Na coluna "Testes", os nomes são arquivos de teste
(`*.test.ts` ou `*.test.tsx`) e "contrato" são os testes de `tests/contract`.

### 8.1 Sprint 1

| Req.     | Onde                                                                                                                                                                                                    | Testes                                                   |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| R01      | App RN Android; registro e categorização; gráficos em Início (maiores despesas) e Fluxo (6 meses). As metas de economia (Sprint 2) ficam em Planejamento › Metas                                        | telas, contrato                                          |
| R02      | `features/auth/register-screen.tsx`, `domain/password-policy.ts`                                                                                                                                        | auth-screens, domain, contrato                           |
| R03      | `data/session/*`, `core/http/http-client.ts`, `Stack.Protected`                                                                                                                                         | session-manager, navigation, contrato                    |
| R04      | `features/auth/password-recovery-screens.tsx` (+ link `orcamentofacil://reset-password`)                                                                                                                | auth-screens, contrato                                   |
| R40      | `features/auth/biometric-auth.ts`, botão no login, chave em Preferências                                                                                                                                | biometric-auth, auth-screens, screens, contrato          |
| R87      | Bloqueio com contagem regressiva (423), renovação/expiração de token, aviso de sessão expirada                                                                                                          | auth-screens, http-client, session-manager, contrato     |
| R53, R56 | `features/wallets/wallet-form-sheet.tsx`, `currency-picker.tsx`                                                                                                                                         | screens, contrato                                        |
| R54      | `features/wallets/transfer-sheet.tsx` (chave de idempotência)                                                                                                                                           | screens, contrato                                        |
| R55      | Início e Carteiras (`/reports/overview`, `/wallets/summary`)                                                                                                                                            | screens, contrato                                        |
| R28      | Moeda no cadastro e em Preferências                                                                                                                                                                     | auth-screens, screens, contrato                          |
| R29      | `converter-dialog.tsx`, prévia da conversão na transferência                                                                                                                                            | screens, contrato                                        |
| R06, R11 | `transaction-form-sheet.tsx`, `transaction-form.ts` (edição envia só o que mudou)                                                                                                                       | transaction-sheets, transaction-rules, contrato          |
| R12      | Diálogo "Excluir transação?" em `transaction-details-sheet.tsx`                                                                                                                                         | transaction-sheets                                       |
| R48      | Duplicar nos detalhes                                                                                                                                                                                   | transaction-sheets, contrato                             |
| R49      | Snackbar "Desfazer" (`use-undoable-feedback.ts` → `POST /api/history/undo`), também ao cancelar uma série                                                                                               | transaction-sheets, planning, contrato                   |
| R65      | Atalho de microfone no lugar do principal do Início (`home-screen.tsx`) e botão no formulário; `voice/use-voice-capture.ts`, `listening-panel.tsx`                                                      | transaction-sheets, screens, contrato                    |
| R77      | `features/feedback/success-overlay.tsx`                                                                                                                                                                 | transaction-sheets, screens                              |
| R07, R08 | Categorias por tipo e `new-category-dialog.tsx`                                                                                                                                                         | transaction-sheets, contrato                             |
| R43      | `tags-input.tsx`, filtro por tag                                                                                                                                                                        | transaction-sheets, contrato                             |
| R44      | Chip "Sugestão" (`POST /api/categories/suggest`)                                                                                                                                                        | transaction-sheets, contrato                             |
| R09      | `history-tab.tsx` — FlatList com rolagem infinita por cursor                                                                                                                                            | transactions-tabs, contrato                              |
| R10      | Busca, categoria, tag e período no histórico                                                                                                                                                            | transactions-tabs, contrato                              |
| R26      | Navegação por mês e resumo do mês                                                                                                                                                                       | transactions-tabs, contrato                              |
| R70      | Ordenação por data, valor e categoria                                                                                                                                                                   | transactions-tabs, contrato                              |
| R52      | Arquivar/restaurar nos detalhes, filtro de arquivadas e a tela Arquivo (`features/archive`, aberta pelas Preferências): arquivamento em lote, lista de arquivadas, restaurar uma ou todas, com Desfazer | transaction-sheets, transactions-tabs, screens, contrato |
| R41      | `statement-tab.tsx` + PDF baixado do servidor e compartilhado                                                                                                                                           | transactions-tabs, contrato                              |
| R58      | `cash-flow-tab.tsx` com saldo acumulado na moeda principal                                                                                                                                              | transactions-tabs, transaction-rules, contrato           |
| R42      | Tema sistema/claro/escuro, salvo no aparelho e no perfil                                                                                                                                                | theme-preference, screens                                |
| R80      | Design system Material 3 (`ui/`): tokens de cor, tipografia e formas do Material Design 3                                                                                                               | ui                                                       |
| R82      | Barra inferior ↔ trilho lateral, grade e largura máxima em tablets, fonte limitada a 1,3×; os gráficos acompanham a largura do cartão                                                                   | ui, navigation                                           |
| R72      | Status consultado a cada minuto, 503 tratado, avisos e bloqueio das escritas; chave para administradores                                                                                                | screens, http-client, contrato                           |
| R81      | Tokens no Keystore; nenhum dado financeiro gravado no aparelho (cifragem no banco é do backend). Arquivos temporários: veja 8.2                                                                         | session-manager                                          |
| R83      | Início em uma requisição, cache, esqueletos, FlatList otimizada, build de release                                                                                                                       | screens, contrato                                        |
| R84      | Camadas e componentes reutilizáveis                                                                                                                                                                     | architecture                                             |
| R85      | `core/logging` (eventos, mascaramento), tratador global de erros e tela de erro                                                                                                                         | logger                                                   |
| R86      | gzip pelo OkHttp (verificado), páginas de 20, buscas com atraso, PATCH só com o que mudou                                                                                                               | http-client, contrato                                    |
| R88      | Este documento e o README                                                                                                                                                                               | —                                                        |
| R79      | React Native 0.86 / Expo SDK 57, `platforms: ["android"]`                                                                                                                                               | build Android                                            |

### 8.2 Sprint 2

| Req.     | Onde                                                                                                                                                                                                                                                                                                                                  | Testes                                                                 |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| R37      | Repetir no formulário (`transactions/components/repeat-field.tsx`), "Marcar como recorrente" (`mark-recurring-dialog.tsx`), Planejamento › Contas (`planning/accounts/series-*`), `domain/series.ts`; a criação envia `Idempotency-Key` (`useCreateRecurring`), então repetir o envio depois de uma falha de rede não duplica a série | series-and-goals, planning, domain/series, transaction-rules, contrato |
| R62      | Parcelar despesa (`transactions/components/installments-field.tsx`): de 2 a 72 parcelas, prévia com a sobra dos centavos na 1ª; selo "Parcela 3/10" na lista e nos detalhes; também com `Idempotency-Key` (`useCreateInstallments`)                                                                                                   | series-and-goals, planning, domain/series, transaction-rules, contrato |
| R34      | Lembretes de contas (`planning/accounts/reminders-section.tsx`, `reminder-form-sheet.tsx`), avulsos ou a partir de uma despesa recorrente; horário e interruptores em Preferências                                                                                                                                                    | planning, notifications-section, contrato                              |
| R21, R74 | Planejamento › Orçamentos (`planning/budgets/*`): orçamentos mensais e limites diários por categoria, com estado (dentro, atenção, estourado) e restante                                                                                                                                                                              | planning, domain/planning, contrato                                    |
| R45      | `planning/budgets/budget-chart.tsx`: orçado × gasto por categoria, compartilhável como imagem (R30)                                                                                                                                                                                                                                   | planning, domain/planning, contrato                                    |
| R23      | `planning/budgets/budget-history-sheet.tsx`: últimos 6 ou 12 meses e comparação entre dois meses                                                                                                                                                                                                                                      | planning, domain/planning, contrato                                    |
| R67      | `planning/budgets/reduction-goals.tsx`, `reduction-goal-form-sheet.tsx`: metas de redução com base, alvo e estado; recusa sem gasto nos meses anteriores (`NO_BASELINE`)                                                                                                                                                              | planning, contrato                                                     |
| R15, R16 | Planejamento › Metas (`planning/goals/*`, `domain/goals.ts`): metas de economia com prazo, progresso e filtro Ativas · Atingidas · Canceladas                                                                                                                                                                                         | planning, domain/planning, contrato                                    |
| R17      | Destino da receita no formulário (`transactions/components/goal-destination-field.tsx`), "Destinar a uma meta" nos detalhes (`transactions/goals/*`) e, no detalhe da meta, as receitas vinculadas e o botão "Vincular receita" (`planning/goals/link-income-dialog.tsx`)                                                             | series-and-goals, planning, contrato                                   |
| R68      | Celebração só quando o vínculo completa a meta (`achievedNow`); o aviso de meta abre o detalhe da meta                                                                                                                                                                                                                                | series-and-goals, notifications, planning, contrato                    |
| R13, R50 | Análises › Despesas por categoria (`analytics/category-breakdown-card.tsx`): pizza com as 5 maiores e "Outras" (R13), alterna para anéis (R50); `ui/charts/pie-chart-card.tsx`, `ring-chart.tsx`, `domain/charts.ts`                                                                                                                  | analytics, charts                                                      |
| R14      | Análises › Evolução do saldo (`analytics/balance-evolution-card.tsx`, `ui/charts/line-chart-card.tsx`): 30 dias ou 12 meses, todas as carteiras ou uma                                                                                                                                                                                | analytics, charts, contrato                                            |
| R35, R75 | Análises › indicadores do mês (`analytics/month-indicators-card.tsx`): saldo médio diário e economia comparada à média dos meses anteriores                                                                                                                                                                                           | analytics, contrato                                                    |
| R36      | Análises › maiores despesas (`analytics/top-expenses-card.tsx`): as 10 maiores do mês; o toque abre os detalhes                                                                                                                                                                                                                       | analytics, contrato                                                    |
| R38      | Análises › resumo anual (`analytics/annual-summary-card.tsx`, `domain/annual-summary.ts`): 12 meses, totais e médias dos meses decorridos                                                                                                                                                                                             | analytics                                                              |
| R63      | Análises › projeção (`analytics/projection-card.tsx`): saldo dos próximos 6 meses pelas recorrências e parcelas                                                                                                                                                                                                                       | analytics, contrato                                                    |
| R46      | `analytics/category-visibility-sheet.tsx`: oculta categorias dos relatórios; o cartão informa quantas ficaram de fora                                                                                                                                                                                                                 | analytics, contrato                                                    |
| R30      | `analytics/share-button.tsx`, `share-card.ts`, `components/section-card.tsx` (também usado pelo gráfico de orçamentos): o cartão vira uma imagem PNG e abre a folha de compartilhamento do Android; aviso sobre os valores na primeira vez; escondido sem o módulo de captura                                                         | share-card (captura real só em aparelho)                               |
| R22      | Sino com contador (`shell/app-bar.tsx`, `ui/components/badge.tsx`) e `notifications/notifications-screen.tsx`: lista com rolagem infinita, filtro "Não lidas", "Marcar todas como lidas"                                                                                                                                              | notifications, ui, contrato                                            |
| R47      | Avisos por tipo (`notifications/notification-row.tsx`) e destino pela entidade do aviso (`notification-target.ts`, `use-open-notification.ts`)                                                                                                                                                                                        | notifications                                                          |
| R78      | Saldo mínimo da carteira, inclusive negativo (`wallets/wallet-form-sheet.tsx`), selo "Abaixo do mínimo" em Carteiras e aviso de saldo baixo na central                                                                                                                                                                                | wallet-min-balance, notifications, contrato                            |
| R18      | Push pelo FCM (`notifications/push-registration.ts`, `push-notifications.tsx`, `native-notifications.ts`), pedido de permissão explicado, preferências (`preferences/notifications-section.tsx`), descadastro em `onBeforeSignOut`                                                                                                    | push, notifications-section, session-manager, contrato                 |
| R24      | Foto do recibo pela câmera (`transactions/attachments/camera-modal.tsx`), reduzida a 1600 px (JPEG 0,7) antes do envio                                                                                                                                                                                                                | attachments, domain/attachments, contrato                              |
| R25      | Anexos PDF e imagem nos detalhes (`attachments-section.tsx`, `native-files.ts`): até 10 por transação e 5 MB cada, conferidos antes do envio; abrir baixa para o cache (`open-attachment.ts`) e excluir pede confirmação                                                                                                              | attachments, domain/attachments, contrato                              |
| R76      | "Comprovante de pagamento": anexo do tipo `receipt`, pelo seletor ou pela câmera                                                                                                                                                                                                                                                      | attachments, domain/attachments, contrato                              |
| R57      | Observações no formulário e nos detalhes (`transaction-form.ts`): até 1000 caracteres                                                                                                                                                                                                                                                 | transaction-sheets, transaction-rules, contrato                        |
| R81      | `core/files/temp-files.ts`: limpeza de PDFs e imagens do cache ao abrir o app logado (`shell/app-shell.tsx`) e ao sair da conta (`data/client.ts`)                                                                                                                                                                                    | temp-files                                                             |
| R83, R86 | Análises: 3 consultas ao abrir, resumo anual e projeção adiados até aparecerem; Planejamento: uma consulta de status por mês; foto reduzida antes do envio; anexo baixado só ao tocar                                                                                                                                                 | analytics, planning, attachments, contrato                             |

## 9. Testes

| Tipo        | Onde                                                  | O que garante                                                                                                                    |
| ----------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Unidade     | `src/**/*.test.ts`                                    | Regras de domínio (orçamentos, metas, séries, anexos), cliente HTTP, sessão, logger, biometria, formulários, limpeza de arquivos |
| Telas       | `src/**/*.test.tsx`                                   | Fluxos reais renderizados com um backend falso (`test-utils/fake-api.ts`) e módulos nativos simulados                            |
| Gráficos    | `ui/charts/charts.test.tsx`                           | Pizza, anéis, linha e barras renderizam com o resumo em texto; regras de lacunas e de rótulos do eixo                            |
| Navegação   | `features/shell/navigation.test.tsx`                  | Rotas protegidas e restauração da sessão com o roteador real                                                                     |
| Arquitetura | `tests/unit/architecture.test.ts`                     | Dependências entre camadas                                                                                                       |
| Contrato    | `tests/contract` (`api-contract`, `sprint2-contract`) | O app conversa corretamente com o backend real: Sprint 1 e Sprint 2 (planejamento, relatórios, avisos, anexos)                   |

Os comandos para rodar cada tipo estão no [README do app](../README.md). Como o contrato exige a API no ar, o
passo a passo está em [tests/contract/README.md](../tests/contract/README.md). Os pontos que dependem do
aparelho físico estão listados em "Decisões e desvios".
