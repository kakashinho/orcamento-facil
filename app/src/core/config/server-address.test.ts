import { createMemoryStorage, storageKeys } from "../storage/secure-storage";
import { parseServerAddress, useServerAddress } from "./server-address";

describe("endereço do servidor", () => {
  it("aceita IP, IP com porta e URL completa", () => {
    expect(parseServerAddress("192.168.0.250")).toEqual({ url: "http://192.168.0.250" });
    expect(parseServerAddress(" 192.168.0.250:3000/ ")).toEqual({ url: "http://192.168.0.250:3000" });
    expect(parseServerAddress("https://api.exemplo.com")).toEqual({ url: "https://api.exemplo.com" });
  });

  it("recusa endereço vazio ou malformado", () => {
    expect(parseServerAddress("   ")).toHaveProperty("error");
    expect(parseServerAddress("192.168 .0.1")).toHaveProperty("error");
    expect(parseServerAddress("http://")).toHaveProperty("error");
  });

  it("carrega o endereço salvo", async () => {
    const storage = createMemoryStorage({ [storageKeys.serverAddress]: "http://10.0.0.5" });
    await useServerAddress.getState().hydrate(storage);
    expect(useServerAddress.getState()).toMatchObject({ override: "http://10.0.0.5", hydrated: true });
  });
});
