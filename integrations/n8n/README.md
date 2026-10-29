# Opsflow Ticket Intake — n8n Workflow

An importable n8n workflow (hand-written and not yet run inside n8n; not an in-app simulation of one) that receives a simulated
customer inquiry, gets it classified by Opsflow's own AI pipeline, and either auto-creates the
ticket or routes it to manual review depending on confidence. It calls the exact same endpoints
Opsflow's own UI uses, no duplicate logic, no second AI integration to maintain.

This is deliberately a thin artifact, not a rebuild of Opsflow's automation engine in n8n. The
in-app rule builder (`/automations`) proves the general "design a trigger → filter → action
system" skill. This workflow shows how those pieces map onto n8n (it has not yet been run inside n8n): webhook triggers, Code nodes,
conditional branching, and signed HTTP calls to an external API.

## What it does

```
Webhook (POST /ticket-intake)
  → Validate Payload            (Code: rejects empty/malformed rawText before anything else runs)
  → Sign Classify Request       (Code: HMAC-SHA256, same scheme Opsflow uses internally)
  → Call Opsflow: Classify      (HTTP Request → POST /api/integrations/classify)
  → Merge Classification        (Code: recombines the AI result with the original rawText/source)
  → IF: Confidence >= 0.7
      ├─ true  → Sign Callback Request → Call Opsflow: Create Ticket (POST /api/integrations/n8n-callback)
      └─ false → Flag for Manual Review (Set: marks pending_manual_review, does NOT auto-create)
  → Respond to Webhook
```

## Why each node is there

- **Validate Payload** fails fast and explicitly on a malformed request, rather than letting a
  missing `rawText` field produce a confusing downstream error from the classify endpoint.
- **Sign Classify Request / Sign Callback Request** are separate Code nodes, not one shared
  signer, because each signs a different body at a different point in the flow, the signature
  has to be computed over the exact bytes being sent, so it's computed right before each HTTP
  Request node, not once upfront.
- **IF: Confidence >= 0.7** is the guardrail. Low-confidence classifications don't silently
  become tickets, they get explicitly flagged for a human to review before anything is created.
  "AI recommends, a person decides" isn't just a line in a proposal, it's an actual branch in
  this workflow.
- **Respond to Webhook** is a dedicated node (`responseMode: responseNode` on the trigger)
  rather than an immediate response, so both branches, auto-created and flagged-for-review,
  can report back what actually happened.

## Running it yourself

1. Import `ticket-intake-workflow.json` into n8n (self-hosted or cloud free tier).
2. Set two environment variables on the n8n instance:
   - `OPSFLOW_BASE_URL` — e.g. `https://your-opsflow-deploy.vercel.app` (or `http://localhost:3002` for local testing against the dev server)
   - `OPSFLOW_N8N_SECRET` — must match Opsflow's `N8N_CALLBACK_SECRET` env var exactly, this is the shared signing secret both sides use.
3. Activate the workflow, then POST to the workflow's webhook URL:
   ```bash
   curl -X POST https://your-n8n-instance/webhook/ticket-intake \
     -H "Content-Type: application/json" \
     -d '{"rawText": "Furnace won'\''t turn on, pilot light keeps going out.", "source": "n8n-test"}'
   ```
4. Check Opsflow's `/tickets` page, high-confidence results appear as classified tickets
   immediately; low-confidence ones don't appear as tickets at all, by design, until a human
   acts on the manual-review flag.
