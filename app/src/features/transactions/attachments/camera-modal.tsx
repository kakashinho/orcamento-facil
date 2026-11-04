import type { CameraView } from "expo-camera";
import { useRef, useState, type ReactNode } from "react";
import { Image, Linking, Modal, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { logger } from "@/core/logging/logger";
import type { LocalFile } from "@/data/api";
import type { AttachmentKind } from "@/data/api/types";
import { Banner, Button, IconButton, radii, Spinner, Switch, Text, useTheme } from "@/ui";
import { getCamera, shrinkPhoto } from "./native-files";

type CameraPackage = NonNullable<ReturnType<typeof getCamera>>;

interface Photo {
  uri: string;
  width: number;
  height: number;
}

/**
 * Foto do recibo pela câmera (R24), em tela cheia sobre os detalhes: permissão, captura, prévia e
 * envio da foto reduzida (lado maior 1600 px, JPEG 0,7 — R86). "Comprovante de pagamento" (R76)
 * envia como comprovante em vez de foto. É um Modal da própria funcionalidade (sem rota nova).
 */
export function CameraModal({
  onClose,
  onUse,
  uploading,
  error,
}: {
  onClose: () => void;
  onUse: (file: LocalFile, kind: AttachmentKind) => void;
  uploading: boolean;
  error: string | null;
}) {
  const camera = getCamera();
  return (
    <Modal visible animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <SafeAreaProvider>
        {camera ? (
          <CameraFlow camera={camera} onClose={onClose} onUse={onUse} uploading={uploading} error={error} />
        ) : (
          <Message
            onClose={onClose}
            text="A câmera não está disponível nesta versão do app. Use “Anexar arquivo” para enviar uma foto já tirada."
          />
        )}
      </SafeAreaProvider>
    </Modal>
  );
}

function CameraFlow({
  camera,
  onClose,
  onUse,
  uploading,
  error,
}: {
  camera: CameraPackage;
  onClose: () => void;
  onUse: (file: LocalFile, kind: AttachmentKind) => void;
  uploading: boolean;
  error: string | null;
}) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = camera.useCameraPermissions();
  const ref = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [receipt, setReceipt] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  if (!permission) {
    return (
      <View style={[styles.center, styles.dark]}>
        <Spinner color="#FFFFFF" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <Message
        onClose={onClose}
        text="Para fotografar o recibo, permita o uso da câmera. A foto só é enviada para esta transação."
        action={
          permission.canAskAgain ? (
            <Button icon="photo_camera" label="Permitir câmera" onPress={() => void requestPermission()} />
          ) : (
            <Button icon="settings" label="Abrir configurações" onPress={() => void Linking.openSettings()} />
          )
        }
      />
    );
  }

  const capture = async () => {
    if (!ref.current || capturing) return;
    setLocalError(null);
    setCapturing(true);
    try {
      const picture = await ref.current.takePictureAsync({ quality: 0.8 });
      setPhoto({ uri: picture.uri, width: picture.width, height: picture.height });
    } catch (e) {
      logger.warn("camera.capture_failed", { error: String(e) });
      setLocalError("Não foi possível tirar a foto. Tente novamente.");
    } finally {
      setCapturing(false);
    }
  };

  const use = async () => {
    if (!photo) return;
    setLocalError(null);
    setProcessing(true);
    try {
      const file = await shrinkPhoto(photo);
      onUse(file, receipt ? "receipt" : "photo");
    } catch (e) {
      logger.warn("camera.resize_failed", { error: String(e) });
      setLocalError("Não foi possível preparar a foto. Tente novamente.");
    } finally {
      setProcessing(false);
    }
  };

  const shownError = localError ?? error;

  return (
    <View style={[styles.flex, styles.dark]} testID="camera-modal">
      {photo ? (
        <Image
          source={{ uri: photo.uri }}
          style={styles.flex}
          resizeMode="contain"
          accessibilityLabel="Prévia da foto"
          testID="camera-preview"
        />
      ) : (
        <camera.CameraView
          ref={ref}
          style={styles.flex}
          facing="back"
          onCameraReady={() => setReady(true)}
          onMountError={() => setLocalError("Não foi possível iniciar a câmera.")}
        />
      )}
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <IconButton name="close" color="#FFFFFF" accessibilityLabel="Fechar câmera" onPress={onClose} />
      </View>
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 16 }]}>
        {shownError ? (
          <Banner icon="error" tone="error" style={styles.banner}>
            {shownError}
          </Banner>
        ) : null}
        {photo ? (
          <>
            <View style={styles.receipt}>
              <Text color="#FFFFFF" style={styles.flex}>
                Comprovante de pagamento
              </Text>
              <Switch value={receipt} onValueChange={setReceipt} accessibilityLabel="Comprovante de pagamento" />
            </View>
            <View style={styles.actions}>
              <Button
                variant="outlined"
                icon="refresh"
                label="Tirar outra"
                style={styles.flex}
                disabled={processing || uploading}
                onPress={() => {
                  setPhoto(null);
                  setReady(false);
                }}
              />
              <Button
                icon="upload_file"
                label="Usar foto"
                style={styles.flex}
                loading={processing || uploading}
                onPress={() => void use()}
              />
            </View>
          </>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Capturar foto"
            accessibilityState={{ disabled: !ready || capturing, busy: capturing }}
            disabled={!ready || capturing}
            onPress={() => void capture()}
            style={[styles.shutter, (!ready || capturing) && styles.disabled]}
          >
            <View style={styles.shutterInner} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

function Message({ text, action, onClose }: { text: string; action?: ReactNode; onClose: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[styles.center, { backgroundColor: colors.surface, paddingTop: insets.top, paddingBottom: insets.bottom }]}
      testID="camera-message"
    >
      <Text align="center" color="onSurfaceVariant" style={styles.message}>
        {text}
      </Text>
      {action}
      <Button variant="text" label="Voltar" onPress={onClose} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  dark: { backgroundColor: "#000000" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 24 },
  message: { maxWidth: 320 },
  top: { position: "absolute", top: 0, left: 8, right: 8, flexDirection: "row" },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", gap: 12, paddingHorizontal: 16 },
  banner: { alignSelf: "stretch" },
  receipt: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radii.lg,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  actions: { alignSelf: "stretch", flexDirection: "row", gap: 12 },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: radii.full,
    borderWidth: 4,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  shutterInner: { width: 56, height: 56, borderRadius: radii.full, backgroundColor: "#FFFFFF" },
  disabled: { opacity: 0.4 },
});
