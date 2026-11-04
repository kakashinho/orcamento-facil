import { purgeTempFiles } from "./temp-files";

// O módulo é simulado em jest.setup-env.js: `Directory(entradas)` devolve as entradas em `list()`.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Directory } = require("expo-file-system");

const file = (name: string) => ({ name, delete: jest.fn() });

describe("limpeza de arquivos temporários (R81)", () => {
  it("apaga PDFs e imagens do cache, inclusive das subpastas, e preserva o resto", () => {
    const pdf = file("extrato_2026-10-01_a_2026-10-31.pdf");
    const photo = file("foto_2026-11-04_153012.JPG");
    const nested = file("recibo.png");
    const other = file("dados.json");
    const root = new Directory([pdf, new Directory([nested, other]), photo]);

    expect(purgeTempFiles(root)).toBe(3);
    expect(pdf.delete).toHaveBeenCalled();
    expect(photo.delete).toHaveBeenCalled();
    expect(nested.delete).toHaveBeenCalled();
    expect(other.delete).not.toHaveBeenCalled();
  });

  it("uma falha isolada não interrompe a limpeza", () => {
    const broken = file("a.pdf");
    broken.delete.mockImplementation(() => {
      throw new Error("sem permissão");
    });
    const fine = file("b.pdf");
    expect(purgeTempFiles(new Directory([broken, fine]))).toBe(1);
    expect(fine.delete).toHaveBeenCalled();
  });

  it("pasta ilegível devolve zero", () => {
    const root = new Directory();
    root.list = () => {
      throw new Error("inacessível");
    };
    expect(purgeTempFiles(root)).toBe(0);
  });
});
