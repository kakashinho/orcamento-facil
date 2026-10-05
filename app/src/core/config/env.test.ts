import { normalizeApiUrl } from "./env";

describe("URL da API", () => {
  it.each([
    ["172.27.128.1:3000", "http://172.27.128.1:3000"],
    ["http://192.168.0.10:3000/", "http://192.168.0.10:3000"],
    [" https://api.orcamentofacil.app ", "https://api.orcamentofacil.app"],
  ])("normaliza %p", (input, expected) => {
    expect(normalizeApiUrl(input)).toBe(expected);
  });
});
