import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Garante as regras de camadas descritas em docs/architecture/implementation.md:
 *   route → controller → service → repository → Drizzle
 * Se alguém "pular" uma camada, este teste falha apontando o arquivo.
 */
const MODULES_DIR = path.resolve(import.meta.dirname, "../../src/modules");

interface SourceFile {
  module: string;
  layer: string;
  file: string;
  imports: string[];
}

function sourceFiles(): SourceFile[] {
  const files: SourceFile[] = [];
  for (const module of readdirSync(MODULES_DIR)) {
    for (const layer of readdirSync(path.join(MODULES_DIR, module))) {
      for (const file of readdirSync(path.join(MODULES_DIR, module, layer))) {
        const content = readFileSync(path.join(MODULES_DIR, module, layer, file), "utf8");
        const imports = [...content.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]!);
        files.push({ module, layer, file: `${module}/${layer}/${file}`, imports });
      }
    }
  }
  return files;
}

const files = sourceFiles();
const inLayer = (layer: string) => files.filter((file) => file.layer === layer);
const offenders = (list: SourceFile[], forbidden: (spec: string, file: SourceFile) => boolean) =>
  list.filter((file) => file.imports.some((spec) => forbidden(spec, file))).map((file) => file.file);

describe("arquitetura em camadas", () => {
  it("todo módulo segue as pastas do padrão documentado", () => {
    const allowed = new Set(["routes", "controllers", "schemas", "services", "repositories", "types"]);
    expect(files.filter((file) => !allowed.has(file.layer)).map((file) => file.file)).toEqual([]);
  });

  it("somente repositories usam o Drizzle", () => {
    const others = files.filter((file) => file.layer !== "repositories");
    expect(offenders(others, (spec) => spec.startsWith("drizzle-orm"))).toEqual([]);
  });

  it("routes só declaram endpoints: não chamam services nem repositories", () => {
    expect(offenders(inLayer("routes"), (spec) => /\/(services|repositories)\//.test(spec))).toEqual([]);
  });

  it("controllers não acessam repositories", () => {
    expect(offenders(inLayer("controllers"), (spec) => spec.includes("/repositories/"))).toEqual([]);
  });

  it("services não conhecem o Fastify", () => {
    expect(offenders(inLayer("services"), (spec) => spec === "fastify" || spec.startsWith("fastify-"))).toEqual([]);
  });

  it("repositories não conhecem HTTP nem chamam services", () => {
    expect(
      offenders(inLayer("repositories"), (spec) => spec.startsWith("fastify") || /\/(services|controllers)\//.test(spec)),
    ).toEqual([]);
  });

  it("um módulo não usa o repository de outro módulo", () => {
    const crossModule = (spec: string, file: SourceFile) => {
      const match = /\.\.\/\.\.\/([a-z-]+)\/repositories\//.exec(spec);
      return match !== null && match[1] !== file.module;
    };
    expect(offenders(files, crossModule)).toEqual([]);
  });
});
