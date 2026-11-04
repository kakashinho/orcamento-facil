import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { errorMessage } from "@/core/http/api-error";
import type { AppNotification } from "@/data/api/types";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationsInfinite,
  useUnreadCount,
} from "@/data/queries/notifications";
import {
  Banner,
  Button,
  EmptyState,
  IconButton,
  SegmentedControl,
  Skeleton,
  Spinner,
  Text,
  useResponsiveLayout,
  useTheme,
} from "@/ui";
import { useFeedback } from "../feedback/feedback-provider";
import { targetOf } from "./notification-target";
import { NotificationRow } from "./notification-row";
import { useOpenNotificationTarget } from "./use-open-notification";

type Filter = "all" | "unread";

/**
 * Notificações (R22, R47, R68, R78, R18, R34): alertas e lembretes do servidor, mais recentes primeiro,
 * com rolagem infinita (20 por página), filtro "Não lidas" e "Marcar todas como lidas". O toque marca
 * como lido e abre a tela da entidade (orçamento, meta, conta, carteira ou transação).
 */
export function NotificationsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const layout = useResponsiveLayout();
  const { showSnackbar } = useFeedback();
  const [filter, setFilter] = useState<Filter>("all");
  const list = useNotificationsInfinite(filter === "unread");
  const unread = useUnreadCount();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const openTarget = useOpenNotificationTarget();

  const items = useMemo(() => list.data?.pages.flatMap((page) => page.data) ?? [], [list.data]);
  const unreadCount = unread.data ?? 0;
  const hasUnread = unreadCount > 0 || items.some((item) => !item.readAt);

  const back = () => (router.canGoBack() ? router.back() : router.navigate("/"));

  const open = (notification: AppNotification) => {
    if (!notification.readAt) markRead.mutate(notification.id);
    void openTarget(targetOf(notification));
  };

  const readAll = () =>
    markAll.mutate(undefined, {
      onSuccess: () => showSnackbar("Todas as notificações foram marcadas como lidas"),
      onError: (error) => showSnackbar(errorMessage(error)),
    });

  const header = (
    <View style={[styles.header, { paddingHorizontal: layout.gutter }]}>
      <View style={styles.titleRow}>
        <IconButton name="arrow_back" accessibilityLabel="Voltar" color="onSurface" onPress={back} />
        <Text variant="headline" accessibilityRole="header" style={styles.flex}>
          Notificações
        </Text>
      </View>
      <SegmentedControl
        accessibilityLabel="Filtrar notificações"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "Todas" },
          { value: "unread", label: unreadCount > 0 ? `Não lidas (${unreadCount})` : "Não lidas" },
        ]}
      />
      {hasUnread ? (
        <Button
          variant="text"
          icon="done_all"
          label="Marcar todas como lidas"
          onPress={readAll}
          loading={markAll.isPending}
          style={styles.readAll}
        />
      ) : null}
      {list.isError ? (
        <Banner icon="cloud_off" tone="error">
          {errorMessage(list.error)}
        </Banner>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <FlatList
        testID="notifications-list"
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={{ paddingHorizontal: layout.gutter }}>
            <NotificationRow notification={item} onPress={open} />
          </View>
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListHeaderComponent={header}
        ListEmptyComponent={
          list.isPending ? (
            <View style={{ paddingHorizontal: layout.gutter, gap: 12 }}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} style={styles.skeleton} />
              ))}
            </View>
          ) : list.isError ? null : filter === "unread" ? (
            <EmptyState icon="done_all" title="Tudo lido" description="Você não tem notificações não lidas." />
          ) : (
            <EmptyState
              icon="notifications"
              title="Nenhum aviso por enquanto"
              description="Alertas de orçamento, saldo e metas e os lembretes aparecem aqui."
            />
          )
        }
        ListFooterComponent={list.isFetchingNextPage ? <Spinner /> : null}
        onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && void list.fetchNextPage()}
        onEndReachedThreshold={0.5}
        contentContainerStyle={[styles.content, { maxWidth: layout.contentMaxWidth }]}
        style={styles.flex}
        refreshControl={
          <RefreshControl
            refreshing={list.isRefetching && !list.isFetchingNextPage}
            onRefresh={() => {
              void list.refetch();
              void unread.refetch();
            }}
            colors={[colors.primary]}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  content: { paddingBottom: 112, alignSelf: "center", width: "100%" },
  header: { gap: 12, paddingTop: 8, paddingBottom: 12 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  readAll: { alignSelf: "flex-end" },
  separator: { height: 4 },
  skeleton: { height: 72, borderRadius: 16 },
});
