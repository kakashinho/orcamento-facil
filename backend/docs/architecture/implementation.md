# Arquitetura implementada — API

Monólito modular em Node.js (R79, R84), como pede a arquitetura do projeto: um processo, um PostgreSQL,
módulos por domínio. Este documento descreve **o que existe no código** (Sprints 1 e 2) e por que foi feito
assim.

## Visão geral

```text
App Android (React Native)
        │ HTTPS · JSON (anexos em multipart) · br/gzip (R86)
        ▼
Nginx (proxy, TLS)  ──►  Fastify (Node.js)
                            ├─ hooks globais: request-id, manutenção (R72), cabeçalhos de segurança
                            ├─ DTOs Zod (validação + resposta)  ─►  OpenAPI em /docs (R88)
                            ├─ módulos: auth · finance · history · reports · system
                            │           planning · notifications · attachments
                            ├─ route → controller → service → repository ─► Drizzle ─► PostgreSQL
                            │                            └─► ExchangeRate-API (R29) · SMTP (R04) · FCM HTTP v1 (R18)
                            ├─ eventos de domínio em memória: finance ──finance.changed──► alertas (planning)
                            └─ tarefas agendadas (JobScheduler, com trava no banco): séries, lembretes, push
```

## Camadas

Cada módulo de domínio tem as mesmas pastas:

| Camada | Pasta | Responsabilidade |
|---|---|---|
| Route | `modules/*/routes/` | Declara método, caminho, schema e controller. Sem lógica |
| Controller | `modules/*/controllers/` | Lê o request já validado e o usuário autenticado, chama o service, escolhe o status HTTP |
| DTOs | `modules/*/schemas/` | Schemas Zod de request e de response: validação, tipos TypeScript e documentação |
| Service | `modules/*/services/` | Regras de negócio, transações de banco (`TransactionRunner`), posse dos dados. Sem SQL e sem Fastify |
| Repository | `modules/*/repositories/` | Única camada com Drizzle. Cifra e decifra os valores financeiros (R81) |
| Infraestrutura | `infrastructure/` | Conexão e unidade de transação, hook de autenticação, tratamento de erros, JWT, hash de senha, criptografia, logs, e-mail, cliente de câmbio, eventos de domínio, envio de push |

| Módulo | O que faz |
|---|---|
| `auth` | Cadastro, login (senha e biometria), sessão, recuperação de senha, perfil e preferências |
| `finance` | Carteiras, categorias (e a ocultação nos relatórios), tags, transações, transferências, câmbio, recorrências e parcelamentos |
| `history` | Histórico de ações e desfazer |
| `reports` | Tela inicial, extrato e PDF, fluxo de caixa, gráficos, evolução do saldo, indicadores do mês e projeção (sem tabelas) |
| `planning` | Orçamentos mensais e diários, metas de redução, metas de economia e as regras de alerta |
| `notifications` | Caixa de notificações, preferências de aviso, aparelhos para push, lembrete diário e lembretes de contas |
| `attachments` | Fotos, documentos e comprovantes das transações |
| `system` | Saúde, status, manutenção, logs, limpeza periódica e o agendador das tarefas |

Comunicação entre módulos acontece pelos services públicos, nunca pelos repositories de outro módulo:

- `reports` lê dados por `WalletService`, `TransactionService`, `TransferService`, `CategoryService` (ocultas),
  `SeriesService` (projeção) e `NotificationService` (contagem de não lidas na tela inicial);
- `finance` usa `UserService` (auth) para moeda principal e fuso, e **não conhece** `planning` nem
  `notifications`: avisa as mudanças por eventos de domínio;
- `planning` usa os services do finance (transações, categorias, carteiras, câmbio), o `UserService` e o
  `NotificationService` para gravar os avisos;
- `notifications` usa o `UserService` (fuso), o `TransactionService` (lembrete diário) e o `SeriesService`
  (lembrete que nasce de uma despesa recorrente);
- `attachments` usa o `TransactionService` para conferir a posse da transação;
- o cadastro (auth) cria a carteira padrão por um callback injetado, sem conhecer o finance;
- as reversões do "desfazer" são handlers registrados pelo finance no `UndoService` (history), inclusive os
  das séries;
- limpeza e tarefas agendadas: cada módulo entrega as suas tarefas ao system, que só agenda.

[tests/unit/architecture.test.ts](../../tests/unit/architecture.test.ts) verifica essas regras
automaticamente.

A composição é feita por injeção manual em `container.ts`: repositories → services → controllers. Nos
testes, o container troca o relógio, o e-mail, o provedor de câmbio e o envio de push por versões
controladas.

## Modelo de dados

| Tabela | Conteúdo |
|---|---|
| `users` | E-mail e usuário únicos (sem diferenciar maiúsculas), hash da senha, perfil, moeda principal (R28), fuso, tema do app (R42), contador de falhas e bloqueio (R87) |
| `sessions` | Um registro por refresh token (só o hash SHA-256); `family_id` agrupa as rotações de um login |
| `password_reset_tokens` | Hash do token, expiração, uso único, revogação (R04) |
| `biometric_credentials` | Chave pública do aparelho (R40), tipo (RSA/EC), impressão digital da chave, desafio pendente (só o hash) e revogação |
| `wallets` | Nome, tipo, moeda (R56), carteira padrão, saldo inicial, saldo atual e saldo mínimo para aviso (R78), todos **cifrados** (R53, R55) |
| `categories` | Predefinidas (`user_id` nulo + `system_key`, semeadas na migration — R07) e personalizadas (R08), tipo (receita, despesa ou ambos), exclusão lógica |
| `category_preferences` | Preferência do usuário sobre uma categoria, inclusive as predefinidas: ocultar nos relatórios (R46). PK `(user_id, category_id)` |
| `tags`, `transaction_tags` | Tags do usuário e associação N:N com PK composta (R43) |
| `transactions` | Tipo, valor **cifrado**, data, descrição, observações **cifradas** (R57), categoria, arquivada (R52), série e número da ocorrência, exclusão lógica para o desfazer |
| `transaction_series` | Plano da recorrência (R37) ou do parcelamento (R62): modelo da transação, frequência, valor **cifrado**, início, próxima data, quantas já foram geradas, total de parcelas ou data final, status |
| `transfers` | Origem, destino, valores **cifrados** de saída e entrada, taxa aplicada, chave de idempotência (R54) |
| `action_history` | Ações desfazíveis com snapshot **cifrado** e sequência estrita (R49) |
| `budgets` | Limite mensal (R21) ou diário (R74) por categoria, **cifrado**, com vigência `valid_from`/`valid_to` (R23) |
| `reduction_goals` | Meta de redução por categoria (R67): percentual e base congelada **cifrada**, vigência |
| `savings_goals`, `goal_contributions` | Metas de economia (R15) e as receitas destinadas a elas (R17), com valores **cifrados**; único `(goal_id, transaction_id)` |
| `notifications` | Caixa de avisos: tipo, título e texto **sem valores em dinheiro**, entidade de destino, chave de deduplicação única por usuário, leitura e situação do push |
| `notification_settings` | Preferências de aviso: lembrete diário e hora, lembretes de metas e de contas, alertas por push (R18, R34) |
| `push_devices` | Token FCM de cada aparelho (único), nome, revogação |
| `reminders` | Lembretes de contas fixas (R34): título, valor opcional **cifrado**, frequência, próximo vencimento, série de origem |
| `transaction_attachments` | Anexos (R24, R25, R76): tipo, nome, MIME, tamanho e o arquivo inteiro **cifrado** |
| `system_settings` | Linha única com o modo de manutenção (R72) |
| `app_logs` | Eventos importantes e erros (R85) |

Migrations oficiais em `drizzle/` (versionadas):

- Sprint 1: `0000_initial_schema` (estrutura), `0001_seed_defaults` (categorias predefinidas, configuração e
  extensão `unaccent`) e `0002_audit_theme_category_type_biometric` (tema, tipo de categoria e biometria);
- Sprint 2: `0003_transaction_notes`, `0004_category_preferences`, `0005_budgets`, `0006_reduction_goals`,
  `0007_notifications`, `0008_savings_goals`, `0009_wallet_min_balance`, `0010_transaction_series`,
  `0011_reminders` e `0012_attachments`. Todas só acrescentam tabelas e colunas: nenhum dado existente muda.

Mudanças futuras = novas migrations. O teste de migrations confere a lista de tabelas, as colunas `BYTEA` dos
dados cifrados e a idempotência (o total aplicado é o número de entradas de `drizzle/meta/_journal.json`).

## Decisões de implementação

### Contrato de validação e erros (R84, R88)
- **DTOs estritos.** Corpos e query strings são `z.strictObject`: um campo desconhecido (`categoryID` no lugar de `categoryId`) é erro 400 apontando o campo, em vez de ser ignorado em silêncio.
- **Blocos compartilhados** em `infrastructure/http/common-schemas.ts`, iguais em toda a API:
  - textos com `trim` antes de validar;
  - e-mail e moeda normalizados;
  - datas reais entre 1900 e 2100;
  - valores com até duas casas (`multipleOf(0.01)`);
  - fuso IANA válido;
  - períodos coerentes (`from` ≤ `to`, tamanho máximo), com o erro apontando o campo `to`.
- **Mensagens em português** pensadas para o usuário ("Campo obrigatório.", "Valor inválido. Use: income, expense."), configuradas em `validation-messages.ts`.
- **Erros no mesmo formato**, `{ statusCode, code, message, details? }`, inclusive nestes casos:
  - JSON malformado (`INVALID_JSON`);
  - formato errado (`415`);
  - corpo grande demais (`413`);
  - rota inexistente.

  Regras de negócio causadas por um campo também trazem `details` com o `path`.
- **Corpo vazio com `Content-Type: application/json`** vale como "sem corpo", porque muitos clientes HTTP enviam o cabeçalho em todo POST.
- **O OpenAPI documenta as respostas de erro de cada rota**, deduzidas do que ela declara (`error-responses.ts`), e os DTOs aparecem com `additionalProperties: false`.

### Coerência categoria × transação (R07, R08, R11)
Cada categoria aceita receitas, despesas ou os dois (`type` nulo). O service da transação confere a
compatibilidade ao criar, editar (inclusive quando só o tipo muda) e duplicar: uma despesa com "Salário"
responde `422 CATEGORY_TYPE_MISMATCH` apontando `categoryId`. Restringir o tipo de uma categoria em uso pelo
outro tipo responde `409 CATEGORY_TYPE_IN_USE`. As sugestões (R44) e o comando de voz (R65) só sugerem
categorias do tipo certo. Orçamentos e metas de redução só aceitam categorias que recebem despesas
(`422 CATEGORY_NOT_EXPENSE`).

Ocultar uma categoria (R46) é uma preferência do usuário em `category_preferences`, por isso vale também para as
predefinidas. A categoria continua nas listas e nos formulários; só sai do relatório por categoria e das maiores
despesas da tela inicial, que informam o que ficou de fora em `hidden: { count, convertedTotal }`.

### Login por biometria (R40)
Segue o modelo do `react-native-biometrics`:

1. O aparelho gera um par de chaves no Android Keystore, liberado só pela digital.
2. O app envia a chave pública (`biometric_credentials`).
3. No login, o servidor emite um desafio de uso único, válido por 2 min, e guarda só o hash dele.
4. O aparelho assina o desafio e o servidor confere a assinatura (`infrastructure/auth/device-signature.ts`: RSA PKCS#1 v1.5 ou ECDSA P-256, com SHA-256).

Regras de segurança:

- O desafio é consumido de forma atômica antes da verificação, então não pode ser reaproveitado.
- Assinatura inválida conta para o bloqueio do R87.
- A recuperação de senha revoga todas as biometrias (aparelho perdido).
- O limite é de 5 aparelhos por conta.

### Eventos de domínio (R22, R47, R67, R68, R74, R78)
Os alertas dependem de orçamentos e metas (planning), mas quem registra o gasto é o finance, que não pode
depender do planning. A ligação é um barramento em memória, tipado, em `infrastructure/events/domain-events.ts`:

- o finance publica `finance.changed` (`cause`: transação criada, alterada ou excluída, transferência, saldo
  inicial ou mínimo da carteira, desfazer, ocorrência gerada) **depois** do commit, com as carteiras afetadas e a
  origem (`user` ou `system`); o planning publica `planning.changed` quando orçamentos ou reduções mudam;
- `AlertService` (planning) assina os dois e reavalia o usuário. Quem publica não espera os assinantes nem recebe
  os erros deles: um alerta que falha vira `events.handler_failed` em `app_logs` e nunca derruba o registro de
  uma despesa;
- `idle()` aguarda os handlers pendentes, nos testes e no encerramento do servidor.

As regras do `AlertService`:

| Aviso | Regra |
|---|---|
| `budget_warning` · `budget_exceeded` (R22) | Gasto do mês na categoria chegou a 80% · passou de 100% do limite |
| `daily_limit_exceeded` (R74) | Gasto do dia passou do limite diário |
| `reduction_exceeded` (R67) | Gasto do mês passou do alvo da meta de redução |
| `low_balance` (R78) | Saldo da carteira abaixo do mínimo; no máximo um por carteira por dia |
| `unusual_transaction` (R47) | Despesa registrada pelo usuário maior que o dobro da média e que média + 2 desvios-padrão da categoria nos 90 dias anteriores, com ao menos 5 amostras (parcelas e ocorrências geradas não entram) |
| `goal_achieved` (R68) | Meta de economia chegou a 100%; uma única vez |

Cada aviso tem uma **chave de deduplicação** (ex.: `budget:<id>:2026-11:80`) com índice único no banco:
reavaliar quantas vezes for preciso nunca repete a notificação.

### Tarefas agendadas com trava (R18, R34, R37, R62)
O `JobScheduler` (system) roda a cada `JOBS_INTERVAL_MINUTES` (padrão 15; `0` desliga) e sob demanda em
`POST /api/admin/jobs/run`. Cada módulo entrega as suas tarefas:

| Tarefa | O que faz |
|---|---|
| `finance.series` | Gera as ocorrências de recorrências e parcelas cuja data chegou, no fuso de cada usuário |
| `notifications.daily-reminder` | Lembrete de registrar as despesas do dia (R18), a partir da hora escolhida (padrão 20h), só para quem tem aparelho para push e não registrou nada no dia |
| `notifications.bill-reminders` | Aviso no dia do vencimento de cada conta fixa (R34), às 9h no fuso do usuário; o vencimento avança pela frequência |
| `planning.goal-deadlines` | Aviso de metas de economia a 7 dias e a 1 dia da data limite |
| `notifications.push-retry` | Reenvia os pushes que falharam (até 3 tentativas) |

Diferente da limpeza, essas tarefas escrevem dados do usuário. Por isso cada uma roda sob
`pg_try_advisory_lock` (`job-lock.repository.ts`): com várias instâncias, só uma executa e as outras pulam
(`reason: "locked"`). Nada roda durante a manutenção (`reason: "maintenance"`). Uma tarefa que falha é registrada
em `app_logs` (`system.job_failed`) e as demais seguem. Todas são idempotentes (índice único da ocorrência na
série, chaves de deduplicação dos avisos), então rodar duas vezes no mesmo minuto é inofensivo. A resposta da
rota administrativa traz `{ ranAt, results: [{ job, processed, skipped, failed, reason }] }`.

### Recorrências e parcelamentos gerados na data (R37, R62, R63)
`transaction_series` guarda o **plano**; cada ocorrência vira uma transação normal só no dia dela. Assim nada
entra no saldo antes da data e saldo, extrato, relatórios e desfazer não precisam conhecer "transações previstas".

- Toda ocorrência é criada pelo `TransactionService` (mesmas regras de saldo, cifragem, tags e categoria) e
  guarda `series_id` + `series_occurrence`, com índice único: gerar de novo não duplica.
- A criação já grava as ocorrências vencidas (a 1ª, se a data é hoje ou passou; no máximo 12). Marcar uma
  transação existente como recorrente a transforma na 1ª ocorrência (só dos últimos 12 meses).
- O calendário ancora no dia original: dia 31 cai no último dia dos meses curtos. O parcelamento divide o total em
  centavos e deixa a sobra na 1ª parcela (100 em 3 = 33,34 + 33,33 + 33,33).
- Alterar a série muda só as próximas ocorrências; cancelar encerra as próximas e mantém as registradas. Criar,
  alterar e cancelar entram no desfazer (`series.create`, `series.update`, `series.cancel`); as ocorrências geradas
  pela tarefa agendada não.
- Carteira com série ativa não pode ser excluída (`409 WALLET_HAS_SERIES`).
- A projeção (R63) parte do saldo total atual e soma as próximas ocorrências das recorrências e as parcelas
  restantes de cada mês, convertidas para a moeda principal.

### Orçamentos com vigência (R21, R23, R45, R74)
Um orçamento vale de `valid_from` em diante (meses `AAAA-MM`), e um índice único parcial garante no máximo um em
vigor por categoria e período. Alterar o limite no mês atual atualiza a linha se ela começou neste mês; senão
fecha a atual no mês anterior e abre outra. Assim o histórico (R23) mostra, em cada mês, o limite que valia de
fato, sem uma segunda fonte de verdade. O status compara o limite com o gasto do mês (mensais) e do dia (diários),
convertido para a moeda do limite. A meta de redução (R67) congela, na criação, a média de gasto dos 3 meses
anteriores (`422 NO_BASELINE` sem gasto anterior).

### Progresso das metas calculado na leitura (R15, R16, R17, R68)
O vínculo (`goal_contributions`) guarda quanto de uma receita foi destinado; o acumulado é calculado a cada
leitura: cada vínculo conta `min(valor destinado, valor atual da receita)` se a receita ainda existe e é receita,
convertido para a moeda da meta. Editar ou excluir a receita corrige o progresso sem que o finance precise saber
das metas. A soma dos vínculos de uma receita não passa do valor dela. Ao completar a meta (no vínculo ou depois
de uma mudança no finance), ela passa a `achieved`, a resposta do vínculo traz `achievedNow: true` e chega um
único aviso. Meta atingida continua aceitando vínculos; só a cancelada recusa (`409 GOAL_NOT_ACTIVE`).

### Notificações e push pelo FCM (R18)
- `NotificationService.notify` grava o aviso (se a chave de deduplicação for nova) e dispara o push em segundo
  plano: quem chama não espera o FCM.
- **Sem valores em dinheiro** no título e no texto ("Alimentação chegou a 80% do orçamento do mês"): o push passa
  pelos servidores do Google e a tabela guarda o texto em claro. O app mostra os valores ao abrir a entidade
  (`entityType`, `entityId`).
- Envio pela **API HTTP v1 do Firebase Cloud Messaging**, sem o SDK (`infrastructure/push/push-sender.ts`): a
  conta de serviço assina um JWT RS256 (`fast-jwt`), trocado por um token OAuth 2.0 guardado em cache até 5 min
  antes de vencer. A mensagem leva título, texto, `data: { notificationId, kind, entityType, entityId }` e o canal
  Android `avisos`.
- Token recusado pelo FCM (app desinstalado) revoga o aparelho; falha temporária deixa o push pendente para a
  tarefa de reenvio, até 3 tentativas. Alertas respeitam a preferência `alertsPushEnabled` (a caixa recebe sempre).
- Credencial em `FCM_SERVICE_ACCOUNT_FILE` (JSON da conta de serviço, fora do git) ou em `FCM_PROJECT_ID`,
  `FCM_CLIENT_EMAIL` e `FCM_PRIVATE_KEY`. Sem nenhuma, o `LogPushSender` só registra o envio no log (tipo e id
  da notificação, sem o texto); nos testes, um envio falso.

### Anexos no banco (R24, R25, R76)
- O arquivo fica **no próprio PostgreSQL**, cifrado inteiro (`BYTEA`): um só lugar para o backup e nada a montar
  no Docker. Metadados (tipo, nome normalizado até 120 caracteres, MIME, tamanho) ficam em claro.
- Upload `multipart/form-data` com `@fastify/multipart` registrado **só no plugin das rotas de anexo**: as demais
  rotas continuam aceitando apenas JSON. Um arquivo no campo `file`; o tipo (`photo`, `document`, `receipt`) vai
  na query (`?kind=`).
- O tipo real é conferido pelos primeiros bytes (PDF, JPEG, PNG, WebP), não pelo nome nem pelo `Content-Type`
  declarado (`415 UNSUPPORTED_FILE_TYPE`). Limites: 5 MB por arquivo (`413 FILE_TOO_LARGE`), 10 por transação e
  `ATTACHMENT_QUOTA_MB` por usuário (padrão 100; `409 ATTACHMENT_LIMIT` / `ATTACHMENT_QUOTA`). O Nginx aceita
  corpos de até 6 MB por causa do envelope multipart.
- Download com o `Content-Type` original e `Content-Disposition: attachment`, sem compressão (imagem e PDF já são
  comprimidos).
- Transação excluída esconde os anexos (404) e o desfazer os traz de volta; excluir a carteira os apaga de vez.
  Duplicar não copia anexos; excluir um anexo é definitivo.

### Limpeza periódica (R83, R85)
`HousekeepingService` (módulo system) roda a cada `HOUSEKEEPING_INTERVAL_MINUTES` e sob demanda em
`POST /api/admin/housekeeping`. Ele remove:

- refresh tokens vencidos;
- links de recuperação vencidos;
- biometrias revogadas há mais de 30 dias;
- histórico além de `HISTORY_RETENTION_DAYS` (nunca antes do fim da janela do desfazer);
- logs além de `LOG_RETENTION_DAYS`;
- notificações lidas há mais de 90 dias ou não lidas há mais de 180, e aparelhos de push revogados há mais de 30.

Cada módulo fornece a sua tarefa; o system só agenda, sem acessar tabelas de outros módulos. Sem a limpeza,
a tabela de sessões cresceria com cada renovação de token (uma linha a cada 15 minutos de uso).

### Criptografia dos dados financeiros (R81)
- **AES-256-GCM na aplicação**, por campo:
  - Sprint 1: valores de transações e transferências, saldo e saldo inicial das carteiras, snapshots do histórico;
  - Sprint 2: observações das transações, saldo mínimo, valor das séries, limites dos orçamentos, base das metas
    de redução, alvo das metas de economia, valores destinados, valor dos lembretes e o conteúdo dos anexos.
- Envelope `versão(1) ‖ IV(12) ‖ ciphertext ‖ tag(16)` em colunas `BYTEA`. A versão da chave fica no próprio envelope, o que permite rotação progressiva (`DATA_ENCRYPTION_PREVIOUS_KEYS`).
- O AAD de cada valor identifica tabela, coluna e linha (`transaction.amount:<id>`, `attachment.content:<id>`…), centralizado no objeto `aad` de `field-cipher.ts`. Assim, copiar um ciphertext para outra linha faz a leitura falhar em vez de produzir um valor falso. Há teste cobrindo isso.
- **Descrições ficam em claro**, para que a busca de R10 funcione no banco. É um compromisso consciente: o valor é o dado sensível; a descrição é pesquisável. Pelo mesmo motivo ficam em claro os nomes de metas, lembretes e séries e os nomes de arquivo. Já as observações (R57) são texto livre, podem conter dados sensíveis e não entram na busca: ficam cifradas.
- Títulos e textos das notificações não levam valores, e `app_logs` e o log estruturado não registram valores, observações, nomes de arquivo nem conteúdo de anexo.
- Senhas: scrypt (N=2¹⁵, r=8, p=3; parâmetros gravados no hash). Tokens de refresh e de recuperação: só o SHA-256 é persistido.

### Saldos (R55)
O saldo é **materializado e cifrado** na carteira. Ele é atualizado na mesma transação de banco do movimento, com `SELECT … FOR UPDATE` nas carteiras em ordem de id (sem deadlock). Ler a tela inicial custa uma linha por carteira; nada precisa ser somado. Os testes verificam o saldo depois de criar, editar (inclusive trocando de carteira), excluir, transferir e desfazer, inclusive o desfazer da criação de uma série.

### Dinheiro e câmbio (R28, R29, R56)
- Toda conta é feita em **centavos inteiros**; a API recebe e devolve decimais com até 2 casas.
- Conversões usam aritmética inteira (taxa com 12 casas, arredondamento half-up).
- Cotações vêm da ExchangeRate-API (acesso aberto, sem chave), em uma tabela base USD com cache de 6 h, da qual saem as taxas cruzadas. Se o provedor falhar, a API usa o cache vencido marcado como `stale`. Sem cache, responde 503, e resumos, relatórios, orçamentos e metas trazem os valores convertidos como `null`, sem falhar.

### Consulta de transações (R09, R10, R26, R70, R83)
- Ordem padrão `(date DESC, created_at DESC, id DESC)` com **paginação por keyset** sobre índice parcial. O custo por página é constante.
- Ordenar por categoria usa SQL. **Ordenar por valor** decifra apenas o conjunto já filtrado do usuário e hidrata só a página: é a consequência de cifrar os valores. Com 3.000 transações leva cerca de 125 ms.
- A busca usa `unaccent(description) ILIKE unaccent(:q)`, então "farmacia" encontra "Farmácia".

### Indicadores e evolução do saldo (R14, R35, R36, R75)
Os relatórios novos reconstroem o saldo de fim de cada dia de cada carteira: saldo inicial + movimentos
(transações e transferências) até a data — dia sem movimento repete o anterior —, convertendo para a moeda
principal quando somam carteiras de moedas diferentes. Os indicadores do mês reúnem numa requisição o saldo médio diário (média dos saldos de fim de dia,
até hoje no mês atual), o valor economizado (receitas − despesas) comparado à média dos até 3 meses anteriores com
movimento e as 10 maiores despesas pelo valor na moeda principal.

### Desfazer (R49)
Cada comando de transação, transferência ou série registra, na mesma transação de banco, o estado anterior cifrado. `POST /history/undo` reverte a ação mais recente da janela de 24 h; chamadas seguidas desfazem as anteriores. Exclusões são lógicas (`deleted_at`), então restaurar preserva id, tags, FKs, anexos e vínculos com metas. Se a reversão ficar impossível (ex.: a carteira foi excluída), um savepoint descarta só a reversão, a entrada é encerrada e a API responde 409.

### Autenticação (R03, R87, R04)
- Access JWT HS256 de 15 min e refresh opaco de 30 dias, com rotação a cada uso.
- Reapresentar um refresh já trocado revoga a família inteira (proteção contra roubo).
- Cada requisição confirma que a sessão não foi revogada, então logout e reset têm efeito imediato.
- O 401 diz ao app o que fazer:
  - `TOKEN_EXPIRED`: renovar o token;
  - `SESSION_REVOKED`, `INVALID_TOKEN` ou `UNAUTHORIZED`: voltar ao login.

  As respostas trazem `WWW-Authenticate: Bearer`.
- Depois de 5 falhas seguidas (senha ou biometria), a conta fica bloqueada por 15 min (HTTP 423 com `Retry-After`).
- Há limite de requisições por IP nas rotas de autenticação, inclusive na troca de senha.
- Login de conta inexistente custa o mesmo tempo e devolve a mesma resposta de uma senha errada.
- Reset: link de uso único, válido por 1 h. Um novo pedido invalida os anteriores, e concluir o reset encerra todas as sessões e biometrias. A resposta é igual exista ou não o e-mail.

### Manutenção (R72) e logs (R85)
- O modo de manutenção fica no banco (vale para todas as instâncias, com cache de 5 s) ou é forçado por `MAINTENANCE_MODE`.
- Durante a manutenção, escritas recebem 503 com mensagem e `Retry-After`, e as tarefas agendadas não rodam. Consultas, login e administração continuam funcionando.
- `GET /api/system/status` é público, para o app avisar o usuário.
- Logs: JSON estruturado (pino) com `request-id`, redigindo `Authorization`, senhas e tokens, inclusive o `token` da URL do reset.
- Eventos importantes vão também para `app_logs`: falhas e bloqueios de login, reuso de token, reset de senha, mudanças de manutenção, erros 500, falhas do câmbio, das tarefas agendadas, dos alertas e do push. Consulta em `/api/admin/logs`.
- Saúde: `/health` e `/health/ready`.

### Compressão e dados móveis (R86, R83)
`@fastify/compress` comprime respostas acima de 1 KB (br/gzip/deflate) e **descomprime corpos de requisição** (`Content-Encoding`). Uma página de 30 transações trafega cerca de 1,9 KB comprimida. Respostas da API usam `cache-control: no-store`, porque são dados financeiros. O download de anexos não é comprimido de novo.

## Desempenho medido (R83)

`tests/integration/performance.test.ts`: 3.000 transações (cerca de 3 anos de uso intenso), mediana de 5 execuções, tempo de servidor sem rede. O teste exige menos de 300 ms por consulta.

| Consulta | Mediana | Resposta gzip |
|---|---|---|
| Lista (1ª página, 30 itens) | 14 ms | 1,9 KB |
| Busca por descrição | 10 ms | 1,9 KB |
| Ordenação por valor | 125 ms | 1,9 KB |
| Ordenação por categoria | 12 ms | 1,7 KB |
| Mês + resumo do mês | 5–6 ms | 0,2–1,9 KB |
| Resumo das carteiras (tela inicial) | 2 ms | 0,4 KB |
| Relatório por categoria (6 meses) | 22 ms | 0,4 KB |
| Evolução mensal (12 meses) | 44 ms | 0,4 KB |
| Fluxo de caixa (3 meses) | 19 ms | 9,9 KB |
| Evolução do saldo diária (92 dias) | 118 ms | 0,8 KB |
| Evolução do saldo mensal (36 meses) | 121 ms | 0,4 KB |
| Indicadores do mês | 133 ms | 1,1 KB |
| Status dos orçamentos | 9 ms | 0,5 KB |
| Histórico dos orçamentos (12 meses) | 34 ms | 0,4 KB |

Somando a latência típica de 4G (50–100 ms de ida e volta), as telas ficam bem abaixo de 1 s. Os relatórios novos
são os mais caros porque decifram os movimentos até o fim do período para reconstruir o saldo dia a dia.

### Tela inicial em uma requisição (R55, R83, R86)
`GET /api/reports/overview` reúne o que a tela inicial mostra:

- saldo de cada carteira e total na moeda principal;
- resumo do mês;
- as 5 maiores despesas por categoria (sem as ocultas);
- as 5 últimas transações;
- a quantidade de notificações não lidas (sino).

Em 4G, uma ida ao servidor no lugar de quatro reduz a latência e os cabeçalhos trafegados.

## Fora do backend

R80 (Material Design), R82 (responsividade), R77 (animação), a aplicação visual do tema escuro (R42), os
gráficos (R13, R14, R45, R50), a câmera e o seletor de arquivos (R24, R25), a celebração da meta atingida (R68)
e a captura de áudio de R65 são do aplicativo. A API apoia:

- R42, guardando a preferência de tema (`theme`) no perfil;
- R65, com `POST /api/transactions/parse`, que interpreta o texto reconhecido;
- os gráficos e telas, com relatórios prontos para desenhar e `achievedNow` na resposta do vínculo com a meta;
- o push (R18), registrando o token FCM de cada aparelho em `POST /api/notifications/devices`.
