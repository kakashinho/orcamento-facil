import { generateKeyPairSync } from "node:crypto";
import { createVerifier } from "fast-jwt";
import { describe, expect, it } from "vitest";
import { FcmPushSender } from "../../src/infrastructure/push/push-sender.js";
import { MutableClock } from "../helpers/test-config.js";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const credentials = { projectId: "orcamento-teste", clientEmail: "push@orcamento-teste.iam.gserviceaccount.com", privateKey };
const message = { title: "Orçamento quase no limite", body: "Alimentação chegou a 80%.", data: { kind: "budget_warning" } };

function fakeFetch(fcmStatus: number, fcmBody: unknown = {}) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    if (String(url).includes("oauth2")) {
      return new Response(JSON.stringify({ access_token: "token-oauth", expires_in: 3600 }), { status: 200 });
    }
    return new Response(JSON.stringify(fcmBody), { status: fcmStatus });
  }) as typeof fetch;
  return { impl, calls };
}

describe("envio de push pelo FCM HTTP v1 (ADR-S2-008)", () => {
  it("troca um JWT RS256 da conta de serviço por token OAuth, guarda em cache e envia a mensagem", async () => {
    const start = new Date("2026-11-03T12:00:00Z");
    const clock = new MutableClock(start);
    const { impl, calls } = fakeFetch(200);
    const sender = new FcmPushSender(credentials, clock, impl);

    expect(await sender.send("token-aparelho", message)).toBe("sent");
    expect(await sender.send("token-aparelho", message)).toBe("sent");
    const oauth = calls.filter((call) => call.url.includes("oauth2"));
    expect(oauth).toHaveLength(1);

    const assertion = new URLSearchParams(String(oauth[0]!.init.body)).get("assertion")!;
    const claims = createVerifier({ key: publicKey, algorithms: ["RS256"], clockTimestamp: start.getTime() })(assertion);
    expect(claims).toMatchObject({
      iss: credentials.clientEmail,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
    });

    const send = calls.find((call) => call.url.includes("fcm.googleapis.com"))!;
    expect(send.url).toBe("https://fcm.googleapis.com/v1/projects/orcamento-teste/messages:send");
    expect((send.init.headers as Record<string, string>).authorization).toBe("Bearer token-oauth");
    expect(JSON.parse(String(send.init.body))).toEqual({
      message: {
        token: "token-aparelho",
        notification: { title: message.title, body: message.body },
        data: message.data,
        android: { priority: "high", notification: { channel_id: "avisos" } },
      },
    });

    // Perto de vencer, renova o token.
    clock.advance(56 * 60_000);
    await sender.send("token-aparelho", message);
    expect(calls.filter((call) => call.url.includes("oauth2"))).toHaveLength(2);
  });

  it.each([
    [404, {}, "invalid_token"],
    [400, { error: { status: "INVALID_ARGUMENT", details: [{ errorCode: "UNREGISTERED" }] } }, "invalid_token"],
    [400, { error: { status: "INVALID_ARGUMENT", message: "Invalid JSON payload" } }, "failed"],
    [500, {}, "failed"],
  ])("HTTP %i do FCM vira %s", async (status, body, expected) => {
    const { impl } = fakeFetch(status, body);
    const sender = new FcmPushSender(credentials, new MutableClock(), impl);
    expect(await sender.send("token", message)).toBe(expected);
  });

  it("falha de rede vira 'failed', sem lançar", async () => {
    const failing = (async () => {
      throw new Error("sem rede");
    }) as typeof fetch;
    expect(await new FcmPushSender(credentials, new MutableClock(), failing).send("token", message)).toBe("failed");
  });
});
