import crypto from "node:crypto";
import http from "node:http";
import https from "node:https";
import type { JobStatus, Prisma } from "@prisma/client";
import type { ScopedDb } from "@/lib/db";
import { parseWebhookTarget, safeLookup } from "@/lib/safe-url";

export interface JobStatusChangeEvent {
  jobId: string;
  jobType: string;
  customerName: string;
  fromStatus: JobStatus | null;
  toStatus: JobStatus;
}

/**
 * Signs `timestamp + "." + body` (not just the body) so a receiver can enforce a replay
 * window, not just authenticity. Receivers should recompute this HMAC over the raw request
 * body and the `X-Webhook-Timestamp` header, then compare with `crypto.timingSafeEqual`
 * (never `===`, which is vulnerable to timing attacks).
 */
export function signPayload(secret: string, timestamp: string, body: string): string {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

/**
 * Verifies an inbound signed request the same way an outbound receiver would verify ours —
 * one shared implementation so signing and verifying don't drift into two mental models.
 * Also rejects timestamps older than `maxAgeMs` (default 5 minutes) to close the replay window.
 */
export function verifySignature(params: {
  secret: string;
  timestamp: string;
  body: string;
  signatureHeader: string | null;
  maxAgeMs?: number;
}): boolean {
  const { secret, timestamp, body, signatureHeader, maxAgeMs = 5 * 60_000 } = params;
  if (!signatureHeader) return false;

  const receivedAt = Date.parse(timestamp);
  if (Number.isNaN(receivedAt) || Date.now() - receivedAt > maxAgeMs) return false;

  const expected = signPayload(secret, timestamp, body);
  const expectedHeader = `sha256=${expected}`;

  const a = Buffer.from(expectedHeader);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Backoff schedule for the attempt that just failed: attempt 1 fails -> retry (attempt 2)
 * in 30s; attempt 2 fails -> retry (attempt 3) in 5min; attempt 3 fails -> give up.
 */
function nextRetryDelayMs(failedAttemptNumber: number): number | null {
  if (failedAttemptNumber === 1) return 30_000;
  if (failedAttemptNumber === 2) return 5 * 60_000;
  return null;
}

const DELIVERY_TIMEOUT_MS = 5000;
const MAX_RESPONSE_BYTES = 4096;

/**
 * One POST over node's http(s) rather than fetch, for two reasons that both matter for an
 * outbound request to a user-supplied address: `lookup: safeLookup` validates the resolved IPs at
 * connect time (see lib/safe-url.ts), and http(s).request never follows redirects, so a
 * "public" URL can't bounce the request somewhere internal.
 *
 * Two limits keep a hostile endpoint from holding the caller hostage. The whole exchange — connect,
 * TLS, response — gets one hard deadline; `http.request`'s own `timeout` option is only an *idle*
 * timer that any received byte resets, so an endpoint dripping a byte every few seconds would
 * never trip it. And the response is read only up to a cap, then dropped: we keep a snippet for
 * the delivery log, not whatever the other side feels like sending.
 */
function postJson(
  target: URL,
  headers: Record<string, string>,
  body: string,
  timeoutMs: number
): Promise<{ statusCode: number; text: string }> {
  return new Promise((resolve, reject) => {
    const transport = target.protocol === "https:" ? https : http;
    let settled = false;
    const timer: { id?: ReturnType<typeof setTimeout> } = {};
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer.id);
      fn();
    };

    const req = transport.request(
      target,
      {
        method: "POST",
        headers: { ...headers, "Content-Length": String(Buffer.byteLength(body)) },
        lookup: safeLookup,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let received = 0;
        const finish = () =>
          settle(() => resolve({ statusCode: res.statusCode ?? 0, text: Buffer.concat(chunks).toString("utf8").slice(0, 2000) }));
        res.on("data", (chunk: Buffer) => {
          if (received < MAX_RESPONSE_BYTES) chunks.push(chunk);
          received += chunk.length;
          // Enough to log. Stop reading rather than draining an endless body; the status line has
          // already told us what we need to know.
          if (received >= MAX_RESPONSE_BYTES) {
            finish();
            res.destroy();
          }
        });
        res.on("end", finish);
        res.on("close", finish);
        res.on("error", (err) => settle(() => reject(err)));
      }
    );

    timer.id = setTimeout(() => req.destroy(new Error(`Timed out after ${timeoutMs / 1000}s`)), timeoutMs);
    req.on("error", (err) => settle(() => reject(err)));
    req.end(body);
  });
}

export async function deliverWebhook(
  db: ScopedDb,
  params: {
    webhookConfigId: string;
    secret: string;
    targetUrl: string;
    jobId: string | null;
    eventType: string;
    payload: Prisma.InputJsonValue;
    attemptNumber: number;
  },
  options: { timeoutMs?: number } = {}
): Promise<boolean> {
  const { webhookConfigId, secret, targetUrl, jobId, eventType, payload, attemptNumber } = params;
  const body = JSON.stringify(payload);
  const timestamp = new Date().toISOString();
  const signature = signPayload(secret, timestamp, body);

  const start = Date.now();
  let statusCode: number | null = null;
  let responseBody: string | null = null;
  let success = false;
  let errorMessage: string | null = null;
  // A target that fails the safety checks is never retried — retrying can't make it safe.
  let retryable = true;

  try {
    // Re-validated on every attempt, not just when the endpoint was saved: a config written
    // before these checks existed, or edited directly in the database, gets no free pass.
    let target: URL;
    try {
      target = parseWebhookTarget(targetUrl);
    } catch (err) {
      retryable = false;
      throw err;
    }
    const res = await postJson(
      target,
      {
        "Content-Type": "application/json",
        "User-Agent": "Opsflow-Webhooks/1.0",
        "X-Webhook-Signature": `sha256=${signature}`,
        "X-Webhook-Timestamp": timestamp,
        "X-Webhook-Event": eventType,
      },
      body,
      options.timeoutMs ?? DELIVERY_TIMEOUT_MS
    );
    statusCode = res.statusCode;
    responseBody = res.text;
    success = statusCode >= 200 && statusCode < 300;
    if (!success) {
      errorMessage = `Non-2xx response: ${statusCode}`;
    }
  } catch (err) {
    if ((err as Error)?.name === "UnsafeUrlError") retryable = false;
    errorMessage = err instanceof Error ? err.message : "Unknown delivery error";
  }

  const durationMs = Date.now() - start;

  await db.webhookDelivery.create({
    data: {
      webhookConfigId,
      jobId,
      organizationId: "", // overwritten unconditionally by the org-scope extension (lib/db.ts)
      eventType,
      payload,
      attemptNumber,
      statusCode,
      responseBody,
      success,
      errorMessage,
      durationMs,
      nextRetryAt: (() => {
        if (success || !retryable) return null;
        const delay = nextRetryDelayMs(attemptNumber);
        return delay != null ? new Date(Date.now() + delay) : null;
      })(),
    },
  });

  return success;
}

/**
 * A failed delivery stops being worth retrying after this long. The sweep runs once a day on
 * Vercel's Hobby plan, so this has to comfortably cover "failed yesterday, retried today" — but a
 * week-old "job completed" notification delivered the moment someone un-pauses an endpoint is noise.
 */
const MAX_RETRY_AGE_MS = 36 * 60 * 60 * 1000;

/**
 * Cron-driven retry sweep: re-attempts failed deliveries whose backoff window has elapsed.
 * Decoupled from the original request so delivery isn't bound by a serverless function's
 * execution window, and a receiver's transient outage doesn't permanently drop an event.
 *
 * Note the 30s / 5min backoff is a floor, not a schedule: the sweep itself only runs when the cron
 * does, so a delivery is retried at the first sweep after it becomes eligible.
 */
export async function retryFailedDeliveries(db: ScopedDb): Promise<{ attempted: number }> {
  const due = await db.webhookDelivery.findMany({
    where: { success: false, attemptNumber: { lt: 3 }, nextRetryAt: { lte: new Date() } },
    include: { webhookConfig: true },
  });

  // Matching on the nextRetryAt we read means two overlapping sweeps can't both claim a row.
  const claim = (d: { id: string; nextRetryAt: Date | null }) =>
    db.webhookDelivery.updateMany({ where: { id: d.id, nextRetryAt: d.nextRetryAt }, data: { nextRetryAt: null } });

  let attempted = 0;
  for (const delivery of due) {
    // Too old to be worth sending: close it out so it stops being "due" (and can't resurface when
    // a paused endpoint is switched back on weeks later).
    if (Date.now() - delivery.createdAt.getTime() > MAX_RETRY_AGE_MS) {
      await claim(delivery);
      continue;
    }
    // A paused endpoint's failures stay pending (until they age out above), so pausing for an hour
    // doesn't throw the events away.
    if (!delivery.webhookConfig.isActive) continue;

    // Claim the row before retrying it. The failed attempt stays in the log as history, but it
    // must stop being "due": otherwise every later sweep would pick it up again and re-send an
    // event that a subsequent attempt already delivered.
    if ((await claim(delivery)).count === 0) continue;

    attempted += 1;
    try {
      await deliverWebhook(db, {
        webhookConfigId: delivery.webhookConfigId,
        secret: delivery.webhookConfig.secret,
        targetUrl: delivery.webhookConfig.targetUrl,
        jobId: delivery.jobId,
        eventType: delivery.eventType,
        payload: delivery.payload as Prisma.InputJsonValue,
        attemptNumber: delivery.attemptNumber + 1,
      });
    } catch (err) {
      // deliverWebhook records its own failures; reaching here means the attempt couldn't even be
      // logged (the database was unhappy). Put the row back in the queue instead of losing the event.
      console.error("retryFailedDeliveries: delivery threw", err);
      await db.webhookDelivery
        .updateMany({ where: { id: delivery.id, nextRetryAt: null }, data: { nextRetryAt: delivery.nextRetryAt } })
        .catch(() => {});
    }
  }

  return { attempted };
}

export async function triggerWebhooksForJobStatusChange(db: ScopedDb, event: JobStatusChangeEvent): Promise<void> {
  const configs = await db.webhookConfig.findMany({
    where: { isActive: true, triggerOn: { has: event.toStatus } },
  });

  if (configs.length === 0) return;

  const eventType = "job.status_changed";
  const payload = {
    event: eventType,
    jobId: event.jobId,
    jobType: event.jobType,
    customerName: event.customerName,
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    timestamp: new Date().toISOString(),
  };

  await Promise.all(
    configs.map((config) =>
      deliverWebhook(db, {
        webhookConfigId: config.id,
        secret: config.secret,
        targetUrl: config.targetUrl,
        jobId: event.jobId,
        eventType,
        payload,
        attemptNumber: 1,
      })
    )
  );
}
