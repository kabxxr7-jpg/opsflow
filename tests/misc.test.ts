import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { sniffImageType } from "../lib/image";
import { hashPassword, verifyPassword, verifyPasswordOrDummy } from "../lib/password";
import { formatCurrency, formatDate, formatDateTime, plural } from "../lib/utils";

describe("sniffImageType trusts bytes, not filenames", () => {
  test("recognises JPEG, PNG and WebP signatures", () => {
    assert.equal(sniffImageType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])), "jpeg");
    assert.equal(sniffImageType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])), "png");
    assert.equal(sniffImageType(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])), "webp");
  });
  test("rejects everything else — including things named like images", () => {
    assert.equal(sniffImageType(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>")), null);
    assert.equal(sniffImageType(new TextEncoder().encode("GIF89a")), null);
    assert.equal(sniffImageType(new TextEncoder().encode("%PDF-1.7")), null);
    assert.equal(sniffImageType(new Uint8Array()), null);
    // A RIFF container that is not WebP (e.g. WAV)
    assert.equal(sniffImageType(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45])), null);
  });
});

describe("passwords", () => {
  test("round-trips, and rejects a wrong password", () => {
    const stored = hashPassword("correct horse");
    assert.equal(verifyPassword("correct horse", stored), true);
    assert.equal(verifyPassword("wrong horse", stored), false);
  });
  test("two hashes of the same password differ (salted)", () => {
    assert.notEqual(hashPassword("same"), hashPassword("same"));
  });
  test("malformed stored values never verify", () => {
    assert.equal(verifyPassword("x", ""), false);
    assert.equal(verifyPassword("x", "nocolon"), false);
  });
  test("verifyPasswordOrDummy: a missing account fails (after doing the same work as a real one)", () => {
    assert.equal(verifyPasswordOrDummy("anything", undefined), false);
    assert.equal(verifyPasswordOrDummy("right", hashPassword("right")), true);
    assert.equal(verifyPasswordOrDummy("wrong", hashPassword("right")), false);
  });
});

describe("formatting is identical on server and client", () => {
  test("currency always has two decimals and separators", () => {
    assert.equal(formatCurrency(568.5), "$568.50");
    assert.equal(formatCurrency("6581.55"), "$6,581.55");
    assert.equal(formatCurrency({ toString: () => "0" }), "$0.00");
  });
  test("dates are pinned to UTC and labelled", () => {
    assert.equal(formatDate("2026-10-29T23:30:00Z"), "Oct 29, 2026");
    assert.equal(formatDateTime("2026-10-29T23:30:00Z"), "Oct 29, 2026, 11:30 PM UTC");
  });
  test("plural", () => {
    assert.equal(plural(1, "job"), "1 job");
    assert.equal(plural(0, "job"), "0 jobs");
    assert.equal(plural(2, "job"), "2 jobs");
  });
});
