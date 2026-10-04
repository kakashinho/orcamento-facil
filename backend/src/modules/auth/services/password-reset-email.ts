import { escapeHtml } from "../../../shared/utils/html.js";

export function passwordResetEmail(input: { username: string; link: string; ttlMinutes: number }) {
  const subject = "Orçamento Fácil — recuperação de senha";
  const text = [
    `Olá, ${input.username}!`,
    "",
    "Recebemos uma solicitação para redefinir a senha da sua conta no Orçamento Fácil.",
    `Para criar uma nova senha, acesse o link abaixo (válido por ${input.ttlMinutes} minutos):`,
    "",
    input.link,
    "",
    "Se você não fez essa solicitação, ignore este e-mail: sua senha continua a mesma.",
  ].join("\n");
  const html = `<!doctype html>
<html lang="pt-BR"><body style="font-family:Arial,sans-serif;color:#1f2933">
<p>Olá, <strong>${escapeHtml(input.username)}</strong>!</p>
<p>Recebemos uma solicitação para redefinir a senha da sua conta no Orçamento Fácil.</p>
<p><a href="${escapeHtml(input.link)}" style="display:inline-block;padding:10px 16px;background:#2e7d32;color:#fff;text-decoration:none;border-radius:4px">Redefinir minha senha</a></p>
<p>O link é válido por ${input.ttlMinutes} minutos.</p>
<p style="color:#52606d">Se você não fez essa solicitação, ignore este e-mail: sua senha continua a mesma.</p>
</body></html>`;
  return { subject, text, html };
}
