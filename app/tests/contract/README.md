# Testes de contrato (app × backend)

Rodam a camada de dados do próprio app — `src/data/api` (contrato), `src/core/http` (cliente) e
`src/data/session` (sessão JWT) — contra o backend real. Se uma rota, um campo ou um código de erro mudar
de um lado, estes testes falham.

Cobrem (`api-contract.test.ts`): cadastro e login (e-mail e usuário), bloqueio por tentativas, rotação do
refresh token, recuperação e troca de senha, carteiras e moedas, categorias e sugestão, tags, transações
(registro, validação, paginação por cursor, busca sem acento, ordenação, resumo do mês, edição, duplicação,
arquivamento, exclusão e desfazer), interpretação da frase falada, transferências idempotentes entre moedas,
câmbio, tela inicial, extrato, fluxo de caixa, PDF, gráfico mensal, preferências, login biométrico com chave
EC (mesmo formato do Android Keystore), modo de manutenção e compressão das respostas.

E a Sprint 2 (`sprint2-contract.test.ts`): observações e campo `series` das transações, saldo mínimo da
carteira, categorias ocultas e a contagem `hidden` do relatório por categoria, evolução do saldo (dia e mês),
indicadores do mês (mês futuro → 422), projeção, recorrências (criar, marcar uma transação existente,
alterar, cancelar, carteira protegida), parcelamento com a sobra dos centavos na 1ª parcela, orçamentos
mensais e diários (status, alteração, histórico, encerramento), meta de redução sem base (`NO_BASELINE`),
metas de economia (vínculo de receitas, `achievedNow`, consulta por transação, desvinculação, cancelamento),
notificações geradas pelos alertas (lista paginada, não lidas, marcar como lida, preferências, registro do
aparelho para push), lembretes de contas e anexos (envio multipart de PDF e PNG, tipo conferido pelo
conteúdo, limite de 5 MB, download autenticado, exclusão e desfazer da transação).

`support.ts` reúne o que os dois arquivos usam: o empilhamento cliente HTTP ← sessão ← API, o cadastro de
usuários descartáveis, as datas de referência e a conferência dos erros.

## Como rodar

1. Banco isolado (no PostgreSQL de testes do backend, porta 5433):

   ```bash
   docker compose -f ../backend/docker-compose.test.yml up -d --wait
   docker exec orcamento-postgres-test psql -U postgres -c "CREATE DATABASE orcamento_app"
   cd ../backend && DATABASE_URL=postgresql://postgres:postgres@localhost:5433/orcamento_app npm run db:migrate
   ```

2. API na porta 3100, com um e-mail de administrador para o teste de manutenção e sem as tarefas
   agendadas (`SMTP_HOST=` e `FCM_SERVICE_ACCOUNT_FILE=` vazios evitam e-mail e push de verdade se o `.env`
   local os tiver):

   ```bash
   cd ../backend
   DATABASE_URL=postgresql://postgres:postgres@localhost:5433/orcamento_app \
   PORT=3100 JWT_SECRET=<48 bytes em base64> DATA_ENCRYPTION_KEY=<32 bytes em base64> \
   ADMIN_EMAILS=admin.contrato@orcamentofacil.app AUTH_RATE_LIMIT_MAX=10000 JOBS_INTERVAL_MINUTES=0 \
   SMTP_HOST= FCM_SERVICE_ACCOUNT_FILE= \
   npx tsx src/server.ts
   ```

3. Testes:

   ```bash
   CONTRACT_API_URL=http://localhost:3100 npm run test:contract
   ```

Cada execução cria usuários novos (sufixo aleatório), então pode ser repetida no mesmo banco.
