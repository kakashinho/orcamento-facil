import fs from "node:fs";
import path from "node:path";

/**
 * Regras de arquitetura (R84): cada camada só depende das camadas abaixo dela.
 *
 *   app (rotas) → features → data → core
 *                    ↘ ui      ↘ domain (regras puras)
 *
 * - ui: componentes visuais; não conhece dados, sessão nem telas.
 * - core: infraestrutura genérica (HTTP, logs, armazenamento); não conhece o domínio.
 * - data/api: contrato da API em TypeScript puro (roda também nos testes de contrato em Node).
 * - domain: regras puras; só importa tipos.
 * - app: rotas finas que apenas apontam para as telas.
 */
const SRC = path.resolve(__dirname, "../../src");

function filesUnder(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return filesUnder(full);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

interface ImportInfo {
  source: string;
  typeOnly: boolean;
}

function importsOf(file: string): ImportInfo[] {
  const text = fs.readFileSync(file, "utf8");
  const result: ImportInfo[] = [];
  const pattern = /^\s*(import|export)\s+(type\s+)?[^'"]*?from\s+["']([^"']+)["']/gm;
  for (const match of text.matchAll(pattern)) {
    result.push({ source: match[3], typeOnly: !!match[2] });
  }
  return result;
}

/** Resolve o import para a camada de destino ("ui", "core", "data", ...) ou o pacote externo. */
function targetOf(file: string, source: string): string {
  if (source.startsWith("@/")) return source.slice(2).split("/")[0];
  if (source.startsWith(".")) {
    const resolved = path.relative(SRC, path.resolve(path.dirname(file), source)).split(path.sep);
    return resolved[0];
  }
  return `pkg:${source}`;
}

function layerFiles(layer: string): string[] {
  return filesUnder(path.join(SRC, layer));
}

function violations(layer: string, forbidden: (target: string, info: ImportInfo, file: string) => boolean): string[] {
  return layerFiles(layer).flatMap((file) =>
    importsOf(file)
      .filter((info) => forbidden(targetOf(file, info.source), info, file))
      .map((info) => `${path.relative(SRC, file)} → ${info.source}`),
  );
}

describe("arquitetura em camadas (R84)", () => {
  it("ui não depende de dados, regras de negócio nem telas", () => {
    expect(violations("ui", (t) => ["core", "data", "domain", "features", "app"].includes(t))).toEqual([]);
  });

  it("core não depende de dados, domínio, telas ou UI", () => {
    expect(violations("core", (t) => ["data", "domain", "features", "app", "ui"].includes(t))).toEqual([]);
  });

  it("data não depende de telas, rotas ou UI", () => {
    expect(violations("data", (t) => ["features", "app", "ui", "domain"].includes(t))).toEqual([]);
  });

  it("o contrato da API (data/api) é TypeScript puro", () => {
    const forbidden = (t: string, info: ImportInfo) =>
      (t.startsWith("pkg:") || (t === "core" && !info.typeOnly) || t === "data") && !info.source.startsWith(".");
    const list = filesUnder(path.join(SRC, "data", "api")).flatMap((file) =>
      importsOf(file)
        .filter((info) => forbidden(targetOf(file, info.source), info))
        .map((info) => `${path.relative(SRC, file)} → ${info.source}`),
    );
    expect(list).toEqual([]);
  });

  it("domain só importa tipos e nada de React/React Native", () => {
    expect(
      violations(
        "domain",
        (t, info) =>
          t.startsWith("pkg:") ||
          ["core", "features", "app"].includes(t) ||
          (["data", "ui"].includes(t) && !info.typeOnly),
      ),
    ).toEqual([]);
  });

  it("features não dependem das rotas", () => {
    expect(violations("features", (t) => t === "app")).toEqual([]);
  });

  it("rotas são finas: cada arquivo só aponta para uma tela", () => {
    const routes = layerFiles("app").filter((f) => !f.endsWith("_layout.tsx") && !f.endsWith("+not-found.tsx"));
    for (const file of routes) {
      const imports = importsOf(file);
      expect(imports.every((i) => targetOf(file, i.source) === "features")).toBe(true);
      expect(fs.readFileSync(file, "utf8").split("\n").length).toBeLessThan(10);
    }
  });
});
