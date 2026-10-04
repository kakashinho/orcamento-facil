# Guia do backend

Este guia ensina, em ordem:

1. [Como rodar o projeto](#1-como-rodar-o-projeto)
2. [Como ver as rotas](#2-como-ver-as-rotas)
3. [DTOs e validação: onde estão e como funcionam](#3-dtos-e-validação)
4. [A estrutura em camadas e o caminho de uma requisição](#4-a-estrutura-em-camadas)
5. [Essa estrutura é comum?](#5-essa-estrutura-é-comum)

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
3. Clique em **Authorize** (cadeado no topo), cole o token e confirme.
4. Agora as rotas com cadeado funcionam. Teste **GET /api/wallets** (sua carteira padrão já existe).

O access token vale 15 minutos. Quando expirar, faça login de novo ou use **POST /api/auth/refresh** com o `refreshToken`.

### Rodando os testes

```bash
npm run db:test:up          # 1ª vez: sobe um PostgreSQL só para testes (porta 5433)
npm run test:unit           # testes sem banco, inclusive as regras de arquitetura
npm run test:integration    # testes da API contra o banco de teste (recria as tabelas a cada execução)
npm run db:test:down        # desliga o banco de teste quando terminar
```

### Comandos do dia a dia

| Comando | Para quê |
|---|---|
| `npm run dev` | Sobe a API em modo desenvolvimento |
| `npm run routes` | Lista todas as rotas no terminal |
| `npm run typecheck` | Procura erros de tipo no código |
| `npm run build` / `npm start` | Compila para `dist/` e roda a versão compilada |
| `npm run db:generate` | Gera uma migration nova depois de mudar `src/infrastructure/database/schema/` |
| `npm run db:migrate` | Aplica migrations pendentes no banco do `.env` |

Para olhar o banco direto:
`docker exec -it my-api-postgres psql -U postgres -d myapi`, depois `\dt` (tabelas) e
`select description, amount from transactions limit 5;`. A coluna `amount` aparece como bytes ilegíveis:
é a criptografia dos valores financeiros (requisito R81) funcionando.

---

## 2. Como ver as rotas

### 2.1 Documentação interativa (Swagger) — `/docs`

Com a API rodando, abra `http://localhost:3000/docs`. Ali estão **todas** as rotas agrupadas por assunto,
com os campos aceitos, as respostas e o botão **Try it out**. A especificação em JSON (para importar no
Postman/Insomnia) fica em `/docs/json`.

Ela é **gerada a partir dos próprios DTOs** (seção 3), então nunca fica desatualizada.

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

São 55 rotas.

### 2.3 No código

Cada recurso tem um arquivo em `routes/`, e o [src/app.ts](src/app.ts) registra cada um com um prefixo:

| Prefixo | Arquivo de rotas |
|---|---|
| `/api/auth` | [modules/auth/routes/auth.routes.ts](src/modules/auth/routes/auth.routes.ts) |
| `/api/users` | [modules/auth/routes/user.routes.ts](src/modules/auth/routes/user.routes.ts) |
| `/api/wallets` | [modules/finance/routes/wallet.routes.ts](src/modules/finance/routes/wallet.routes.ts) |
| `/api/categories` | [modules/finance/routes/category.routes.ts](src/modules/finance/routes/category.routes.ts) |
| `/api/tags` | [modules/finance/routes/tag.routes.ts](src/modules/finance/routes/tag.routes.ts) |
| `/api/transactions` | [modules/finance/routes/transaction.routes.ts](src/modules/finance/routes/transaction.routes.ts) |
| `/api/transfers` | [modules/finance/routes/transfer.routes.ts](src/modules/finance/routes/transfer.routes.ts) |
| `/api/exchange-rates` | [modules/finance/routes/exchange-rate.routes.ts](src/modules/finance/routes/exchange-rate.routes.ts) |
| `/api/history` | [modules/history/routes/history.routes.ts](src/modules/history/routes/history.routes.ts) |
| `/api/reports` | [modules/reports/routes/report.routes.ts](src/modules/reports/routes/report.routes.ts) |
| `/api/admin` | [modules/system/routes/admin.routes.ts](src/modules/system/routes/admin.routes.ts) |
| `/health`, `/api/system/status` | [modules/system/routes/system.routes.ts](src/modules/system/routes/system.routes.ts) |

Um arquivo de rotas só **declara** os endpoints. Cada linha diz o método, o caminho, qual schema valida e
qual método do controller atende:

```ts
// modules/finance/routes/transaction.routes.ts
export function transactionRoutes(controller: TransactionController, guards: HttpGuards): FastifyPluginAsyncZod {
  return async (app) => {
    app.addHook("onRequest", guards.authenticate);          // todas exigem login

    app.get("/", { schema: schemas.list }, controller.list);
    app.post("/", { schema: schemas.create }, controller.create);
    app.patch("/:id", { schema: schemas.update }, controller.update);
    app.delete("/:id", { schema: schemas.remove }, controller.remove);
    // ...
  };
}
```

---

## 3. DTOs e validação

### 3.1 Onde ficam os DTOs

Na pasta `schemas/` de cada módulo. Cada arquivo tem três blocos, sempre na mesma ordem:

```ts
// modules/finance/schemas/transaction.schema.ts

// ---------- Request DTOs ----------
export const createTransactionRequestSchema = z.object({
  type: z.enum(["income", "expense"]),
  amount: positiveAmount,                 // > 0, até 2 casas decimais
  description: z.string().min(1).max(200),
  date: isoDate.optional(),               // AAAA-MM-DD que existe no calendário
  walletId: z.uuid().optional(),
  categoryId: z.uuid().nullable().optional(),
  tags: z.array(z.string().min(1).max(40)).max(10).optional(),
});
export type CreateTransactionRequestDto = z.infer<typeof createTransactionRequestSchema>;

// ---------- Response DTOs ----------
export const transactionResponseSchema = z.object({ id: z.string(), amount: z.number(), /* ... */ });
export type TransactionResponseDto = z.infer<typeof transactionResponseSchema>;

// ---------- Schemas das rotas (validação + documentação) ----------
export const transactionRouteSchemas = {
  create: {
    summary: "Registrar transação (R06)",
    body: createTransactionRequestSchema,          // valida a entrada
    response: { 201: transactionResponseSchema },  // valida e filtra a saída
  },
  // ...
};
```

Cada schema Zod cumpre três papéis ao mesmo tempo:

| Papel | Como acontece |
|---|---|
| **Valida em tempo de execução** | O Fastify confere `body`, `querystring`, `params` e `headers` **antes** de chamar o controller |
| **Gera o tipo TypeScript** | `CreateTransactionRequestDto` vem do schema (`z.infer`); não há interface duplicada para manter |
| **Documenta** | O Swagger em `/docs` é gerado desses schemas |

O **DTO de resposta também protege dados**: a resposta passa pelo schema antes de sair, e campos que não
estão nele são removidos. Por isso o hash da senha nunca sai da API, mesmo que alguém o coloque no objeto
por engano.

### 3.2 As três camadas de validação

| Camada | Onde | O que verifica | Resposta |
|---|---|---|---|
| **1. Formato** (DTO) | `schemas/` e [infrastructure/http/common-schemas.ts](src/infrastructure/http/common-schemas.ts) | Campo obrigatório, tipo, tamanho, data válida, moeda ISO, UUID, valor > 0 | `400 VALIDATION_ERROR` |
| **2. Regra de negócio** | `services/` | Carteira existe e é sua, nome duplicado, senha forte, moeda suportada | `4xx` com código específico (`INVALID_WALLET`, `WALLET_NAME_TAKEN`…) |
| **3. Banco** (constraints) | [infrastructure/database/schema/](src/infrastructure/database/schema/) → migrations | Unicidade, chave estrangeira, CHECK | `409` / `400` |

A camada 1 só olha o formato e nunca consulta o banco. "Esse e-mail já existe?" é regra de negócio
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

O erro lista **todos** os campos com problema de uma vez, e o controller nem chega a rodar.

Uma regra de negócio (carteira que não existe ou é de outro usuário):

```json
HTTP 422
{ "statusCode": 422, "code": "INVALID_WALLET", "message": "Carteira inexistente." }
```

Todo erro tem o formato `{ statusCode, code, message, details? }`, garantido por
[infrastructure/http/error-handler.ts](src/infrastructure/http/error-handler.ts).

---

## 4. A estrutura em camadas

### 4.1 Mapa das pastas

```text
src/
├── server.ts          ponto de entrada: lê a config, monta tudo e sobe o servidor
├── app.ts             monta o Fastify: plugins, hooks globais e registro das rotas
├── container.ts       cria repositories → services → controllers e liga uns aos outros
├── config/env.ts      lê e valida as variáveis de ambiente
│
├── modules/                       ⭐ um módulo por domínio
│   ├── auth/          cadastro, login, sessão, recuperação de senha, perfil
│   ├── finance/       carteiras, categorias, tags, transações, transferências, câmbio
│   ├── history/       histórico de ações e "desfazer"
│   ├── reports/       extrato, PDF, fluxo de caixa, gráficos
│   └── system/        saúde, status, manutenção, logs administrativos
│
│   cada módulo tem as mesmas pastas:
│   ├── routes/        declaram os endpoints (caminho + schema + controller)
│   ├── controllers/   recebem o request validado, chamam o service, devolvem o response
│   ├── schemas/       DTOs de request e de response (validação com Zod)
│   ├── services/      regras de negócio — sem SQL e sem Fastify
│   ├── repositories/  única camada que acessa o banco (Drizzle)
│   └── types/         tipos do domínio
│
├── infrastructure/    peças técnicas usadas pelos módulos
│   ├── database/      conexão, transação, base dos repositories, tabelas e migrator
│   ├── http/          autenticação (hook), tratamento de erros, validadores comuns
│   ├── auth/          JWT e hash de senha
│   ├── crypto/        criptografia dos valores financeiros (AES-256-GCM)
│   ├── logging/       logger e registro de eventos
│   ├── mail/          envio de e-mail
│   └── exchange-rates/ cliente da API de câmbio
│
└── shared/            utilitários sem regra de negócio: erros, dinheiro, datas, paginação
```

O módulo `reports` não tem `repositories/`: ele só **lê dados de outros módulos**, e pela regra da
arquitetura faz isso pelos services públicos deles, nunca acessando as tabelas diretamente.

### 4.2 O que cada camada pode e não pode fazer

| Camada | Pode | Não pode |
|---|---|---|
| **Route** | Declarar o endpoint, ligar schema, autenticação e controller | Ter lógica, chamar service ou banco |
| **Controller** | Ler `body`/`query`/`params` e o usuário logado, chamar o service, escolher o status HTTP | Acessar repository, ter regra de negócio |
| **Service** | Aplicar regras, coordenar repositories, abrir transação de banco | Conhecer Fastify, escrever SQL |
| **Repository** | Fazer queries com Drizzle, cifrar e decifrar valores | Ter regra de negócio, conhecer HTTP |

Essas regras não são só documentação: [tests/unit/architecture.test.ts](tests/unit/architecture.test.ts)
falha se algum arquivo "pular" uma camada.

### 4.3 O caminho de uma requisição

O que acontece quando o app envia `POST /api/transactions`:

```text
App ──HTTP──► app.ts
               │ ① hooks globais: x-request-id; modo de manutenção ativo → 503
               ▼
             routes/transaction.routes.ts
               │ ② guards.authenticate: valida o JWT → request.auth.userId          (sem token: 401)
               │ ③ valida o body com createTransactionRequestSchema (DTO)          (inválido: 400)
               ▼
             controllers/transaction.controller.ts → create()
               │ ④ pega userId e body e chama o service
               ▼
             services/transaction.service.ts → create()
               │ ⑤ abre uma transação de banco (tudo ou nada)
               │ ⑥ regras: a carteira é do usuário? a categoria pode ser usada? cria as tags
               │ ⑦ grava pela TransactionRepository e atualiza o saldo pelo WalletService
               │ ⑧ registra a ação no histórico, para poder desfazer (ActionHistoryService)
               ▼
             repositories/transaction.repository.ts
               │ ⑨ cifra o valor e executa o INSERT com Drizzle
               ▼
             PostgreSQL
               ▼
             controller → reply.status(201).send(TransactionResponseDto)
               │ ⑩ resposta validada pelo DTO de saída, comprimida e enviada
 App ◄──201──

 Erro em qualquer ponto → infrastructure/http/error-handler.ts → { statusCode, code, message, details? }
```

### 4.4 Como as peças se conectam (`container.ts`)

Ninguém cria as próprias dependências: nenhum service faz `new Repository()`. O
[src/container.ts](src/container.ts) monta tudo uma vez, de baixo para cima:

```ts
const transactionRepository = new TransactionRepository(db, cipher);            // banco
const transactions = new TransactionService({ transactions: transactionRepository, wallets, ... }); // regras
const transactionController = new TransactionController(transactions);          // HTTP
// app.ts: transactionRoutes(transactionController, guards)                      // endpoints
```

Isso se chama **injeção de dependências**. Na prática, nos testes o container recebe um e-mail falso, um
câmbio falso e um relógio controlável (para testar o bloqueio de login sem esperar 15 minutos), sem
mudar nada no código de produção.

### 4.5 Como adicionar um endpoint

1. **DTO:** no `schemas/<recurso>.schema.ts`, crie o schema de request, o de response e a entrada em `<recurso>RouteSchemas`.
2. **Repository** (se precisar de uma query nova): método em `repositories/<recurso>.repository.ts`.
3. **Service:** a regra de negócio em `services/<recurso>.service.ts`, usando o repository. Lance `errors.xxx(...)` ([shared/errors/app-error.ts](src/shared/errors/app-error.ts)) quando uma regra impedir a operação.
4. **Controller:** um método em `controllers/<recurso>.controller.ts` que chama o service e devolve o DTO.
5. **Route:** uma linha em `routes/<recurso>.routes.ts` ligando caminho + schema + controller.
6. **Banco** (se mudar tabela): altere `infrastructure/database/schema/*.ts` → `npm run db:generate` → revise o SQL em `drizzle/` → `npm run db:migrate`.
7. **Teste:** um caso em `tests/integration/`. Depois confira em `/docs` e com `npm run routes`.

---

## 5. Essa estrutura é comum?

Sim. É o formato mais comum em backends Node.js (Express, NestJS, Fastify) e o mesmo descrito em
[docs/standards/01-structure-and-modules.md](docs/standards/01-structure-and-modules.md) e
[docs/standards/03-layers-and-dependencies.md](docs/standards/03-layers-and-dependencies.md):

- **Organização por domínio** (`modules/auth`, `modules/finance`…): cada pasta é uma área de negócio, como no NestJS. É o "monólito modular" pedido pela arquitetura do projeto.
- **Camadas dentro de cada domínio** (`route → controller → service → repository`): separa o que é HTTP, o que é regra e o que é banco. Dá para trocar uma parte sem mexer nas outras, por exemplo testar uma regra sem subir servidor.
- **DTOs com validação** em `schemas/`: o contrato da API fica num lugar só, validado e documentado.

Diferenças pequenas em relação a outros projetos que você pode encontrar por aí:

- alguns usam **classes de DTO com decorators** (`class-validator` no NestJS); aqui são schemas **Zod**, que fazem o mesmo papel;
- alguns chamam `schemas/` de `dtos/` ou `validators/`, e `repositories/` de `dao/`. O papel é o mesmo.
