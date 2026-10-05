import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorMessage, isApiError } from "@/core/http/api-error";
import { api } from "@/data/client";
import { emailError, passwordPolicyViolations } from "@/domain/password-policy";
import { Banner, Button, Icon, radii, Text, TextField, useTheme } from "@/ui";
import { disableBiometric } from "./biometric-auth";
import { AuthLayout, SuccessMark } from "./components/auth-layout";
import { PasswordStrengthMeter } from "./components/password-strength";
import { useForgotPassword, useResetPassword } from "./use-auth";

/** Recuperação de senha por link enviado ao e-mail (R04). */
export function ForgotPasswordScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const forgot = useForgotPassword();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const submit = () => {
    const problem = emailError(email);
    setError(problem);
    if (problem) return;
    forgot.mutate(email.trim(), {
      onSuccess: () => setSentTo(email.trim()),
      onError: (e) => setError(isApiError(e) ? (e.fieldErrors.email ?? e.message) : errorMessage(e)),
    });
  };

  return (
    <AuthLayout subtitle="Vamos recuperar seu acesso.">
      {sentTo ? (
        <View style={styles.center}>
          <View style={[styles.badge, { backgroundColor: colors.primaryContainer }]}>
            <Icon name="mark_email_read" size={30} color="onPrimaryContainer" />
          </View>
          <Text variant="titleMedium" weight="medium" align="center">
            Verifique seu e-mail
          </Text>
          <Text color="onSurfaceVariant" align="center">
            Se houver uma conta com {sentTo}, enviamos um link para redefinir a senha. O link vale por 1 hora.
          </Text>
          <Button
            variant="tonal"
            label="Tenho o código do link"
            icon="password"
            onPress={() => router.push("/reset-password")}
            style={styles.gap}
          />
        </View>
      ) : (
        <>
          <Text color="onSurfaceVariant">Informe seu e-mail e enviaremos um link para redefinir a senha.</Text>
          <TextField
            label="E-mail"
            icon="mail"
            value={email}
            onChangeText={setEmail}
            placeholder="voce@email.com"
            autoCapitalize="none"
            keyboardType="email-address"
            error={error}
            onSubmitEditing={submit}
          />
          <Button
            label="Enviar link de recuperação"
            fullWidth
            onPress={submit}
            loading={forgot.isPending}
            disabled={!email}
          />
        </>
      )}
      <Button variant="text" icon="arrow_back" label="Voltar ao login" onPress={() => router.replace("/login")} />
    </AuthLayout>
  );
}

/**
 * Nova senha com o token do link (R04). Abre pelo link `orcamentofacil://reset-password?token=…`
 * (configurável no backend em PASSWORD_RESET_URL) ou colando o código recebido.
 */
export function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();
  const reset = useResetPassword();
  const [token, setToken] = useState(params.token ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = () => {
    setFormError(null);
    const next: Record<string, string> = {};
    if (!token.trim()) next.token = "Informe o código do link recebido por e-mail.";
    const violations = passwordPolicyViolations(password);
    if (violations.length) next.password = violations[0];
    else if (password !== confirm) next.confirm = "As senhas não coincidem.";
    setErrors(next);
    if (Object.keys(next).length) return;
    reset.mutate(
      { token: token.trim(), password },
      {
        onSuccess: () => {
          setDone(true);
          // O servidor encerra sessões e biometrias ao redefinir a senha.
          void disableBiometric({ api }, false);
        },
        onError: (error) => {
          if (isApiError(error) && error.code === "INVALID_RESET_TOKEN") setErrors({ token: error.message });
          else if (isApiError(error) && Object.keys(error.fieldErrors).length) setErrors(error.fieldErrors);
          else setFormError(errorMessage(error));
        },
      },
    );
  };

  if (done) {
    return (
      <AuthLayout subtitle="Senha redefinida.">
        <View style={styles.center}>
          <SuccessMark />
          <Text variant="titleLarge" align="center">
            Tudo certo!
          </Text>
          <Text color="onSurfaceVariant" align="center">
            Sua senha foi alterada. Por segurança, as outras sessões foram encerradas.
          </Text>
        </View>
        <Button label="Ir para o login" fullWidth onPress={() => router.replace("/login")} />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout subtitle="Crie uma nova senha.">
      {formError ? (
        <Banner icon="error" tone="error">
          {formError}
        </Banner>
      ) : null}
      <TextField
        label="Código do link"
        icon="password"
        value={token}
        onChangeText={setToken}
        autoCapitalize="none"
        autoCorrect={false}
        error={errors.token}
      />
      <TextField
        label="Nova senha"
        icon="lock"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        error={errors.password}
      />
      <PasswordStrengthMeter password={password} />
      <TextField
        label="Confirmar nova senha"
        icon="lock"
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry
        autoCapitalize="none"
        error={errors.confirm}
      />
      <Button label="Redefinir senha" fullWidth onPress={submit} loading={reset.isPending} disabled={!password} />
      <Button variant="text" icon="arrow_back" label="Voltar ao login" onPress={() => router.replace("/login")} />
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", gap: 8, paddingVertical: 8 },
  badge: {
    width: 64,
    height: 64,
    borderRadius: radii.full,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  gap: { marginTop: 16 },
});
