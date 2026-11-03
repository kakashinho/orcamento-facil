import { createHash, randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, createTransaction, registerUser, type TestContext, type TestUser } from "./support/test-app.js";

const PDF = Buffer.concat([Buffer.from("%PDF-1.4\n"), randomBytes(2000), Buffer.from("\n%%EOF")]);
const jpeg = (size = 500) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(size)]);
const sha = (buffer: Buffer) => createHash("sha256").update(buffer).digest("hex");

function multipart(content: Buffer, fileName = "conta.pdf", field = "file", mime = "application/pdf") {
  const boundary = `----teste${randomBytes(6).toString("hex")}`;
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${fileName}"\r\nContent-Type: ${mime}\r\n\r\n`,
  );
  return {
    payload: Buffer.concat([head, content, Buffer.from(`\r\n--${boundary}--\r\n`)]),
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
  };
}

describe("anexos das transações (R24, R25, R76)", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  function upload(user: TestUser, transactionId: string, content: Buffer, query = "", fileName?: string) {
    const body = multipart(content, fileName);
    return user.api.post(`/api/transactions/${transactionId}/attachments${query}`, body.payload, body.headers);
  }

  it("envia, lista e baixa exatamente o mesmo arquivo; no banco fica cifrado", async () => {
    const user = await registerUser(ctx.app);
    const tx = await createTransaction(user, { amount: 120, description: "Conta de luz" });

    const created = await upload(user, tx.id, PDF, "?kind=receipt", "luz-outubro.pdf");
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ kind: "receipt", fileName: "luz-outubro.pdf", mimeType: "application/pdf", sizeBytes: PDF.length });
    const photo = await upload(user, tx.id, jpeg(), "?kind=photo", "recibo.jpg");
    expect(photo.json()).toMatchObject({ kind: "photo", mimeType: "image/jpeg" });

    const list = (await user.api.get(`/api/transactions/${tx.id}/attachments`)).json().data;
    expect(list.map((item: { kind: string }) => item.kind)).toEqual(["photo", "receipt"]);

    const download = await user.api.get(`/api/transactions/${tx.id}/attachments/${created.json().id}/content`);
    expect(download.statusCode).toBe(200);
    expect(download.headers["content-type"]).toBe("application/pdf");
    expect(download.headers["content-disposition"]).toBe("attachment; filename*=UTF-8''luz-outubro.pdf");
    expect(sha(download.rawPayload)).toBe(sha(PDF));

    const { rows } = await ctx.container.pool.query<{ content: Buffer }>("select content from transaction_attachments where id = $1", [
      created.json().id,
    ]);
    expect(rows[0]!.content.includes(Buffer.from("%PDF-1.4"))).toBe(false);

    expect((await user.api.delete(`/api/transactions/${tx.id}/attachments/${photo.json().id}`)).statusCode).toBe(204);
    expect((await user.api.get(`/api/transactions/${tx.id}/attachments`)).json().data).toHaveLength(1);
  });

  it("tipo pela assinatura, tamanho máximo, arquivo vazio, campo errado e corpo que não é multipart", async () => {
    const user = await registerUser(ctx.app);
    const tx = await createTransaction(user, { amount: 1 });

    const fake = await upload(user, tx.id, Buffer.from("isto é só texto, não um PDF"), "", "falso.pdf");
    expect(fake.statusCode).toBe(415);
    expect(fake.json().code).toBe("UNSUPPORTED_FILE_TYPE");

    const big = await upload(user, tx.id, Buffer.concat([Buffer.from("%PDF-"), Buffer.alloc(5 * 1024 * 1024 - 4)]));
    expect(big.statusCode).toBe(413);
    expect(big.json().code).toBe("FILE_TOO_LARGE");

    expect((await upload(user, tx.id, Buffer.alloc(0))).statusCode).toBe(400);
    const wrongField = multipart(PDF, "a.pdf", "arquivo");
    expect((await user.api.post(`/api/transactions/${tx.id}/attachments`, wrongField.payload, wrongField.headers)).statusCode).toBe(400);
    const json = await user.api.post(`/api/transactions/${tx.id}/attachments`, { file: "x" });
    expect(json.statusCode).toBe(415);
  });

  it("até 10 anexos por transação", async () => {
    const user = await registerUser(ctx.app);
    const tx = await createTransaction(user, { amount: 1 });
    for (let index = 0; index < 10; index += 1) expect((await upload(user, tx.id, jpeg(50), "", `f${index}.jpg`)).statusCode).toBe(201);
    const eleventh = await upload(user, tx.id, jpeg(50));
    expect(eleventh.statusCode).toBe(409);
    expect(eleventh.json().code).toBe("ATTACHMENT_LIMIT");
  });

  it("cota de espaço por usuário", async () => {
    const small = await createTestApp({ ATTACHMENT_QUOTA_MB: "1" });
    try {
      const user = await registerUser(small.app);
      const tx = await createTransaction(user, { amount: 1 });
      const send = (content: Buffer) => {
        const body = multipart(content, "foto.jpg");
        return user.api.post(`/api/transactions/${tx.id}/attachments`, body.payload, body.headers);
      };
      expect((await send(jpeg(600 * 1024))).statusCode).toBe(201);
      const over = await send(jpeg(600 * 1024));
      expect(over.statusCode).toBe(409);
      expect(over.json().code).toBe("ATTACHMENT_QUOTA");
    } finally {
      await small.close();
    }
  });

  it("anexos de outro usuário: 404 em todas as rotas", async () => {
    const owner = await registerUser(ctx.app);
    const other = await registerUser(ctx.app);
    const tx = await createTransaction(owner, { amount: 1 });
    const attachment = (await upload(owner, tx.id, PDF)).json();
    expect((await other.api.get(`/api/transactions/${tx.id}/attachments`)).statusCode).toBe(404);
    expect((await upload(other, tx.id, PDF)).statusCode).toBe(404);
    expect((await other.api.get(`/api/transactions/${tx.id}/attachments/${attachment.id}/content`)).statusCode).toBe(404);
    expect((await other.api.delete(`/api/transactions/${tx.id}/attachments/${attachment.id}`)).statusCode).toBe(404);
  });

  it("ciclo de vida: excluir esconde, desfazer traz de volta, duplicar não copia, excluir a carteira apaga", async () => {
    const user = await registerUser(ctx.app);
    const tx = await createTransaction(user, { amount: 10 });
    await upload(user, tx.id, PDF);

    await user.api.delete(`/api/transactions/${tx.id}`);
    expect((await user.api.get(`/api/transactions/${tx.id}/attachments`)).statusCode).toBe(404);
    await user.api.post("/api/history/undo");
    expect((await user.api.get(`/api/transactions/${tx.id}/attachments`)).json().data).toHaveLength(1);

    const copy = (await user.api.post(`/api/transactions/${tx.id}/duplicate`, {})).json();
    expect((await user.api.get(`/api/transactions/${copy.id}/attachments`)).json().data).toEqual([]);

    const temp = (await user.api.post("/api/wallets", { name: "Temporária" })).json();
    const inTemp = await createTransaction(user, { amount: 5, walletId: temp.id });
    await upload(user, inTemp.id, PDF);
    await user.api.delete(`/api/transactions/${inTemp.id}`);
    expect((await user.api.delete(`/api/wallets/${temp.id}`)).statusCode).toBe(204);
    const { rows } = await ctx.container.pool.query<{ total: number }>(
      "select count(*)::int as total from transaction_attachments where transaction_id = $1",
      [inTemp.id],
    );
    expect(rows[0]!.total).toBe(0);
  });

  it("as demais rotas continuam só com JSON: multipart em POST /api/transactions é 415", async () => {
    const user = await registerUser(ctx.app);
    const body = multipart(PDF);
    const response = await user.api.post("/api/transactions", body.payload, body.headers);
    expect(response.statusCode).toBe(415);
  });
});
