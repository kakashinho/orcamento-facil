import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { env } from "@/core/config/env";
import { parseServerAddress, useServerAddress } from "@/core/config/server-address";
import { Button, Dialog, Text, TextField } from "@/ui";

/**
 * Troca o endereço da API sem gerar outro APK (útil em demonstrações, quando o IP do computador
 * muda). Aceita "192.168.0.250", "192.168.0.250:3000" ou uma URL completa. Remontado (key) a cada abertura.
 */
export function ServerAddressDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const override = useServerAddress((s) => s.override);
  const setAddress = useServerAddress((s) => s.set);
  const resetAddress = useServerAddress((s) => s.reset);
  const [text, setText] = useState(override ?? "");
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const parsed = parseServerAddress(text);
    if ("error" in parsed) {
      setError(parsed.error);
      return;
    }
    setAddress(parsed.url);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Servidor"
      icon="language"
      actions={
        <>
          <Button variant="text" label="Cancelar" onPress={onClose} />
          <Button label="Salvar" onPress={save} disabled={!text.trim()} />
        </>
      }
    >
      <View style={styles.body}>
        <TextField
          label="Endereço da API"
          value={text}
          onChangeText={(value) => {
            setText(value);
            setError(null);
          }}
          placeholder="192.168.0.250"
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
          error={error}
          helper="IP do computador onde a API roda. Sem porta, usa a 80."
          autoFocus
          onSubmitEditing={save}
          testID="server-address-input"
        />
        <Text variant="caption" color="onSurfaceVariant">
          Padrão deste app: {env.apiUrl}
        </Text>
        {override ? (
          <Button
            variant="text"
            label="Usar o padrão"
            onPress={() => {
              resetAddress();
              onClose();
            }}
          />
        ) : null}
      </View>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  body: { gap: 12 },
});
