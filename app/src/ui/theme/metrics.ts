/** Raios do protótipo: o tema redefine rounded-md=12, rounded-lg=16 e rounded-xl=28. */
export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 28,
  full: 999,
} as const;

/** Espaçamento em múltiplos de 4 (escala do Tailwind). */
export const space = (units: number): number => units * 4;

/** Elevação Material (sombra no Android). */
export const elevation = {
  level1: 1,
  level2: 3,
  level3: 6,
} as const;
