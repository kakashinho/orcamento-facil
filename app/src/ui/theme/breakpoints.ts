import { useWindowDimensions } from "react-native";

/**
 * Classes de tamanho de janela do Material Design 3 (R82):
 * compact < 600dp (celular), medium 600–839dp (tablet em retrato), expanded ≥ 840dp.
 */
export type WindowSizeClass = "compact" | "medium" | "expanded";

export function windowSizeClass(width: number): WindowSizeClass {
  if (width >= 840) return "expanded";
  if (width >= 600) return "medium";
  return "compact";
}

export interface ResponsiveLayout {
  width: number;
  height: number;
  sizeClass: WindowSizeClass;
  /** Tablet ou celular na horizontal: usa trilho de navegação lateral e grade. */
  isWide: boolean;
  /** Largura máxima do conteúdo para manter linhas legíveis em telas grandes. */
  contentMaxWidth: number;
  /** Colunas para grades de cartões (carteiras). */
  columns: number;
  /** Margem lateral da página. */
  gutter: number;
}

export function layoutFor(width: number, height: number): ResponsiveLayout {
  const sizeClass = windowSizeClass(width);
  const isWide = sizeClass !== "compact";
  return {
    width,
    height,
    sizeClass,
    isWide,
    contentMaxWidth: sizeClass === "expanded" ? 960 : sizeClass === "medium" ? 720 : width,
    columns: sizeClass === "expanded" ? 3 : sizeClass === "medium" ? 2 : 1,
    gutter: isWide ? 24 : 20,
  };
}

export function useResponsiveLayout(): ResponsiveLayout {
  const { width, height } = useWindowDimensions();
  return layoutFor(width, height);
}
