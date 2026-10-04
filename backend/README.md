# Orçamento Fácil — Backend (API RESTful)

API em Node.js que atende o aplicativo Android (React Native) do Orçamento Fácil: autenticação, carteiras em várias moedas, transações, categorias, tags, transferências, desfazer, relatórios com PDF, câmbio, modo de manutenção e logs. Cobre os requisitos da Sprint 1 (`sources/requisitos-1sprint.txt`) que dependem do servidor.

| Para… | Veja |
|---|---|
| **Aprender: rodar, ver rotas, validação e estrutura** | [GUIA.md](GUIA.md) |
| Usar a API (endpoints, formatos, exemplos) | [docs/api/README.md](docs/api/README.md) e o Swagger em `/docs` |
| Entender a arquitetura e as decisões | [docs/architecture/implementation.md](docs/architecture/implementation.md) |
| Ver como cada requisito foi atendido | [docs/requirements/sprint-1-implementation.md](docs/requirements/sprint-1-implementation.md) |

## Stack

Node.js 24 (≥ 22.12) · TypeScript · Fastify 5 · PostgreSQL 17 · Drizzle ORM · Zod (validação + OpenAPI) · Vitest · Docker · Nginx.

## Rodando localmente

Pré-requisitos: Node.js 22.12+ e Docker.

```bash
cp .env.example .env          # preencha JWT_SECRET e DATA_ENCRYPTION_KEY (comandos no arquivo)
npm install
docker compose up -d postgres # banco de desenvolvimento na porta 5432
npm run db:migrate            # aplica as migrations oficiais
npm run dev                   # API em http://localhost:3000 — documentação em /docs
```

Tudo em containers (API + PostgreSQL + Nginx na porta 80):

```bash
docker compose up --build     # http://localhost/docs
```

Sem `SMTP_HOST`, os e-mails de recuperação de senha aparecem no log do servidor em desenvolvimento.
O primeiro usuário cujo e-mail esteja em `ADMIN_EMAILS` recebe o perfil de administrador
(no compose: `admin@orcamentofacil.local`).

> **Banco de desenvolvimento antigo:** se o volume `postgres_data` foi criado com o protótipo
> anterior (tabela `users` com id serial), recrie-o com `docker compose down -v` antes de migrar.

## Scripts

| Script | O que faz |
|---|---|
| `npm run dev` | API com recarga automática (tsx) |
| `npm run routes` | Lista todas as rotas (método, caminho, se exige login, descrição) |
| `npm run build` / `npm start` | Compila para `dist/` e executa |
| `npm run typecheck` | Verificação de tipos |
| `npm run test:unit` | Testes unitários (sem banco) |
| `npm run db:test:up` | Sobe o PostgreSQL isolado de testes (porta 5433) |
| `npm run test:integration` | Testes de integração contra o banco de testes (recria o schema a cada execução) |
| `npm run db:generate` | Gera nova migration a partir de `src/infrastructure/database/schema/*` |
| `npm run db:migrate` / `db:migrate:prod` | Aplica migrations pendentes (dev / build compilado) |

Fluxo de testes completo:

```bash
npm run db:test:up
npm run typecheck && npm run test:unit && npm run test:integration && npm run build
```

## Produção

`docker build --target prod .` gera uma imagem só com dependências de execução; ao iniciar, ela aplica as
migrations pendentes e sobe a API (`HEALTHCHECK` em `/health`). Exigências de produção:

- `NODE_ENV=production`, `JWT_SECRET` e `DATA_ENCRYPTION_KEY` fortes e guardados em cofre de segredos;
- **guardar a chave de criptografia**: sem ela os valores financeiros não podem ser lidos. Para rotacionar,
  gere uma nova chave com `DATA_ENCRYPTION_KEY_VERSION` maior e mova a antiga para `DATA_ENCRYPTION_PREVIOUS_KEYS`;
- SMTP configurado (`SMTP_*`, `MAIL_FROM`) e `PUBLIC_BASE_URL` com o domínio público (link do e-mail);
- TLS no Nginx/balanceador e `TRUST_PROXY=true`;
- durante um deploy, `MAINTENANCE_MODE=true` (ou `PUT /api/admin/maintenance`) bloqueia operações de escrita (R72).

## Estrutura

Monólito modular em camadas, conforme `docs/standards/` (explicação completa no [GUIA.md](GUIA.md)):

```text
src/
├── server.ts · app.ts · container.ts   entrada, montagem do Fastify, injeção de dependências
├── config/env.ts                       variáveis de ambiente validadas
├── modules/                            um módulo por domínio
│   ├── auth/  finance/  history/  reports/  system/
│   │   ├── routes/         endpoints
│   │   ├── controllers/    request validado → service → response
│   │   ├── schemas/        DTOs de request e response (Zod)
│   │   ├── services/       regras de negócio
│   │   ├── repositories/   acesso ao banco (Drizzle)
│   │   └── types/
├── infrastructure/                     banco, HTTP (auth hook, erros), JWT/senha, criptografia, logs, e-mail, câmbio
└── shared/                             erros e utilitários (dinheiro, datas, paginação)
drizzle/                                migrations oficiais (versionadas)
tests/unit · tests/integration          testes (inclui regras de arquitetura)
```
