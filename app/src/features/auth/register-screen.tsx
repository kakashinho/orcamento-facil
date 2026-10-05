import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorMessage, isApiError } from "@/core/http/api-error";
import type { AuthResult } from "@/data/api/types";
import { session } from "@/data/client";
import { COMMON_CURRENCIES, currencySymbol } from "@/domain/money";
import { emailError, passwordPolicyViolations, usernameError } from "@/domain/password-policy";
import { Banner, Button, Chip, Text, TextField } from "@/ui";
import { AuthLayout, SuccessMark } from "./components/auth-layout";
import { PasswordStrengthMeter } from "./components/password-strength";
import { useRegister } from "./use-auth";

/** Cadastro com e-mail, nome de usuário e senha forte (R02), com a moeda principal (R28). */
export function RegisterScreen() {
  const router = useRouter();
  const register = useRegister();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [currency, setCurrency] = useState<string>("BRL");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<AuthResult | null>(null);

  const submit = () => {
    setFormError(null);
    const next: Record<string, string> = {};
    const userProblem = usernameError(username);
    if (userProblem) next.username = userProblem;
    const emailProblem = emailError(email);
    if (emailProblem) next.email = emailProblem;
    const violations = passwordPolicyViolations(password, { email, username });
    if (violations.length) next.password = violations[0];
    setErrors(next);
    if (Object.keys(next).length) return;

    register.mutate(
      { username: username.trim(), email: email.trim(), password, primaryCurrency: currency },
      {
        onSuccess: setCreated,
        onError: (error) => {
          const fields = isApiError(error) ? error.fieldErrors : {};
          if (Object.keys(fields).length) setErrors(fields);
          else setFormError(errorMessage(error));
        },
      },
    );
  };

  if (created) {
    return (
      <AuthLayout subtitle="Crie sua conta em poucos passos.">
        <View style={styles.success}>
          <SuccessMark />
          <Text variant="titleLarge" align="center">
            Conta criada!
          </Text>
          <Text color="onSurfaceVariant" align="center">
            Bem-vindo(a), {created.user.username}. Sua carteira padrão já está pronta.
          </Text>
        </View>
        <Button label="Começar" fullWidth onPress={() => void session.begin(created)} />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout subtitle="Crie sua conta em poucos passos.">
      {formError ? (
        <Banner icon="error" tone="error">
          {formError}
        </Banner>
      ) : null}
      <TextField
        label="Nome de usuário"
        icon="person"
        value={username}
        onChangeText={setUsername}
        placeholder="ana.silva"
        autoCapitalize="none"
        autoComplete="username-new"
        error={errors.username}
      />
      <TextField
        label="E-mail"
        icon="mail"
        value={email}
        onChangeText={setEmail}
        placeholder="voce@email.com"
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        error={errors.email}
      />
      <TextField
        label="Senha"
        icon="lock"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        placeholder="mínimo 8 caracteres"
        helper="Use maiúscula, minúscula, número e símbolo."
        error={errors.password}
      />
      <PasswordStrengthMeter password={password} />
      <View>
        <Text variant="caption" weight="medium" color="onSurfaceVariant" style={styles.label}>
          Moeda principal dos registros
        </Text>
        <View style={styles.chips}>
          {COMMON_CURRENCIES.map((code) => (
            <Chip
              key={code}
              label={`${currencySymbol(code)} ${code}`}
              selected={currency === code}
              onPress={() => setCurrency(code)}
            />
          ))}
        </View>
      </View>
      <Button
        label="Criar conta"
        fullWidth
        onPress={submit}
        loading={register.isPending}
        disabled={!username || !email || !password}
      />
      <View style={styles.footer}>
        <Text color="onSurfaceVariant">Já tem conta?</Text>
        <Button variant="text" label="Entrar" onPress={() => router.back()} />
      </View>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  success: { alignItems: "center", gap: 8, paddingVertical: 16 },
  label: { paddingHorizontal: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingTop: 8 },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
});
