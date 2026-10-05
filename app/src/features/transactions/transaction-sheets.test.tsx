import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import * as Speech from "expo-speech";
import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";
import { useMaintenanceStore } from "@/data/system/maintenance-store";
import { apiError } from "@/test-utils/fake-api";
import { categories, transaction, wallet } from "@/test-utils/fixtures";
import { speechEvents } from "@/test-utils/native-mocks";
import { renderWithProviders, setupApi, signIn } from "@/test-utils/render";
import { TransactionDetailsSheet } from "./transaction-details-sheet";
import { TransactionFormSheet } from "./transaction-form-sheet";

const speech = speechEvents;

async function openForm(editing = null as ReturnType<typeof transaction> | null) {
  const onClose = jest.fn();
  await renderWithProviders(<TransactionFormSheet open editing={editing} onClose={onClose} />);
  await screen.findByRole("button", { name: "Carteira: Conta corrente (BRL)" });
  return onClose;
}

describe("registrar transação (R06, R07, R43, R77)", () => {
  beforeEach(() => signIn());

  it("registra despesa com valor, categoria e tags e mostra a confirmação animada", async () => {
    const api = setupApi().on("POST", "/api/transactions", { status: 201, body: transaction() });
    const onClose = await openForm();
    await fireEvent.changeText(screen.getByLabelText("Valor"), "35,90");
    await fireEvent.changeText(screen.getByLabelText("Descrição"), "Mercado");
    await fireEvent.press(await screen.findByRole("button", { name: "Alimentação" }));
    await fireEvent.changeText(screen.getByLabelText("Nova tag"), "casa,");
    await fireEvent.press(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(api.lastCall("POST", "/api/transactions")!.body).toEqual({
      type: "expense",
      amount: 35.9,
      description: "Mercado",
      date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      walletId: wallet().id,
      categoryId: categories[0].id,
      tags: ["casa"],
    });
    expect(await screen.findByText("Transação registrada!")).toBeOnTheScreen();
    expect(screen.getByText("Saldos atualizados")).toBeOnTheScreen();
  });

  it("só mostra categorias compatíveis com o tipo (R07)", async () => {
    setupApi();
    await openForm();
    expect(await screen.findByRole("button", { name: "Alimentação" })).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Salário" })).toBeNull();
    await fireEvent.press(screen.getByRole("tab", { name: "Receita" }));
    expect(await screen.findByRole("button", { name: "Salário" })).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Alimentação" })).toBeNull();
  });

  it("sugere a categoria pela descrição (R44)", async () => {
    const api = setupApi().on("POST", "/api/categories/suggest", {
      body: { suggestions: [{ categoryId: categories[1].id, name: "Transporte", confidence: 0.9, reasons: ["uber"] }] },
    });
    await openForm();
    await fireEvent.changeText(screen.getByLabelText("Descrição"), "Uber para o trabalho");
    const chip = await screen.findByRole("button", { name: "Sugestão: Transporte" }, { timeout: 2000 });
    expect(api.lastCall("POST", "/api/categories/suggest")!.body).toEqual({
      description: "Uber para o trabalho",
      type: "expense",
    });
    await fireEvent.press(chip);
    expect(screen.getByRole("button", { name: "Transporte" })).toBeSelected();
  });

  it("cria categoria personalizada e já a seleciona (R08)", async () => {
    const created = {
      id: "99999999-9999-4999-8999-999999999999",
      name: "Pets",
      type: "expense" as const,
      predefined: false,
      systemKey: null,
    };
    const api = setupApi().on("POST", "/api/categories", { status: 201, body: created });
    await openForm();
    await fireEvent.press(screen.getByRole("button", { name: "Nova" }));
    await fireEvent.changeText(screen.getByLabelText("Nome da categoria"), "Pets");
    await fireEvent.press(screen.getByRole("button", { name: "Criar" }));
    await waitFor(() =>
      expect(api.lastCall("POST", "/api/categories")!.body).toEqual({ name: "Pets", type: "expense" }),
    );
  });

  it("valida o formulário antes de enviar", async () => {
    const api = setupApi();
    await openForm();
    await fireEvent.changeText(screen.getByLabelText("Valor"), "10,999");
    await fireEvent.press(await screen.findByRole("button", { name: "Alimentação" }));
    await fireEvent.press(screen.getByRole("button", { name: "Salvar" }));
    expect(screen.getByText("Informe um valor válido, com até duas casas decimais.")).toBeOnTheScreen();
    expect(api.callsTo("POST", "/api/transactions")).toHaveLength(0);
  });

  it("mostra o erro de regra do servidor no campo (`details`)", async () => {
    setupApi().on(
      "POST",
      "/api/transactions",
      apiError(422, "INVALID_WALLET", "Carteira inexistente.", [
        { location: "body", path: "walletId", message: "Carteira inexistente." },
      ]),
    );
    await openForm();
    await fireEvent.changeText(screen.getByLabelText("Valor"), "10");
    await fireEvent.press(await screen.findByRole("button", { name: "Alimentação" }));
    await fireEvent.press(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByText("Carteira inexistente.")).toBeOnTheScreen();
  });

  it("bloqueia o registro em manutenção (R72)", async () => {
    setupApi();
    useMaintenanceStore.getState().setFromStatus(true, null);
    await openForm();
    await fireEvent.changeText(screen.getByLabelText("Valor"), "10");
    await fireEvent.press(await screen.findByRole("button", { name: "Alimentação" }));
    expect(screen.getByText("Operações de registro estão suspensas durante a manutenção.")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
  });

  it("registra por voz: converte a fala em texto e preenche o rascunho (R65)", async () => {
    const api = setupApi().on("POST", "/api/transactions/parse", {
      body: {
        draft: { type: "expense", amount: 35.9, date: "2026-10-03", description: "Mercado" },
        suggestions: [{ categoryId: categories[0].id, name: "Alimentação", confidence: 0.8 }],
      },
    });
    await openForm();
    await fireEvent.press(screen.getByRole("button", { name: "Registrar por voz" }));
    expect(await screen.findByText("Ouvindo… fale o valor e a descrição")).toBeOnTheScreen();
    expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalledWith(expect.objectContaining({ lang: "pt-BR" }));

    await act(async () => {
      speech.__emit("result", { results: [{ transcript: "gastei 35,90 no mercado ontem" }], isFinal: true });
      speech.__emit("end");
    });

    expect(await screen.findByTestId("voice-review")).toBeOnTheScreen();
    expect(api.lastCall("POST", "/api/transactions/parse")!.body).toEqual({ text: "gastei 35,90 no mercado ontem" });
    expect(screen.getByDisplayValue("35,90")).toBeOnTheScreen();
    expect(screen.getByDisplayValue("Mercado")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Alimentação" })).toBeSelected();
    expect(Speech.speak).toHaveBeenCalledWith(expect.stringContaining("Despesa de R$ 35,90"), { language: "pt-BR" });
  });

  it("avisa quando o microfone não é permitido", async () => {
    setupApi();
    (ExpoSpeechRecognitionModule.requestPermissionsAsync as jest.Mock).mockResolvedValueOnce({ granted: false });
    await openForm();
    await fireEvent.press(screen.getByRole("button", { name: "Registrar por voz" }));
    expect(await screen.findByText("Permita o uso do microfone para registrar por voz.")).toBeOnTheScreen();
  });
});

describe("editar transação (R11, R49)", () => {
  beforeEach(() => signIn());

  it("envia só o campo alterado e oferece desfazer", async () => {
    const api = setupApi()
      .on("PATCH", "/api/transactions/:id", { body: transaction({ amount: 50 }) })
      .on("POST", "/api/history/undo", {
        body: {
          undone: {
            id: "h1",
            action: "transaction.update",
            label: "Transação editada",
            entityType: "transaction",
            entityId: "x",
            createdAt: "",
          },
          message: "ok",
        },
      });
    const onClose = await openForm(transaction());
    expect(screen.getByDisplayValue("47,90")).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText("Valor"), "50,00");
    await fireEvent.press(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(api.lastCall("PATCH", "/api/transactions/:id")!.body).toEqual({ amount: 50 });

    expect(await screen.findByText("Transação atualizada")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Desfazer" }));
    expect(await screen.findByText("Desfeito: transação editada")).toBeOnTheScreen();
    expect(api.callsTo("POST", "/api/history/undo")).toHaveLength(1);
  });
});

describe("detalhes da transação (R12, R48, R49, R52)", () => {
  beforeEach(() => signIn());

  async function openDetails() {
    const onClose = jest.fn();
    const onEdit = jest.fn();
    await renderWithProviders(
      <TransactionDetailsSheet transaction={transaction()} onClose={onClose} onEdit={onEdit} />,
    );
    return { onClose, onEdit };
  }

  it("mostra os dados da transação", async () => {
    setupApi();
    await openDetails();
    expect(screen.getByText("−R$ 47,90")).toBeOnTheScreen();
    expect(screen.getByText("03 de outubro de 2026")).toBeOnTheScreen();
    expect(screen.getByText("#trabalho")).toBeOnTheScreen();
  });

  it("exclui só depois da confirmação e permite desfazer", async () => {
    const api = setupApi()
      .on("DELETE", "/api/transactions/:id", { status: 204 })
      .on("POST", "/api/history/undo", {
        body: {
          undone: {
            id: "h1",
            action: "transaction.delete",
            label: "Transação excluída",
            entityType: "transaction",
            entityId: "x",
            createdAt: "",
          },
          message: "ok",
        },
      });
    const { onClose } = await openDetails();
    await fireEvent.press(screen.getByRole("button", { name: "Excluir" }));
    expect(api.callsTo("DELETE", "/api/transactions/:id")).toHaveLength(0);

    const dialog = await screen.findByTestId("confirm-delete");
    expect(within(dialog).getByText("Excluir transação?")).toBeOnTheScreen();
    await fireEvent.press(within(dialog).getByRole("button", { name: "Excluir" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(api.lastCall("DELETE", "/api/transactions/:id")!.path).toBe(`/api/transactions/${transaction().id}`);
    expect(await screen.findByText("Transação excluída")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Desfazer" }));
    expect(await screen.findByText("Desfeito: transação excluída")).toBeOnTheScreen();
  });

  it("cancelar a confirmação não exclui", async () => {
    const api = setupApi();
    await openDetails();
    await fireEvent.press(screen.getByRole("button", { name: "Excluir" }));
    const dialog = await screen.findByTestId("confirm-delete");
    await fireEvent.press(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(api.callsTo("DELETE", "/api/transactions/:id")).toHaveLength(0);
  });

  it("duplica e arquiva pela API", async () => {
    const api = setupApi()
      .on("POST", "/api/transactions/:id/duplicate", { status: 201, body: transaction({ id: "dup" }) })
      .on("POST", "/api/transactions/:id/archive", { body: transaction({ archived: true }) });
    await openDetails();
    await fireEvent.press(screen.getByRole("button", { name: "Duplicar" }));
    expect(await screen.findByText("Transação duplicada")).toBeOnTheScreen();
    expect(api.callsTo("POST", "/api/transactions/:id/duplicate")).toHaveLength(1);

    await fireEvent.press(screen.getByRole("button", { name: "Arquivar" }));
    expect(await screen.findByText("Transação arquivada")).toBeOnTheScreen();
    expect(api.callsTo("POST", "/api/transactions/:id/archive")).toHaveLength(1);
  });

  it("editar abre o formulário com a transação", async () => {
    setupApi();
    const { onEdit } = await openDetails();
    await fireEvent.press(screen.getByRole("button", { name: "Editar" }));
    expect(onEdit).toHaveBeenCalledWith(transaction());
  });
});
