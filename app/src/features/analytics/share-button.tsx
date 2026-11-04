import { useState, type RefObject } from "react";
import { StyleSheet, View } from "react-native";
import { logger } from "@/core/logging/logger";
import { Button, Dialog, IconButton, Switch, Text } from "@/ui";
import { useFeedback } from "../feedback/feedback-provider";
import { canShareCards, dismissShareWarning, shareCardImage, shareWarningDismissed } from "./share-card";

/** Espera o próximo quadro desenhado (o rodapé da imagem precisa aparecer antes da captura). */
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/**
 * Botão "Compartilhar" do cartão (R30). Na primeira vez, avisa que a imagem mostra valores das
 * finanças, com "Não perguntar de novo" guardado no aparelho. Escondido sem o módulo de
 * captura (Expo Go).
 */
export function ShareButton({
  target,
  title,
  onCapturing,
}: {
  target: RefObject<View | null>;
  title: string;
  /** Liga o rodapé "Orçamento Fácil" só durante a captura. */
  onCapturing: (capturing: boolean) => void;
}) {
  const { showSnackbar } = useFeedback();
  const [warning, setWarning] = useState(false);
  const [dontAsk, setDontAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!canShareCards()) return null;

  const share = async () => {
    setBusy(true);
    try {
      onCapturing(true);
      await nextFrame();
      await nextFrame();
      await shareCardImage(target, title);
    } catch (error) {
      logger.warn("analytics.share_failed", { error: String(error) });
      showSnackbar("Não foi possível compartilhar a imagem.");
    } finally {
      onCapturing(false);
      setBusy(false);
    }
  };

  const press = async () => {
    if (await shareWarningDismissed()) await share();
    else setWarning(true);
  };

  const confirm = async () => {
    setWarning(false);
    if (dontAsk) await dismissShareWarning();
    await share();
  };

  return (
    <>
      <IconButton
        name="share"
        size={36}
        accessibilityLabel={`Compartilhar ${title}`}
        disabled={busy}
        onPress={() => void press()}
      />
      <Dialog
        open={warning}
        onClose={() => setWarning(false)}
        title="Compartilhar imagem?"
        icon="share"
        testID="share-warning"
        actions={
          <>
            <Button variant="text" label="Cancelar" onPress={() => setWarning(false)} />
            <Button label="Compartilhar" onPress={() => void confirm()} />
          </>
        }
      >
        <View style={styles.body}>
          <Text color="onSurfaceVariant" align="center">
            A imagem mostra valores das suas finanças. Compartilhar?
          </Text>
          <View style={styles.row}>
            <Text style={styles.flex}>Não perguntar de novo</Text>
            <Switch value={dontAsk} onValueChange={setDontAsk} accessibilityLabel="Não perguntar de novo" />
          </View>
        </View>
      </Dialog>
    </>
  );
}

const styles = StyleSheet.create({
  body: { gap: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  flex: { flex: 1 },
});
