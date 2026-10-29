import dns from "node:dns";
import net from "node:net";

/**
 * SSRF protection for outbound webhooks.
 *
 * Anyone who can configure a webhook can make *this server* send an HTTP request to an address
 * of their choosing — and the delivery log reports back the status code. Left unchecked that's a
 * probe into whatever the server can reach (loopback services, link-local metadata endpoints,
 * private networks). So a target is only accepted if it's https (http only for loopback in
 * development), carries no credentials, uses a conventional port, and — checked at *connect*
 * time, not just when it's saved, so DNS rebinding can't swap in a private address afterwards —
 * resolves exclusively to public addresses.
 */

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

const allowLoopbackForDev = () => process.env.NODE_ENV !== "production";

const ALLOWED_PORTS = new Set(["", "80", "443", "8080", "8443"]);

// [network, prefix length]
const BLOCKED_V4: [string, number][] = [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, incl. cloud metadata (169.254.169.254)
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast
];

function v4ToInt(ip: string): number {
  return ip.split(".").reduce((n, octet) => n * 256 + Number(octet), 0);
}

function isBlockedV4(ip: string): boolean {
  const n = v4ToInt(ip);
  return BLOCKED_V4.some(([base, bits]) => {
    const size = 2 ** (32 - bits);
    const start = v4ToInt(base);
    return n >= start && n < start + size;
  });
}

/** Parses an IPv6 literal into eight 16-bit groups, or null if it isn't one. */
function parseV6(input: string): number[] | null {
  let ip = input.split("%")[0]; // drop a zone id
  if (!net.isIPv6(ip)) return null;

  // An embedded dotted IPv4 tail (::ffff:1.2.3.4) becomes two hex groups.
  const tail = ip.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (tail) {
    const n = v4ToInt(tail[1]);
    ip = ip.slice(0, -tail[1].length) + ((n >>> 16) & 0xffff).toString(16) + ":" + (n & 0xffff).toString(16);
  }

  const [head, rest] = ip.split("::");
  const headGroups = head ? head.split(":") : [];
  const restGroups = rest === undefined ? [] : rest ? rest.split(":") : [];
  const fill = rest === undefined ? 0 : 8 - headGroups.length - restGroups.length;
  const groups = [...headGroups, ...Array(Math.max(fill, 0)).fill("0"), ...restGroups].map((g) => parseInt(g, 16));
  return groups.length === 8 && groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : null;
}

function embeddedV4(groups: number[], from: number): string {
  const hi = groups[from], lo = groups[from + 1];
  return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
}

function isBlockedV6(ip: string): boolean {
  const g = parseV6(ip);
  if (!g) return true; // can't parse it, don't trust it
  const allZeroUntil = (end: number) => g.slice(0, end).every((x) => x === 0);

  if (allZeroUntil(7) && (g[7] === 0 || g[7] === 1)) return true; // :: and ::1
  if (allZeroUntil(5) && g[5] === 0xffff) return isBlockedV4(embeddedV4(g, 6)); // ::ffff:a.b.c.d (IPv4-mapped)
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return isBlockedV4(embeddedV4(g, 6)); // NAT64
  if (g[0] === 0x2002) return isBlockedV4(embeddedV4(g, 1)); // 6to4
  if (g[0] === 0x2001 && g[1] === 0) return true; // Teredo
  if (g[0] === 0x2001 && g[1] === 0xdb8) return true; // documentation
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g[0] & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local (deprecated)
  if ((g[0] & 0xff00) === 0xff00) return true; // multicast
  if (g[0] === 0x100 && g[1] === 0 && g[2] === 0 && g[3] === 0) return true; // 100::/64 discard
  return false;
}

/** True only for a globally routable unicast address. */
export function isPublicIp(ip: string): boolean {
  if (net.isIPv4(ip)) return !isBlockedV4(ip);
  if (net.isIPv6(ip)) return !isBlockedV6(ip);
  return false;
}

const isLoopbackName = (host: string) =>
  host === "localhost" || host.endsWith(".localhost") || host === "127.0.0.1" || host === "::1" || host === "[::1]";

/** Synchronous checks on the URL itself. Throws UnsafeUrlError with a message safe to show the user. */
export function parseWebhookTarget(raw: string): URL {
  if (raw.length > 2048) throw new UnsafeUrlError("That URL is too long.");
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new UnsafeUrlError("Enter a full URL, like https://example.com/webhooks/opsflow.");
  }

  const dev = allowLoopbackForDev();
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const loopbackOk = dev && isLoopbackName(host);

  if (url.protocol !== "https:" && !(loopbackOk && url.protocol === "http:")) {
    throw new UnsafeUrlError("Webhook URLs must use https://.");
  }
  if (url.username || url.password) throw new UnsafeUrlError("Webhook URLs can't contain a username or password.");
  if (!ALLOWED_PORTS.has(url.port) && !loopbackOk) {
    throw new UnsafeUrlError("Webhook URLs must use a standard web port (80, 443, 8080, or 8443).");
  }
  if (!host) throw new UnsafeUrlError("That URL has no host.");

  if (!loopbackOk) {
    const literal = net.isIP(host) !== 0;
    if (literal && !isPublicIp(host)) throw new UnsafeUrlError("Webhook URLs can't point at private or internal addresses.");
    if (!literal) {
      const internalSuffix = /\.(local|localhost|internal|lan|home|corp|intranet|home\.arpa)$/;
      if (!host.includes(".") || internalSuffix.test(host)) {
        throw new UnsafeUrlError("Webhook URLs can't point at private or internal hostnames.");
      }
    }
  }
  return url;
}

/** Pure decision used by the connect-time lookup (kept separate so it can be tested without DNS). */
export function checkResolvedAddresses(addresses: { address: string; family: number }[], allowPrivate: boolean) {
  if (addresses.length === 0) throw new UnsafeUrlError("That host didn't resolve to any address.");
  if (!allowPrivate && addresses.some((a) => !isPublicIp(a.address))) {
    throw new UnsafeUrlError("That host resolves to a private or internal address.");
  }
  return addresses;
}

/**
 * A `lookup` for http(s).request that validates every address a hostname resolves to at the
 * moment of connecting — closing the window between "we checked it" and "we connected to it" that
 * DNS rebinding exploits. Loopback is only tolerated in development, and only for loopback names.
 */
export const safeLookup: net.LookupFunction = (hostname, options, callback) => {
  const allowPrivate = allowLoopbackForDev() && isLoopbackName(hostname.toLowerCase());
  dns.lookup(hostname, { ...options, all: true, verbatim: true }, (err, addresses) => {
    if (err) return callback(err, "", 4);
    try {
      const ok = checkResolvedAddresses(addresses, allowPrivate);
      if (options.all) return callback(null, ok as never);
      return callback(null, ok[0].address, ok[0].family);
    } catch (e) {
      return callback(e as NodeJS.ErrnoException, "", 4);
    }
  });
};

/**
 * Save-time check: everything parseWebhookTarget verifies, plus a DNS lookup so a hostname that
 * already resolves somewhere private is rejected with a clear message instead of failing later.
 */
export async function assertSafeWebhookTarget(raw: string): Promise<URL> {
  const url = parseWebhookTarget(raw);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host) || (allowLoopbackForDev() && isLoopbackName(host.toLowerCase()))) return url;
  let addresses: { address: string; family: number }[];
  try {
    addresses = await dns.promises.lookup(host, { all: true, verbatim: true });
  } catch {
    throw new UnsafeUrlError("Couldn't resolve that host. Check the URL for typos.");
  }
  checkResolvedAddresses(addresses, false);
  return url;
}
