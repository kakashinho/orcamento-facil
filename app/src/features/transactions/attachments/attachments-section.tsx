import { StyleSheet, View } from "react-native";
import { MAX_ATTACHMENTS } from "@/domain/attachments";
import { Banner, Button, Dialog, radii, Skeleton, Spinner, Text, useTheme } from "@/ui";
import { AttachmentRow } from "./attachment-row";
import { CameraModal } from "./camera-modal";
import type { AttachmentActions } from "./use-attachment-actions";

/**
 * Seção "Anexos" nos detalhes da transação (R24, R25, R76): lista, abrir, excluir, "Anexar arquivo"
 * (documento ou comprovante de pagamento) e "Tirar foto".
 */
export function AttachmentsSection({ actions, disabled }: { actions: AttachmentActions; disabled: boolean }) {
  const { colors } = useTheme();
  const { list, attachments } = actions;
  return (
    <View style={styles.root} testID="details-attachments">
      <View style={styles.header}>
        <Text weight="medium" accessibilityRole="header" style={styles.flex}>
          Anexos
        </Text>
        {attachments.length > 0 ? (
          <Text variant="label" color="onSurfaceVariant">
            {attachments.length}/{MAX_ATTACHMENTS}
          </Text>
        ) : null}
      </View>
      {list.isPending && list.fetchStatus !== "idle" ? (
        <Skeleton style={styles.skeleton} />
      ) : list.isError ? (
        <Text variant="bodySmall" color="onSurfaceVariant">
          Não foi possível carregar os anexos.
        </Text>
      ) : attachments.length === 0 ? (
        <Text variant="bodySmall" color="onSurfaceVariant">
          Nenhum anexo. Guarde aqui o recibo, a nota fiscal ou o comprovante de pagamento.
        </Text>
      ) : (
        <View style={[styles.list, { borderColor: colors.outlineVariant }]}>
          {attachments.map((attachment, index) => (
            <View
              key={attachment.id}
              style={index > 0 ? { borderTopWidth: 1, borderTopColor: colors.outlineVariant } : undefined}
            >
              <AttachmentRow
                attachment={attachment}
                opening={actions.openingId === attachment.id}
                disabled={disabled || actions.deletingPending}
                onOpen={actions.openAttachment}
                onDelete={actions.askDelete}
              />
            </View>
          ))}
        </View>
      )}
      {actions.uploading && !actions.cameraOpen ? (
        <View style={styles.uploading}>
          <Spinner />
          <Text variant="bodySmall" color="onSurfaceVariant">
            Enviando anexo…
          </Text>
        </View>
      ) : null}
      {actions.error ? (
        <Banner icon="error" tone="error" testID="attachments-error">
          {actions.error}
        </Banner>
      ) : null}
      <View style={styles.buttons}>
        <Button
          variant="tonal"
          icon="attach_file"
          label="Anexar arquivo"
          style={styles.flex}
          disabled={disabled || actions.uploading}
          onPress={actions.openKindChoice}
        />
        {actions.cameraAvailable ? (
          <Button
            variant="tonal"
            icon="photo_camera"
            label="Tirar foto"
            style={styles.flex}
            disabled={disabled || actions.uploading}
            onPress={actions.openCamera}
          />
        ) : null}
      </View>
    </View>
  );
}

/** Diálogos e câmera dos anexos, renderizados fora da folha de detalhes. */
export function AttachmentsOverlays({ actions }: { actions: AttachmentActions }) {
  return (
    <>
      <Dialog
        open={actions.kindOpen}
        onClose={actions.closeKindChoice}
        title="Anexar arquivo"
        icon="attach_file"
        testID="attachment-kind"
        actions={<Button variant="text" label="Cancelar" onPress={actions.closeKindChoice} />}
      >
        <View style={styles.choices}>
          <Text color="onSurfaceVariant" align="center">
            PDF ou imagem (JPEG, PNG ou WebP), até 5 MB.
          </Text>
          <Button
            variant="tonal"
            icon="description"
            label="Documento"
            fullWidth
            onPress={() => void actions.attachFile("document")}
          />
          <Button
            variant="tonal"
            icon="receipt"
            label="Comprovante de pagamento"
            fullWidth
            onPress={() => void actions.attachFile("receipt")}
          />
        </View>
      </Dialog>
      <Dialog
        open={!!actions.deleting}
        onClose={actions.cancelDelete}
        title="Excluir anexo?"
        icon="delete"
        testID="confirm-delete-attachment"
        actions={
          <>
            <Button variant="text" label="Cancelar" onPress={actions.cancelDelete} />
            <Button
              variant="danger"
              label="Excluir"
              loading={actions.deletingPending}
              onPress={actions.confirmDelete}
            />
          </>
        }
      >
        {`“${actions.deleting?.fileName ?? ""}” será excluído desta transação. Esta ação não pode ser desfeita.`}
      </Dialog>
      {actions.cameraOpen ? (
        <CameraModal
          onClose={actions.closeCamera}
          onUse={actions.sendPhoto}
          uploading={actions.uploading}
          error={actions.cameraError}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  root: { gap: 8 },
  header: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 32 },
  flex: { flex: 1 },
  skeleton: { height: 56 },
  list: { borderWidth: 1, borderRadius: radii.lg, overflow: "hidden" },
  uploading: { flexDirection: "row", alignItems: "center", gap: 8 },
  buttons: { flexDirection: "row", gap: 8 },
  choices: { gap: 12 },
});
