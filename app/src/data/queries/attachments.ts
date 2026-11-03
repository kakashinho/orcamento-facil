import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fileForm, type LocalFile } from "../api/attachments";
import type { AttachmentKind } from "../api/types";
import { api } from "../client";
import { queryKeys } from "./keys";

/** Anexos da transação (R25); só consulta quando os detalhes estão abertos. */
export function useAttachments(transactionId: string | null) {
  return useQuery({
    queryKey: queryKeys.attachments(transactionId ?? ""),
    queryFn: () => api.attachments.list(transactionId!).then((r) => r.data),
    enabled: !!transactionId,
  });
}

export function useUploadAttachment(transactionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file, kind }: { file: LocalFile; kind: AttachmentKind }) =>
      api.attachments.upload(transactionId, fileForm(file), kind),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.attachments(transactionId) }),
  });
}

export function useDeleteAttachment(transactionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (attachmentId: string) => api.attachments.remove(transactionId, attachmentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.attachments(transactionId) }),
  });
}
