import { useState } from "react";
import { errorMessage, isApiError } from "@/core/http/api-error";
import { logger } from "@/core/logging/logger";
import type { LocalFile } from "@/data/api";
import type { Attachment, AttachmentKind } from "@/data/api/types";
import { useAttachments, useDeleteAttachment, useUploadAttachment } from "@/data/queries/attachments";
import { attachmentErrorMessage, MAX_ATTACHMENTS, validateLocalFile } from "@/domain/attachments";
import { useFeedback } from "../../feedback/feedback-provider";
import { getCamera, pickDocument } from "./native-files";
import { openAttachment } from "./open-attachment";

const UPLOADED: Record<AttachmentKind, string> = {
  photo: "Foto anexada",
  document: "Arquivo anexado",
  receipt: "Comprovante anexado",
};

/** Mensagem do erro de upload: as regras conhecidas ganham texto próprio (413, 415, 409). */
export function uploadErrorMessage(error: unknown): string {
  if (isApiError(error)) return attachmentErrorMessage(error.code) ?? error.message;
  return errorMessage(error, "Não foi possível anexar o arquivo. Tente novamente.");
}

/**
 * Estado e ações dos anexos da transação (R24, R25, R76). A seção fica dentro da folha de detalhes;
 * os diálogos e a câmera, fora dela (o Android não mostra um Modal dentro de outro).
 */
export function useAttachmentActions(transactionId: string, open: boolean) {
  const { showSnackbar } = useFeedback();
  const list = useAttachments(open ? transactionId : null);
  const upload = useUploadAttachment(transactionId);
  const remove = useDeleteAttachment(transactionId);
  const [error, setError] = useState<string | null>(null);
  const [kindOpen, setKindOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Attachment | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const attachments = list.data ?? [];
  const full = attachments.length >= MAX_ATTACHMENTS;
  const cameraAvailable = !!getCamera();

  const send = (file: LocalFile, kind: AttachmentKind, onFail: (message: string) => void, onSent?: () => void) => {
    if (full) {
      onFail(attachmentErrorMessage("ATTACHMENT_LIMIT")!);
      return;
    }
    upload.mutate(
      { file, kind },
      {
        onSuccess: () => {
          logger.info("attachments.uploaded", { kind });
          onSent?.();
          showSnackbar(UPLOADED[kind]);
        },
        onError: (e) => onFail(uploadErrorMessage(e)),
      },
    );
  };

  /** Seletor de arquivo → validação local de tipo e tamanho (sem chamada à API) → upload. */
  const attachFile = async (kind: AttachmentKind) => {
    setKindOpen(false);
    setError(null);
    try {
      const picked = await pickDocument();
      if (!picked) return;
      const invalid = validateLocalFile(picked);
      if (invalid) {
        setError(invalid);
        return;
      }
      send(picked, kind, setError);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Não foi possível abrir o seletor de arquivos.");
    }
  };

  const sendPhoto = (file: LocalFile, kind: AttachmentKind) => {
    setCameraError(null);
    send(file, kind, setCameraError, () => setCameraOpen(false));
  };

  const openFile = async (attachment: Attachment) => {
    setError(null);
    setOpeningId(attachment.id);
    try {
      await openAttachment(transactionId, attachment);
    } catch (e) {
      logger.warn("attachments.open_failed", { error: String(e) });
      setError("Não foi possível abrir o anexo. Tente novamente.");
    } finally {
      setOpeningId(null);
    }
  };

  const confirmDelete = () => {
    if (!deleting) return;
    remove.mutate(deleting.id, {
      onSuccess: () => {
        setDeleting(null);
        showSnackbar("Anexo excluído");
      },
      onError: (e) => {
        setDeleting(null);
        setError(errorMessage(e));
      },
    });
  };

  return {
    list,
    attachments,
    hasReceipt: attachments.some((attachment) => attachment.kind === "receipt"),
    uploading: upload.isPending,
    deletingPending: remove.isPending,
    error,
    openingId,
    cameraAvailable,
    kindOpen,
    cameraOpen,
    cameraError,
    deleting,
    openKindChoice: () => {
      setError(null);
      setKindOpen(true);
    },
    closeKindChoice: () => setKindOpen(false),
    openCamera: () => {
      setError(null);
      setCameraError(null);
      setCameraOpen(true);
    },
    closeCamera: () => setCameraOpen(false),
    attachFile,
    sendPhoto,
    openAttachment: openFile,
    askDelete: setDeleting,
    cancelDelete: () => setDeleting(null),
    confirmDelete,
  };
}

export type AttachmentActions = ReturnType<typeof useAttachmentActions>;
