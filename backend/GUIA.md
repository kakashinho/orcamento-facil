# Guia do backend

Este guia ensina, em ordem:

1. [Como rodar o projeto](#1-como-rodar-o-projeto)
2. [Como ver as rotas](#2-como-ver-as-rotas)
3. [DTOs e validação: onde estão e como funcionam](#3-dtos-e-validação)
4. [A estrutura do código e o caminho de uma requisição](#4-a-estrutura-do-código)
5. [Essa estrutura é comum? Comparação com o padrão documentado](#5-essa-estrutura-é-comum)

Todos os comandos rodam dentro da pasta `backend/`.

---

## 1. Como rodar o projeto

### Pré-requisitos

- **Node.js 22.12 ou mais novo** (`node -v` para conferir)
- **Docker Desktop** aberto (para o PostgreSQL)

### Opção A — tudo no Docker (mais simples)

```bash
docker compose up --build
```

Sobem três containers: o PostgreSQL, a API (com recarga automática quando você salva um arquivo) e o Nginx.
Abra **http://localhost/docs**. As migrations são aplicadas sozinhas na subida.

### Opção B — API no terminal, banco no Docker (melhor para programar)

```bash
npm install                    # 1ª vez: instala as dependências
docker compose up -d postgres  # sobe só o banco (porta 5432)
npm run db:migrate             # cria as tabelas (rode de novo quando houver migration nova)
npm run dev                    # sobe a API com recarga automática
```

Abra **http://localhost:3000/docs**.

O arquivo `.env` guarda a configuração local: endereço do banco, segredo do JWT e chave de criptografia.
O seu já está preenchido. Numa máquina nova, copie `.env.example` para `.env` e gere as chaves com os
comandos indicados dentro do arquivo.

### Primeiro uso: criar conta e chamar uma rota protegida

1. Em `/docs`, abra **POST /api/auth/register**, clique em **Try it out** e envie:
   ```json
   { "email": "voce@exemplo.com", "username": "voce", "password": "Senha@Forte123" }
   ```
2. Copie o `accessToken` da resposta.
3. Clique no botão **Authorize** (cadeado no topo), cole o token e confirme.
4. Agora as rotas com cadeado funcionam. Teste **GET /api/wallets** (sua carteira padrão já existe).

O access token vale 15 minutos. Quando expirar, faça login de novo ou use **POST /api/auth/refresh** com o `refreshToken`.

### Rodando os testes

```bash
npm run db:test:up          # 1ª vez: sobe um PostgreSQL só para testes (porta 5433)
npm run test:unit           # testes sem banco (rápidos)
npm run test:integration    # testes contra o banco de teste (recria as tabelas a cada execução)
npm run db:test:down        # desliga o banco de teste quando terminar
```

### Comandos do dia a dia

| Comando | Para quê |
|---|---|
| `npm run dev` | Sobe a API em modo desenvolvimento |
| `npm run routes` | Lista todas as rotas no terminal |
| `npm run typecheck` | Procura erros de tipo no código |
| `npm run build` / `npm start` | Compila para `dist/` e roda a versão compilada |
| `npm run db:generate` | Gera uma migration nova depois de mudar `src/db/schema/` |
| `npm run db:migrate` | Aplica migrations pendentes no banco do `.env` |

Para olhar o banco direto:
`docker exec -it my-api-postgres psql -U postgres -d myapi`, depois `\dt` (tabelas) e
`select description, amount from transactions limit 5;`. A coluna `amount` aparece como bytes ilegíveis:
é a criptografia dos valores financeiros (requisito R81) funcionando.

---

## 2. Como ver as rotas

### 2.1 Documentação interativa (Swagger) — `/docs`

Com a API rodando, abra `http://localhost:3000/docs` (ou `http://localhost/docs` no Docker). Ali estão
**todas** as rotas agrupadas por assunto, com os campos aceitos, as respostas e o botão **Try it out** para
testar. A especificação em JSON (para importar no Postman/Insomnia) fica em `/docs/json`.

Essa documentação é **gerada a partir do próprio código de validação** (seção 3). Por isso ela nunca fica
desatualizada: se a regra de um campo mudar no código, o Swagger muda junto.

### 2.2 No terminal — `npm run routes`

Não precisa do banco rodando. Saída (trecho):

```text
Transações
  GET    🔒 /api/transactions/                       Listar transações (R09, R10, R26, R52, R70)
  POST   🔒 /api/transactions/                       Registrar transação (R06)
  GET    🔒 /api/transactions/summary                Totais de receitas e despesas do filtro, por moeda
  POST   🔒 /api/transactions/parse                  Interpretar frase falada em rascunho de transação
  GET    🔒 /api/transactions/{id}                   Detalhar transação
  PATCH  🔒 /api/transactions/{id}                   Editar transação (R11)
  DELETE 🔒 /api/transactions/{id}                   Excluir transação (R12)
  POST   🔒 /api/transactions/{id}/duplicate         Duplicar transação (R48)
...
🔒 = exige header Authorization: Bearer <accessToken>
```

São 57 rotas.

### 2.3 No código

Cada módulo tem um arquivo `*.routes.ts`, e o [src/app.ts](src/app.ts) registra cada um com um prefixo:

| Prefixo | Arquivo |
|---|---|
| `/api/auth` | [src/modules/auth/auth.routes.ts](src/modules/auth/auth.routes.ts) |
| `/api/users` | [src/modules/users/user.routes.ts](src/modules/users/user.routes.ts) |
| `/api/wallets` | [src/modules/wallets/wallet.routes.ts](src/modules/wallets/wallet.routes.ts) |
| `/api/categories` | [src/modules/categories/category.routes.ts](src/modules/categories/category.routes.ts) |
| `/api/tags` | [src/modules/tags/tag.routes.ts](src/modules/tags/tag.routes.ts) |
| `/api/transactions` | [src/modules/transactions/transaction.routes.ts](src/modules/transactions/transaction.routes.ts) |
| `/api/transfers` | [src/modules/transfers/transfer.routes.ts](src/modules/transfers/transfer.routes.ts) |
| `/api/history` | [src/modules/history/history.routes.ts](src/modules/history/history.routes.ts) |
| `/api/exchange-rates` | [src/modules/exchange-rates/exchange-rate.routes.ts](src/modules/exchange-rates/exchange-rate.routes.ts) |
| `/api/reports` | [src/modules/reports/report.routes.ts](src/modules/reports/report.routes.ts) |
| `/api/system`, `/api/admin`, `/health` | [src/modules/system/system.routes.ts](src/modules/system/system.routes.ts) |

Exemplo de leitura de uma rota (`POST /api/transactions`, simplificado):

```ts
export function transactionRoutes(deps: RouteDeps): FastifyPluginAsyncZod {
  return async (app) => {
    app.addHook("onRequest", deps.authenticate);   // ① toda rota deste arquivo exige login

    app.post("/", {                                // ② método + caminho (prefixo /api/transactions)
      schema: {
        summary: "Registrar transação (R06)",      // ③ texto que aparece no Swagger
        body: z.object({                           // ④ VALIDAÇÃO do corpo — o DTO de entrada
          type: z.enum(["income", "expense"]),
          amount: positiveAmount,
          description: z.string().min(1).max(200),
          date: isoDate.optional(),
          walletId: z.uuid().optional(),
          tags: z.array(z.string()).max(10).optional(),
        }),
        response: { 201: transactionResponse },    // ⑤ DTO de saída
      },
    },
    async (request, reply) => {                    // ⑥ handler: só roda se ①–④ passaram
      const result = await transactions.create(requireAuth(request).userId, request.body);
      return reply.status(201).send(result);       // ⑦ status HTTP + resposta
    });
  };
}
```

---

## 3. DTOs e validação

### 3.1 O que é DTO neste projeto

DTO (*Data Transfer Object*) é o formato dos dados que **entram** e **saem** da API. Aqui eles são
definidos com a biblioteca **Zod**, e o mesmo schema cumpre três papéis ao mesmo tempo:

| Papel | Como acontece |
|---|---|
| **Valida em tempo de execução** | O plugin `fastify-type-provider-zod` confere o `body`, a `querystring` e os `params` **antes** de o handler rodar |
| **Dá o tipo TypeScript** | `request.body` já vem tipado com os campos do schema; não existe interface duplicada para manter |
| **Documenta** | O Swagger em `/docs` é gerado desses schemas |

| DTO | Onde fica | Exemplo |
|---|---|---|
| Entrada (body, query, params) | `schema.body`, `schema.querystring`, `schema.params` em cada `*.routes.ts` | corpo do `POST /api/transactions` acima |
| Saída (resposta) | `schema.response` + funções de mapeamento | `transactionResponse` em [transaction.routes.ts](src/modules/transactions/transaction.routes.ts); `toUserDto` em [user.dto.ts](src/modules/users/user.dto.ts); `WalletService.toDto` |
| Contrato rota → service | interfaces no service | `CreateTransactionInput` em [transaction.service.ts](src/modules/transactions/transaction.service.ts) |

O DTO de saída também **protege dados**: a resposta passa pelo schema antes de ser enviada, e campos
que não estão nele são removidos. Por isso `passwordHash` nunca sai da API, mesmo que alguém o coloque
no objeto por engano.

### 3.2 As três camadas de validação

| Camada | Onde | O que verifica | Resposta |
|---|---|---|---|
| **1. Formato** (schema Zod) | `*.routes.ts` e [src/http/schemas.ts](src/http/schemas.ts) | Campo obrigatório, tipo, tamanho, data válida, moeda ISO, UUID, valor > 0 com até 2 casas | `400 VALIDATION_ERROR` |
| **2. Regra de negócio** (service) | `*.service.ts` | Carteira existe e é sua, nome duplicado, senha forte, moeda suportada, carteira com movimentos não pode ser excluída | `4xx` com código específico (`INVALID_WALLET`, `WALLET_NAME_TAKEN`…) |
| **3. Banco** (constraints) | [src/db/schema/](src/db/schema/) → migrations | Unicidade, chave estrangeira, CHECK | `409 CONFLICT` / `400` |

A camada 1 só olha o formato; ela nunca consulta o banco. "Esse e-mail já existe?" é regra de negócio
(camada 2), com a camada 3 como última garantia.

### 3.3 Veja acontecendo

Enviando `{ "type": "compra", "amount": -5, "description": "", "date": "2026-02-30" }` para
`POST /api/transactions`, a resposta real é:

```json
HTTP 400
{
  "statusCode": 400,
  "code": "VALIDATION_ERROR",
  "message": "Dados inválidos na requisição.",
  "details": [
    { "location": "body", "path": "type", "message": "Opção inválida: esperava uma das seguintes opções: \"income\"|\"expense\"" },
    { "location": "body", "path": "amount", "message": "O valor deve ser maior que zero" },
    { "location": "body", "path": "description", "message": "Pequeno demais: esperava que o texto tivesse >= 1 caracteres" },
    { "location": "body", "path": "date", "message": "Data inválida" }
  ]
}
```

O erro lista **todos** os campos com problema de uma vez, para o app marcar cada um no formulário.
O handler nem chegou a rodar.

Já uma regra de negócio (carteira que não existe ou é de outro usuário):

```json
HTTP 422
{ "statusCode": 422, "code": "INVALID_WALLET", "message": "Carteira inexistente." }
```

Todo erro da API tem esse formato `{ statusCode, code, message, details? }`. Quem garante isso é
[src/http/error-handler.ts](src/http/error-handler.ts). O app deve usar o `code` para decidir o que fazer
e mostrar a `message` ao usuário.

### 3.4 Validadores reutilizáveis

Regras usadas em vários lugares ficam em [src/http/schemas.ts](src/http/schemas.ts): `isoDate` (data
AAAA-MM-DD que existe no calendário), `isoMonth`, `currencyCode` (ISO 4217), `positiveAmount`,
`idParams` (`:id` precisa ser UUID), `limitQuery` (paginação 1–100). Uma regra nova de formato entra
nesse arquivo e é importada pelas rotas.

---

## 4. A estrutura do código

### 4.1 Mapa das pastas

```text
backend/
├── src/
│   ├── server.ts          ponto de entrada: lê a config, monta tudo e sobe o servidor
│   ├── app.ts             monta o Fastify: plugins (compressão, Swagger, CORS), hooks globais, registra os módulos
│   ├── container.ts       cria cada serviço uma vez e entrega para quem precisa (injeção de dependências)
│   ├── config/env.ts      lê e valida as variáveis de ambiente (falha na subida se faltar algo)
│   │
│   ├── modules/           ⭐ uma pasta por funcionalidade — aqui fica o "negócio"
│   │   ├── auth/            cadastro, login, tokens, recuperação de senha
│   │   ├── users/           perfil do usuário
│   │   ├── wallets/         carteiras e saldo
│   │   ├── categories/      categorias e sugestão de categoria
│   │   ├── tags/            tags
│   │   ├── transactions/    transações: comandos, consultas, interpretação de voz
│   │   ├── transfers/       transferências entre carteiras
│   │   ├── history/         histórico de ações e "desfazer"
│   │   ├── exchange-rates/  cotações de câmbio
│   │   ├── reports/         extrato, PDF, fluxo de caixa, gráficos
│   │   └── system/          saúde, status, manutenção, logs administrativos
│   │
│   ├── http/              peças HTTP comuns: autenticação, tratamento de erros, validadores reutilizáveis
│   ├── db/                tabelas (schema Drizzle), conexão com o banco, aplicação das migrations
│   ├── infra/             serviços técnicos: logger, e-mail, registro de eventos, relógio
│   └── shared/            utilitários sem regra de negócio: criptografia, dinheiro, datas, paginação
│
├── drizzle/               migrations SQL oficiais (histórico das mudanças do banco)
├── tests/unit/            testes de funções puras (sem banco)
├── tests/integration/     testes da API contra um PostgreSQL real
└── scripts/               utilitários de desenvolvimento (npm run routes)
```

Dentro de cada módulo, os arquivos seguem o mesmo padrão de nomes:

| Arquivo | Papel | Exemplo |
|---|---|---|
| `*.routes.ts` | Endpoints HTTP: caminho, validação (DTOs) e o handler que chama o service | `transaction.routes.ts` |
| `*.service.ts` | Regras de negócio e gravação no banco | `transaction.service.ts` |
| `*.queries.ts` | Consultas de leitura mais complexas (filtros, paginação, ordenação) | `transaction.queries.ts` |
| `*.types.ts` / `*.dto.ts` | Tipos e conversão para o formato de resposta | `transaction.types.ts`, `user.dto.ts` |
| demais | Lógica pura específica do módulo, fácil de testar isolada | `category-suggester.ts`, `statement-pdf.ts` |

### 4.2 O caminho de uma requisição

O que acontece quando o app envia `POST /api/transactions`:

```text
 App ──HTTP──► Fastify (app.ts)
                 │ ① hooks globais: gera x-request-id; se o modo de manutenção estiver ativo, recusa (503)
                 ▼
               transaction.routes.ts
                 │ ② authenticate (http/auth.ts): valida o JWT → request.auth.userId   (sem token: 401)
                 │ ③ valida o body com o schema Zod                                    (inválido: 400)
                 │ ④ handler chama o service
                 ▼
               transaction.service.ts
                 │ ⑤ abre uma transação no banco
                 │ ⑥ confere carteira e categoria (WalletService, CategoryService), cria as tags (TagService)
                 │ ⑦ cifra o valor (shared/crypto), grava, atualiza o saldo (BalanceLedger)
                 │ ⑧ registra a ação no histórico, para poder desfazer (ActionHistory)
                 │ ⑨ commit; tudo ou nada
                 ▼
               transaction.queries.ts → monta o DTO de resposta
                 ▼
 App ◄──201──  ⑩ resposta validada pelo schema de saída, comprimida (gzip/br) e enviada

 Erro em qualquer ponto → http/error-handler.ts → { statusCode, code, message, details? }
```

### 4.3 Injeção de dependências, sem mistério

Nenhum service cria as próprias dependências; ninguém escreve `new Pool()` ou `new WalletService()`
dentro de outro service. O [src/container.ts](src/container.ts) cria tudo uma vez, na ordem certa, e
passa pelo construtor:

```ts
const wallets = new WalletService(db, cipher, clock, exchangeRates);
const transactions = new TransactionService(db, cipher, clock, ledger, history, wallets, categories, tags, queries);
```

Vantagem prática: nos testes, o container recebe um e-mail falso (guarda as mensagens em memória), um
câmbio falso (taxas fixas) e um relógio controlável (avançar 15 minutos para testar o bloqueio de login).
O código de produção não muda nada.

### 4.4 Como adicionar um endpoint

1. **Rota:** no `*.routes.ts` do módulo, declare método, caminho, `schema` (body/query/params e response) e um handler curto que chama o service.
2. **Regra:** escreva o método no `*.service.ts`. Ele recebe o `userId` e dados já validados, e lança `errors.xxx(...)` ([src/shared/errors.ts](src/shared/errors.ts)) quando uma regra impede a operação.
3. **Banco (se precisar):** altere `src/db/schema/*.ts` → `npm run db:generate` → revise o SQL gerado em `drizzle/` → `npm run db:migrate`.
4. **Teste:** acrescente um caso em `tests/integration/`.
5. **Confira:** a rota aparece em `/docs` e em `npm run routes`.

---

## 5. Essa estrutura é comum?

Em parte. Há duas decisões diferentes aqui:

**Organizar por funcionalidade** (uma pasta por assunto em `modules/`): sim, é muito comum e recomendado.
É como o NestJS organiza "modules", como o Fastify sugere organizar plugins, e o que se chama de
*feature folders*. A arquitetura do projeto (`sources/Arquitetura.txt` e `docs/architecture/`) pede
justamente um monólito modular organizado por domínio.

**Separar camadas dentro de cada módulo:** aqui o código atual **não segue o padrão documentado do
projeto**. O padrão mais comum em backends Node (Express, NestJS) é o fluxo
`route → controller → service → repository`, com os schemas em arquivos próprios. É exatamente o que
[docs/standards/01-structure-and-modules.md](docs/standards/01-structure-and-modules.md) e
[docs/standards/03-layers-and-dependencies.md](docs/standards/03-layers-and-dependencies.md) definem:

| Padrão documentado | Como está hoje | Diferença |
|---|---|---|
| `routes/` declaram o endpoint | `*.routes.ts` | Existe, mas a rota também faz o papel de controller (o handler está dentro dela) |
| `controllers/` traduzem HTTP ↔ service | não existe | Os handlers ficam dentro das rotas |
| `schemas/` com os DTOs | schemas dentro das rotas + `http/schemas.ts` | A validação existe e funciona, mas não está separada em arquivos próprios |
| `services/` com regras de negócio | `*.service.ts` | Existe, mas os services **executam queries Drizzle diretamente**, o que o padrão proíbe |
| `repositories/` como única camada que fala com o banco | não existe (`*.queries.ts` faz parte desse papel) | **Falta a camada de repository** |
| Módulos por domínio: `auth`, `finance`, `history`, `reports`, `system` | 11 pastas, quase uma por entidade (`wallets`, `tags`, `transfers`…) | O padrão agrupa carteiras, categorias, tags, transações e transferências em `finance` |

Resumo honesto: a API funciona, cobre os requisitos e tem 132 testes passando, mas a organização interna
não é a que o projeto documentou. Para seguir o padrão, cada módulo ficaria assim:

```text
src/modules/finance/
├── routes/         transaction.routes.ts      (só endpoints: caminho + schema + controller)
├── controllers/    transaction.controller.ts  (lê request, chama service, escolhe status HTTP)
├── schemas/        transaction.schema.ts      (DTOs Zod de entrada e saída)
├── services/       transaction.service.ts     (regras de negócio, sem SQL)
├── repositories/   transaction.repository.ts  (todas as queries Drizzle)
└── types/          transaction.types.ts
```

Essa reorganização muda **onde** o código mora, não **o que** ele faz. Os testes de integração chamam a
API por HTTP, então servem de rede de segurança: se continuarem passando depois da mudança, o
comportamento não mudou.
