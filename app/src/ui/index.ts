/**
 * Design system do Orçamento Fácil (Material Design 3 — R80): componentes React Native
 * reutilizáveis, tokens de tema e gráficos (R84).
 */
export * from "./theme";
export { Icon, type IconName, type IconProps } from "./icons/icon";
export { Badge, badgeLabel, type BadgeProps } from "./components/badge";
export { Button, type ButtonProps, type ButtonVariant } from "./components/button";
export * from "./charts";
export { Card } from "./components/card";
export { Chip, type ChipProps } from "./components/chip";
export { DateField, type DateFieldProps } from "./components/date-field";
export { Dialog, type DialogProps } from "./components/dialog";
export { FAB } from "./components/fab";
export { Banner, Divider, EmptyState, ProgressBar, Skeleton, Spinner, type BannerTone } from "./components/feedback";
export { IconButton, type IconButtonProps } from "./components/icon-button";
export { ContentContainer, Grid, SectionHeader } from "./components/layout";
export { SegmentedControl, type SegmentOption } from "./components/segmented-control";
export { Sheet, emphasizedEasing, useInsideSheet, usePresence, type SheetProps } from "./components/sheet";
export { Snackbar, type SnackbarProps } from "./components/snackbar";
export { Switch } from "./components/switch";
export { Text, type TextProps } from "./components/text";
export { TextField, type TextFieldProps } from "./components/text-field";
