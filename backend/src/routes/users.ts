import { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";

export async function usersRoutes(app: FastifyInstance) {
  app.get("/", async () => {
    return db.select().from(users);
  });

  app.post<{
    Body: {
      name: string;
      email: string;
    };
  }>("/", async (request, reply) => {
    const { name, email } = request.body;

    const [user] = await db
      .insert(users)
      .values({
        name,
        email,
      })
      .returning();

    return reply.status(201).send(user);
  });
}
