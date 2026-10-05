import { fireEvent, render, screen } from "@testing-library/react-native";
import { useState } from "react";
import {
  Button,
  Chip,
  Dialog,
  SegmentedControl,
  Switch,
  TextField,
  ThemeProvider,
  layoutFor,
  palettes,
  windowSizeClass,
  withAlpha,
} from ".";

function themed(ui: React.ReactElement, scheme: "light" | "dark" = "light") {
  return render(<ThemeProvider scheme={scheme}>{ui}</ThemeProvider>);
}

describe("design system (R80)", () => {
  it("Button dispara a ação e respeita o estado desabilitado", async () => {
    const onPress = jest.fn();
    await themed(
      <>
        <Button label="Salvar" onPress={onPress} />
        <Button label="Excluir" onPress={onPress} disabled />
      </>,
    );
    await fireEvent.press(screen.getByRole("button", { name: "Salvar" }));
    await fireEvent.press(screen.getByRole("button", { name: "Excluir" }));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Excluir" })).toBeDisabled();
  });

  it("Button em carregamento fica ocupado", async () => {
    await themed(<Button label="Entrar" loading />);
    const button = screen.getByRole("button", { name: "Entrar" });
    expect(button).toBeBusy();
    expect(button).toBeDisabled();
  });

  it("Chip informa seleção para leitores de tela", async () => {
    await themed(<Chip label="Alimentação" selected />);
    expect(screen.getByRole("button", { name: "Alimentação" })).toBeSelected();
  });

  it("Switch alterna o valor", async () => {
    function Harness() {
      const [on, setOn] = useState(false);
      return <Switch value={on} onValueChange={setOn} accessibilityLabel="Tema escuro" />;
    }
    await themed(<Harness />);
    const toggle = screen.getByRole("switch", { name: "Tema escuro" });
    expect(toggle).not.toBeChecked();
    await fireEvent.press(toggle);
    expect(toggle).toBeChecked();
  });

  it("TextField mostra o erro abaixo do campo", async () => {
    const onChangeText = jest.fn();
    await themed(<TextField label="E-mail" value="" onChangeText={onChangeText} error="Informe um e-mail válido." />);
    await fireEvent.changeText(screen.getByLabelText("E-mail"), "ana@ex.com");
    expect(onChangeText).toHaveBeenCalledWith("ana@ex.com");
    expect(screen.getByText("Informe um e-mail válido.")).toBeOnTheScreen();
  });

  it("SegmentedControl seleciona uma opção", async () => {
    const onChange = jest.fn();
    await themed(
      <SegmentedControl
        value="expense"
        onChange={onChange}
        options={[
          { value: "expense", label: "Despesa" },
          { value: "income", label: "Receita" },
        ]}
      />,
    );
    expect(screen.getByRole("tab", { name: "Despesa" })).toBeSelected();
    await fireEvent.press(screen.getByRole("tab", { name: "Receita" }));
    expect(onChange).toHaveBeenCalledWith("income");
  });

  it("Dialog mostra título, corpo e ações", async () => {
    await themed(
      <Dialog open onClose={jest.fn()} title="Excluir transação?" actions={<Button label="Excluir" />}>
        Esta ação pode ser desfeita.
      </Dialog>,
    );
    expect(screen.getByText("Excluir transação?")).toBeOnTheScreen();
    expect(screen.getByText("Esta ação pode ser desfeita.")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Excluir" })).toBeOnTheScreen();
  });
});

describe("tema e responsividade (R42, R82)", () => {
  it("tem paletas clara e escura com os tokens do protótipo", () => {
    expect(palettes.light.primary).toBe("#1560d4");
    expect(palettes.dark.primary).toBe("#a9c7ff");
    expect(palettes.dark.background).toBe("#101318");
    expect(withAlpha("#1560d4", 0.4)).toBe("#1560d466");
  });

  it("classifica a janela como no Material 3", () => {
    expect(windowSizeClass(360)).toBe("compact");
    expect(windowSizeClass(700)).toBe("medium");
    expect(windowSizeClass(1024)).toBe("expanded");
  });

  it("usa grade e trilho lateral em tablets", () => {
    expect(layoutFor(390, 844)).toMatchObject({ isWide: false, columns: 1, contentMaxWidth: 390 });
    expect(layoutFor(800, 1280)).toMatchObject({ isWide: true, columns: 2, contentMaxWidth: 720 });
    expect(layoutFor(1280, 800)).toMatchObject({ isWide: true, columns: 3, contentMaxWidth: 960 });
  });
});

describe("presença de folhas e diálogos", () => {
  it("um aviso atrasado de fim da saída não fecha um diálogo reaberto", async () => {
    const { Animated } = jest.requireActual<typeof import("react-native")>("react-native");
    const callbacks: ((result: { finished: boolean }) => void)[] = [];
    const spy = jest.spyOn(Animated, "timing").mockImplementation(
      () =>
        ({
          start: (cb?: (result: { finished: boolean }) => void) => cb && callbacks.push(cb),
          stop: jest.fn(),
          reset: jest.fn(),
        }) as never,
    );
    const view = (open: boolean) => (
      <ThemeProvider scheme="light">
        <Dialog open={open} onClose={jest.fn()} title="Sair da conta?" actions={<Button label="Sair" />} />
      </ThemeProvider>
    );
    const { rerender } = await render(view(true));
    await rerender(view(false)); // inicia a saída
    await rerender(view(true)); // reabre antes de a saída avisar que terminou
    callbacks.forEach((cb) => cb({ finished: true })); // aviso atrasado da saída antiga
    await rerender(view(true));
    expect(screen.getByText("Sair da conta?")).toBeOnTheScreen();
    spy.mockRestore();
  });
});
