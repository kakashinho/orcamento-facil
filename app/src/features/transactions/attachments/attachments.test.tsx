import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { useCameraPermissions } from "expo-camera";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { ImageManipulator } from "expo-image-manipulator";
import * as Sharing from "expo-sharing";
import { Linking } from "react-native";
import type { Attachment } from "@/data/api/types";
import { apiError } from "@/test-utils/fake-api";
import { transaction } from "@/test-utils/fixtures";
import { renderWithProviders, setupApi, signIn } from "@/test-utils/render";
import { TransactionDetailsSheet } from "../transaction-details-sheet";

const tx = transaction();
const BASE = `/api/transactions/${tx.id}/attachments`;

const attachment = (overrides: Partial<Attachment> = {}): Attachment => ({
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  kind: "document",
  fileName: "nota-fiscal.pdf",
  mimeType: "application/pdf",
  sizeBytes: 1_258_291,
  createdAt: "2026-10-03T12:00:00.000Z",
  ...overrides,
});

const receipt = attachment({
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  kind: "receipt",
  fileName: "pix.png",
  mimeType: "image/png",
  sizeBytes: 48_000,
});

/**
 * Partes do multipart: no aparelho, o FormData do React Native lê `{ uri, name, type }` do disco; no
 * Jest o FormData é o do Node, então os testes conferem o que foi anexado a ele.
 */
let append: jest.SpyInstance;
beforeEach(() => {
  append = jest.spyOn(FormData.prototype, "append");
});
afterEach(() => append.mockRestore());
function formParts() {
  return append.mock.calls.map(([fieldName, value]) => ({ fieldName, ...(value as object) }));
}

async function openDetails() {
  await renderWithProviders(<TransactionDetailsSheet transaction={tx} onClose={jest.fn()} onEdit={jest.fn()} />);
  return screen.getByTestId("details-attachments");
}

const defaultPermissions = (useCameraPermissions as jest.Mock).getMockImplementation()!;

describe("anexos nos detalhes da transação (R25, R76)", () => {
  beforeEach(() => signIn());

  it("lista os anexos com tipo e tamanho e mostra o selo de comprovante", async () => {
    const api = setupApi().on("GET", BASE, { body: { data: [attachment(), receipt] } });
    const section = await openDetails();
    expect(await within(section).findByText("nota-fiscal.pdf")).toBeOnTheScreen();
    expect(within(section).getByText("Documento")).toBeOnTheScreen();
    expect(within(section).getByText("1,2 MB")).toBeOnTheScreen();
    expect(within(section).getByText("Comprovante")).toBeOnTheScreen();
    expect(within(section).getByText("2/10")).toBeOnTheScreen();
    expect(within(screen.getByTestId("receipt-badge")).getByText("Comprovante anexado")).toBeOnTheScreen();
    expect(api.callsTo("GET", BASE)).toHaveLength(1);
  });

  it("anexa um comprovante escolhido no seletor", async () => {
    const api = setupApi()
      .on("GET", BASE, { body: { data: [] } })
      .on("POST", BASE, { status: 201, body: attachment({ kind: "receipt", fileName: "conta.pdf" }) });
    const section = await openDetails();
    expect(await within(section).findByText(/Nenhum anexo/)).toBeOnTheScreen();
    expect(screen.queryByTestId("receipt-badge")).toBeNull();

    await fireEvent.press(within(section).getByRole("button", { name: "Anexar arquivo" }));
    const dialog = await screen.findByTestId("attachment-kind");
    await fireEvent.press(within(dialog).getByRole("button", { name: "Comprovante de pagamento" }));

    await waitFor(() => expect(api.callsTo("POST", BASE)).toHaveLength(1));
    expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledWith({
      type: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
      copyToCacheDirectory: true,
      multiple: false,
    });
    const call = api.lastCall("POST", BASE)!;
    expect(call.query).toEqual({ kind: "receipt" });
    expect(call.headers.authorization).toBe("Bearer access-1");
    expect(call.body).toBeInstanceOf(FormData);
    expect(formParts()).toEqual([
      { fieldName: "file", uri: "file:///cache/conta.pdf", name: "conta.pdf", type: "application/pdf" },
    ]);
    expect(await screen.findByText("Comprovante anexado")).toBeOnTheScreen();
  });

  it("recusa no aparelho um arquivo de 6 MB, sem chamar a API", async () => {
    const api = setupApi().on("GET", BASE, { body: { data: [] } });
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [
        { uri: "file:///cache/grande.pdf", name: "grande.pdf", mimeType: "application/pdf", size: 6 * 1024 * 1024 },
      ],
    });
    const section = await openDetails();
    await fireEvent.press(within(section).getByRole("button", { name: "Anexar arquivo" }));
    await fireEvent.press(
      within(await screen.findByTestId("attachment-kind")).getByRole("button", { name: "Documento" }),
    );
    expect(await within(section).findByText("O arquivo passa de 5 MB. Envie um arquivo menor.")).toBeOnTheScreen();
    expect(api.callsTo("POST", BASE)).toHaveLength(0);
  });

  it("recusa tipos não aceitos e ignora o cancelamento do seletor", async () => {
    const api = setupApi().on("GET", BASE, { body: { data: [] } });
    (DocumentPicker.getDocumentAsync as jest.Mock)
      .mockResolvedValueOnce({ canceled: true, assets: null })
      .mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri: "file:///cache/p.xlsx", name: "p.xlsx", mimeType: "application/vnd.ms-excel", size: 10 }],
      });
    const section = await openDetails();
    await fireEvent.press(within(section).getByRole("button", { name: "Anexar arquivo" }));
    await fireEvent.press(
      within(await screen.findByTestId("attachment-kind")).getByRole("button", { name: "Documento" }),
    );
    await waitFor(() => expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledTimes(1));
    expect(within(section).queryByTestId("attachments-error")).toBeNull();

    await fireEvent.press(within(section).getByRole("button", { name: "Anexar arquivo" }));
    await fireEvent.press(
      within(await screen.findByTestId("attachment-kind")).getByRole("button", { name: "Documento" }),
    );
    expect(await within(section).findByText("Envie um PDF ou uma imagem (JPEG, PNG ou WebP).")).toBeOnTheScreen();
    expect(api.callsTo("POST", BASE)).toHaveLength(0);
  });

  it.each([
    [
      apiError(409, "ATTACHMENT_QUOTA", "Cota."),
      "O espaço para anexos acabou. Exclua anexos antigos para liberar espaço.",
    ],
    [apiError(413, "FILE_TOO_LARGE", "Grande."), "O arquivo passa de 5 MB. Envie um arquivo menor."],
    [
      apiError(415, "UNSUPPORTED_FILE_TYPE", "Tipo."),
      "Formato não aceito. Envie um PDF ou uma imagem (JPEG, PNG ou WebP).",
    ],
    [apiError(409, "ATTACHMENT_LIMIT", "Limite."), "Esta transação já tem 10 anexos. Exclua um para anexar outro."],
  ])("traduz o erro do servidor no upload (%#)", async (response, message) => {
    setupApi()
      .on("GET", BASE, { body: { data: [] } })
      .on("POST", BASE, response);
    const section = await openDetails();
    await fireEvent.press(within(section).getByRole("button", { name: "Anexar arquivo" }));
    await fireEvent.press(
      within(await screen.findByTestId("attachment-kind")).getByRole("button", { name: "Documento" }),
    );
    expect(await within(section).findByText(message)).toBeOnTheScreen();
  });

  it("abre o anexo: baixa para o cache com o token e abre o compartilhamento", async () => {
    setupApi().on("GET", BASE, { body: { data: [attachment()] } });
    const section = await openDetails();
    await fireEvent.press(await within(section).findByRole("button", { name: /^Abrir nota-fiscal\.pdf/ }));
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalled());
    expect(File.downloadFileAsync).toHaveBeenCalledWith(
      `http://api.test${BASE}/${attachment().id}/content`,
      expect.objectContaining({ uri: "file:///cache/aaaaaaaa_nota-fiscal.pdf" }),
      { headers: { Authorization: "Bearer access-1" }, idempotent: true },
    );
    expect(Sharing.shareAsync).toHaveBeenCalledWith("file:///cache/aaaaaaaa_nota-fiscal.pdf", {
      mimeType: "application/pdf",
      dialogTitle: "nota-fiscal.pdf",
    });
  });

  it("avisa quando não consegue abrir", async () => {
    setupApi().on("GET", BASE, { body: { data: [attachment()] } });
    (File.downloadFileAsync as jest.Mock).mockRejectedValueOnce(new Error("404"));
    const section = await openDetails();
    await fireEvent.press(await within(section).findByRole("button", { name: /^Abrir nota-fiscal\.pdf/ }));
    expect(await within(section).findByText("Não foi possível abrir o anexo. Tente novamente.")).toBeOnTheScreen();
  });

  it("exclui só depois da confirmação", async () => {
    const api = setupApi()
      .on("GET", BASE, { body: { data: [attachment()] } })
      .on("DELETE", `${BASE}/:id`, { status: 204 });
    const section = await openDetails();
    await fireEvent.press(await within(section).findByRole("button", { name: "Excluir anexo nota-fiscal.pdf" }));
    let dialog = await screen.findByTestId("confirm-delete-attachment");
    await fireEvent.press(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(api.callsTo("DELETE", `${BASE}/:id`)).toHaveLength(0);

    await fireEvent.press(within(section).getByRole("button", { name: "Excluir anexo nota-fiscal.pdf" }));
    dialog = await screen.findByTestId("confirm-delete-attachment");
    await fireEvent.press(within(dialog).getByRole("button", { name: "Excluir" }));
    await waitFor(() => expect(api.lastCall("DELETE", `${BASE}/:id`)!.path).toBe(`${BASE}/${attachment().id}`));
    expect(await screen.findByText("Anexo excluído")).toBeOnTheScreen();
  });
});

describe("foto do recibo pela câmera (R24)", () => {
  beforeEach(() => signIn());
  afterEach(() => (useCameraPermissions as jest.Mock).mockImplementation(defaultPermissions));

  async function openCamera() {
    const section = await openDetails();
    await fireEvent.press(within(section).getByRole("button", { name: "Tirar foto" }));
    return section;
  }

  it("captura, mostra a prévia, reduz para 1600 px e envia como foto", async () => {
    const api = setupApi()
      .on("GET", BASE, { body: { data: [] } })
      .on("POST", BASE, { status: 201, body: attachment({ kind: "photo", fileName: "foto.jpg" }) });
    await openCamera();
    const camera = await screen.findByTestId("camera-view");
    const shutter = screen.getByRole("button", { name: "Capturar foto" });
    expect(shutter).toBeDisabled();
    await act(async () => camera.props.onCameraReady());
    await fireEvent.press(shutter);
    expect(await screen.findByTestId("camera-preview")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Usar foto" }));

    await waitFor(() => expect(api.callsTo("POST", BASE)).toHaveLength(1));
    expect(ImageManipulator.manipulate).toHaveBeenCalledWith("file:///cache/foto.jpg");
    const context = (ImageManipulator.manipulate as jest.Mock).mock.results[0].value;
    // Foto de 3000 × 4000: o lado maior (altura) fica em 1600 px.
    expect(context.resize).toHaveBeenCalledWith({ height: 1600 });
    const image = await context.renderAsync.mock.results[0].value;
    expect(image.saveAsync).toHaveBeenCalledWith({ compress: 0.7, format: "jpeg" });
    const call = api.lastCall("POST", BASE)!;
    expect(call.query).toEqual({ kind: "photo" });
    expect(formParts()).toEqual([
      expect.objectContaining({
        fieldName: "file",
        uri: "file:///cache/foto-reduzida.jpg",
        type: "image/jpeg",
        name: expect.stringMatching(/^foto_\d{4}-\d{2}-\d{2}_\d{6}\.jpg$/),
      }),
    ]);
    expect(await screen.findByText("Foto anexada")).toBeOnTheScreen();
    await waitFor(() => expect(screen.queryByTestId("camera-modal")).toBeNull());
  });

  it("envia como comprovante quando marcado, e permite tirar outra", async () => {
    const api = setupApi()
      .on("GET", BASE, { body: { data: [] } })
      .on("POST", BASE, { status: 201, body: attachment({ kind: "receipt" }) });
    await openCamera();
    const camera = await screen.findByTestId("camera-view");
    await act(async () => camera.props.onCameraReady());
    await fireEvent.press(screen.getByRole("button", { name: "Capturar foto" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Tirar outra" }));
    const again = await screen.findByTestId("camera-view");
    await act(async () => again.props.onCameraReady());
    await fireEvent.press(screen.getByRole("button", { name: "Capturar foto" }));
    await fireEvent.press(await screen.findByRole("switch", { name: "Comprovante de pagamento" }));
    await fireEvent.press(screen.getByRole("button", { name: "Usar foto" }));
    await waitFor(() => expect(api.lastCall("POST", BASE)?.query).toEqual({ kind: "receipt" }));
  });

  it("mostra o erro do envio na própria câmera", async () => {
    setupApi()
      .on("GET", BASE, { body: { data: [] } })
      .on("POST", BASE, apiError(409, "ATTACHMENT_QUOTA", "Cota."));
    await openCamera();
    const camera = await screen.findByTestId("camera-view");
    await act(async () => camera.props.onCameraReady());
    await fireEvent.press(screen.getByRole("button", { name: "Capturar foto" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Usar foto" }));
    expect(
      await within(screen.getByTestId("camera-modal")).findByText(
        "O espaço para anexos acabou. Exclua anexos antigos para liberar espaço.",
      ),
    ).toBeOnTheScreen();
  });

  it("permissão negada: explica e leva às configurações", async () => {
    setupApi().on("GET", BASE, { body: { data: [] } });
    (useCameraPermissions as jest.Mock).mockImplementation(() => [
      { granted: false, status: "denied", canAskAgain: false },
      jest.fn(),
    ]);
    const openSettings = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
    await openCamera();
    expect(await screen.findByText(/permita o uso da câmera/)).toBeOnTheScreen();
    expect(screen.queryByTestId("camera-view")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Abrir configurações" }));
    expect(openSettings).toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "Voltar" }));
    await waitFor(() => expect(screen.queryByTestId("camera-message")).toBeNull());
  });

  it("permissão ainda não pedida: pede ao tocar", async () => {
    setupApi().on("GET", BASE, { body: { data: [] } });
    const request = jest.fn(async () => ({ granted: true, status: "granted", canAskAgain: true }));
    (useCameraPermissions as jest.Mock).mockImplementation(() => [
      { granted: false, status: "undetermined", canAskAgain: true },
      request,
    ]);
    await openCamera();
    await fireEvent.press(await screen.findByRole("button", { name: "Permitir câmera" }));
    expect(request).toHaveBeenCalled();
  });
});
