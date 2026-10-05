import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useMaintenance } from "@/data/system/maintenance-store";
import { ContentContainer, FAB, SegmentedControl, Text, useTheme } from "@/ui";
import { useAppSheets } from "../shell/app-sheets";
import { CashFlowTab } from "./cash-flow-tab";
import { HistoryTab } from "./history-tab";
import { StatementTab } from "./statement-tab";

type Tab = "history" | "cashFlow" | "statement";

/** Transações: Histórico (R09/R10/R26/R52/R70) · Fluxo (R58) · Extrato (R41). */
export function TransactionsScreen() {
  const { colors } = useTheme();
  const { openTransactionForm, openTransactionDetails } = useAppSheets();
  const maintenance = useMaintenance();
  const [tab, setTab] = useState<Tab>("history");

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ContentContainer style={styles.top}>
        <Text variant="headline" accessibilityRole="header" style={styles.title}>
          Transações
        </Text>
        <SegmentedControl
          accessibilityLabel="Visão das transações"
          value={tab}
          onChange={setTab}
          options={[
            { value: "history", label: "Histórico" },
            { value: "cashFlow", label: "Fluxo" },
            { value: "statement", label: "Extrato" },
          ]}
        />
      </ContentContainer>
      <View style={styles.body}>
        {tab === "history" ? <HistoryTab onOpen={openTransactionDetails} /> : null}
        {tab === "cashFlow" ? <CashFlowTab /> : null}
        {tab === "statement" ? <StatementTab /> : null}
      </View>
      <FAB
        icon="add"
        label="Registrar"
        onPress={() => openTransactionForm()}
        disabled={maintenance.active}
        style={styles.fab}
        testID="fab-register"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { paddingTop: 12 },
  title: { marginBottom: 12 },
  body: { flex: 1 },
  fab: { position: "absolute", right: 16, bottom: 16 },
});
