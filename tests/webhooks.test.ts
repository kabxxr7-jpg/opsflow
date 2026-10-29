import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { rawDb, getOrgDb } from "../lib/db";
import { deliverWebhook, retryFailedDeliveries, signPayload, verifySignature } from "../lib/webhooks";
import { assertLocalDb, dropOrgs, makeOrg } from "./helpers";

type Fixture = Awaited<ReturnType<typeof makeOrg>>;
let F: Fixture;
let server: http.Server;
let base: string;
let respondWith = 200;
const received: { headers: http.IncomingHttpHeaders; body: string }[] = [];

before(async () => {
  assertLocalDb();
  F = await makeOrg("webhooks");
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      received.push({ headers: req.headers, body: Buffer.concat(chunks).toString("utf8") });
      res.statusCode = respondWith;
      res.end("ok");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await dropOrgs(F?.org.id);
  await rawDb.$disconnect();
});

const db = () => getOrgDb(F.org.id);
const SECRET = "test-signing-secret-123";

async function hook(targetUrl: string) {
  return rawDb.webhookConfig.create({ data: { organizationId: F.org.id, targetUrl, secret: SECRET, triggerOn: ["COMPLETED"] } });
}
function deliver(webhookConfigId: string, targetUrl: string, attemptNumber = 1) {
  return deliverWebhook(db(), {
    webhookConfigId,
    secret: SECRET,
    targetUrl,
    jobId: F.job.id,
    eventType: "job.status_changed",
    payload: { event: "job.status_changed", jobId: F.job.id },
    attemptNumber,
  });
}
const rows = (webhookConfigId: string) => rawDb.webhookDelivery.findMany({ where: { webhookConfigId }, orderBy: { createdAt: "asc" } });

describe("signing", () => {
  test("a signature verifies, and fails for a changed body, secret, or signature", () => {
    const ts = new Date().toISOString();
    const body = '{"a":1}';
    const header = `sha256=${signPayload(SECRET, ts, body)}`;
    assert.equal(verifySignature({ secret: SECRET, timestamp: ts, body, signatureHeader: header }), true);
    assert.equal(verifySignature({ secret: SECRET, timestamp: ts, body: '{"a":2}', signatureHeader: header }), false);
    assert.equal(verifySignature({ secret: "other-secret", timestamp: ts, body, signatureHeader: header }), false);
    // Flip the last hex digit to a *different* one (replacing it with a fixed "0" is a no-op 1 time in 16).
    const flipped = header.slice(0, -1) + (header.endsWith("0") ? "1" : "0");
    assert.notEqual(flipped, header);
    assert.equal(verifySignature({ secret: SECRET, timestamp: ts, body, signatureHeader: flipped }), false);
    assert.equal(verifySignature({ secret: SECRET, timestamp: ts, body, signatureHeader: null }), false);
  });

  test("a stale or unparseable timestamp is rejected (replay window)", () => {
    const body = "{}";
    const old = new Date(Date.now() - 10 * 60_000).toISOString();
    assert.equal(verifySignature({ secret: SECRET, timestamp: old, body, signatureHeader: `sha256=${signPayload(SECRET, old, body)}` }), false);
    assert.equal(verifySignature({ secret: SECRET, timestamp: "yesterday-ish", body, signatureHeader: `sha256=${signPayload(SECRET, "yesterday-ish", body)}` }), false);
  });
});

describe("delivery", () => {
  test("posts a signed request a receiver can verify, and logs a successful attempt", async () => {
    received.length = 0;
    respondWith = 200;
    const url = `${base}/hook`;
    const cfg = await hook(url);

    assert.equal(await deliver(cfg.id, url), true);

    assert.equal(received.length, 1);
    const { headers, body } = received[0];
    assert.equal(headers["user-agent"], "Opsflow-Webhooks/1.0");
    assert.equal(headers["x-webhook-event"], "job.status_changed");
    assert.equal(
      verifySignature({
        secret: SECRET,
        timestamp: String(headers["x-webhook-timestamp"]),
        body,
        signatureHeader: String(headers["x-webhook-signature"]),
      }),
      true,
      "the receiver must be able to verify what we sent"
    );

    const [row] = await rows(cfg.id);
    assert.equal(row.success, true);
    assert.equal(row.statusCode, 200);
    assert.equal(row.nextRetryAt, null);
    assert.equal(row.organizationId, F.org.id);
  });

  test("a failing receiver schedules a retry, and the third failure gives up", async () => {
    respondWith = 500;
    const url = `${base}/flaky`;
    const cfg = await hook(url);

    assert.equal(await deliver(cfg.id, url, 1), false);
    assert.equal(await deliver(cfg.id, url, 3), false);

    const [first, third] = await rows(cfg.id);
    assert.equal(first.success, false);
    assert.equal(first.statusCode, 500);
    assert.ok(first.nextRetryAt, "attempt 1 must schedule attempt 2");
    assert.equal(third.nextRetryAt, null, "attempt 3 must not schedule another");
    respondWith = 200;
  });

  test("an unreachable endpoint is a logged failure, not an exception", async () => {
    const url = "http://127.0.0.1:1/nothing-listens-here";
    const cfg = await hook(url);
    assert.equal(await deliver(cfg.id, url), false);
    const [row] = await rows(cfg.id);
    assert.equal(row.success, false);
    assert.equal(row.statusCode, null);
    assert.ok(row.errorMessage);
  });
});

describe("SSRF: the delivery path refuses internal targets and never sends a request", () => {
  for (const url of ["https://169.254.169.254/latest/meta-data/", "https://10.0.0.5/admin", "https://192.168.1.1/", "http://example.com/plain-http", "ftp://example.com/x"]) {
    test(`blocks ${url}`, async () => {
      received.length = 0;
      const cfg = await hook(url);
      assert.equal(await deliver(cfg.id, url), false);
      const [row] = await rows(cfg.id);
      assert.equal(row.success, false);
      assert.equal(row.statusCode, null);
      assert.equal(row.nextRetryAt, null, "a blocked target must not be retried — retrying can't make it safe");
      assert.equal(received.length, 0);
    });
  }
});

describe("retry sweep", () => {
  test("retries a due failure exactly once, and the failed row stops being due", async () => {
    received.length = 0;
    const url = `${base}/retry-me`;
    const cfg = await hook(url);

    respondWith = 500;
    await deliver(cfg.id, url, 1);
    await rawDb.webhookDelivery.updateMany({ where: { webhookConfigId: cfg.id }, data: { nextRetryAt: new Date(Date.now() - 1000) } });

    respondWith = 200;
    assert.deepEqual(await retryFailedDeliveries(db()), { attempted: 1 });
    assert.equal(received.length, 2, "one original attempt + one retry");

    // The event is now delivered. A second sweep must not send it again.
    assert.deepEqual(await retryFailedDeliveries(db()), { attempted: 0 });
    assert.equal(received.length, 2);

    const all = await rows(cfg.id);
    assert.deepEqual(all.map((r) => [r.attemptNumber, r.success]), [[1, false], [2, true]]);
  });

  test("skips endpoints that have been switched off", async () => {
    const url = `${base}/paused`;
    const cfg = await hook(url);
    respondWith = 500;
    await deliver(cfg.id, url, 1);
    respondWith = 200;
    await rawDb.webhookDelivery.updateMany({ where: { webhookConfigId: cfg.id }, data: { nextRetryAt: new Date(Date.now() - 1000) } });
    await rawDb.webhookConfig.update({ where: { id: cfg.id }, data: { isActive: false } });
    const before = received.length;
    await retryFailedDeliveries(db());
    assert.equal(received.length, before);
  });
});
