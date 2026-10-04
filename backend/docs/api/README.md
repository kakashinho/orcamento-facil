# API — referência

A especificação completa e interativa (OpenAPI 3) é gerada dos próprios schemas de validação e fica em
**`GET /docs`** (JSON em `/docs/json`). Cada rota mostra os campos aceitos, a resposta de sucesso e as
respostas de erro possíveis. Este documento resume convenções, erros e endpoints.

## Convenções

| Tema | Regra |
|---|---|
| Base | `/api` · JSON UTF-8 (`Content-Type: application/json`; outro formato → `415`) |
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
| 409 | `EMAIL_ALREADY_REGISTERED`, `USERNAME_TAKEN`, `WALLET_NAME_TAKEN`, `WALLET_NOT_EMPTY`, `WALLET_HAS_MOVEMENTS`, `CATEGORY_NAME_TAKEN`, `CATEGORY_TYPE_IN_USE`, `TAG_NAME_TAKEN`, `UNDO_NOT_POSSIBLE`, `BIOMETRIC_KEY_ALREADY_REGISTERED`, `BIOMETRIC_LIMIT_REACHED` |
| 413 | `PAYLOAD_TOO_LARGE` (corpo acima de 1 MB) |
| 415 | `UNSUPPORTED_MEDIA_TYPE`, `UNSUPPORTED_CONTENT_ENCODING` |
| 422 | `INVALID_WALLET`, `INVALID_CATEGORY`, `CATEGORY_TYPE_MISMATCH`, `NO_WALLET`, `UNSUPPORTED_CURRENCY`, `INVALID_CURRENT_PASSWORD`, `BALANCE_OVERFLOW` |
| 423 | `ACCOUNT_LOCKED` (`Retry-After` em segundos) |
| 429 | `RATE_LIMITED` (limite por IP nas rotas de autenticação) |
| 503 | `MAINTENANCE_MODE` (`Retry-After`), `EXCHANGE_RATE_UNAVAILABLE` |

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
| POST | `/` | `{ name, type?, currency?, initialBalance?, isDefault? }` |
| GET/PATCH/DELETE | `/:id` | Detalhar / alterar (moeda só sem movimentações) / excluir (só sem movimentações) |

`type`: `checking`, `savings`, `cash`, `investment`, `credit_card` ou `other`.

### Transações — `/api/transactions`
| Método | Rota | Descrição | Req. |
|---|---|---|---|
| GET | `/` | Lista com filtros e ordenação (abaixo) | R09, R10, R26, R52, R70 |
| GET | `/summary` | Receitas, despesas e saldo do filtro, por moeda e convertidos para a moeda principal | R26, R28 |
| GET | `/months` | Meses com transações e a quantidade de cada um (navegação entre meses) | R26 |
| POST | `/` | `{ type, amount, description, date?, walletId?, categoryId?, tags? }` | R06, R43 |
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

**Coerência categoria × tipo:** cada categoria aceita receitas, despesas ou os dois (`type: null`). Uma
despesa com a categoria "Salário" responde `422 CATEGORY_TYPE_MISMATCH` (`details` → `categoryId`). Use
`GET /api/categories?type=expense` (ou `income`) para montar o seletor do formulário.

### Categorias e tags
- `/api/categories`: `GET /?type=` (predefinidas R07 + personalizadas R08), `POST / { name, type? }`,
  `PATCH /:id { name?, type? }`, `DELETE /:id`, `POST /suggest { description, type? }` → sugestões com confiança (R44).
- `/api/tags`: `GET /` (com contagem de uso), `POST /`, `PATCH /:id`, `DELETE /:id` (R43).

### Transferências — `/api/transfers` (R54)
`GET /` (`walletId`, `from`, `to`, paginação) · `POST /` `{ sourceWalletId, targetWalletId, amount, targetAmount?, date?, description? }` · `GET /:id` · `DELETE /:id`.
Entre moedas diferentes, usa a cotação atual (R29) ou o `targetAmount` informado; a taxa aplicada fica registrada.

### Histórico — `/api/history` (R49)
`GET /` últimas ações (`label` para exibir, `undoable`) · `POST /undo` desfaz a mais recente; chamadas seguidas desfazem as anteriores (janela de 24 h).

### Câmbio e moedas (R28, R29, R56)
- `GET /api/currencies` — **público** (o cadastro já escolhe a moeda): moedas aceitas e com cotação, com nome em português.
- `GET /api/exchange-rates?base=BRL&symbols=USD,EUR` · `GET /api/exchange-rates/convert?from=USD&to=BRL&amount=10`.
  Fonte: ExchangeRate-API, com cache; `stale: true` indica cotação de cache após falha do provedor.

### Relatórios — `/api/reports`
| Rota | Descrição | Req. |
|---|---|---|
| `GET /overview?month?` | **Tela inicial em uma requisição**: saldos e total, resumo do mês, 5 maiores despesas por categoria, 5 últimas transações | R55, R83, R86 |
| `GET /statement?from&to&walletId?` | Extrato: saldo inicial, movimentos com saldo corrente, totais, saldo final | R41 |
| `GET /statement/pdf?from&to&walletId?` | O mesmo extrato em PDF (`attachment`) | R41 |
| `GET /cash-flow?from&to&walletId?` | Entradas e saídas em ordem cronológica, totais por moeda e convertidos | R58 |
| `GET /by-category?from&to&type` | Totais e participação por categoria (gráfico de pizza) | R01 |
| `GET /monthly?fromMonth&toMonth` | Receitas × despesas por mês, até 36 meses (gráfico de evolução) | R01 |

Períodos de relatório: até 5 anos.

### Sistema
- `GET /health` (processo), `GET /health/ready` (banco) — sem autenticação.
- `GET /api/system/status` — público; o app consulta para avisar sobre manutenção (R72).
- `/api/admin` (perfil admin): `GET`/`PUT /maintenance` `{ enabled, message? }` (R72), `GET /logs?event&level&before&limit` (R85),
  `POST /housekeeping` (limpeza de dados vencidos sob demanda; também roda sozinha a cada hora).

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
```
