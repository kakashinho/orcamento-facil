import { render, screen } from "@testing-library/react-native";
import { ThemeProvider, palettes } from "..";
import { ChartLegend, GroupedBarChart, LineChartCard, PieChartCard, RingChart, fillGaps, thinLabels } from ".";

function themed(ui: React.ReactElement, scheme: "light" | "dark") {
  return render(<ThemeProvider scheme={scheme}>{ui}</ThemeProvider>);
}

describe.each(["light", "dark"] as const)("gráficos do design system — tema %s", (scheme) => {
  const colors = palettes[scheme];

  it("pizza, anéis e linha renderizam com o resumo em texto para o leitor de tela", async () => {
    await themed(
      <>
        <PieChartCard
          accessibilityLabel="Alimentação 60%, Transporte 40%"
          data={[
            { label: "Alimentação", value: 600, color: colors.primary },
            { label: "Transporte", value: 400, color: colors.tertiary },
          ]}
        />
        <RingChart
          accessibilityLabel="Alimentação 60%"
          data={[{ label: "Alimentação", fraction: 0.6, color: colors.primary }]}
        />
        <LineChartCard
          accessibilityLabel="Saldo de 100 a 300"
          labels={["jan", "fev", "mar"]}
          values={[100, 200, 300]}
        />
      </>,
      scheme,
    );
    expect(screen.getByLabelText("Alimentação 60%, Transporte 40%")).toBeOnTheScreen();
    expect(screen.getByLabelText("Alimentação 60%")).toBeOnTheScreen();
    expect(screen.getByLabelText("Saldo de 100 a 300")).toBeOnTheScreen();
  });

  it("pizza com uma fatia só e linha sem pontos não quebram", async () => {
    await themed(
      <>
        <PieChartCard accessibilityLabel="Só uma" data={[{ label: "A", value: 10, color: colors.primary }]} />
        <PieChartCard accessibilityLabel="Nenhuma" data={[]} />
        <LineChartCard accessibilityLabel="Vazia" labels={[]} values={[]} />
      </>,
      scheme,
    );
    expect(screen.getByLabelText("Só uma")).toBeOnTheScreen();
    expect(screen.getByLabelText("Nenhuma")).toBeOnTheScreen();
    expect(screen.getByLabelText("Vazia")).toBeOnTheScreen();
  });

  it("barras agrupadas: uma barra por item, altura proporcional ao maior valor", async () => {
    await themed(
      <GroupedBarChart
        testID="bars"
        height={100}
        accessibilityLabel="Orçado e gasto"
        groups={[
          {
            label: "Mercado",
            bars: [
              { value: 400, color: colors.primary },
              { value: 200, color: colors.error },
            ],
          },
          {
            label: "Lazer",
            bars: [
              { value: 100, color: colors.primary },
              { value: -5, color: colors.error },
            ],
          },
        ]}
      />,
      scheme,
    );
    expect(screen.getByTestId("bars-bar-0-0")).toHaveStyle({ height: 100 });
    expect(screen.getByTestId("bars-bar-0-1")).toHaveStyle({ height: 50 });
    expect(screen.getByTestId("bars-bar-1-0")).toHaveStyle({ height: 25 });
    expect(screen.getByTestId("bars-bar-1-1")).toHaveStyle({ height: 0 });
    expect(screen.getByText("Mercado")).toBeOnTheScreen();
  });

  it("legenda mostra rótulo e valor", async () => {
    await themed(
      <ChartLegend layout="column" items={[{ label: "Alimentação", color: colors.primary, value: "60%" }]} />,
      scheme,
    );
    expect(screen.getByLabelText("Alimentação: 60%")).toBeOnTheScreen();
    expect(screen.getByText("60%")).toBeOnTheScreen();
  });
});

describe("regras dos gráficos de linha", () => {
  it("lacunas repetem o último valor conhecido e escondem o marcador", () => {
    expect(fillGaps([null, 10, null, 30])).toEqual({ values: [10, 10, 10, 30], hidden: [0, 2] });
    expect(fillGaps([null, null])).toEqual({ values: [0, 0], hidden: [0, 1] });
  });

  it("no máximo N rótulos no eixo X", () => {
    const labels = Array.from({ length: 30 }, (_, i) => String(i + 1));
    expect(thinLabels(labels, 6).filter(Boolean)).toEqual(["1", "6", "11", "16", "21", "26"]);
    expect(thinLabels(["a", "b"], 6)).toEqual(["a", "b"]);
  });
});
