import { test, describe } from "node:test";
import assert from "node:assert/strict";
import type { UserRole } from "@prisma/client";
import { assertCan, assertCanUpdateJob, can, ForbiddenError, type Action } from "../lib/authz";

const session = (role: UserRole, userId = "u1") => ({ userId, organizationId: "org1", role });

// The whole role matrix, written out once as the specification. Changing who may do what should
// mean changing this table on purpose.
const EXPECTED: Record<UserRole, Record<Action, boolean>> = {
  OWNER: {
    "view:jobs": true,
    "update:job:status": true,
    "view:tickets": true,
    "write:tickets": true,
    "use:intake": true,
    "view:automations": true,
    "manage:automations": true,
    "manage:webhooks": true,
    "view:settings": true,
    "view:briefings": true,
    "generate:briefing": true,
  },
  DISPATCHER: {
    "view:jobs": true,
    "update:job:status": true,
    "view:tickets": true,
    "write:tickets": true,
    "use:intake": true,
    "view:automations": false,
    "manage:automations": false,
    "manage:webhooks": false,
    "view:settings": false,
    "view:briefings": true,
    "generate:briefing": true,
  },
  TECHNICIAN: {
    "view:jobs": true,
    "update:job:status": true,
    "view:tickets": true,
    "write:tickets": true,
    "use:intake": true,
    "view:automations": false,
    "manage:automations": false,
    "manage:webhooks": false,
    "view:settings": false,
    "view:briefings": false,
    "generate:briefing": false,
  },
};

describe("role matrix", () => {
  for (const [role, actions] of Object.entries(EXPECTED) as [UserRole, Record<Action, boolean>][]) {
    for (const [action, allowed] of Object.entries(actions) as [Action, boolean][]) {
      test(`${role} ${allowed ? "can" : "cannot"} ${action}`, () => {
        assert.equal(can(role, action), allowed);
        if (allowed) assert.doesNotThrow(() => assertCan(session(role), action));
        else assert.throws(() => assertCan(session(role), action), ForbiddenError);
      });
    }
  }

  test("no role means no access to anything", () => {
    assert.equal(can(null, "view:jobs"), false);
    assert.equal(can(undefined, "view:jobs"), false);
  });

  test("the error message doesn't explain why (no role hints for a prober)", () => {
    try {
      assertCan(session("TECHNICIAN"), "manage:webhooks");
      assert.fail("should have thrown");
    } catch (e) {
      assert.ok(e instanceof ForbiddenError);
      assert.doesNotMatch(e.message, /owner|technician|role/i);
    }
  });
});

describe("assertCanUpdateJob (row-level)", () => {
  test("a technician can update a job assigned to them", () => {
    assert.doesNotThrow(() => assertCanUpdateJob(session("TECHNICIAN", "u1"), { assignedToId: "u1" }));
  });

  test("a technician cannot update someone else's job, or an unassigned one", () => {
    assert.throws(() => assertCanUpdateJob(session("TECHNICIAN", "u1"), { assignedToId: "u2" }), ForbiddenError);
    assert.throws(() => assertCanUpdateJob(session("TECHNICIAN", "u1"), { assignedToId: null }), ForbiddenError);
  });

  test("owners and dispatchers can update any job in their organization", () => {
    assert.doesNotThrow(() => assertCanUpdateJob(session("OWNER"), { assignedToId: "someone-else" }));
    assert.doesNotThrow(() => assertCanUpdateJob(session("DISPATCHER"), { assignedToId: null }));
  });
});
