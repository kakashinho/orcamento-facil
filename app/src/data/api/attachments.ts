import type { HttpClient } from "@/core/http/http-client";
import type { Attachment, AttachmentKind, DataList } from "./types";

/** Arquivo local escolhido no aparelho (seletor de documentos ou câmera). */
export interface LocalFile {
  uri: string;
  name: string;
  mimeType: string;
}

/** Corpo multipart com o arquivo no campo `file`. */
export function fileForm(file: LocalFile): FormData {
  const form = new FormData();
  // No React Native, o FormData aceita { uri, name, type }: o envio lê o arquivo direto do disco.
  form.append("file", { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
  return form;
}

/** Fotos, documentos e comprovantes das transações (R24, R25, R76), guardados cifrados no servidor. */
export function attachmentsApi(http: HttpClient) {
  const base = (transactionId: string) => `/api/transactions/${transactionId}/attachments`;
  return {
    list: (transactionId: string) => http.get<DataList<Attachment>>(base(transactionId)),
    upload: (transactionId: string, form: FormData, kind: AttachmentKind = "document") =>
      http.upload<Attachment>(base(transactionId), form, { query: { kind } }),
    /** URL do conteúdo; o download é feito pelo sistema de arquivos com o cabeçalho de autorização. */
    contentUrl: (transactionId: string, attachmentId: string) =>
      http.url(`${base(transactionId)}/${attachmentId}/content`),
    remove: (transactionId: string, attachmentId: string) => http.delete(`${base(transactionId)}/${attachmentId}`),
  };
}
