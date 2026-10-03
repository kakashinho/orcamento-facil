// tests/e2e/users.spec.ts

import { test, expect } from "@playwright/test";

test("cria e consulta um usuário", async ({ request }) => {
  const createResponse = await request.post("/api/users", {
    data: {
      name: "João",
      email: `joao-${Date.now()}@example.com`,
    },
  });

  expect(createResponse.status()).toBe(201);

  const user = await createResponse.json();

  expect(user).toHaveProperty("id");
  expect(user.name).toBe("João");

  const listResponse = await request.get("/api/users");

  expect(listResponse.ok()).toBeTruthy();

  const users = await listResponse.json();

  expect(users).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: user.id,
        name: "João",
      }),
    ]),
  );
});
