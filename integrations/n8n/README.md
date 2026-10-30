# Opsflow Ticket Intake: n8n workflow

An importable n8n workflow that receives a customer inquiry, gets it classified by Opsflow's own
AI pipeline, and either creates the ticket or routes it to manual review depending on confidence.
It calls the same endpoints Opsflow's own UI uses, so there is no duplicate logic and no second AI
integration to maintain.

> **Status: hand-written, and run in n8n Cloud on 2026-10-30.** The workflow file was written by
> hand. Its signing code and every request it makes were checked against Opsflow's real verifier,
> and it has now been executed in a real n8n Cloud instance, both branches (see "Run record" at the
> bottom). Those were manual-mode runs of the imported file. It has not been activated as a
> production webhook or run at any volume.

## What it does

```
Webhook (POST /ticket-intake)
  -> Config: URL and Secret      (Set: the Opsflow URL and shared secret, typed once in the n8n UI)
  -> Validate Payload            (Code: rejects empty/malformed rawText before anything else runs)
  -> Sign Classify Request       (Code: HMAC-SHA256, same scheme Opsflow verifies)
  -> Call Opsflow: Classify      (HTTP Request -> POST /api/integrations/classify)
  -> Merge Classification        (Code: recombines the AI result with the original rawText/source)
  -> IF: Confidence >= 0.7
      |- true  -> Sign Callback Request -> Call Opsflow: Create Ticket (POST /api/integrations/n8n-callback)
      |           -> Mark Ticket Created (Set)
      '- false -> Flag for Manual Review (Set: pending_manual_review, does NOT create a ticket)
  -> Respond to Webhook
```

## Why each node is there

- **Config: URL and Secret** keeps the two values you must edit in one obvious place. The workflow
  does not read n8n environment variables or Variables, because those are not dependable on an
  n8n Cloud trial (environment access is blocked in Code nodes there, and Variables are a paid
  feature at the time of writing; check your plan if you want to move the values there).
- **Validate Payload** fails fast and explicitly on a malformed request, rather than letting a
  missing `rawText` produce a confusing error from the classify endpoint. It also enforces the
  limits Opsflow enforces (4000 characters of text, 40 of source).
- **Sign Classify Request / Sign Callback Request** are separate Code nodes because each signs a
  different body at a different point in the flow. The signature covers the exact bytes sent, so it
  is computed right before each HTTP Request node, and that node sends the signed string as a raw
  body (`Body Content Type: Raw`) so n8n cannot re-serialise it and change the bytes.
- **IF: Confidence >= 0.7** is the guardrail. Low-confidence classifications do not silently become
  tickets; they are flagged for a person. "AI recommends, a person decides" is an actual branch.
- **Respond to Webhook** is a dedicated node (`responseMode: responseNode` on the trigger) so both
  branches can report what actually happened.

### The signing scheme (what Opsflow checks)

For both calls: `X-Webhook-Timestamp` is an ISO-8601 time; `X-Webhook-Signature` is
`sha256=` + hex HMAC-SHA256 of `<timestamp>.<raw body>` using the shared secret. Opsflow
(`lib/webhooks.ts` `verifySignature`) recomputes it over the raw body, compares in constant time,
and rejects timestamps older than 5 minutes.

The Code nodes use Node's `crypto` when the instance allows it and otherwise fall back to a small
pure-JS HMAC-SHA256 inside the node, so they work even if `require('crypto')` is blocked.

---

## Run it yourself (first time, about 30 to 45 minutes)

You need: an n8n Cloud trial account, and Opsflow's `N8N_CALLBACK_SECRET` for the Opsflow you point
at. n8n Cloud cannot reach `localhost`, so use the deployed Opsflow
(`https://opsflow-ka-f1c5.vercel.app`) or a tunnel to a local one.

### 1. Get the shared secret

The production secret is stored in Vercel as a hidden value, so it cannot be read back. Easiest
path: set a fresh one, redeploy, and paste the same value into n8n. Only the two integration
endpoints use this secret, so rotating it affects nothing else. Run in the `opsflow` folder:

```bash
openssl rand -hex 32 | pbcopy
```

That puts a new random secret on your clipboard without printing it. Do not copy anything else
until you have pasted it into n8n in step 4 (or run the line again). Then:

```bash
vercel env rm N8N_CALLBACK_SECRET production --yes
```

```bash
pbpaste | vercel env add N8N_CALLBACK_SECRET production
```

```bash
vercel deploy --prod --yes
```

These change production configuration, so run them on purpose. Running Opsflow locally instead?
Use the value of `N8N_CALLBACK_SECRET` in your local `.env`, and expose the dev server with a
tunnel so n8n Cloud can reach it.

### 2. Create the n8n Cloud trial

Sign up for n8n Cloud's free trial and open the editor. Sign-up screens change, so follow what it
shows. Create a new blank workflow.

### 3. Import the workflow

In the blank workflow, open the `...` menu at the top right, choose **Import from File...**, and
select `ticket-intake-workflow.json` from this folder. You should see 12 connected nodes plus a
sticky note.

### 4. Fill in the Config node

Double-click **Config: URL and Secret**. Set:

- `baseUrl`: your Opsflow URL, for example `https://opsflow-ka-f1c5.vercel.app` (no path).
- `callbackSecret`: paste the secret from step 1 (clipboard).

Close the node. Do not screenshot or record this node open: it holds the secret. Do not export or
share the workflow after filling it in.

### 5. Test run

1. Click **Execute workflow** (the workflow now listens for one test call, and only for a short while).
2. Double-click **Webhook: Incoming Inquiry** and copy the **Test URL**. It ends in
   `/webhook-test/ticket-intake`.
3. In a terminal, send a request (replace the URL):

```bash
curl -X POST "https://YOUR-NAME.app.n8n.cloud/webhook-test/ticket-intake" \
  -H "Content-Type: application/json" \
  -d '{"rawText": "Furnace won'\''t turn on, pilot light keeps going out.", "source": "n8n-test"}'
```

### 6. What you should see

- **In n8n:** the nodes turn green in order. The classification takes a few seconds because it
  calls the model. The IF node takes the top (true) branch when confidence is 0.7 or higher.
- **In the terminal** (high confidence):
  `{"status":"ticket_created","ticketId":"...","classification":"equipment_issue","confidence":0.9}`
  (values vary).
- **In Opsflow:** log in as the owner and open **Tickets**. A new ticket with source `n8n-test`
  appears already classified, with its "Grounded on" quote.
- **Low confidence:** send something vague, for example `{"rawText": "Call me back please", "source": "n8n-test"}`.
  If the model scores it under 0.7 the response is `"status":"pending_manual_review"` with a
  reason, and **no ticket** is created. Whether a given text scores low is up to the model, so you
  may need to try a vaguer message.

### 7. Activate and run it for real

Switch the **Active** toggle (top right) on. The production URL ends in `/webhook/ticket-intake`
(without `-test`). Run the same curl against it, then open the **Executions** tab in n8n to see the
saved run.

### 8. Record 60 seconds

Checklist for the recording (keep the Config node closed):

1. The whole workflow canvas (5 seconds).
2. Run the curl in the terminal and show the JSON response (15 seconds).
3. Show the green run in n8n (10 seconds): click through Sign Classify Request and Call Opsflow:
   Classify to show the signed headers and the AI result.
4. Show the new ticket in Opsflow's Tickets page with the "Grounded on" quote (15 seconds).
5. Send the vague message and show the `pending_manual_review` response with no new ticket (15 seconds).

Then fill in the "Run record" at the bottom and update the status note at the top.

---

## Troubleshooting

| What you see | Cause | Fix |
|---|---|---|
| Error in **Sign Classify Request**: "paste Opsflow's N8N_CALLBACK_SECRET" | The Config node still has the placeholder | Step 4 |
| Error: "baseUrl must look like https://..." | Wrong URL shape, or a path/typo | Use `https://host`, no path |
| **Call Opsflow: Classify** fails with 401 "Invalid or missing signature" | Secret in n8n differs from the one Opsflow is running with, you rotated it but did not redeploy, or hidden whitespace was pasted | Redo step 1 completely, paste again; check the deploy finished |
| 401 even though the secret is right | Timestamp older than 5 minutes (the node ran long ago, e.g. you re-ran a single node from an old execution) | Run the whole workflow fresh |
| 400 "Invalid request body" from classify | `rawText` empty or over 4000 characters | Send real text; Validate Payload catches most of this first |
| 502 from classify with a `kind` field | The model call failed (rate limit on the free tier, overloaded, or not configured) | Wait a minute and retry |
| **Call Opsflow: Create Ticket** fails with 400 and `details` | A field in the callback body does not match Opsflow's schema | Open the node's output and read `details`; the Merge Classification node shows what was sent |
| `ECONNREFUSED` / `ENOTFOUND` on an Opsflow call | `baseUrl` points at `localhost` or a typo | n8n Cloud cannot reach localhost; use the deployed URL or a tunnel |
| Webhook returns 404 "not registered" | Test URL used without clicking **Execute workflow** first (it only listens for one call), or production URL used before activating | Step 5, or switch the workflow Active |
| Error "Send a JSON body with header Content-Type: application/json" | The curl is missing `-H "Content-Type: application/json"` | Add the header |
| Run succeeded but no ticket in Opsflow | The low-confidence branch was taken, by design | Check the response for `pending_manual_review` |
| Red error "Cannot find module 'crypto'" | Should not happen: the nodes fall back to pure JS | If it does, report it; the fallback code is in the Sign nodes |
| Import warns about an unknown node or parameter version | Your n8n version is older or newer than the one this file targets | Open the flagged node, let n8n update it, and re-check its parameters |

---

## What has been checked (and what has not)

Checked locally, without n8n, against Opsflow's real code:

- The workflow JSON parses; every connection and every `$('Node Name')` reference points to an
  existing node; all nodes are reachable from the trigger; nothing reads `$env`.
- The Sign nodes' code, run in an n8n-style harness, produces the same signature Opsflow's
  `signPayload` produces, on both the `crypto` path and the pure-JS fallback path. The fallback
  matched Node's `crypto` on 500 randomised cases (including non-ASCII text and block boundaries)
  and on the RFC 4231 test vectors.
- The real route handlers (`classify`, `n8n-callback`) accepted requests built exactly the way the
  workflow builds them: `verifySignature` passes, and the body schema accepts every field. A
  tampered signature, a changed body and a timestamp older than 5 minutes are all refused with 401.
- Opsflow's own tests cover the receiving side (`tests/integrations.test.ts`), including the
  successful ticket creation.

Not checked:

- Execution inside real n8n is now covered by the run record below (two manual runs on n8n Cloud on
  2026-10-30 against the live demo, which also made two real model calls). Still not checked:
  the activated production webhook URL, runs at any volume, retries and error branches beyond the
  two paths below, and classification quality beyond these two examples.

## Run record

Last run in n8n: 2026-10-30, n8n Cloud trial, manual mode, executions 2 and 3 (execution 1 stopped
on purpose at the Sign node because the secret had not been pasted yet, which is the guard working).

- Execution 2, high confidence: input "Furnace won't turn on, pilot light keeps going out." The
  classify call returned 200 (equipment_issue, HIGH, confidence 0.95), the IF node took the true
  branch, the signed callback returned 201 and created a ticket, and the webhook responded
  `status: ticket_created`.
- Execution 3, low confidence: input "Call me back please". Classification came back
  general_inquiry, LOW, confidence 0.5; the IF node took the false branch; no ticket was created;
  the response was `status: pending_manual_review` with the reason.

n8n version: n8n Cloud trial (version not recorded). Recording: ______ (to be added)
