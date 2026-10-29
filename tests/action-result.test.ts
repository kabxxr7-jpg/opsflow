import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { ForbiddenError } from "../lib/authz";
import { fail, OK, toActionError, UserInputError } from "../lib/action-result";
import { OrgScopeError } from "../lib/db";
import { UnsafeUrlError } from "../lib/safe-url";

// Server Actions return failures as values because production masks the message of anything
// thrown. This is the one place that decides which failures become a sentence a person can act on
// and which are genuinely unexpected (and so are rethrown to the error boundary).

describe("toActionError", () => {
  test("a permission failure becomes a plain message, without saying why", () => {
    const result = toActionError(new ForbiddenError("manage:webhooks"));
    assert.equal(result.error, "You don't have permission to do that.");
  });

  test("a validation failure keeps its own message", () => {
    assert.deepEqual(toActionError(new UserInputError("Give the rule a name.")), { error: "Give the rule a name." });
  });

  test("an unsafe webhook URL keeps its own message", () => {
    assert.match(toActionError(new UnsafeUrlError("Webhook URLs must use https://.")).error ?? "", /https/);
  });

  test("another organization's row and a row that's gone are indistinguishable", () => {
    const crossTenant = toActionError(new OrgScopeError("Customer not found in this organization."));
    const gone = toActionError(Object.assign(new Error("Record to update not found."), { code: "P2025" }));
    assert.equal(crossTenant.error, gone.error);
    assert.match(crossTenant.error ?? "", /no longer exists/i);
  });

  test("a foreign-key violation says to try again, rather than crashing the page", () => {
    const result = toActionError(Object.assign(new Error("Foreign key constraint violated"), { code: "P2003" }));
    assert.match(result.error ?? "", /try again/i);
  });

  test("anything it doesn't recognise is rethrown, not swallowed or disguised", () => {
    const surprise = new Error("connection reset");
    assert.throws(() => toActionError(surprise), (e: unknown) => e === surprise);
    assert.throws(() => toActionError("a string"));
    assert.throws(() => toActionError(null));
  });
});

describe("the small helpers", () => {
  test("OK has no error and fail() carries the message", () => {
    assert.deepEqual(OK, { error: null });
    assert.deepEqual(fail("nope"), { error: "nope" });
  });
});
