# Arquitetura do aplicativo

Este documento descreve como o app é organizado, como os dados fluem até a API e onde cada requisito da
Sprint 1 (`sources/requisitos-1sprint.txt`) está implementado e testado (R84, R88).

## 1. Camadas

```text
app (rotas Expo Router)
  └─► features (telas por funcionalidade)
        ├─► ui (design system)          ─ não conhece dados nem telas
        ├─► domain (regras puras)       ─ só importa tipos
        └─► data (API, sessão, cache)
              └─► core (HTTP, logs, armazenamento, configuração)
```

| Camada | Pasta | Responsabilidade | Não pode |
|---|---|---|---|
| Rotas | `src/app` | Declarar a navegação (Expo Router) e apontar cada rota para uma tela | Ter lógica |
| Telas | `src/features/*` | Compor componentes, ler hooks de dados, tratar interação | Importar rotas |
| Design system | `src/ui` | Tema Material 3 claro/escuro, componentes, ícones, responsividade | Importar dados, domínio ou telas |
| Domínio | `src/domain` | Regras puras: formatação de dinheiro, datas, política de senha, catálogo de ícones | Depender de React/RN |
| Dados | `src/data` | Contrato da API (DTOs), cliente, sessão JWT, cache (React Query), estado global | Importar telas ou UI |
| Infraestrutura | `src/core` | Cliente HTTP, erros, logger, SecureStore, configuração | Conhecer o domínio |

As regras são verificadas por `tests/unit/architecture.test.ts`: um import que pule camada faz o teste falhar.

## 2. Caminho de uma operação

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

## 3. Decisões principais

- **Expo (CNG) + Expo Router**: a pasta `android/` é gerada a partir de `app.config.ts`; rotas protegidas
  com `Stack.Protected` (sem sessão, só as telas de acesso existem).
- **React Query** para dados do servidor: cache, paginação por cursor (`useInfiniteQuery`), invalidação
  após cada alteração. **Zustand** para estado do cliente (sessão, tema, manutenção).
- **Sessão JWT**: access token só em memória; refresh token cifrado pelo Android Keystore
  (`expo-secure-store`). A renovação é feita uma única vez por vez (voo único), porque o backend rotaciona
  o refresh token e trata reuso como roubo.
- **Biometria (R40)**: `@sbaiahmed1/react-native-biometrics`, sucessor mantido do `react-native-biometrics`
  (sem suporte à Nova Arquitetura do RN 0.86). Mesmo modelo: chave EC P-256 no Keystore protegida pela
  digital, chave pública (SPKI/base64) cadastrada no servidor, assinatura SHA256withECDSA do desafio.
- **Voz (R65)**: o requisito cita `expo-speech`, que só faz texto → fala. A captura (fala → texto) usa
  `expo-speech-recognition` (serviço de reconhecimento do Android, pt-BR); a frase vai para
  `POST /api/transactions/parse`; o `expo-speech` lê a confirmação em voz alta.
- **Ícones**: a mesma família do protótipo (Material Symbols Rounded), reduzida aos ícones usados
  (`npm run icons:build`, ~20 KB por variante, contorno e preenchido).
- **Formatação**: valores em pt-BR com o símbolo da moeda de cada carteira (`R$ 1.234,56`, `US$ 908,00`).
- **Cor das carteiras**: o backend não guarda cor/ícone; ambos derivam do tipo da carteira.

## 4. Componentes reutilizáveis (`src/ui`)

| Componente | Uso |
|---|---|
| `ThemeProvider`, `palettes`, `useTheme` | Tokens MD3 do protótipo, claro e escuro (R42, R80) |
| `useResponsiveLayout`, `ContentContainer`, `Grid` | Classes de janela MD3, largura máxima e grade em tablets (R82) |
| `Text`, `Icon` | Escala tipográfica (Roboto/Roboto Mono) e ícones Material Symbols |
| `Button`, `IconButton`, `FAB`, `Chip`, `SegmentedControl`, `Switch` | Controles MD3 com estados acessíveis |
| `TextField`, `DateField` | Campos com rótulo, erro por campo e seletor nativo de data |
| `Card`, `Banner`, `EmptyState`, `Skeleton`, `ProgressBar`, `Divider` | Estrutura e feedback de carregamento |
| `Sheet`, `Dialog`, `Snackbar` | Folha inferior, diálogo de confirmação e aviso com ação |

## 5. Mapa de requisitos

| Req. | Onde | Testes |
|---|---|---|
| R01 | App RN Android; registro e categorização; gráficos em Início (maiores despesas) e Fluxo (6 meses). *Metas de economia não fazem parte da Sprint 1* | telas, contrato |
| R02 | `features/auth/register-screen.tsx`, `domain/password-policy.ts` | auth-screens, domain, contrato |
| R03 | `data/session/*`, `core/http/http-client.ts`, `Stack.Protected` | session-manager, navigation, contrato |
| R04 | `features/auth/password-recovery-screens.tsx` (+ link `orcamentofacil://reset-password`) | auth-screens, contrato |
| R40 | `features/auth/biometric-auth.ts`, botão no login, chave em Preferências | biometric-auth, auth-screens, screens, contrato |
| R87 | Bloqueio com contagem regressiva (423), renovação/expiração de token, aviso de sessão expirada | auth-screens, http-client, session-manager, contrato |
| R53, R56 | `features/wallets/wallet-form-sheet.tsx`, `currency-picker.tsx` | screens, contrato |
| R54 | `features/wallets/transfer-sheet.tsx` (chave de idempotência) | screens, contrato |
| R55 | Início e Carteiras (`/reports/overview`, `/wallets/summary`) | screens, contrato |
| R28 | Moeda no cadastro e em Preferências | auth-screens, screens, contrato |
| R29 | `converter-dialog.tsx`, prévia da conversão na transferência | screens, contrato |
| R06, R11 | `transaction-form-sheet.tsx`, `transaction-form.ts` (edição envia só o que mudou) | transaction-sheets, transaction-rules, contrato |
| R12 | Diálogo "Excluir transação?" em `transaction-details-sheet.tsx` | transaction-sheets |
| R48 | Duplicar nos detalhes | transaction-sheets, contrato |
| R49 | Snackbar "Desfazer" (`use-undoable-feedback.ts` → `POST /api/history/undo`) | transaction-sheets, contrato |
| R65 | `voice/use-voice-capture.ts`, `listening-panel.tsx` | transaction-sheets, contrato |
| R77 | `features/feedback/success-overlay.tsx` | transaction-sheets, screens |
| R07, R08 | Categorias por tipo e `new-category-dialog.tsx` | transaction-sheets, contrato |
| R43 | `tags-input.tsx`, filtro por tag | transaction-sheets, contrato |
| R44 | Chip "Sugestão" (`POST /api/categories/suggest`) | transaction-sheets, contrato |
| R09 | `history-tab.tsx` — FlatList com rolagem infinita por cursor | transactions-tabs, contrato |
| R10 | Busca, categoria, tag e período no histórico | transactions-tabs, contrato |
| R26 | Navegação por mês e resumo do mês | transactions-tabs, contrato |
| R70 | Ordenação por data, valor e categoria | transactions-tabs, contrato |
| R52 | Arquivar/restaurar, filtro de arquivadas e arquivamento em lote | transaction-sheets, transactions-tabs, screens, contrato |
| R41 | `statement-tab.tsx` + PDF baixado do servidor e compartilhado | transactions-tabs, contrato |
| R58 | `cash-flow-tab.tsx` com saldo acumulado na moeda principal | transactions-tabs, transaction-rules, contrato |
| R42 | Tema sistema/claro/escuro, salvo no aparelho e no perfil | theme-preference, screens |
| R80 | Design system Material 3 (`src/ui`) com os tokens do protótipo | ui |
| R82 | Barra inferior ↔ trilho lateral, grade e largura máxima em tablets, fonte limitada a 1,3× | ui, navigation |
| R72 | Status consultado a cada minuto, 503 tratado, avisos e bloqueio das escritas; chave para administradores | screens, http-client, contrato |
| R81 | Tokens no Keystore; nenhum dado financeiro gravado no aparelho (cifragem no banco é do backend) | session-manager |
| R83 | Início em uma requisição, cache, esqueletos, FlatList otimizada, build de release | screens, contrato |
| R84 | Camadas e componentes reutilizáveis | architecture |
| R85 | `core/logging` (eventos, mascaramento), tratador global de erros e tela de erro | logger |
| R86 | gzip pelo OkHttp (verificado), páginas de 20, buscas com atraso, PATCH só com o que mudou | http-client, contrato |
| R88 | Este documento e o README | — |
| R79 | React Native 0.86 / Expo SDK 57, `platforms: ["android"]` | build Android |

## 6. Testes

| Tipo | Onde | O que garante |
|---|---|---|
| Unidade | `src/**/*.test.ts` | Regras de domínio, cliente HTTP, sessão, logger, biometria, formulários |
| Telas | `src/**/*.test.tsx` | Fluxos reais renderizados com um backend falso (`test-utils/fake-api.ts`) |
| Navegação | `features/shell/navigation.test.tsx` | Rotas protegidas e restauração da sessão com o roteador real |
| Arquitetura | `tests/unit/architecture.test.ts` | Dependências entre camadas |
| Contrato | `tests/contract` | O app conversa corretamente com o backend real |
