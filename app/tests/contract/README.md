# Testes de contrato (app × backend)

Rodam a camada de dados do próprio app — `src/data/api` (contrato), `src/core/http` (cliente) e
`src/data/session` (sessão JWT) — contra o backend real. Se uma rota, um campo ou um código de erro mudar
de um lado, estes testes falham.

Cobrem: cadastro e login (e-mail e usuário), bloqueio por tentativas, rotação do refresh token, recuperação
e troca de senha, carteiras e moedas, categorias e sugestão, tags, transações (registro, validação,
paginação por cursor, busca sem acento, ordenação, resumo do mês, edição, duplicação, arquivamento,
exclusão e desfazer), interpretação da frase falada, transferências idempotentes entre moedas, câmbio,
tela inicial, extrato, fluxo de caixa, PDF, gráfico mensal, preferências, login biométrico com chave EC
(mesmo formato do Android Keystore), modo de manutenção e compressão das respostas.

## Como rodar

1. Banco isolado (no PostgreSQL de testes do backend, porta 5433):

   ```bash
   docker compose -f ../backend/docker-compose.test.yml up -d --wait
   docker exec orcamento-postgres-test psql -U postgres -c "CREATE DATABASE orcamento_app"
   cd ../backend && DATABASE_URL=postgresql://postgres:postgres@localhost:5433/orcamento_app npm run db:migrate
   ```

2. API na porta 3100, com um e-mail de administrador para o teste de manutenção:

   ```bash
   cd ../backend
   DATABASE_URL=postgresql://postgres:postgres@localhost:5433/orcamento_app \
   PORT=3100 JWT_SECRET=<48 bytes em base64> DATA_ENCRYPTION_KEY=<32 bytes em base64> \
   ADMIN_EMAILS=admin.contrato@orcamentofacil.app AUTH_RATE_LIMIT_MAX=10000 \
   npx tsx src/server.ts
   ```

3. Testes:

   ```bash
   CONTRACT_API_URL=http://localhost:3100 npm run test:contract
   ```

Cada execução cria usuários novos (sufixo aleatório), então pode ser repetida no mesmo banco.
