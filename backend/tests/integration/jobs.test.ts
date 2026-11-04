import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { JobLockRepository } from "../../src/modules/system/repositories/job-lock.repository.js";
import { JobScheduler } from "../../src/modules/system/services/job-scheduler.service.js";
import type { JobTask } from "../../src/modules/system/types/system.types.js";
import { createTestApp, registerUser, type TestContext, type TestUser, unique } from "./support/test-app.js";

describe("tarefas agendadas com trava no banco", () => {
  let ctx: TestContext;
  let admin: TestUser;
  const adminEmail = `${unique("admin")}@teste.com`;

  beforeAll(async () => {
    ctx = await createTestApp({ ADMIN_EMAILS: adminEmail });
    admin = await registerUser(ctx.app, { email: adminEmail });
  });

  afterAll(async () => {
    await admin.api.put("/api/admin/maintenance", { enabled: false });
    await ctx.close();
  });

  function scheduler(tasks: JobTask[]): JobScheduler {
    const { container } = ctx;
    return new JobScheduler(tasks, new JobLockRepository(container.db), container.services.maintenance, ctx.clock, container.eventLog);
  }

  it("outra instância pula a tarefa enquanto a primeira segura a trava", async () => {
    const name = unique("job");
    let release!: () => void;
    const holding = new Promise<void>((resolve) => (release = resolve));
    let started!: () => void;
    const hasStarted = new Promise<void>((resolve) => (started = resolve));

    const slow = scheduler([
      {
        name,
        run: async () => {
          started();
          await holding;
          return { processed: 1 };
        },
      },
    ]);
    const other = scheduler([{ name, run: async () => ({ processed: 99 }) }]);

    const first = slow.runOnce();
    await hasStarted;
    const second = await other.runOnce();
    expect(second.results).toEqual([{ job: name, processed: 0, skipped: true, failed: false, reason: "locked" }]);

    release();
    expect((await first).results).toEqual([{ job: name, processed: 1, skipped: false, failed: false, reason: null }]);
    // Liberada a trava, a outra instância volta a rodar.
    expect((await other.runOnce()).results[0]).toMatchObject({ processed: 99, skipped: false });
  });

  it("tarefa que falha não impede as seguintes e fica registrada", async () => {
    const failing = unique("falha");
    const result = await scheduler([
      {
        name: failing,
        run: async () => {
          throw new Error("quebrou");
        },
      },
      { name: unique("ok"), run: async () => ({ processed: 2 }) },
    ]).runOnce();
    expect(result.results.map((r) => [r.failed, r.processed])).toEqual([
      [true, 0],
      [false, 2],
    ]);
    await ctx.container.eventLog.flush();
    const logs = (await admin.api.get("/api/admin/logs?event=system.job_failed")).json().data;
    expect(logs.some((log: { context: { job: string } }) => log.context.job === failing)).toBe(true);
  });

  it("em manutenção, nenhuma tarefa roda", async () => {
    let ran = false;
    const jobs = scheduler([
      {
        name: unique("bloqueada"),
        run: async () => {
          ran = true;
          return { processed: 1 };
        },
      },
    ]);
    await admin.api.put("/api/admin/maintenance", { enabled: true });
    try {
      const result = await jobs.runOnce();
      expect(result.results[0]).toMatchObject({ skipped: true, reason: "maintenance" });
      expect(ran).toBe(false);
    } finally {
      await admin.api.put("/api/admin/maintenance", { enabled: false });
    }
  });

  it("POST /api/admin/jobs/run: só administradores", async () => {
    const user = await registerUser(ctx.app);
    expect((await user.api.post("/api/admin/jobs/run")).statusCode).toBe(403);
    const anonymous = await ctx.app.inject({ method: "POST", url: "/api/admin/jobs/run" });
    expect(anonymous.statusCode).toBe(401);
    const run = await admin.api.post("/api/admin/jobs/run");
    expect(run.statusCode).toBe(200);
    expect(run.json()).toMatchObject({ ranAt: expect.any(String), results: expect.any(Array) });
  });

  it("intervalo 0 não agenda", () => {
    const cancel = scheduler([]).schedule(0);
    expect(cancel()).toBeUndefined();
  });
});
