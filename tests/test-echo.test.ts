import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { rawDb } from "../lib/db";
import { signPayload } from "../lib/webhooks";
import { POST } from "../app/api/integrations/test-echo/route";
import { assertLocalDb, dropOrgs, makeOrg } from "./helpers";

// The built-in receiver is what makes the sign -> deliver -> verify loop demonstrable end to
// end, so it has to actually reject what it should — a receiver that answers 200 to anything
// would make that demonstration meaningless.

const SECRET = "echo-test-secret-456";
let F: Awaited<ReturnType<typeof makeOrg>>;

before(async () => {
  assertLocalDb();
  F = await makeOrg("echo");
  await rawDb.webhookConfig.create({
    data: { organizationId: F.org.id, targetUrl: "https://demo.invalid/api/integrations/test-echo", secret: SECRET, triggerOn: ["COMPLETED"] },
  });
});
after(async () => {
  await dropOrgs(F?.org.id);
  await rawDb.$disconnect();
});

function request(body: string, headers: Record<string, string>) {
  return new NextRequest("http://localhost/api/integrations/test-echo", { method: "POST", body, headers });
}
function signed(body: string, secret = SECRET, ts = new Date().toISOString()) {
  return { "X-Webhook-Timestamp": ts, "X-Webhook-Signature": `sha256=${signPayload(secret, ts, body)}` };
}

describe("POST /api/integrations/test-echo", () => {
  const body = JSON.stringify({ event: "job.status_changed", jobId: "j1" });

  test("accepts a correctly signed delivery", async () => {
    const res = await POST(request(body, signed(body)));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { received: true, verified: true });
  });

  test("rejects a signature made with the wrong secret", async () => {
    assert.equal((await POST(request(body, signed(body, "not-the-secret")))).status, 401);
  });

  test("rejects a body that was changed after signing", async () => {
    assert.equal((await POST(request(body.replace("j1", "j2"), signed(body)))).status, 401);
  });

  test("rejects a replayed (stale) delivery", async () => {
    const stale = new Date(Date.now() - 10 * 60_000).toISOString();
    assert.equal((await POST(request(body, signed(body, SECRET, stale)))).status, 401);
  });

  test("rejects requests with no signature headers at all", async () => {
    assert.equal((await POST(request(body, {}))).status, 401);
    assert.equal((await POST(request(body, { "X-Webhook-Timestamp": new Date().toISOString() }))).status, 401);
  });

  test("the 401 doesn't say which check failed", async () => {
    const res = await POST(request(body, signed(body, "nope")));
    assert.deepEqual(await res.json(), { error: "Invalid or missing signature." });
  });

  test("refuses oversized payloads before reading them", async () => {
    const big = "x".repeat(70 * 1024);
    assert.equal((await POST(request(big, { ...signed(big), "content-length": String(big.length) }))).status, 413);
  });
});
