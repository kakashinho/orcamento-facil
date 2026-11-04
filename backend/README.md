# Orçamento Fácil — Backend (API RESTful)

API em Node.js que atende o aplicativo Android (React Native) do Orçamento Fácil: autenticação (com senha ou biometria), carteiras em várias moedas, transações com observações, categorias, tags, transferências, desfazer, tela inicial em uma requisição, relatórios com PDF, câmbio, modo de manutenção e logs (Sprint 1); recorrências e parcelamentos, orçamentos mensais e diários, metas de redução e de economia, alertas, notificações com push pelo Firebase Cloud Messaging, lembretes de contas, anexos cifrados e os relatórios de evolução do saldo, indicadores do mês e projeção (Sprint 2). Cobre os requisitos das duas sprints que dependem do servidor.

| Para… | Veja |
|---|---|
| **Aprender: rodar, ver rotas, validação e estrutura** | [GUIA.md](docs/GUIA.md) |
| Usar a API (endpoints, formatos, exemplos) | [docs/api/README.md](docs/api/README.md) e o Swagger em `/docs` |
| Entender a arquitetura e as decisões | [docs/architecture/implementation.md](docs/architecture/implementation.md) |

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
Para enviá-los de verdade (R04), preencha `SMTP_*` e `MAIL_FROM` no `.env` (o `.env.example` explica o
caso do Gmail) e confira com `npm run mail:test -- destino@exemplo.com`; o compose também lê o `.env`.
O link do e-mail usa `PUBLIC_BASE_URL` (`http://localhost` no compose), que só abre no próprio PC. Para
abrir no celular, defina no `.env` `PASSWORD_RESET_URL=http://<IP do PC na rede>/reset-password`.
O primeiro usuário cujo e-mail esteja em `ADMIN_EMAILS` recebe o perfil de administrador
(no compose: `admin@orcamentofacil.local`).

As tarefas agendadas (ocorrências de recorrências e parcelas, lembrete diário, lembretes de contas, aviso de
prazo das metas e reenvio de push) rodam a cada `JOBS_INTERVAL_MINUTES` (padrão 15; `0` desliga). Um
administrador também as roda na hora com `POST /api/admin/jobs/run`, que responde
`{ ranAt, results: [{ job, processed, skipped, failed, reason }] }`.

Sem credencial do Firebase, o push só é registrado no log; a caixa de notificações do app funciona do mesmo
jeito. Para enviar de verdade (R18), aponte `FCM_SERVICE_ACCOUNT_FILE` para o JSON da conta de serviço,
guardado **fora do projeto**, ou preencha `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL` e `FCM_PRIVATE_KEY`. No
compose, prefira as três variáveis (o arquivo precisaria estar montado no container). A chave nunca vai para
o git nem para o log.

> **Banco de desenvolvimento antigo:** se o volume `postgres_data` foi criado com o protótipo
> anterior (tabela `users` com id serial), recrie-o com `docker compose down -v` antes de migrar.

## Dados de demonstração

Para apresentar as funcionalidades sem digitar nada, o script `scripts/seed-demo.ts` cria uma conta com seis
meses de histórico e preenche tudo o que a Sprint 2 entregou: carteiras (uma em dólar e uma com saldo
mínimo), recorrências e parcelamentos, orçamentos e metas de redução em estados diferentes, metas de
economia (andamento, quase concluída, atingida, com prazo próximo e cancelada), lembretes de contas, anexos
e os avisos que as regras geram sozinhas. Tudo entra pela API, então os valores ficam cifrados e os avisos
nascem como no uso real. Com a pilha do Docker no ar:

```bash
docker compose up -d --build
npm run demo:seed -- --reset      # recria a conta demo@orcamentofacil.app (senha Apresenta@2026)
```

Opções: `--api <url>` (padrão `http://localhost`, ou `DEMO_API_URL`), `--db <url>` (padrão o PostgreSQL do
compose, ou `DATABASE_URL`; usada só para apagar a conta no `--reset` e para recuar a vigência dos
orçamentos, que a API não permite), `--out <pasta>` (os 3 CSVs de apoio: transações, planejamento e avisos;
padrão `../apresentacao/csv`), `--only-csv` (só regera os CSVs do que já está no banco) e `--skip-jobs` (não roda as tarefas agendadas). Os valores são
gerados de forma determinística, relativos à data de hoje; rode `--reset` de novo para reposicionar o
"mês corrente" no dia da apresentação. O script também cria a conta de administração
`admin@orcamentofacil.local` para disparar as tarefas agendadas uma vez.

## Scripts

| Script | O que faz |
|---|---|
| `npm run dev` | API com recarga automática (tsx) |
| `npm run routes` | Lista todas as rotas (método, caminho, se exige login, descrição) |
| `npm run mail:test -- <e-mail>` | Envia um e-mail de recuperação de teste pelo SMTP do `.env` (sem banco) |
| `npm run demo:seed` | Cria a conta de demonstração com meses de dados e gera os CSVs (veja "Dados de demonstração") |
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
- durante um deploy, `MAINTENANCE_MODE=true` (ou `PUT /api/admin/maintenance`) bloqueia operações de escrita (R72);
- a limpeza de dados vencidos (sessões, links de recuperação, histórico, logs e notificações antigas) roda
  sozinha a cada `HOUSEKEEPING_INTERVAL_MINUTES`; retenções em `HISTORY_RETENTION_DAYS` e `LOG_RETENTION_DAYS`;
- as tarefas agendadas rodam a cada `JOBS_INTERVAL_MINUTES` com trava no banco (uma instância por vez) e
  param durante a manutenção;
- push: credencial da conta de serviço do Firebase (`FCM_*`) no cofre de segredos;
- anexos: até 5 MB por arquivo (o `nginx.conf` aceita corpos de até 6 MB) e `ATTACHMENT_QUOTA_MB` por usuário
  (padrão 100). Os arquivos ficam cifrados no próprio PostgreSQL, então o backup do banco os inclui.

O `.dockerignore` mantém fora da imagem o `.env`, o `node_modules` local e os artefatos de build.

## Estrutura

Monólito modular em camadas (explicação completa no [GUIA.md](docs/GUIA.md)):

```text
src/
├── server.ts · app.ts · container.ts   entrada, montagem do Fastify, injeção de dependências
├── config/env.ts                       variáveis de ambiente validadas
├── modules/                            um módulo por domínio
│   ├── auth/  finance/  history/  reports/  system/
│   ├── planning/  notifications/  attachments/
│   │   ├── routes/         endpoints
│   │   ├── controllers/    request validado → service → response
│   │   ├── schemas/        DTOs de request e response (Zod)
│   │   ├── services/       regras de negócio
│   │   ├── repositories/   acesso ao banco (Drizzle)
│   │   └── types/
├── infrastructure/                     banco, HTTP (auth hook, erros), JWT/senha, criptografia, logs, e-mail, câmbio,
│                                       eventos de domínio, push (FCM)
└── shared/                             erros e utilitários (dinheiro, datas, paginação)
drizzle/                                migrations oficiais (versionadas)
tests/unit · tests/integration          testes (inclui regras de arquitetura)
```
