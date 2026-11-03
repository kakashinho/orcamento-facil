import { describe, expect, it } from "vitest";
import { budgetState } from "../../src/modules/planning/types/budget.types.js";

describe("estado do orçamento (R21, R22)", () => {
  it.each([
    [79_90, 100_00, "ok"],
    [80_00, 100_00, "warning"],
    [100_00, 100_00, "warning"],
    [100_01, 100_00, "exceeded"],
    [0, 100_00, "ok"],
  ])("gasto %i de %i centavos → %s", (spent, limit, state) => {
    expect(budgetState(spent, limit)).toBe(state);
  });
});
