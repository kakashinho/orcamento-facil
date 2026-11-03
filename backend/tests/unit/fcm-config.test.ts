import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { testConfig } from "../helpers/test-config.js";

describe("configuração do push pelo FCM (R18)", () => {
  it("sem credencial, o push fica só no log", () => {
    expect(testConfig().push).toEqual({});
  });

  it("as três variáveis, com a chave em uma linha (\\n escapado)", () => {
    const config = testConfig({
      FCM_PROJECT_ID: "orcamento-facil-b5760",
      FCM_CLIENT_EMAIL: "firebase-adminsdk@orcamento-facil-b5760.iam.gserviceaccount.com",
      FCM_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n",
    });
    expect(config.push.fcm).toEqual({
      projectId: "orcamento-facil-b5760",
      clientEmail: "firebase-adminsdk@orcamento-facil-b5760.iam.gserviceaccount.com",
      privateKey: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n",
    });
  });

  it("configuração incompleta falha com mensagem clara", () => {
    expect(() => testConfig({ FCM_PROJECT_ID: "x" })).toThrow(/FCM incompleta/);
  });

  it("arquivo JSON da conta de serviço", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "fcm-"));
    const file = path.join(dir, "conta.json");
    writeFileSync(file, JSON.stringify({ project_id: "p", client_email: "e@p.iam.gserviceaccount.com", private_key: "k" }));
    expect(testConfig({ FCM_SERVICE_ACCOUNT_FILE: file }).push.fcm).toEqual({
      projectId: "p",
      clientEmail: "e@p.iam.gserviceaccount.com",
      privateKey: "k",
    });
    writeFileSync(file, "{}");
    expect(() => testConfig({ FCM_SERVICE_ACCOUNT_FILE: file })).toThrow(/faltam project_id/);
  });
});
