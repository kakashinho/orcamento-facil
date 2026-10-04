# Arquitetura implementada — API da Sprint 1

Monólito modular em Node.js (R79, R84), como sugere `sources/Arquitetura.txt`: um processo, um PostgreSQL,
módulos por domínio. Este documento descreve **o que existe no código** e por que foi feito assim.

## Visão geral

```text
App Android (React Native)
        │ HTTPS · JSON · br/gzip (R86)
        ▼
Nginx (proxy, TLS)  ──►  Fastify (Node.js)
                            ├─ hooks globais: request-id, manutenção (R72), cabeçalhos de segurança
                            ├─ DTOs Zod (validação + resposta)  ─►  OpenAPI em /docs (R88)
                            ├─ módulos: auth · finance · history · reports · system
                            └─ route → controller → service → repository ─► Drizzle ─► PostgreSQL
                                                         └─► ExchangeRate-API (R29) · SMTP (R04)
```

## Camadas

Segue [docs/standards/03-layers-and-dependencies.md](../standards/03-layers-and-dependencies.md). Cada
módulo de domínio tem as mesmas pastas:

| Camada | Pasta | Responsabilidade |
|---|---|---|
| Route | `modules/*/routes/` | Declara método, caminho, schema e controller. Sem lógica |
| Controller | `modules/*/controllers/` | Lê o request já validado e o usuário autenticado, chama o service, escolhe o status HTTP |
| DTOs | `modules/*/schemas/` | Schemas Zod de request e de response: validação, tipos TypeScript e documentação |
| Service | `modules/*/services/` | Regras de negócio, transações de banco (`TransactionRunner`), posse dos dados. Sem SQL e sem Fastify |
| Repository | `modules/*/repositories/` | Única camada com Drizzle. Cifra e decifra os valores financeiros (R81) |
| Infraestrutura | `infrastructure/` | Conexão e unidade de transação, hook de autenticação, tratamento de erros, JWT, hash de senha, criptografia, logs, e-mail, cliente de câmbio |

Comunicação entre módulos acontece pelos services públicos, nunca pelos repositories de outro módulo:

- `reports` lê dados por `WalletService`, `TransactionService` e `TransferService`;
- `finance` usa `UserService` (auth) para moeda principal e fuso;
- o cadastro (auth) cria a carteira padrão por um callback injetado, sem conhecer o finance;
- as reversões do "desfazer" são handlers registrados pelo finance no `UndoService` (history).

[tests/unit/architecture.test.ts](../../tests/unit/architecture.test.ts) verifica essas regras
automaticamente.

A composição é feita por injeção manual em `container.ts`: repositories → services → controllers. Nos
testes, o container troca o relógio, o e-mail e o provedor de câmbio por versões controladas.

## Modelo de dados

| Tabela | Conteúdo |
|---|---|
| `users` | E-mail e usuário únicos (sem diferenciar maiúsculas), hash da senha, perfil, moeda principal (R28), fuso, contador de falhas e bloqueio (R87) |
| `sessions` | Um registro por refresh token (só o hash SHA-256); `family_id` agrupa as rotações de um login |
| `password_reset_tokens` | Hash do token, expiração, uso único, revogação (R04) |
| `wallets` | Nome, tipo, moeda (R56), carteira padrão, saldo inicial e saldo atual **cifrados** (R53, R55) |
| `categories` | Predefinidas (`user_id` nulo + `system_key`, semeadas na migration — R07) e personalizadas (R08), exclusão lógica |
| `tags`, `transaction_tags` | Tags do usuário e associação N:N com PK composta (R43) |
| `transactions` | Tipo, valor **cifrado**, data, descrição, categoria, arquivada (R52), exclusão lógica para o desfazer |
| `transfers` | Origem, destino, valores **cifrados** de saída e entrada, taxa aplicada, chave de idempotência (R54) |
| `action_history` | Ações desfazíveis com snapshot **cifrado** e sequência estrita (R49) |
| `system_settings` | Linha única com o modo de manutenção (R72) |
| `app_logs` | Eventos importantes e erros (R85) |

Migrations oficiais em `drizzle/` (versionadas): `0000_initial_schema` (estrutura) e `0001_seed_defaults`
(categorias predefinidas, configuração e extensão `unaccent`). Mudanças futuras = novas migrations.

## Decisões de implementação

### Criptografia dos dados financeiros (R81)
- **AES-256-GCM na aplicação**, por campo: valores de transações, transferências, saldos e saldo inicial das carteiras, e snapshots do histórico.
- Envelope `versão(1) ‖ IV(12) ‖ ciphertext ‖ tag(16)` em colunas `BYTEA`. A versão da chave fica no próprio envelope, o que permite rotação progressiva (`DATA_ENCRYPTION_PREVIOUS_KEYS`).
- O AAD de cada valor identifica tabela, coluna e linha (`transaction.amount:<id>`). Assim, copiar um ciphertext para outra linha faz a leitura falhar em vez de produzir um valor falso. Há teste cobrindo isso.
- **Descrições ficam em claro**, para que a busca de R10 funcione no banco. É um compromisso consciente: o valor é o dado sensível; a descrição é pesquisável.
- Senhas: scrypt (N=2¹⁵, r=8, p=3; parâmetros gravados no hash). Tokens de refresh e de recuperação: só o SHA-256 é persistido.

### Saldos (R55)
O saldo é **materializado e cifrado** na carteira. Ele é atualizado na mesma transação de banco do movimento, com `SELECT … FOR UPDATE` nas carteiras em ordem de id (sem deadlock). Ler a tela inicial custa uma linha por carteira; nada precisa ser somado. Os testes verificam o saldo depois de criar, editar (inclusive trocando de carteira), excluir, transferir e desfazer.

### Dinheiro e câmbio (R28, R29, R56)
- Toda conta é feita em **centavos inteiros**; a API recebe e devolve decimais com até 2 casas.
- Conversões usam aritmética inteira (taxa com 12 casas, arredondamento half-up).
- Cotações vêm da ExchangeRate-API (acesso aberto, sem chave), em uma tabela base USD com cache de 6 h, da qual saem as taxas cruzadas. Se o provedor falhar, a API usa o cache vencido marcado como `stale`. Sem cache, responde 503, e resumos e relatórios trazem o total convertido como `null`, sem falhar.

### Consulta de transações (R09, R10, R26, R70, R83)
- Ordem padrão `(date DESC, created_at DESC, id DESC)` com **paginação por keyset** sobre índice parcial. O custo por página é constante.
- Ordenar por categoria usa SQL. **Ordenar por valor** decifra apenas o conjunto já filtrado do usuário e hidrata só a página: é a consequência de cifrar os valores. Com 3.000 transações leva cerca de 130 ms.
- A busca usa `unaccent(description) ILIKE unaccent(:q)`, então "farmacia" encontra "Farmácia".

### Desfazer (R49)
Cada comando de transação ou transferência registra, na mesma transação de banco, o estado anterior cifrado. `POST /history/undo` reverte a ação mais recente da janela de 24 h; chamadas seguidas desfazem as anteriores. Exclusões são lógicas (`deleted_at`), então restaurar preserva id, tags e FKs. Se a reversão ficar impossível (ex.: a carteira foi excluída), um savepoint descarta só a reversão, a entrada é encerrada e a API responde 409.

### Autenticação (R03, R87, R04)
- Access JWT HS256 de 15 min e refresh opaco de 30 dias, com rotação a cada uso.
- Reapresentar um refresh já trocado revoga a família inteira (proteção contra roubo).
- Cada requisição confirma que a sessão não foi revogada, então logout e reset têm efeito imediato.
- Depois de 5 falhas seguidas, a conta fica bloqueada por 15 min (HTTP 423 com `Retry-After`).
- Há limite de requisições por IP nas rotas de autenticação.
- Login de conta inexistente custa o mesmo tempo de um login real.
- Reset: link de uso único, válido por 1 h. Um novo pedido invalida os anteriores, e concluir o reset encerra todas as sessões. A resposta é igual exista ou não o e-mail.

### Manutenção (R72) e logs (R85)
- O modo de manutenção fica no banco (vale para todas as instâncias, com cache de 5 s) ou é forçado por `MAINTENANCE_MODE`.
- Durante a manutenção, escritas recebem 503 com mensagem e `Retry-After`. Consultas, login e administração continuam funcionando.
- `GET /api/system/status` é público, para o app avisar o usuário.
- Logs: JSON estruturado (pino) com `request-id`, redigindo `Authorization`, senhas e tokens, inclusive o `token` da URL do reset.
- Eventos importantes vão também para `app_logs`: falhas e bloqueios de login, reuso de token, reset de senha, mudanças de manutenção, erros 500 e falhas do câmbio. Consulta em `/api/admin/logs`.
- Saúde: `/health` e `/health/ready`.

### Compressão e dados móveis (R86, R83)
`@fastify/compress` comprime respostas acima de 1 KB (br/gzip/deflate) e **descomprime corpos de requisição** (`Content-Encoding`). Uma página de 30 transações trafega cerca de 1,9 KB comprimida. Respostas da API usam `cache-control: no-store`, porque são dados financeiros.

## Desempenho medido (R83)

`tests/integration/performance.test.ts`: 3.000 transações (cerca de 3 anos de uso intenso), mediana de 5 execuções, tempo de servidor sem rede. O teste exige menos de 300 ms por consulta.

| Consulta | Mediana | Resposta gzip |
|---|---|---|
| Lista (1ª página, 30 itens) | 13 ms | 1,9 KB |
| Busca por descrição | 9 ms | 1,8 KB |
| Ordenação por valor | 129 ms | 1,9 KB |
| Ordenação por categoria | 10 ms | 1,6 KB |
| Mês + resumo do mês | 5–6 ms | 0,1–1,9 KB |
| Resumo das carteiras (tela inicial) | 3 ms | 0,3 KB |
| Relatório por categoria (6 meses) | 22 ms | 0,4 KB |
| Evolução mensal (12 meses) | 46 ms | 0,4 KB |
| Fluxo de caixa (3 meses) | 16 ms | 9,9 KB |

Somando a latência típica de 4G (50–100 ms de ida e volta), as telas ficam bem abaixo de 1 s.

## Fora do backend

R42 (modo escuro), R80 (Material Design), R82 (responsividade), R77 (animação), R40 (biometria) e a captura de áudio de R65 são do aplicativo. A API apoia:

- R40, com refresh tokens de longa duração que o app guarda protegidos pela biometria;
- R65, com `POST /api/transactions/parse`, que interpreta o texto reconhecido.
