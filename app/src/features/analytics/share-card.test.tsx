import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import * as Sharing from "expo-sharing";
import { TurboModuleRegistry } from "react-native";
import { captureRef } from "react-native-view-shot";
import type { MonthIndicators } from "@/data/api/types";
import { secureStoreData } from "@/test-utils/native-mocks";
import { renderWithProviders, setupApi, signIn } from "@/test-utils/render";
import { MonthIndicatorsCard } from "./month-indicators-card";
import { SHARE_WARNING_KEY } from "./share-card";

const indicators: MonthIndicators = {
  month: "2026-10",
  currency: "BRL",
  days: 31,
  averageDailyBalance: 1234.5,
  ratesStale: false,
  savings: { saved: 900, previousAverage: 600, previousMonths: ["2026-09"], difference: 300, differencePercent: 50 },
  topExpenses: [],
};

async function renderCard() {
  setupApi().on("GET", "/api/reports/month-indicators", { body: indicators });
  await renderWithProviders(<MonthIndicatorsCard month="2026-10" />);
  await screen.findByText("R$ 1.234,50");
}

describe("compartilhar cartão das análises como imagem (R30)", () => {
  beforeEach(() => signIn());

  it("avisa sobre os valores na primeira vez, captura o cartão em PNG e abre o compartilhamento", async () => {
    await renderCard();
    await fireEvent.press(screen.getByRole("button", { name: "Compartilhar Indicadores do mês" }));
    const dialog = await screen.findByTestId("share-warning");
    expect(within(dialog).getByText("A imagem mostra valores das suas finanças. Compartilhar?")).toBeOnTheScreen();
    expect(captureRef).not.toHaveBeenCalled();

    await fireEvent.press(within(dialog).getByRole("button", { name: "Compartilhar" }));
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalled());
    expect(captureRef).toHaveBeenCalledWith(expect.objectContaining({ current: expect.anything() }), {
      format: "png",
      quality: 1,
      result: "tmpfile",
    });
    expect(Sharing.shareAsync).toHaveBeenCalledWith("file:///cache/cartao.png", {
      mimeType: "image/png",
      dialogTitle: "Indicadores do mês",
    });
    // O rodapé com o período só existe durante a captura.
    await waitFor(() => expect(screen.queryByTestId("share-footer")).toBeNull());
    expect(secureStoreData().has(SHARE_WARNING_KEY)).toBe(false);
  });

  it("com 'Não perguntar de novo', guarda a escolha no aparelho e compartilha direto depois", async () => {
    await renderCard();
    await fireEvent.press(screen.getByRole("button", { name: "Compartilhar Indicadores do mês" }));
    const dialog = await screen.findByTestId("share-warning");
    await fireEvent.press(within(dialog).getByRole("switch", { name: "Não perguntar de novo" }));
    await fireEvent.press(within(dialog).getByRole("button", { name: "Compartilhar" }));
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledTimes(1));
    expect(secureStoreData().get(SHARE_WARNING_KEY)).toBe("1");

    await fireEvent.press(await screen.findByRole("button", { name: "Compartilhar Indicadores do mês" }));
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId("share-warning")).toBeNull();
    expect(captureRef).toHaveBeenCalledTimes(2);
  });

  it("cancelar o aviso não captura nada", async () => {
    await renderCard();
    await fireEvent.press(screen.getByRole("button", { name: "Compartilhar Indicadores do mês" }));
    const dialog = await screen.findByTestId("share-warning");
    await fireEvent.press(within(dialog).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByTestId("share-warning")).toBeNull());
    expect(captureRef).not.toHaveBeenCalled();
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  it("falha na captura avisa", async () => {
    secureStoreData().set(SHARE_WARNING_KEY, "1");
    (captureRef as jest.Mock).mockRejectedValueOnce(new Error("falhou"));
    await renderCard();
    await fireEvent.press(screen.getByRole("button", { name: "Compartilhar Indicadores do mês" }));
    expect(await screen.findByText("Não foi possível compartilhar a imagem.")).toBeOnTheScreen();
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  it("fica escondido sem o módulo de captura (Expo Go)", async () => {
    const original = TurboModuleRegistry.get;
    const spy = jest
      .spyOn(TurboModuleRegistry, "get")
      .mockImplementation((name: string) => (name === "RNViewShot" ? null : original(name)));
    try {
      await renderCard();
      expect(screen.queryByRole("button", { name: "Compartilhar Indicadores do mês" })).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });
});
