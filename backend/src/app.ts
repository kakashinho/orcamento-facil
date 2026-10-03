import Fastify from "fastify";
import cors from "@fastify/cors";

import { usersRoutes } from "./routes/users.js";

export function buildApp() {
  const app = Fastify({
    logger: true,
  });

  app.register(cors);

  app.get("/health", async () => {
    return {
      status: "ok",
    };
  });

  app.register(usersRoutes, {
    prefix: "/api/users",
  });

  return app;
}
