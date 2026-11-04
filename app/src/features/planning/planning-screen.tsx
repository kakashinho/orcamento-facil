import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { ContentContainer, SegmentedControl, Text, useTheme } from "@/ui";
import { AccountsSection } from "./accounts/accounts-section";
import { BudgetsSection } from "./budgets/budgets-section";
import { GoalsSection } from "./goals/goals-section";

export type PlanningSection = "budgets" | "goals" | "accounts";

const SECTIONS: { value: PlanningSection; label: string }[] = [
  { value: "budgets", label: "Orçamentos" },
  { value: "goals", label: "Metas" },
  { value: "accounts", label: "Contas" },
];

/** Valor do parâmetro `section` da rota, quando é uma seção conhecida. */
export function parseSection(value: string | string[] | undefined): PlanningSection | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return SECTIONS.some((section) => section.value === raw) ? (raw as PlanningSection) : null;
}

/**
 * Planejamento: Orçamentos (R21, R74, R45, R23, R67) · Metas (R15, R16, R17) ·
 * Contas (R37, R62, R34). Os avisos abrem a seção certa com `/planning?section=goals`.
 */
export function PlanningScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ section?: string; goalId?: string }>();
  const requested = parseSection(params.section);
  // O aviso de meta atingida/perto da data traz o id da meta: o detalhe abre direto.
  const goalId = typeof params.goalId === "string" && params.goalId ? params.goalId : null;
  const [section, setSection] = useState<PlanningSection>(requested ?? "budgets");
  // Cada novo pedido da rota troca a seção (padrão "valor da renderização anterior" do React).
  const [handled, setHandled] = useState<PlanningSection | null>(requested);
  if (requested !== handled) {
    setHandled(requested);
    if (requested) setSection(requested);
  }

  // Limpa os parâmetros já atendidos: o próximo aviso com a mesma seção volta a funcionar.
  useEffect(() => {
    if (requested || goalId) router.setParams({ section: undefined, goalId: undefined });
  }, [requested, goalId, router]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]} testID="planning-screen">
      <ContentContainer style={styles.top}>
        <Text variant="headline" accessibilityRole="header" style={styles.title}>
          Planejamento
        </Text>
        <SegmentedControl
          accessibilityLabel="Seções do planejamento"
          value={section}
          onChange={setSection}
          options={SECTIONS}
        />
      </ContentContainer>
      <View style={styles.body}>
        {section === "budgets" ? <BudgetsSection /> : null}
        {section === "goals" ? <GoalsSection openGoalId={goalId} /> : null}
        {section === "accounts" ? <AccountsSection /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { paddingTop: 12, paddingBottom: 8 },
  title: { marginBottom: 12 },
  body: { flex: 1 },
});
