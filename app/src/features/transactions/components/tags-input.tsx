import { useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { MAX_TAGS, normalizeTag } from "@/domain/catalog";
import { Chip, Icon, radii, Text, useTheme, withAlpha } from "@/ui";

/** Tags da transação (R43): adiciona ao confirmar, remove no "x" e sugere as já usadas. */
export function TagsInput({
  value,
  onChange,
  known,
  error,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  known: string[];
  error?: string | null;
}) {
  const { colors } = useTheme();
  const [draft, setDraft] = useState("");

  const add = (raw: string) => {
    const tag = normalizeTag(raw);
    setDraft("");
    if (!tag || value.length >= MAX_TAGS) return;
    if (value.some((t) => t.toLowerCase() === tag.toLowerCase())) return;
    onChange([...value, tag]);
  };

  const query = normalizeTag(draft).toLowerCase();
  const suggestions = known
    .filter((tag) => !value.some((t) => t.toLowerCase() === tag.toLowerCase()))
    .filter((tag) => (query ? tag.toLowerCase().includes(query) : true))
    .slice(0, 6);

  return (
    <View>
      <Text variant="caption" weight="medium" color="onSurfaceVariant" style={styles.label}>
        Tags ({value.length}/{MAX_TAGS})
      </Text>
      <View style={styles.wrap}>
        {value.map((tag) => (
          <View key={tag} style={[styles.tag, { backgroundColor: colors.surfaceVariant }]}>
            <Text variant="bodySmall" color="onSurfaceVariant">
              #{tag}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remover tag ${tag}`}
              hitSlop={8}
              onPress={() => onChange(value.filter((t) => t !== tag))}
            >
              <Icon name="close" size={15} />
            </Pressable>
          </View>
        ))}
        {value.length < MAX_TAGS ? (
          <TextInput
            accessibilityLabel="Nova tag"
            value={draft}
            onChangeText={(text) => (text.endsWith(",") ? add(text.slice(0, -1)) : setDraft(text))}
            onSubmitEditing={() => add(draft)}
            blurOnSubmit={false}
            returnKeyType="done"
            placeholder="+ tag"
            placeholderTextColor={withAlpha(colors.onSurfaceVariant, 0.6)}
            autoCapitalize="none"
            style={[styles.input, { color: colors.onSurface }]}
          />
        ) : null}
      </View>
      {suggestions.length > 0 && (draft.length > 0 || value.length === 0) ? (
        <View style={styles.wrap}>
          {suggestions.map((tag) => (
            <Chip
              key={tag}
              label={`#${tag}`}
              icon="tag"
              onPress={() => add(tag)}
              accessibilityLabel={`Adicionar tag ${tag}`}
            />
          ))}
        </View>
      ) : null}
      {error ? (
        <Text variant="label" color="error">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { paddingHorizontal: 4 },
  wrap: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, paddingVertical: 8 },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 32,
    paddingHorizontal: 10,
    borderRadius: radii.lg,
  },
  input: { minWidth: 96, height: 36, fontSize: 13, paddingVertical: 0 },
});
