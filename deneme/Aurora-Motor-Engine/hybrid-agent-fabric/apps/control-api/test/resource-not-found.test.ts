/**
 * `ResourceNotFoundError` → 404, through the real error handler.
 *
 * Six `GET /v1/…/:id` routes answered 500 for an id that simply did not exist,
 * because the engine threw a plain `Error` and the only way the handler could
 * have told "no such id" from a real malfunction was to match on the message
 * text. Measured before this change:
 *
 *   /v1/automations/:id                        500 HAF-8001
 *   /v1/checkpoints/:id                        500 HAF-8001
 *   /v1/decisions/:id                          500 HAF-8001
 *   /v1/detached-workers/:id                   500 HAF-8001
 *   /v1/plans/:id                              500 HAF-8001
 *   /v1/society/authority/templates/:id        500 HAF-8001
 *
 * `RESOURCE_NOT_FOUND` (HAF-7001, 404) was already in the registry and used by
 * nothing but the Fastify not-found handler — the same shape of gap the
 * `SessionNotFoundError` comment describes.
 */
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { ResourceNotFoundError } from "@haf/engine";
import { AppError, ErrorCodes, registerErrorHandler } from "../src/middleware/error-handler.js";

async function appThatThrows(error: unknown) {
  const app = Fastify({ logger: false });
  await registerErrorHandler(app);
  app.get("/boom", async () => {
    throw error;
  });
  return app;
}

describe("ResourceNotFoundError", () => {
  it("answers 404 RESOURCE_NOT_FOUND instead of 500", async () => {
    const app = await appThatThrows(new ResourceNotFoundError("automation", "auto-1"));
    const response = await app.inject({ method: "GET", url: "/boom" });
    expect(response.statusCode).toBe(ErrorCodes.RESOURCE_NOT_FOUND.status);
    expect(response.statusCode).toBe(404);
    const body = response.json();
    expect(body.error.code).toBe("HAF-7001");
    expect(body.error.details.resource).toBe("automation");
    expect(body.error.details.id).toBe("auto-1");
    await app.close();
  });

  it("names the tenant when the lookup was tenant-scoped, without changing the status", async () => {
    const app = await appThatThrows(new ResourceNotFoundError("decision", "dec-9", "tenant-b"));
    const response = await app.inject({ method: "GET", url: "/boom" });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.message).toContain("tenant-b");
    await app.close();
  });

  it("carries the facts as fields, so rewording the message cannot change the status code", async () => {
    const error = new ResourceNotFoundError("checkpoint", "cp-1", "local");
    expect(error.name).toBe("ResourceNotFoundError");
    expect(error.resource).toBe("checkpoint");
    expect(error.id).toBe("cp-1");
    expect(error.tenantId).toBe("local");
    expect(error).toBeInstanceOf(Error);
  });

  it("leaves a genuine malfunction at 500", async () => {
    // The point of typing the error: a real failure must still look like one.
    const app = await appThatThrows(new Error("connection refused"));
    const response = await app.inject({ method: "GET", url: "/boom" });
    expect(response.statusCode).toBe(500);
    expect(response.json().error.code).toBe("HAF-8001");
    await app.close();
  });
});

describe("ResourceNotFoundError — optional diagnostics", () => {
  it("surfaces the tenant and the 'what to do instead' hint as fields, still 404", async () => {
    const app = await appThatThrows(
      new ResourceNotFoundError("harness-entry", "prompt-note:ghost", "tenant-a", "Use create instead."),
    );
    const response = await app.inject({ method: "GET", url: "/boom" });
    expect(response.statusCode).toBe(404);
    const body = response.json();
    expect(body.error.code).toBe("HAF-7001");
    expect(body.error.details.resource).toBe("harness-entry");
    expect(body.error.details.id).toBe("prompt-note:ghost");
    expect(body.error.details.resourceTenantId).toBe("tenant-a");
    expect(body.error.details.hint).toBe("Use create instead.");
    await app.close();
  });

  it("omits the optional fields rather than sending undefined when they are absent", async () => {
    const app = await appThatThrows(new ResourceNotFoundError("entity", "entity-9"));
    const response = await app.inject({ method: "GET", url: "/boom" });
    const details = response.json().error.details;
    expect(details.resource).toBe("entity");
    expect("resourceTenantId" in details).toBe(false);
    expect("hint" in details).toBe(false);
    await app.close();
  });

  it("answers 404 for a workspace file that is not there", async () => {
    // `GET /v1/sessions/:id/file` used to wrap every capability failure in
    // SESSION_EXECUTION_FAILED, so a missing file answered 500 HAF-3005 — the
    // same "go read the server logs about your own typo" problem as the routes
    // above. The path carried in the reason is the one the caller asked for; the
    // underlying ENOENT message holds the absolute location of the workspace on
    // this machine and must not be the thing a remote caller reads.
    const absolute = "/srv/haf/workspaces/6f1c/session-file.txt";
    const app = await appThatThrows(
      new AppError("RESOURCE_NOT_FOUND", {
        sessionId: "6f1c",
        capabilityId: "filesystem.read",
        path: "session-file.txt",
        reason: "the requested path does not exist in this session's workspace",
      }, Object.assign(new Error(`ENOENT: no such file or directory, realpath '${absolute}'`), { code: "ENOENT" })),
    );
    const response = await app.inject({ method: "GET", url: "/boom" });
    expect(response.statusCode).toBe(404);
    const body = response.json();
    expect(body.error.code).toBe("HAF-7001");
    expect(body.error.details.path).toBe("session-file.txt");
    expect(response.body).not.toContain("/srv/haf");
    await app.close();
  });
});
