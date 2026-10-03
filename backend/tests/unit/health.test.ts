import { describe, it, expect, afterEach } from "vitest";
import { buildApp } from "../../src/app";

describe("GET /health", () => {
  afterEach(async () => {
    // Cleanup will be handled per test
  });

  it("should return 200 with status ok", async () => {
    const app = buildApp();

    try {
      const response = await app.inject({
        method: "GET",
        url: "/health",
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ status: "ok" });
    } finally {
      await app.close();
    }
  });

  it("should respond without database connection", async () => {
    const app = buildApp();

    try {
      // DATABASE_URL is not set in test environment
      const response = await app.inject({
        method: "GET",
        url: "/health",
      });

      expect(response.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});
