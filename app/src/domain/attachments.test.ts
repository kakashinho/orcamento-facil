import {
  attachmentErrorMessage,
  attachmentIcon,
  ATTACHMENT_KIND_LABEL,
  cacheFileName,
  formatFileSize,
  MAX_ATTACHMENT_BYTES,
  mimeTypeOf,
  photoFileName,
  photoResize,
  validateLocalFile,
} from "./attachments";

describe("anexos (R24, R25, R76)", () => {
  it("aceita PDF, JPEG, PNG e WebP pelo tipo informado ou pela extensão", () => {
    expect(mimeTypeOf("conta.pdf", "application/pdf")).toBe("application/pdf");
    expect(mimeTypeOf("foto.JPG", null)).toBe("image/jpeg");
    expect(mimeTypeOf("foto", "image/jpg")).toBe("image/jpeg");
    expect(mimeTypeOf("print.webp", "application/octet-stream")).toBe("image/webp");
    expect(mimeTypeOf("planilha.xlsx", "application/vnd.ms-excel")).toBeNull();
    expect(mimeTypeOf("video.mp4")).toBeNull();
  });

  it("confere tipo e o limite de 5 MB antes do envio", () => {
    expect(validateLocalFile({ name: "conta.pdf", mimeType: "application/pdf", size: 2048 })).toBeNull();
    expect(
      validateLocalFile({ name: "conta.pdf", mimeType: "application/pdf", size: MAX_ATTACHMENT_BYTES }),
    ).toBeNull();
    expect(validateLocalFile({ name: "conta.pdf", mimeType: "application/pdf", size: 6 * 1024 * 1024 })).toBe(
      "O arquivo passa de 5 MB. Envie um arquivo menor.",
    );
    expect(validateLocalFile({ name: "conta.pdf", mimeType: "application/pdf", size: 0 })).toBe(
      "O arquivo está vazio.",
    );
    expect(validateLocalFile({ name: "conta.pdf", mimeType: "application/pdf", size: null })).toBeNull();
    expect(validateLocalFile({ name: "planilha.xlsx", mimeType: "application/vnd.ms-excel", size: 10 })).toBe(
      "Envie um PDF ou uma imagem (JPEG, PNG ou WebP).",
    );
  });

  it("mostra tamanho legível, rótulo e ícone por tipo", () => {
    expect(formatFileSize(820)).toBe("820 B");
    expect(formatFileSize(2048)).toBe("2 KB");
    expect(formatFileSize(1_258_291)).toBe("1,2 MB");
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5 MB");
    expect(ATTACHMENT_KIND_LABEL).toEqual({ photo: "Foto", document: "Documento", receipt: "Comprovante" });
    expect(attachmentIcon({ kind: "receipt", mimeType: "application/pdf" })).toBe("receipt");
    expect(attachmentIcon({ kind: "document", mimeType: "application/pdf" })).toBe("picture_as_pdf");
    expect(attachmentIcon({ kind: "photo", mimeType: "image/jpeg" })).toBe("photo_camera");
    expect(attachmentIcon({ kind: "document", mimeType: "image/png" })).toBe("image");
  });

  it("reduz a foto para o lado maior de 1600 px", () => {
    expect(photoResize(3000, 4000)).toEqual({ height: 1600 });
    expect(photoResize(4000, 3000)).toEqual({ width: 1600 });
    expect(photoResize(1200, 1600)).toBeNull();
    expect(photoFileName(new Date(2026, 10, 4, 15, 30, 12))).toBe("foto_2026-11-04_153012.jpg");
  });

  it("nome seguro no cache e mensagens dos erros do servidor", () => {
    expect(cacheFileName({ id: "abcdef12-3456", fileName: "nota fiscal (1).pdf" })).toBe("abcdef12_nota_fiscal_1_.pdf");
    expect(attachmentErrorMessage("FILE_TOO_LARGE")).toBe("O arquivo passa de 5 MB. Envie um arquivo menor.");
    expect(attachmentErrorMessage("UNSUPPORTED_FILE_TYPE")).toMatch(/Formato não aceito/);
    expect(attachmentErrorMessage("ATTACHMENT_LIMIT")).toMatch(/10 anexos/);
    expect(attachmentErrorMessage("ATTACHMENT_QUOTA")).toMatch(/espaço para anexos acabou/);
    expect(attachmentErrorMessage("NOT_FOUND")).toBeNull();
  });
});
