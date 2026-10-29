import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import { checkResolvedAddresses, isPublicIp, parseWebhookTarget, UnsafeUrlError } from "../lib/safe-url";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = env.NODE_ENV;
afterEach(() => {
  // Assigning undefined to process.env stores the *string* "undefined", so remove it instead.
  if (originalNodeEnv === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = originalNodeEnv;
});

describe("isPublicIp", () => {
  const publicAddresses = ["8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:4700:4700::1111", "::ffff:8.8.8.8"];
  const blockedAddresses = [
    "127.0.0.1",
    "127.255.255.254",
    "10.0.0.1",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254", // cloud metadata
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "fe80::1",
    "fc00::1",
    "fd12:3456:789a::1",
    "ff02::1",
    "::ffff:127.0.0.1", // IPv4-mapped loopback
    "::ffff:10.0.0.1",
    "::ffff:169.254.169.254",
    "64:ff9b::7f00:1", // NAT64 -> 127.0.0.1
    "2002:7f00:1::", // 6to4 -> 127.0.0.1
    "2001:db8::1",
    "::7f00:1", // IPv4-compatible (::127.0.0.1)
    "::a00:1", // IPv4-compatible (::10.0.0.1)
    "::ffff:0:7f00:1", // SIIT-translated 127.0.0.1
  ];

  for (const ip of publicAddresses) test(`${ip} is public`, () => assert.equal(isPublicIp(ip), true));
  for (const ip of blockedAddresses) test(`${ip} is blocked`, () => assert.equal(isPublicIp(ip), false));

  test("things that aren't IP addresses are never 'public'", () => {
    assert.equal(isPublicIp("example.com"), false);
    assert.equal(isPublicIp(""), false);
    assert.equal(isPublicIp("999.1.1.1"), false);
  });

  test("the 172.16/12 block ends where it should", () => {
    assert.equal(isPublicIp("172.15.255.255"), true);
    assert.equal(isPublicIp("172.32.0.0"), true);
  });
});

describe("parseWebhookTarget (production)", () => {
  const rejected: [string, RegExp][] = [
    ["http://example.com/hook", /https/],
    ["https://user:pass@example.com/hook", /username or password/],
    ["https://example.com:22/hook", /port/],
    ["https://localhost/hook", /private or internal/],
    ["https://app.localhost/hook", /private or internal/],
    ["https://127.0.0.1/hook", /private or internal/],
    ["https://10.1.2.3/hook", /private or internal/],
    ["https://169.254.169.254/latest/meta-data", /private or internal/],
    ["https://[::1]/hook", /private or internal/],
    ["https://[::ffff:127.0.0.1]/hook", /private or internal/],
    ["https://printer.internal/hook", /private or internal/],
    ["https://intranet/hook", /private or internal/],
    ["https://metadata.google.internal./hook", /private or internal/], // trailing root dot
    ["https://localhost./hook", /private or internal/],
    ["https://[::7f00:1]/hook", /private or internal/],
    ["not a url", /full URL/],
    ["ftp://example.com/hook", /https/],
    ["javascript:alert(1)", /https|full URL/],
  ];
  for (const [url, message] of rejected) {
    test(`rejects ${url}`, () => {
      env.NODE_ENV = "production";
      assert.throws(() => parseWebhookTarget(url), (e: unknown) => e instanceof UnsafeUrlError && message.test(e.message));
    });
  }

  test("rejects absurdly long URLs", () => {
    env.NODE_ENV = "production";
    assert.throws(() => parseWebhookTarget(`https://example.com/${"a".repeat(3000)}`), UnsafeUrlError);
  });

  test("accepts ordinary public https endpoints", () => {
    env.NODE_ENV = "production";
    assert.equal(parseWebhookTarget("https://example.com/webhooks/opsflow").hostname, "example.com");
    assert.equal(parseWebhookTarget("https://hooks.example.com:8443/x").port, "8443");
    assert.equal(parseWebhookTarget("  https://example.com/x  ").href, "https://example.com/x");
  });

  test("loopback is refused in production, even over https", () => {
    env.NODE_ENV = "production";
    assert.throws(() => parseWebhookTarget("http://localhost:3000/api/integrations/test-echo"), UnsafeUrlError);
    assert.throws(() => parseWebhookTarget("https://127.0.0.1/x"), UnsafeUrlError);
  });
});

describe("parseWebhookTarget (development)", () => {
  test("allows loopback over http so the built-in receiver works locally", () => {
    env.NODE_ENV = "development";
    assert.equal(parseWebhookTarget("http://localhost:3000/api/integrations/test-echo").port, "3000");
    assert.equal(parseWebhookTarget("http://127.0.0.1:4010/hook").hostname, "127.0.0.1");
  });

  test("still refuses private networks and plain http to public hosts", () => {
    env.NODE_ENV = "development";
    assert.throws(() => parseWebhookTarget("https://10.0.0.5/x"), UnsafeUrlError);
    assert.throws(() => parseWebhookTarget("https://169.254.169.254/x"), UnsafeUrlError);
    assert.throws(() => parseWebhookTarget("http://example.com/x"), UnsafeUrlError);
  });
});

describe("checkResolvedAddresses (the connect-time DNS-rebinding guard)", () => {
  const v4 = (address: string) => ({ address, family: 4 });

  test("passes when every address is public", () => {
    assert.equal(checkResolvedAddresses([v4("8.8.8.8"), v4("1.1.1.1")], false).length, 2);
  });

  test("fails if ANY resolved address is private — a mixed answer is how rebinding sneaks through", () => {
    assert.throws(() => checkResolvedAddresses([v4("8.8.8.8"), v4("127.0.0.1")], false), UnsafeUrlError);
    assert.throws(() => checkResolvedAddresses([v4("169.254.169.254")], false), UnsafeUrlError);
  });

  test("an empty answer is a failure, not a pass", () => {
    assert.throws(() => checkResolvedAddresses([], false), UnsafeUrlError);
  });

  test("allowPrivate (loopback dev only) lets private addresses through", () => {
    assert.equal(checkResolvedAddresses([v4("127.0.0.1")], true).length, 1);
  });
});
