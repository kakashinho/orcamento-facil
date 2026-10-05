import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorMessage, isApiError } from "@/core/http/api-error";
import { useChangePassword } from "@/data/queries/account";
import { useCurrentUser } from "@/data/session/session-store";
import { passwordPolicyViolations } from "@/domain/password-policy";
import { Banner, Button, Sheet, TextField } from "@/ui";
import { PasswordStrengthMeter } from "../auth/components/password-strength";
import { useFeedback } from "../feedback/feedback-provider";

/** Troca de senha com a sessão aberta (as outras sessões são encerradas pelo servidor). Remontada a cada abertura. */
export function ChangePasswordSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const user = useCurrentUser();
  const { showSnackbar } = useFeedback();
  const change = useChangePassword();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const submit = () => {
    setFormError(null);
    const found: Record<string, string> = {};
    if (!current) found.currentPassword = "Informe a senha atual.";
    const violations = passwordPolicyViolations(next, { email: user?.email, username: user?.username });
    if (violations.length) found.newPassword = violations[0];
    else if (next !== confirm) found.confirm = "As senhas não coincidem.";
    setErrors(found);
    if (Object.keys(found).length) return;
    change.mutate(
      { currentPassword: current, newPassword: next },
      {
        onSuccess: () => {
          onClose();
          showSnackbar("Senha alterada. As outras sessões foram encerradas.");
        },
        onError: (error) => {
          if (isApiError(error) && error.code === "INVALID_CURRENT_PASSWORD")
            setErrors({ currentPassword: error.message });
          else if (isApiError(error) && Object.keys(error.fieldErrors).length) setErrors(error.fieldErrors);
          else setFormError(errorMessage(error));
        },
      },
    );
  };

  return (
    <Sheet open={open} onClose={onClose} title="Alterar senha">
      <View style={styles.form}>
        {formError ? (
          <Banner icon="error" tone="error">
            {formError}
          </Banner>
        ) : null}
        <TextField
          label="Senha atual"
          icon="lock"
          value={current}
          onChangeText={setCurrent}
          secureTextEntry
          error={errors.currentPassword}
        />
        <TextField
          label="Nova senha"
          icon="lock_reset"
          value={next}
          onChangeText={setNext}
          secureTextEntry
          error={errors.newPassword}
        />
        <PasswordStrengthMeter password={next} />
        <TextField
          label="Confirmar nova senha"
          icon="lock_reset"
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          error={errors.confirm}
        />
        <View style={styles.actions}>
          <Button variant="text" label="Cancelar" onPress={onClose} />
          <Button label="Alterar senha" onPress={submit} loading={change.isPending} disabled={!current || !next} />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  form: { gap: 16, paddingTop: 12 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
});
