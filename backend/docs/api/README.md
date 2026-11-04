# API — referência

A especificação completa e interativa (OpenAPI 3) é gerada dos próprios schemas de validação e fica em
**`GET /docs`** (JSON em `/docs/json`). Cada rota mostra os campos aceitos, a resposta de sucesso e as
respostas de erro possíveis. Este documento resume convenções, erros e endpoints.

## Convenções

| Tema | Regra |
|---|---|
| Base | `/api` · JSON UTF-8 (`Content-Type: application/json`; outro formato → `415`). Só o envio de anexo usa `multipart/form-data` |
| Autenticação | `Authorization: Bearer <accessToken>`. Access token JWT de 15 min; refresh token opaco de 30 dias, **rotativo** |
| Validação | Estrita: campo desconhecido é erro. Textos têm os espaços das pontas removidos (`"   "` não vale como nome). E-mail vira minúsculas; moeda `" usd "` vira `"USD"` |
| Valores | Número positivo com até 2 casas decimais, na moeda da carteira (`35.9`). Em extratos e fluxo de caixa, com sinal |
| Datas | `AAAA-MM-DD` (anos 1900–2100); meses `AAAA-MM`; data/hora em ISO 8601 UTC. Períodos: `from` ≤ `to` |
| Moedas | ISO 4217 (`BRL`, `USD`…). Lista para os seletores: `GET /api/currencies` |
| Paginação | Rolagem infinita: a resposta traz `nextCursor`; envie-o em `?cursor=`. `null` = fim |
| Compressão | Respostas acima de 1 KB comprimidas (`Accept-Encoding: br, gzip`). Corpos podem ir com `Content-Encoding: gzip` |
| Rastreio | Toda resposta tem `x-request-id` (o cliente pode enviar o seu) |
| Idempotência | `POST /api/transfers` aceita `Idempotency-Key`: repetir devolve a mesma transferência (200) |
| Manutenção | Em manutenção, escritas respondem `503 MAINTENANCE_MODE` com mensagem para o usuário |
| Fuso | "Hoje", o mês atual e as datas das ocorrências de séries seguem o fuso do usuário (`timezone`, padrão `America/Sao_Paulo`) |

## Erros

Formato único, em todas as rotas:

```json
{
  "statusCode": 400,
  "code": "VALIDATION_ERROR",
  "message": "Dados inválidos na requisição.",
  "details": [
    { "location": "body", "path": "amount", "message": "Use no máximo duas casas decimais." },
    { "location": "body", "path": "categoryID", "message": "Campo não reconhecido." }
  ]
}
```

- `code` é o contrato estável para o app decidir o que fazer; `message` já vem pronta para o usuário.
- `details[].path` aponta o campo do formulário (`location`: `body`, `querystring`, `params` ou `headers`).
  Erros de regra de negócio causados por um campo também trazem `details`, como `INVALID_WALLET` → `walletId`.

| Status | `code` |
|---|---|
| 400 | `VALIDATION_ERROR` (lista de campos), `INVALID_JSON`, `INVALID_RESET_TOKEN`, `INVALID_CONTENT_LENGTH`, `INVALID_COMPRESSED_BODY`, `INVALID_URL` |
| 401 | `UNAUTHORIZED`, `TOKEN_EXPIRED`, `INVALID_TOKEN`, `SESSION_REVOKED`, `INVALID_CREDENTIALS`, `INVALID_REFRESH_TOKEN`, `BIOMETRIC_CREDENTIAL_INVALID`, `BIOMETRIC_CHALLENGE_INVALID`, `BIOMETRIC_SIGNATURE_INVALID` |
| 403 | `FORBIDDEN` (ex.: alterar categoria predefinida, rota de admin) |
| 404 | `NOT_FOUND`, `ROUTE_NOT_FOUND`, `NOTHING_TO_UNDO` |
| 409 | `EMAIL_ALREADY_REGISTERED`, `USERNAME_TAKEN`, `WALLET_NAME_TAKEN`, `WALLET_NOT_EMPTY`, `WALLET_HAS_MOVEMENTS`, `WALLET_HAS_SERIES`, `CATEGORY_NAME_TAKEN`, `CATEGORY_TYPE_IN_USE`, `TAG_NAME_TAKEN`, `UNDO_NOT_POSSIBLE`, `BIOMETRIC_KEY_ALREADY_REGISTERED`, `BIOMETRIC_LIMIT_REACHED`, `TRANSACTION_ALREADY_IN_SERIES`, `SERIES_NOT_ACTIVE`, `BUDGET_ALREADY_EXISTS`, `REDUCTION_GOAL_EXISTS`, `GOAL_NOT_ACTIVE`, `CONTRIBUTION_EXISTS`, `ATTACHMENT_LIMIT`, `ATTACHMENT_QUOTA` |
| 413 | `PAYLOAD_TOO_LARGE` (corpo acima de 1 MB), `FILE_TOO_LARGE` (anexo acima de 5 MB) |
| 415 | `UNSUPPORTED_MEDIA_TYPE`, `UNSUPPORTED_CONTENT_ENCODING`, `UNSUPPORTED_FILE_TYPE` (anexo que não é PDF, JPEG, PNG ou WebP) |
| 422 | `INVALID_WALLET`, `INVALID_CATEGORY`, `CATEGORY_TYPE_MISMATCH`, `NO_WALLET`, `UNSUPPORTED_CURRENCY`, `INVALID_CURRENT_PASSWORD`, `BALANCE_OVERFLOW`, `MONTH_IN_FUTURE`, `INVALID_END_DATE`, `DATE_OUT_OF_RANGE`, `TRANSACTION_TOO_OLD`, `CATEGORY_NOT_EXPENSE`, `NO_BASELINE`, `INVALID_DEADLINE`, `CONTRIBUTION_NOT_INCOME`, `CONTRIBUTION_EXCEEDS_TRANSACTION`, `INVALID_SERIES` |
| 423 | `ACCOUNT_LOCKED` (`Retry-After` em segundos) |
| 429 | `RATE_LIMITED` (limite por IP nas rotas de autenticação) |
| 503 | `MAINTENANCE_MODE` (`Retry-After`), `EXCHANGE_RATE_UNAVAILABLE` |

Quando acontecem os códigos da Sprint 2:

| `code` | Quando |
|---|---|
| `MONTH_IN_FUTURE` (422) | Indicadores de um mês que ainda não começou |
| `INVALID_END_DATE` (422) | Data final da recorrência antes da 1ª ocorrência |
| `DATE_OUT_OF_RANGE` (422) | Recorrência ou parcelamento com data fora de 1 ano para trás ou para a frente |
| `TRANSACTION_TOO_OLD` (422) | Marcar como recorrente uma transação com mais de 12 meses |
| `TRANSACTION_ALREADY_IN_SERIES` (409) | Marcar como recorrente uma transação que já é de uma série |
| `SERIES_NOT_ACTIVE` (409) | Alterar ou cancelar série encerrada ou cancelada |
| `WALLET_HAS_SERIES` (409) | Excluir carteira com recorrência ou parcelamento ativo |
| `BUDGET_ALREADY_EXISTS` (409) | Segundo orçamento em vigor para a mesma categoria e período |
| `CATEGORY_NOT_EXPENSE` (422) | Orçamento ou meta de redução numa categoria só de receitas |
| `REDUCTION_GOAL_EXISTS` (409) | Segunda meta de redução ativa na mesma categoria |
| `NO_BASELINE` (422) | Meta de redução sem gasto na categoria nos 3 meses anteriores |
| `INVALID_DEADLINE` (422) | Data limite da meta de economia no passado |
| `GOAL_NOT_ACTIVE` (409) | Alterar ou destinar receita a uma meta **cancelada** (meta atingida continua aceitando) |
| `CONTRIBUTION_NOT_INCOME` (422) | Destinar uma despesa a uma meta |
| `CONTRIBUTION_EXCEEDS_TRANSACTION` (422) | A soma do que foi destinado passaria do valor da receita |
| `CONTRIBUTION_EXISTS` (409) | A mesma receita já está vinculada à meta |
| `INVALID_SERIES` (422) | Lembrete a partir de série que não é uma despesa recorrente ativa |
| `FILE_TOO_LARGE` (413) · `UNSUPPORTED_FILE_TYPE` (415) | Anexo acima de 5 MB · tipo conferido pelo conteúdo, não pelo nome |
| `ATTACHMENT_LIMIT` · `ATTACHMENT_QUOTA` (409) | 11º anexo na transação · passaria do espaço do usuário (`ATTACHMENT_QUOTA_MB`, padrão 100 MB) |

Dados de outro usuário respondem sempre **404**, nunca 403, para não revelar que existem. O login responde
igual para conta inexistente e senha errada.

### O que o app faz com cada 401

| `code` | Ação no app |
|---|---|
| `TOKEN_EXPIRED` | Chamar `POST /api/auth/refresh` **uma vez** e repetir a requisição |
| `UNAUTHORIZED`, `INVALID_TOKEN`, `SESSION_REVOKED` | Ir para o login (a sessão acabou: logout, troca/recuperação de senha ou reuso de refresh token) |
| `INVALID_REFRESH_TOKEN` (no refresh) | Ir para o login |
| `INVALID_CREDENTIALS` (no login) | Mostrar "e-mail/usuário ou senha inválidos" |

Não faça chamadas paralelas de refresh com o mesmo refresh token: o reuso é tratado como roubo e encerra a sessão.

## Endpoints

### Autenticação — `/api/auth`
| Método | Rota | Descrição | Req. |
|---|---|---|---|
| POST | `/register` | Cria conta (e-mail, usuário, senha forte, `primaryCurrency?`) + carteira padrão; devolve `{ user, tokens }` | R02 |
| POST | `/login` | `{ email \| username, password }` → `{ user, tokens }`; bloqueio após falhas | R03, R87 |
| POST | `/refresh` | `{ refreshToken }` → novos tokens (o anterior deixa de valer) | R03 |
| POST | `/logout` | `{ refreshToken }` encerra a sessão | R03 |
| POST | `/logout-all` | Encerra todas as sessões | R87 |
| POST | `/password/forgot` | `{ email }` → 202; envia link por e-mail | R04 |
| POST | `/password/reset` | `{ token, password }` → 204; encerra sessões e biometrias | R04 |
| POST | `/password/change` | `{ currentPassword, newPassword }` (autenticado; mantém só a sessão atual) | R87 |

O link do e-mail abre `GET /reset-password?token=…`, página web servida pela API que funciona mesmo sem o app.

### Biometria — `/api/auth/biometric` (R40)
| Método | Rota | Descrição |
|---|---|---|
| POST | `/credentials` | (logado) `{ publicKey, deviceName }` → 201 `{ id, deviceName, keyType }`. Até 5 aparelhos |
| GET | `/credentials` | (logado) Aparelhos habilitados |
| DELETE | `/credentials/:id` | (logado) Desabilita o aparelho |
| POST | `/challenge` | `{ credentialId }` → `{ challenge, expiresAt }` (uso único, 2 min) |
| POST | `/login` | `{ credentialId, challenge, signature }` → `{ user, tokens }` |

Fluxo com `react-native-biometrics`:

1. **Habilitar** (após um login com senha): `createKeys()` → envie `publicKey` em `POST /credentials` e guarde o `id` no aparelho.
2. **Entrar:** `POST /challenge` → `createSignature({ payload: challenge })` (pede a digital) → `POST /login` com a assinatura.
3. `401 BIOMETRIC_CREDENTIAL_INVALID`: a biometria foi desabilitada (ex.: senha recuperada). Apague as chaves locais e volte ao login com senha.

A chave privada nunca sai do Keystore; assinatura inválida conta como tentativa sem sucesso (bloqueio do R87).

### Usuário — `/api/users`
`GET /me` · `PATCH /me` `{ username?, primaryCurrency?, timezone?, theme? }` (R28, R42). `theme`: `system`, `light` ou `dark`.

### Carteiras — `/api/wallets` (R53, R55, R56)
| Método | Rota | Descrição |
|---|---|---|
| GET | `/` | Carteiras com saldo atual (a padrão primeiro) |
| GET | `/summary` | Saldo de cada carteira e total convertido para a moeda principal |
| POST | `/` | `{ name, type?, currency?, initialBalance?, isDefault?, minBalance? }` |
| GET/PATCH/DELETE | `/:id` | Detalhar / alterar (moeda só sem movimentações) / excluir (só sem movimentações nem série ativa) |

`type`: `checking`, `savings`, `cash`, `investment`, `credit_card` ou `other`.
`minBalance` (R78, aceita negativo; `null` remove): quando o saldo fica abaixo dele, chega um aviso
`low_balance` — no máximo um por carteira por dia. A resposta `Wallet` sempre traz `minBalance` (ou `null`).

### Transações — `/api/transactions`
| Método | Rota | Descrição | Req. |
|---|---|---|---|
| GET | `/` | Lista com filtros e ordenação (abaixo) | R09, R10, R26, R52, R70 |
| GET | `/summary` | Receitas, despesas e saldo do filtro, por moeda e convertidos para a moeda principal | R26, R28 |
| GET | `/months` | Meses com transações e a quantidade de cada um (navegação entre meses) | R26 |
| POST | `/` | `{ type, amount, description, date?, walletId?, categoryId?, tags?, notes? }` | R06, R43, R57 |
| GET | `/:id` | Detalhe | |
| PATCH | `/:id` | Edição parcial (`tags` substitui; `categoryId: null` remove) | R11 |
| DELETE | `/:id` | Exclusão (pode ser desfeita) | R12 |
| POST | `/:id/duplicate` | Cópia com data de hoje; o corpo (`{}` ou campos) ajusta | R48 |
| POST | `/:id/archive` · `/:id/unarchive` | Arquivar / desarquivar | R52 |
| POST | `/archive` | `{ before: "AAAA-MM-DD" }` arquiva em lote as anteriores à data | R52 |
| POST | `/parse` | `{ text }` frase falada → rascunho + categorias sugeridas do tipo certo | R65, R44 |

Parâmetros de `GET /`: `q` (descrição, sem diferenciar acentos), `categoryId`, `walletId`, `type`, `tag` (id ou nome),
`from`, `to`, `month`, `archived` (`false` padrão · `true` · `all`), `sort` (`date` · `amount` · `category`),
`order` (`desc` · `asc`), `limit` (1–100, padrão 20), `cursor`.

Campos da Sprint 2 na transação:

- `notes` (R57): observações livres, até 1000 caracteres, guardadas cifradas; `null` (ou vazio) remove. Vale
  em `POST /`, `PATCH /:id` e `POST /:id/duplicate`.
- `series` (só na resposta): `{ id, kind: "recurring" | "installment", frequency, occurrence, total }` quando a
  transação foi gerada por uma recorrência ou parcelamento (`total` = número de parcelas; `null` na recorrência);
  `null` na transação avulsa.
- Os anexos não vêm na transação: a tela de detalhes busca `GET /api/transactions/:id/attachments`.

**Coerência categoria × tipo:** cada categoria aceita receitas, despesas ou os dois (`type: null`). Uma
despesa com a categoria "Salário" responde `422 CATEGORY_TYPE_MISMATCH` (`details` → `categoryId`). Use
`GET /api/categories?type=expense` (ou `income`) para montar o seletor do formulário.

### Categorias e tags
- `/api/categories`: `GET /?type=` (predefinidas R07 + personalizadas R08), `POST / { name, type? }`,
  `PATCH /:id { name?, type? }`, `DELETE /:id`, `POST /suggest { description, type? }` → sugestões com confiança (R44).
  `PUT /:id/visibility { hiddenInReports }` oculta ou reexibe a categoria nos relatórios por categoria (R46),
  inclusive as predefinidas (a preferência é de cada usuário); cada categoria traz `hiddenInReports`.
- `/api/tags`: `GET /` (com contagem de uso), `POST /`, `PATCH /:id`, `DELETE /:id` (R43).

### Transferências — `/api/transfers` (R54)
`GET /` (`walletId`, `from`, `to`, paginação) · `POST /` `{ sourceWalletId, targetWalletId, amount, targetAmount?, date?, description? }` · `GET /:id` · `DELETE /:id`.
Entre moedas diferentes, usa a cotação atual (R29) ou o `targetAmount` informado; a taxa aplicada fica registrada.

### Histórico — `/api/history` (R49)
`GET /` últimas ações (`label` para exibir, `undoable`) · `POST /undo` desfaz a mais recente; chamadas seguidas desfazem as anteriores (janela de 24 h).
`entityType`: `transaction`, `transfer` ou `series`. As séries registram `series.create` (desfazer cancela a série e
exclui as ocorrências criadas junto), `series.update` e `series.cancel`; as ocorrências geradas pelas tarefas
agendadas não entram no histórico.

### Câmbio e moedas (R28, R29, R56)
- `GET /api/currencies` — **público** (o cadastro já escolhe a moeda): moedas aceitas e com cotação, com nome em português.
- `GET /api/exchange-rates?base=BRL&symbols=USD,EUR` · `GET /api/exchange-rates/convert?from=USD&to=BRL&amount=10`.
  Fonte: ExchangeRate-API, com cache; `stale: true` indica cotação de cache após falha do provedor.

### Relatórios — `/api/reports`
| Rota | Descrição | Req. |
|---|---|---|
| `GET /overview?month?` | **Tela inicial em uma requisição**: saldos e total, resumo do mês, 5 maiores despesas por categoria (sem as ocultas), 5 últimas transações e `unreadNotifications` (sino) | R55, R83, R86 |
| `GET /statement?from&to&walletId?` | Extrato: saldo inicial, movimentos com saldo corrente, totais, saldo final | R41 |
| `GET /statement/pdf?from&to&walletId?` | O mesmo extrato em PDF (`attachment`) | R41 |
| `GET /cash-flow?from&to&walletId?` | Entradas e saídas em ordem cronológica, totais por moeda e convertidos | R58 |
| `GET /by-category?from&to&type&includeHidden?` | Totais e participação por categoria (gráfico de pizza). As ocultas ficam de fora e são resumidas em `hidden: { count, convertedTotal }`; `includeHidden=true` as inclui | R01, R13, R46, R50 |
| `GET /monthly?fromMonth&toMonth` | Receitas × despesas por mês, até 36 meses (gráfico de evolução) | R01 |
| `GET /balance-evolution?from&to&walletId?&granularity?` | Saldo de fim de dia (`day`, padrão, até 92 dias) ou de fim de mês (`month`, até 36 meses): `{ granularity, currency, walletId, points: [{ date, balance }], ratesStale }`. Sem `walletId`, soma todas as carteiras na moeda principal | R14 |
| `GET /month-indicators?month?` | Saldo médio diário, valor economizado comparado à média dos até 3 meses anteriores e as 10 maiores despesas: `{ averageDailyBalance, days, savings: { saved, previousAverage, previousMonths, difference, differencePercent }, topExpenses: [{ transaction, convertedAmount }] }`. Mês futuro: `422 MONTH_IN_FUTURE` | R35, R36, R75 |
| `GET /projection?months?` | Saldo projetado de 3 a 24 meses (padrão 6) a partir do atual, pelas próximas ocorrências das recorrências e pelas parcelas restantes: `{ startBalance, months: [{ month, openingBalance, expectedIncome, expectedExpense, closingBalance, items }] }` | R63 |

Períodos de relatório: até 5 anos. Valores convertidos ficam `null` quando falta cotação, sem derrubar o relatório.

### Recorrências e parcelamentos — `/api/series` (R37, R62)
| Método | Rota | Descrição |
|---|---|---|
| POST | `/recurring` | Campos de `POST /api/transactions` + `frequency` (`weekly`, `monthly`, `yearly`) e `endDate?` → 201 `{ series, transactions }` |
| POST | `/recurring/from-transaction/:transactionId` | `{ frequency, endDate? }`: a transação existente vira a 1ª ocorrência |
| POST | `/installments` | `{ totalAmount, installments (2–72), date, description, walletId?, categoryId?, tags?, notes? }`: despesa dividida em parcelas mensais, com a sobra dos centavos na 1ª |
| GET | `/?status=` | `active` (padrão), `ended`, `cancelled` ou `all` |
| GET | `/:id` | Série + `occurrences: [{ occurrence, transactionId, date, amount }]` já geradas |
| PATCH | `/:id` | `{ amount?, description?, categoryId?, walletId?, endDate? }` muda só as próximas ocorrências (`amount` e `endDate` só na recorrência) |
| DELETE | `/:id` | Cancela: as próximas não são geradas; as registradas continuam |

**Nada entra no saldo antes da data.** A resposta de criação traz em `transactions` as ocorrências que já
venceram (a 1ª, se a data é hoje ou passou, até 12); as seguintes viram transação no dia de cada uma, no fuso
do usuário, pela tarefa agendada. Dia 31 cai no último dia dos meses curtos. `Series`: `{ id, kind, type,
frequency, description, wallet, category, amount, totalAmount, installments, startDate, endDate, nextDate,
generatedCount, remaining, status, createdAt }` (no parcelamento, `amount` é o valor das parcelas depois da 1ª).

### Orçamentos — `/api/budgets` (R21, R23, R45, R74)
| Método | Rota | Descrição |
|---|---|---|
| GET | `/?month=` | Orçamentos em vigor no mês |
| POST | `/` | `{ categoryId, period: "monthly" \| "daily", amount }` → vale do mês atual em diante, na moeda principal |
| PATCH | `/:id` | `{ amount }`: o novo limite vale do mês atual em diante; os meses anteriores guardam o antigo |
| DELETE | `/:id` | Encerra (deixa de valer no mês atual; o histórico fica) |
| GET | `/status?month&date` | `{ month, date, monthly: [BudgetStatus], daily: [BudgetStatus] }`: gasto do mês nos limites mensais e do dia `date` nos diários |
| GET | `/history?fromMonth&toMonth` | Até 12 meses: em cada um, o limite que valia e o gasto real |

`BudgetStatus`: `{ budgetId, category, period, currency, limit, spent, remaining, percent, state }`, com `state`
`ok`, `warning` (a partir de 80%) ou `exceeded`.

### Metas de redução — `/api/reduction-goals` (R67)
`GET /?month=` · `POST / { categoryId, percent (1–90) }` · `DELETE /:id`. A base é a média mensal de gasto da
categoria nos 3 meses anteriores, calculada uma vez; cada item traz `baseline`, `target`, `spent` do mês e `state`
(`on_track` ou `exceeded`).

### Metas de economia — `/api/goals` (R15, R16, R17, R68)
| Método | Rota | Descrição |
|---|---|---|
| GET | `/?status=` | `active` (padrão), `achieved`, `cancelled` ou `all`, com progresso |
| POST | `/` | `{ name, targetAmount, deadline, categoryId }` |
| GET | `/:id` | Meta + `contributions: [{ id, transaction, amount, counted }]` |
| PATCH | `/:id` | `{ name?, targetAmount?, deadline?, categoryId? }` |
| DELETE | `/:id` | Cancela (os vínculos ficam) |
| POST | `/:id/contributions` | `{ transactionId, amount? }`: destina uma receita (toda ou parte; sem `amount`, o que ainda não foi destinado) → 201 `{ contribution, goal, achievedNow }` |
| DELETE | `/:id/contributions/:contributionId` | Desfaz o vínculo |
| GET | `/contributions?transactionId=` | Para quais metas uma receita foi destinada (detalhes da transação) |

`Goal`: `{ id, name, category, targetAmount, currency, deadline, status, achievedAt, saved, percent, remaining,
daysLeft }`. O progresso é calculado na leitura: receita excluída ou que virou despesa deixa de contar. Quando
um vínculo completa a meta, `achievedNow: true` (o app celebra) e chega um aviso `goal_achieved`, uma única vez.

### Notificações — `/api/notifications` (R18, R22, R47, R67, R68, R74, R78)
| Método | Rota | Descrição |
|---|---|---|
| GET | `/?unread&limit&cursor` | Caixa de avisos, mais recentes primeiro, com `nextCursor` |
| GET | `/unread-count` | `{ count }` para o sino |
| POST | `/:id/read` · `/read-all` | Marcar como lida · todas (`{ updated }`) |
| GET · PATCH | `/settings` | `{ dailyReminderEnabled, dailyReminderHour (0–23, padrão 20), goalRemindersEnabled, billRemindersEnabled, alertsPushEnabled }` |
| POST | `/devices` | `{ token, deviceName? }` → 201 `{ id }`: token do FCM do aparelho (idempotente pelo token; outro login no mesmo aparelho assume o token) |
| DELETE | `/devices/:id` | Para de receber push (logout) |

`Notification`: `{ id, kind, title, body, entityType, entityId, data, readAt, createdAt }`. `kind`:
`budget_warning`, `budget_exceeded`, `daily_limit_exceeded`, `reduction_exceeded`, `unusual_transaction`,
`low_balance`, `goal_achieved`, `goal_deadline`, `daily_reminder` ou `bill_reminder`. `entityType` (`budget`,
`reduction_goal`, `savings_goal`, `wallet`, `transaction`, `reminder`) e `entityId` dizem para onde o app navega.
**Título e texto nunca levam valores em dinheiro** (o push passa pelo servidor do Google); o detalhe aparece ao
abrir a entidade. O push leva `notification.title`/`body`, `data: { notificationId, kind, entityType, entityId }` e
o canal Android `avisos`. Cada aviso é gravado uma única vez (reavaliar não repete).

### Lembretes de contas — `/api/reminders` (R34)
`GET /` · `POST / { title, nextDueDate, frequency, amount? }` ou `POST / { seriesId }` (nasce de uma despesa
recorrente: título, vencimento e frequência vêm dela) · `PATCH /:id { title?, nextDueDate?, frequency?, amount?,
active? }` (`active: false` pausa; `amount: null` remove) · `DELETE /:id`. No dia do vencimento, às 9h no fuso do
usuário, chega um aviso `bill_reminder` e o vencimento avança pela frequência.

### Anexos — `/api/transactions/:id/attachments` (R24, R25, R76)
| Método | Rota | Descrição |
|---|---|---|
| GET | `/` | `{ data: [{ id, kind, fileName, mimeType, sizeBytes, createdAt }] }` |
| POST | `/?kind=` | `multipart/form-data` com um arquivo no campo `file`; `kind` na query: `photo`, `document` (padrão) ou `receipt` → 201 |
| GET | `/:attachmentId/content` | O arquivo original, com `Content-Type` e `Content-Disposition: attachment` |
| DELETE | `/:attachmentId` | Exclusão definitiva (fora do desfazer) |

PDF, JPEG, PNG ou WebP, conferidos pelos primeiros bytes; até 5 MB por arquivo, 10 por transação e
`ATTACHMENT_QUOTA_MB` por usuário. Os arquivos ficam cifrados no banco. Transação excluída responde 404 nas
rotas de anexo; desfeita a exclusão, os anexos voltam. Duplicar uma transação não copia os anexos.

### Sistema
- `GET /health` (processo), `GET /health/ready` (banco) — sem autenticação.
- `GET /api/system/status` — público; o app consulta para avisar sobre manutenção (R72).
- `/api/admin` (perfil admin): `GET`/`PUT /maintenance` `{ enabled, message? }` (R72), `GET /logs?event&level&before&limit` (R85),
  `POST /housekeeping` (limpeza de dados vencidos sob demanda; também roda sozinha a cada hora),
  `POST /jobs/run` (tarefas agendadas agora: ocorrências de séries, lembrete diário, lembretes de contas, prazo das
  metas e reenvio de push → `{ ranAt, results: [{ job, processed, skipped, failed, reason }] }`; não roda em
  manutenção).

## Fluxos de exemplo

```http
GET  /api/currencies                         → 200 { "data": [{ "code": "BRL", "name": "Real brasileiro" }, ...] }

POST /api/auth/register
{ "email": "maria@exemplo.com", "username": "maria", "password": "Senha@Forte123", "primaryCurrency": "BRL" }
→ 201 { "user": {...}, "tokens": { "accessToken": "...", "refreshToken": "...", "expiresIn": 900 } }

GET  /api/reports/overview                   (Authorization: Bearer ...)
→ 200 { "month": "2026-10", "wallets": {...}, "monthSummary": {...}, "topExpenseCategories": [...], "recentTransactions": [...] }

GET  /api/categories?type=expense            → seletor de categorias da despesa
POST /api/transactions
{ "type": "expense", "amount": 35.9, "description": "Mercado", "categoryId": "00000000-0000-4000-8000-000000000001", "tags": ["casa"] }
→ 201 { "id": "...", "amount": 35.9, "currency": "BRL", "wallet": {...}, "category": {...}, "tags": [...] }

GET  /api/transactions?month=2026-10&limit=20
→ 200 { "data": [...], "nextCursor": "eyJkIjoi..." }

DELETE /api/transactions/{id}   → 204
POST   /api/history/undo        → 200 { "undone": { "action": "transaction.delete", "label": "Transação excluída", ... }, "message": "..." }

POST /api/series/installments
{ "totalAmount": 100, "installments": 3, "date": "2026-11-04", "description": "Fone" }
→ 201 { "series": { "kind": "installment", "amount": 33.33, "remaining": 2, "nextDate": "2026-12-04", ... },
        "transactions": [{ "amount": 33.34, "series": { "kind": "installment", "occurrence": 1, "total": 3 }, ... }] }

POST /api/budgets  { "categoryId": "00000000-0000-4000-8000-000000000001", "period": "monthly", "amount": 800 }
GET  /api/budgets/status
→ 200 { "month": "2026-11", "monthly": [{ "limit": 800, "spent": 680, "percent": 85, "state": "warning", ... }], "daily": [] }
GET  /api/notifications?unread=true
→ 200 { "data": [{ "kind": "budget_warning", "title": "...", "entityType": "budget", "entityId": "...", ... }], "nextCursor": null }

POST /api/goals/{id}/contributions  { "transactionId": "<id da receita>" }
→ 201 { "contribution": { "amount": 400, ... }, "goal": { "saved": 600, "status": "achieved", ... }, "achievedNow": true }

POST /api/transactions/{id}/attachments?kind=receipt   (multipart/form-data, campo "file")
→ 201 { "id": "...", "kind": "receipt", "fileName": "comprovante.png", "mimeType": "image/png", "sizeBytes": 48213 }
GET  /api/transactions/{id}/attachments/{attachmentId}/content   → 200 (bytes do arquivo, Content-Disposition: attachment)
```
