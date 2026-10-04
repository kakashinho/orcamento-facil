# API — referência

A especificação completa e interativa (OpenAPI 3) é gerada dos próprios schemas de validação e fica em
**`GET /docs`** (JSON em `/docs/json`). Este documento resume convenções e endpoints.

## Convenções

| Tema | Regra |
|---|---|
| Base | `/api` · JSON UTF-8 |
| Autenticação | `Authorization: Bearer <accessToken>`. Access token JWT de 15 min; refresh token opaco de 30 dias, **rotativo** |
| Valores | Número positivo com até 2 casas decimais, na moeda da carteira (`35.9`). Em extratos e fluxo de caixa, com sinal |
| Datas | `AAAA-MM-DD`; meses `AAAA-MM`; data/hora em ISO 8601 UTC |
| Moedas | ISO 4217 (`BRL`, `USD`…) |
| Paginação | Rolagem infinita: a resposta traz `nextCursor`; envie-o em `?cursor=`. `null` = fim |
| Compressão | Respostas acima de 1 KB comprimidas (`Accept-Encoding: br, gzip`). Corpos podem ser enviados com `Content-Encoding: gzip` |
| Rastreio | Toda resposta tem `x-request-id` (o cliente pode enviar o seu) |
| Idempotência | `POST /api/transfers` aceita `Idempotency-Key`: repetir devolve a mesma transferência |
| Manutenção | Em manutenção, escritas respondem `503 MAINTENANCE_MODE` com mensagem para o usuário |

### Erros

```json
{ "statusCode": 409, "code": "WALLET_NAME_TAKEN", "message": "Você já possui uma carteira com esse nome.", "details": {} }
```

| Status | `code` mais comuns |
|---|---|
| 400 | `VALIDATION_ERROR` (`details` lista campo e motivo), `BAD_REQUEST` |
| 401 | `UNAUTHORIZED`, `INVALID_TOKEN`, `INVALID_CREDENTIALS` (`details.remainingAttempts`) |
| 403 | `FORBIDDEN` |
| 404 | `NOT_FOUND`, `ROUTE_NOT_FOUND`, `NOTHING_TO_UNDO` |
| 409 | `EMAIL_ALREADY_REGISTERED`, `USERNAME_TAKEN`, `WALLET_NAME_TAKEN`, `WALLET_NOT_EMPTY`, `WALLET_HAS_MOVEMENTS`, `CATEGORY_NAME_TAKEN`, `TAG_NAME_TAKEN`, `UNDO_NOT_POSSIBLE`, `INVALID_CURRENT_PASSWORD` |
| 422 | `INVALID_WALLET`, `INVALID_CATEGORY`, `NO_WALLET`, `UNSUPPORTED_CURRENCY` |
| 423 | `ACCOUNT_LOCKED` (`Retry-After` em segundos) |
| 429 | `RATE_LIMITED` (limite por IP nas rotas de autenticação) |
| 503 | `MAINTENANCE_MODE`, `EXCHANGE_RATE_UNAVAILABLE` |

Dados de outro usuário respondem sempre **404**, nunca 403, para não revelar que existem.

## Endpoints

### Autenticação — `/api/auth`
| Método | Rota | Descrição | Req. |
|---|---|---|---|
| POST | `/register` | Cria conta (e-mail, usuário, senha forte) + carteira padrão; devolve `{ user, tokens }` | R02 |
| POST | `/login` | `{ email \| username, password }` → `{ user, tokens }`; bloqueio após falhas | R03, R87 |
| POST | `/refresh` | `{ refreshToken }` → novos tokens (o anterior deixa de valer) | R03 |
| POST | `/logout` | `{ refreshToken }` encerra a sessão | R03 |
| POST | `/logout-all` | Encerra todas as sessões | R87 |
| POST | `/password/forgot` | `{ email }` → 202; envia link por e-mail | R04 |
| POST | `/password/reset` | `{ token, password }` → 204; encerra sessões | R04 |
| POST | `/password/change` | `{ currentPassword, newPassword }` (autenticado) | R87 |

O link do e-mail abre `GET /reset-password?token=…`, página web servida pela API que funciona mesmo sem o app.

### Usuário — `/api/users`
`GET /me` · `PATCH /me` `{ username?, primaryCurrency?, timezone? }` (R28).

### Carteiras — `/api/wallets` (R53, R55, R56)
| Método | Rota | Descrição |
|---|---|---|
| GET | `/` | Carteiras com saldo atual |
| GET | `/summary` | Tela inicial: saldo de cada carteira e total convertido para a moeda principal |
| POST | `/` | `{ name, type?, currency?, initialBalance?, isDefault? }` |
| GET/PATCH/DELETE | `/:id` | Detalhar / alterar (moeda só sem movimentações) / excluir (só sem movimentações) |

`type`: `checking`, `savings`, `cash`, `investment`, `credit_card` ou `other`.

### Transações — `/api/transactions`
| Método | Rota | Descrição | Req. |
|---|---|---|---|
| GET | `/` | Lista com filtros e ordenação (abaixo) | R09, R10, R26, R52, R70 |
| GET | `/summary` | Receitas, despesas e saldo do filtro, por moeda | R26 |
| POST | `/` | `{ type, amount, description, date?, walletId?, categoryId?, tags? }` | R06, R43 |
| GET | `/:id` | Detalhe | |
| PATCH | `/:id` | Edição parcial (`tags` substitui; `categoryId: null` remove) | R11 |
| DELETE | `/:id` | Exclusão (pode ser desfeita) | R12 |
| POST | `/:id/duplicate` | Cópia com data de hoje; o corpo (`{}` ou campos) ajusta | R48 |
| POST | `/:id/archive` · `/:id/unarchive` | Arquivar / desarquivar | R52 |
| POST | `/archive` | `{ before: "AAAA-MM-DD" }` arquiva em lote as anteriores à data | R52 |
| POST | `/parse` | `{ text }` frase falada → rascunho + categorias sugeridas | R65, R44 |

Parâmetros de `GET /`: `q` (descrição, sem diferenciar acentos), `categoryId`, `walletId`, `type`, `tag` (id ou nome),
`from`, `to`, `month`, `archived` (`false` padrão · `true` · `all`), `sort` (`date` · `amount` · `category`),
`order` (`desc` · `asc`), `limit` (1–100, padrão 20), `cursor`.

### Categorias e tags
- `/api/categories`: `GET /` (predefinidas R07 + personalizadas R08), `POST /`, `PATCH /:id`, `DELETE /:id`,
  `POST /suggest { description }` → sugestões com confiança (R44).
- `/api/tags`: `GET /` (com contagem de uso), `POST /`, `PATCH /:id`, `DELETE /:id` (R43).

### Transferências — `/api/transfers` (R54)
`GET /` (`walletId`, `from`, `to`, paginação) · `POST /` `{ sourceWalletId, targetWalletId, amount, targetAmount?, date?, description? }` · `GET /:id` · `DELETE /:id`.
Entre moedas diferentes, usa a cotação atual (R29) ou o `targetAmount` informado; a taxa aplicada fica registrada.

### Histórico — `/api/history` (R49)
`GET /` últimas ações (`undoable`) · `POST /undo` desfaz a mais recente; chamadas seguidas desfazem as anteriores (janela de 24 h).

### Câmbio — `/api/exchange-rates` (R29)
`GET /?base=BRL&symbols=USD,EUR` · `GET /convert?from=USD&to=BRL&amount=10`. Fonte: ExchangeRate-API, com cache;
`stale: true` indica cotação de cache após falha do provedor.

### Relatórios — `/api/reports`
| Rota | Descrição | Req. |
|---|---|---|
| `GET /statement?from&to&walletId?` | Extrato: saldo inicial, movimentos com saldo corrente, totais, saldo final | R41 |
| `GET /statement/pdf?from&to&walletId?` | O mesmo extrato em PDF (`attachment`) | R41 |
| `GET /cash-flow?from&to&walletId?` | Entradas e saídas em ordem cronológica, totais por moeda e convertidos | R58 |
| `GET /by-category?from&to&type` | Totais e participação por categoria (gráfico de pizza) | R01 |
| `GET /monthly?fromMonth&toMonth` | Receitas × despesas por mês (gráfico de evolução) | R01 |

### Sistema
- `GET /health` (processo), `GET /health/ready` (banco) — sem autenticação.
- `GET /api/system/status` — público; o app consulta para avisar sobre manutenção (R72).
- `/api/admin` (perfil admin): `GET`/`PUT /maintenance` `{ enabled, message? }` (R72), `GET /logs?event&level&before&limit` (R85).

## Fluxos de exemplo

```http
POST /api/auth/register
{ "email": "maria@exemplo.com", "username": "maria", "password": "Senha@Forte123" }
→ 201 { "user": {...}, "tokens": { "accessToken": "...", "refreshToken": "...", "expiresIn": 900 } }

POST /api/transactions                      (Authorization: Bearer ...)
{ "type": "expense", "amount": 35.9, "description": "Mercado", "categoryId": "00000000-0000-4000-8000-000000000001", "tags": ["casa"] }
→ 201 { "id": "...", "amount": 35.9, "currency": "BRL", "wallet": {...}, "category": {...}, "tags": [...] }

GET /api/transactions?month=2026-10&limit=20
→ 200 { "data": [...], "nextCursor": "eyJkIjoi..." }

DELETE /api/transactions/{id}   → 204
POST   /api/history/undo        → 200 { "undone": { "action": "transaction.delete", ... }, "message": "..." }
```

Quando receber `401 INVALID_TOKEN`, o app deve chamar `/api/auth/refresh` **uma vez** (sem chamadas
paralelas com o mesmo refresh token: o reuso é tratado como roubo e encerra a sessão) e repetir a requisição.
