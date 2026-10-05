import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorMessage, isApiError } from "@/core/http/api-error";
import type { Category, TransactionType } from "@/data/api/types";
import { useCreateCategory } from "@/data/queries/finance";
import { Button, Dialog, SegmentedControl, Text, TextField } from "@/ui";

type Scope = "expense" | "income" | "both";

/** Cria uma categoria personalizada (R08) e já a seleciona no formulário. Remontado (key) a cada abertura. */
export function NewCategoryDialog({
  open,
  onClose,
  defaultType,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  defaultType: TransactionType;
  onCreated: (category: Category) => void;
}) {
  const create = useCreateCategory();
  const [name, setName] = useState("");
  const [scope, setScope] = useState<Scope>(defaultType);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const value = name.trim();
    if (!value) {
      setError("Informe o nome da categoria.");
      return;
    }
    create.mutate(
      { name: value, type: scope === "both" ? null : scope },
      {
        onSuccess: (category) => onCreated(category),
        onError: (e) => setError(isApiError(e) ? (e.fieldErrors.name ?? e.message) : errorMessage(e)),
      },
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Nova categoria"
      icon="new_label"
      actions={
        <>
          <Button variant="text" label="Cancelar" onPress={onClose} />
          <Button label="Criar" onPress={submit} loading={create.isPending} disabled={!name.trim()} />
        </>
      }
    >
      <View style={styles.body}>
        <TextField
          label="Nome da categoria"
          value={name}
          onChangeText={setName}
          placeholder="Ex.: Pets"
          error={error}
          autoFocus
        />
        <Text variant="caption" weight="medium" color="onSurfaceVariant">
          Usar em
        </Text>
        <SegmentedControl
          value={scope}
          onChange={setScope}
          options={[
            { value: "expense", label: "Despesas" },
            { value: "income", label: "Receitas" },
            { value: "both", label: "Ambas" },
          ]}
        />
      </View>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  body: { gap: 12 },
});
