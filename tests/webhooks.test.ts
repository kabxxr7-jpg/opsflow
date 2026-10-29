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
function deliver(webhookConfigId: string, targetUrl: string, attemptNumber = 1, options?: { timeoutMs?: number }) {
  return deliverWebhook(
    db(),
    {
      webhookConfigId,
      secret: SECRET,
      targetUrl,
      jobId: F.job.id,
      eventType: "job.status_changed",
      payload: { event: "job.status_changed", jobId: F.job.id },
      attemptNumber,
    },
    options
  );
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
      const cfg = await hook(url);
      assert.equal(await deliver(cfg.id, url), false);
      const [row] = await rows(cfg.id);
      assert.equal(row.success, false);
      assert.equal(row.statusCode, null);
      assert.equal(row.nextRetryAt, null, "a blocked target must not be retried — retrying can't make it safe");
      assert.match(row.errorMessage ?? "", /https|private|internal|standard web port/i);
    });
  }
});

describe("a hostile endpoint can't hold a delivery open", () => {
  const servers: http.Server[] = [];
  const listen = async (handler: http.RequestListener) => {
    const srv = http.createServer(handler);
    servers.push(srv);
    await new Promise<void>((resolve) => srv.listen(0, "127.0.0.1", resolve));
    return `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  };
  after(async () => {
    for (const srv of servers) {
      srv.closeAllConnections();
      await new Promise((resolve) => srv.close(resolve));
    }
  });

  test("an endpoint that trickles a byte forever is cut off at the deadline", async () => {
    const url = await listen((req, res) => {
      req.resume();
      req.on("end", () => {
        res.writeHead(200);
        const timer = setInterval(() => res.write("x"), 50); // every byte resets an idle timer
        res.on("close", () => clearInterval(timer));
      });
    });
    const cfg = await hook(url);

    const started = Date.now();
    assert.equal(await deliver(cfg.id, url, 1, { timeoutMs: 700 }), false);
    const elapsed = Date.now() - started;

    assert.ok(elapsed < 3000, `delivery should give up near the deadline, took ${elapsed}ms`);
    const [row] = await rows(cfg.id);
    assert.equal(row.success, false);
    assert.match(row.errorMessage ?? "", /timed out/i);
  });

  test("a response that never stops is read only up to the cap, then dropped", async () => {
    const url = await listen((req, res) => {
      req.resume();
      req.on("end", () => {
        res.writeHead(200);
        const chunk = Buffer.alloc(16 * 1024, "a");
        const timer = setInterval(() => res.write(chunk), 5);
        res.on("close", () => clearInterval(timer));
      });
    });
    const cfg = await hook(url);

    const started = Date.now();
    assert.equal(await deliver(cfg.id, url, 1, { timeoutMs: 4000 }), true, "a 2xx is still a success");
    assert.ok(Date.now() - started < 2500, "must stop reading instead of draining the body");

    const [row] = await rows(cfg.id);
    assert.equal(row.statusCode, 200);
    assert.ok((row.responseBody ?? "").length <= 2000, "only a short snippet is stored");
  });

  test("a server that accepts the connection and says nothing is cut off too", async () => {
    const url = await listen((req) => {
      req.resume(); // never respond
    });
    const cfg = await hook(url);
    const started = Date.now();
    assert.equal(await deliver(cfg.id, url, 1, { timeoutMs: 500 }), false);
    assert.ok(Date.now() - started < 2500);
    const [row] = await rows(cfg.id);
    assert.match(row.errorMessage ?? "", /timed out/i);
  });
});

describe("retry sweep", () => {
  // Its own organization: the sweep reads every due row in the org, so sharing one with the tests
  // above would let their (not-yet-due) failures leak into the counts here.
  let R: Fixture;
  before(async () => {
    R = await makeOrg("webhooks-retry");
  });
  after(async () => {
    await dropOrgs(R?.org.id);
  });

  const rdb = () => getOrgDb(R.org.id);
  const mkHook = (targetUrl: string, isActive = true) =>
    rawDb.webhookConfig.create({ data: { organizationId: R.org.id, targetUrl, secret: SECRET, triggerOn: ["COMPLETED"], isActive } });
  const failedDelivery = (webhookConfigId: string, over: { createdAt?: Date; nextRetryAt?: Date | null } = {}) =>
    rawDb.webhookDelivery.create({
      data: {
        organizationId: R.org.id,
        webhookConfigId,
        jobId: R.job.id,
        eventType: "job.status_changed",
        payload: { event: "job.status_changed", jobId: R.job.id },
        attemptNumber: 1,
        success: false,
        statusCode: 500,
        errorMessage: "Non-2xx response: 500",
        nextRetryAt: over.nextRetryAt === undefined ? new Date(Date.now() - 1000) : over.nextRetryAt,
        ...(over.createdAt ? { createdAt: over.createdAt } : {}),
      },
    });
  const rowsOf = (webhookConfigId: string) => rawDb.webhookDelivery.findMany({ where: { webhookConfigId }, orderBy: { createdAt: "asc" } });

  test("retries a due failure exactly once, and the failed row stops being due", async () => {
    received.length = 0;
    respondWith = 200;
    const cfg = await mkHook(`${base}/retry-me`);
    await failedDelivery(cfg.id);

    assert.deepEqual(await retryFailedDeliveries(rdb()), { attempted: 1 });
    assert.equal(received.length, 1, "one retry sent");

    // The event is now delivered. A second sweep must not send it again.
    assert.deepEqual(await retryFailedDeliveries(rdb()), { attempted: 0 });
    assert.equal(received.length, 1);

    const all = await rowsOf(cfg.id);
    assert.deepEqual(all.map((r) => [r.attemptNumber, r.success]), [[1, false], [2, true]]);
  });

  test("failures for a paused endpoint wait; they aren't sent, and they aren't thrown away", async () => {
    received.length = 0;
    const cfg = await mkHook(`${base}/paused`, false);
    const failure = await failedDelivery(cfg.id);

    assert.deepEqual(await retryFailedDeliveries(rdb()), { attempted: 0 });
    assert.equal(received.length, 0);
    assert.ok((await rawDb.webhookDelivery.findUnique({ where: { id: failure.id } }))?.nextRetryAt, "still pending");

    // Switched back on soon after: now it goes out.
    await rawDb.webhookConfig.update({ where: { id: cfg.id }, data: { isActive: true } });
    assert.deepEqual(await retryFailedDeliveries(rdb()), { attempted: 1 });
    assert.equal(received.length, 1);
  });

  test("a failure that's gone stale is closed out instead of re-sent when the endpoint comes back", async () => {
    received.length = 0;
    const longAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const cfg = await mkHook(`${base}/stale`, false);
    const failure = await failedDelivery(cfg.id, { createdAt: longAgo });

    await rawDb.webhookConfig.update({ where: { id: cfg.id }, data: { isActive: true } });
    assert.deepEqual(await retryFailedDeliveries(rdb()), { attempted: 0 });
    assert.equal(received.length, 0, "a week-old notification is noise, not news");
    assert.equal((await rawDb.webhookDelivery.findUnique({ where: { id: failure.id } }))?.nextRetryAt, null, "and it stops being due");
  });

  test("deliveries that aren't due yet are left alone", async () => {
    received.length = 0;
    const cfg = await mkHook(`${base}/not-yet`);
    await failedDelivery(cfg.id, { nextRetryAt: new Date(Date.now() + 60_000) });
    assert.deepEqual(await retryFailedDeliveries(rdb()), { attempted: 0 });
    assert.equal(received.length, 0);
  });
});
