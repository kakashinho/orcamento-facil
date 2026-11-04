import { Pressable, StyleSheet, View } from "react-native";
import type { Attachment } from "@/data/api/types";
import { ATTACHMENT_KIND_LABEL, attachmentIcon, formatFileSize } from "@/domain/attachments";
import { Icon, IconButton, radii, Spinner, Text, useTheme, withAlpha } from "@/ui";

/** Linha do anexo: ícone, nome, selo do tipo (Foto/Documento/Comprovante) e tamanho; toque abre. */
export function AttachmentRow({
  attachment,
  opening,
  disabled,
  onOpen,
  onDelete,
}: {
  attachment: Attachment;
  opening: boolean;
  disabled: boolean;
  onOpen: (attachment: Attachment) => void;
  onDelete: (attachment: Attachment) => void;
}) {
  const { colors } = useTheme();
  const kind = ATTACHMENT_KIND_LABEL[attachment.kind];
  const receipt = attachment.kind === "receipt";
  return (
    <View style={styles.row} testID="attachment-row">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Abrir ${attachment.fileName}, ${kind.toLowerCase()}, ${formatFileSize(attachment.sizeBytes)}`}
        accessibilityState={{ busy: opening }}
        disabled={opening}
        onPress={() => onOpen(attachment)}
        android_ripple={{ color: withAlpha(colors.onSurface, 0.08) }}
        style={styles.main}
      >
        <View style={[styles.icon, { backgroundColor: colors.surfaceVariant }]}>
          {opening ? <Spinner /> : <Icon name={attachmentIcon(attachment)} size={20} />}
        </View>
        <View style={styles.body}>
          <Text numberOfLines={1}>{attachment.fileName}</Text>
          <View style={styles.meta}>
            <View
              style={[
                styles.badge,
                { backgroundColor: receipt ? colors.primaryContainer : withAlpha(colors.surfaceVariant, 0.9) },
              ]}
            >
              <Text variant="label" color={receipt ? "onPrimaryContainer" : "onSurfaceVariant"}>
                {kind}
              </Text>
            </View>
            <Text variant="label" color="onSurfaceVariant">
              {formatFileSize(attachment.sizeBytes)}
            </Text>
          </View>
        </View>
      </Pressable>
      <IconButton
        name="delete"
        size={36}
        accessibilityLabel={`Excluir anexo ${attachment.fileName}`}
        disabled={disabled}
        onPress={() => onDelete(attachment)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingRight: 8 },
  main: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12, paddingLeft: 12, paddingVertical: 8 },
  icon: { width: 40, height: 40, borderRadius: radii.full, alignItems: "center", justifyContent: "center" },
  body: { flex: 1, minWidth: 0, gap: 2 },
  meta: { flexDirection: "row", alignItems: "center", gap: 8 },
  badge: { borderRadius: radii.sm, paddingHorizontal: 6, paddingVertical: 1 },
});
