import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { errorMessage, isApiError } from "@/core/http/api-error";
import { useSessionStore } from "@/data/session/session-store";
import { Banner, Button, Icon, radii, Text, TextField, useTheme, withAlpha } from "@/ui";
import { BiometricError } from "./biometric-auth";
import { AuthLayout, OrDivider } from "./components/auth-layout";
import { useBiometricSignIn, useSignIn, useStoredBiometric } from "./use-auth";

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Login (R03) com e-mail ou nome de usuário, bloqueio após tentativas sem sucesso (R87) e
 * entrada pela digital (R40).
 */
export function LoginScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const reason = useSessionStore((s) => s.signedOutReason);
  const clearReason = useSessionStore((s) => s.clearReason);
  const signIn = useSignIn();
  const biometric = useBiometricSignIn();
  const stored = useStoredBiometric();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [lockedFor, setLockedFor] = useState(0);

  useEffect(() => {
    if (lockedFor <= 0) return;
    const timer = setTimeout(() => setLockedFor((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [lockedFor]);

  const submit = () => {
    setFieldErrors({});
    setFormError(null);
    clearReason();
    const value = identifier.trim();
    if (!value) {
      setFieldErrors({ email: "Informe o e-mail ou o nome de usuário." });
      return;
    }
    const body = value.includes("@") ? { email: value, password } : { username: value, password };
    signIn.mutate(body, {
      onError: (error) => {
        if (isApiError(error) && error.code === "ACCOUNT_LOCKED") {
          setLockedFor(error.retryAfterSeconds ?? 15 * 60);
          setPassword("");
          return;
        }
        if (isApiError(error) && error.code === "INVALID_CREDENTIALS") {
          setFieldErrors({ password: error.message });
          setPassword("");
          return;
        }
        const fields = isApiError(error) ? error.fieldErrors : {};
        if (Object.keys(fields).length) setFieldErrors({ ...fields, email: fields.email ?? fields.username });
        else setFormError(errorMessage(error));
      },
    });
  };

  const biometricLogin = () => {
    setFormError(null);
    clearReason();
    biometric.mutate(undefined, {
      onError: (error) => {
        if (error instanceof BiometricError && error.code === "CANCELLED") return;
        if (isApiError(error) && error.code === "ACCOUNT_LOCKED") {
          setLockedFor(error.retryAfterSeconds ?? 15 * 60);
          return;
        }
        setFormError(error instanceof BiometricError ? error.message : errorMessage(error));
        void stored.refetch();
      },
    });
  };

  if (lockedFor > 0) {
    return (
      <AuthLayout subtitle="Acesso temporariamente bloqueado.">
        <View style={styles.center}>
          <View style={[styles.badge, { backgroundColor: colors.errorContainer }]}>
            <Icon name="lock_clock" size={30} color="onErrorContainer" fill />
          </View>
          <Text variant="titleMedium" weight="medium" align="center">
            Conta bloqueada
          </Text>
          <Text color="onSurfaceVariant" align="center" style={styles.lockText}>
            Houve várias tentativas de senha sem sucesso. Por segurança, aguarde para tentar novamente.
          </Text>
          <Text
            mono
            variant="display"
            color="primary"
            accessibilityLabel={`Tempo restante ${formatCountdown(lockedFor)}`}
          >
            {formatCountdown(lockedFor)}
          </Text>
          <Button variant="text" label="Prefiro redefinir a senha" onPress={() => router.push("/forgot-password")} />
        </View>
      </AuthLayout>
    );
  }

  const credential = stored.data;

  return (
    <AuthLayout subtitle="Entre para acompanhar suas finanças.">
      {reason === "expired" ? (
        <Banner icon="schedule" tone="tertiary" testID="session-expired">
          Sua sessão expirou. Entre novamente para continuar.
        </Banner>
      ) : null}
      {reason === "offline" ? (
        <Banner icon="wifi_off" tone="tertiary">
          Sem conexão com o servidor para restaurar sua sessão. Verifique a internet e entre novamente.
        </Banner>
      ) : null}
      {formError ? (
        <Banner icon="error" tone="error">
          {formError}
        </Banner>
      ) : null}

      <TextField
        label="E-mail ou nome de usuário"
        icon="mail"
        value={identifier}
        onChangeText={setIdentifier}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="username"
        returnKeyType="next"
        error={fieldErrors.email}
      />
      <TextField
        label="Senha"
        icon="lock"
        value={password}
        onChangeText={setPassword}
        secureTextEntry={!showPassword}
        autoCapitalize="none"
        autoComplete="current-password"
        textContentType="password"
        placeholder="••••••••"
        returnKeyType="go"
        onSubmitEditing={() => password && submit()}
        error={fieldErrors.password}
        trailing={{
          icon: showPassword ? "visibility_off" : "visibility",
          onPress: () => setShowPassword((v) => !v),
          accessibilityLabel: showPassword ? "Ocultar senha" : "Mostrar senha",
        }}
      />
      <View style={styles.forgotRow}>
        <Button variant="text" label="Esqueci minha senha" onPress={() => router.push("/forgot-password")} />
      </View>
      <Button
        label="Entrar"
        onPress={submit}
        loading={signIn.isPending}
        disabled={!password || !identifier}
        fullWidth
      />

      <OrDivider />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Entrar com biometria"
        onPress={biometricLogin}
        disabled={biometric.isPending}
        android_ripple={{ color: withAlpha(colors.onSurface, 0.08) }}
        style={[styles.biometric, { borderColor: colors.outline }]}
      >
        <Icon name="fingerprint" size={24} color="primary" />
        <View>
          <Text weight="medium">{biometric.isPending ? "Reconhecendo…" : "Entrar com biometria"}</Text>
          {credential ? (
            <Text variant="caption" color="onSurfaceVariant">
              {credential.account}
            </Text>
          ) : null}
        </View>
      </Pressable>

      <View style={styles.signup}>
        <Text color="onSurfaceVariant">Não tem conta?</Text>
        <Button variant="text" label="Cadastre-se" onPress={() => router.push("/register")} />
      </View>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", gap: 8, paddingVertical: 16 },
  badge: {
    width: 64,
    height: 64,
    borderRadius: radii.full,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  lockText: { maxWidth: 280, marginBottom: 8 },
  forgotRow: { alignItems: "flex-end", marginTop: -8 },
  biometric: {
    minHeight: 52,
    borderRadius: radii.full,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    overflow: "hidden",
    paddingHorizontal: 16,
  },
  signup: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 8 },
});
