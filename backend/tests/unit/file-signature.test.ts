import { describe, expect, it } from "vitest";
import { detectMime, safeFileName } from "../../src/modules/attachments/services/file-signature.js";

describe("tipo do anexo pela assinatura", () => {
  it.each([
    [Buffer.from("%PDF-1.7 resto"), "application/pdf"],
    [Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00]), "image/jpeg"],
    [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]), "image/png"],
    [Buffer.concat([Buffer.from("RIFF"), Buffer.from([1, 2, 3, 4]), Buffer.from("WEBPVP8 ")]), "image/webp"],
    [Buffer.from("GIF89a"), null],
    [Buffer.from("texto com nome .pdf"), null],
    [Buffer.alloc(0), null],
  ])("%#: detecta %s", (content, expected) => {
    expect(detectMime(content)).toBe(expected);
  });
});

describe("nome de arquivo seguro", () => {
  it("tira caminho e caracteres de controle; vazio vira um nome padrão", () => {
    expect(safeFileName("C:\\fotos\\recibo.jpg", "image/jpeg")).toBe("recibo.jpg");
    expect(safeFileName("../../etc/conta\u0007.pdf", "application/pdf")).toBe("conta.pdf");
    expect(safeFileName("", "image/png")).toBe("anexo.png");
    expect(safeFileName(undefined, "application/pdf")).toBe("anexo.pdf");
  });

  it("limita a 120 caracteres preservando a extensão", () => {
    const name = safeFileName(`${"a".repeat(200)}.pdf`, "application/pdf");
    expect(name).toHaveLength(120);
    expect(name.endsWith(".pdf")).toBe(true);
  });
});
