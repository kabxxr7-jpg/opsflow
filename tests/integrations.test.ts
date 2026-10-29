import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { rawDb } from "../lib/db";
import { env } from "../lib/env";
import { signPayload } from "../lib/webhooks";
import { POST as classifyPOST } from "../app/api/integrations/classify/route";
import { POST as callbackPOST } from "../app/api/integrations/n8n-callback/route";
import { assertLocalDb, dropOrgs, makeOrg } from "./helpers";

// The two inbound routes the n8n workflow calls. They're public (no session cookie) and guarded
// only by an HMAC, so the rejection paths matter as much as the happy one. The live model is
// never called here: /classify is only exercised up to the point it would reach Gemini.

const SECRET = env.N8N_CALLBACK_SECRET;

function signedRequest(url: string, body: string, opts: { secret?: string; timestamp?: string } = {}) {
  const timestamp = opts.timestamp ?? new Date().toISOString();
  return new NextRequest(`http://localhost${url}`, {
    method: "POST",
    body,
    headers: {
      "X-Webhook-Timestamp": timestamp,
      "X-Webhook-Signature": `sha256=${signPayload(opts.secret ?? SECRET, timestamp, body)}`,
    },
  });
}
const unsigned = (url: string, body: string) => new NextRequest(`http://localhost${url}`, { method: "POST", body });

const CLASSIFY = "/api/integrations/classify";
const CALLBACK = "/api/integrations/n8n-callback";

describe("POST /api/integrations/classify — rejection paths", () => {
  const body = JSON.stringify({ rawText: "My AC is making a grinding noise" });

  test("no signature -> 401", async () => {
    assert.equal((await classifyPOST(unsigned(CLASSIFY, body))).status, 401);
  });
  test("wrong secret -> 401", async () => {
    assert.equal((await classifyPOST(signedRequest(CLASSIFY, body, { secret: "not-the-secret" }))).status, 401);
  });
  test("stale timestamp (replay) -> 401", async () => {
    const stale = new Date(Date.now() - 10 * 60_000).toISOString();
    assert.equal((await classifyPOST(signedRequest(CLASSIFY, body, { timestamp: stale }))).status, 401);
  });
  test("a body changed after signing -> 401", async () => {
    const req = signedRequest(CLASSIFY, body);
    const tampered = new NextRequest(req.url, {
      method: "POST",
      body: JSON.stringify({ rawText: "something else entirely" }),
      headers: req.headers,
    });
    assert.equal((await classifyPOST(tampered)).status, 401);
  });
  test("correctly signed but not JSON -> 400, not a crash", async () => {
    const res = await classifyPOST(signedRequest(CLASSIFY, "this is not json"));
    assert.equal(res.status, 400);
  });
  test("correctly signed but empty or oversized text -> 400", async () => {
    assert.equal((await classifyPOST(signedRequest(CLASSIFY, JSON.stringify({ rawText: "   " })))).status, 400);
    assert.equal((await classifyPOST(signedRequest(CLASSIFY, JSON.stringify({ rawText: "x".repeat(5000) })))).status, 400);
    assert.equal((await classifyPOST(signedRequest(CLASSIFY, JSON.stringify({})))).status, 400);
  });
  test("a body over the size cap is refused before it's parsed -> 413", async () => {
    assert.equal((await classifyPOST(signedRequest(CLASSIFY, "x".repeat(70 * 1024)))).status, 413);
  });
});

describe("POST /api/integrations/n8n-callback", () => {
  // The route files tickets into the *oldest* organization. To make that deterministic — and to
  // avoid writing into (or racing with) whatever other data or test files are around — this suite
  // creates its own organization dated to the epoch, which is always the oldest.
  let target: Awaited<ReturnType<typeof makeOrg>>;
  let targetOrgId: string;

  before(async () => {
    assertLocalDb();
    target = await makeOrg("callback");
    targetOrgId = target.org.id;
    await rawDb.organization.update({ where: { id: targetOrgId }, data: { createdAt: new Date(0) } });
  });

  after(async () => {
    await dropOrgs(target?.org.id); // cascades to the tickets the route created
    await rawDb.$disconnect();
  });

  const payload = (over: Record<string, unknown> = {}) =>
    JSON.stringify({
      rawText: "Customer says the furnace has no heat and the house is freezing",
      source: "n8n",
      classification: "equipment_issue",
      priority: "HIGH",
      summary: "Furnace not heating.",
      confidence: 0.9,
      sourceSnippet: "furnace has no heat",
      ...over,
    });

  test("rejects unsigned, wrongly signed, stale and tampered requests", async () => {
    const body = payload();
    assert.equal((await callbackPOST(unsigned(CALLBACK, body))).status, 401);
    assert.equal((await callbackPOST(signedRequest(CALLBACK, body, { secret: "nope" }))).status, 401);
    const stale = new Date(Date.now() - 10 * 60_000).toISOString();
    assert.equal((await callbackPOST(signedRequest(CALLBACK, body, { timestamp: stale }))).status, 401);
    // signed for one body, sent with another
    const original = signedRequest(CALLBACK, body);
    const tampered = new NextRequest(original.url, { method: "POST", body: payload({ priority: "LOW" }), headers: original.headers });
    assert.equal((await callbackPOST(tampered)).status, 401);
  });

  test("rejects a signed body that isn't JSON, or doesn't match the schema, with 400", async () => {
    assert.equal((await callbackPOST(signedRequest(CALLBACK, "nope"))).status, 400);
    assert.equal((await callbackPOST(signedRequest(CALLBACK, payload({ classification: "made_up" })))).status, 400);
    assert.equal((await callbackPOST(signedRequest(CALLBACK, payload({ confidence: 2 })))).status, 400);
    assert.equal((await callbackPOST(signedRequest(CALLBACK, payload({ rawText: "x".repeat(5000) })))).status, 400);
    assert.equal((await callbackPOST(signedRequest(CALLBACK, payload({ source: "s".repeat(80) })))).status, 400);
  });

  test("a correctly signed, valid request creates a classified ticket in the organization", async () => {
    const res = await callbackPOST(signedRequest(CALLBACK, payload()));
    assert.equal(res.status, 201);
    const { id } = (await res.json()) as { id: string };
    const ticket = await rawDb.ticket.findUnique({ where: { id } });
    assert.ok(ticket);
    assert.equal(ticket.organizationId, targetOrgId);
    assert.equal(ticket.source, "n8n");
    assert.equal(ticket.classification, "equipment_issue");
    assert.equal(ticket.priority, "HIGH");
    assert.equal(ticket.sourceSnippet, "furnace has no heat");
    assert.equal(ticket.confidence, 0.9);
  });

  test("a grounding quote that isn't in the text is dropped and confidence is capped", async () => {
    const res = await callbackPOST(signedRequest(CALLBACK, payload({ sourceSnippet: "words the customer never said", confidence: 0.95 })));
    assert.equal(res.status, 201);
    const { id } = (await res.json()) as { id: string };
    const ticket = await rawDb.ticket.findUnique({ where: { id } });
    assert.equal(ticket?.sourceSnippet, null);
    assert.ok((ticket?.confidence ?? 1) <= 0.4);
  });

  test("an organization id in the body is ignored — the route decides where tickets go", async () => {
    const other = await makeOrg("callback-other");
    try {
      const res = await callbackPOST(signedRequest(CALLBACK, payload({ organizationId: other.org.id })));
      assert.equal(res.status, 201);
      const { id } = (await res.json()) as { id: string };
      const ticket = await rawDb.ticket.findUnique({ where: { id } });
      assert.equal(ticket?.organizationId, targetOrgId);
      assert.notEqual(ticket?.organizationId, other.org.id);
    } finally {
      await dropOrgs(other.org.id);
    }
  });
});
