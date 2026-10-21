// Envia um e-mail de recuperação de senha de teste usando o SMTP do .env.
// Uso: npm run mail:test -- destino@exemplo.com   (não precisa do banco rodando)
import "dotenv/config";
import { loadConfig } from "../src/config/env.js";
import { SmtpMailer } from "../src/infrastructure/mail/mailer.js";
import { passwordResetEmail } from "../src/modules/auth/services/password-reset-email.js";

const to = process.argv[2];
if (!to) {
  console.error("Informe o destinatário: npm run mail:test -- destino@exemplo.com");
  process.exit(1);
}

const config = loadConfig();
if (!config.mail.smtp) {
  console.error("SMTP_HOST não está definido no .env.");
  process.exit(1);
}

const { host, port, secure, user } = config.mail.smtp;
console.log(`Enviando via ${host}:${port} (secure=${secure}, usuário=${user ?? "sem autenticação"})...`);

const mailer = new SmtpMailer(config.mail.smtp, config.mail.from);
const message = passwordResetEmail({
  username: "Teste",
  link: `${config.auth.passwordResetUrl}?token=teste`,
  ttlMinutes: config.auth.passwordResetTtlMinutes,
});

try {
  await mailer.send({ to, ...message });
  console.log(`E-mail enviado para ${to}. Confira a caixa de entrada (e o spam).`);
} catch (error) {
  console.error("Falha no envio:", error instanceof Error ? error.message : error);
  process.exit(1);
}
