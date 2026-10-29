import { ImageResponse } from "next/og";

export const alt = "Opsflow — field-service ops automation and AI reporting";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The card shown when the link is pasted into a proposal, chat, or social post.
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "linear-gradient(135deg, #1f2468 0%, #3d3a99 55%, #1b2a66 100%)",
          color: "#fff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: "rgba(255,255,255,0.16)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", gap: 6 }}>
                <div style={{ width: 14, height: 14, borderRadius: 4, background: "#fff" }} />
                <div style={{ width: 14, height: 14, borderRadius: 4, background: "#fff", opacity: 0.55 }} />
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <div style={{ width: 14, height: 14, borderRadius: 4, background: "#fff", opacity: 0.55 }} />
                <div style={{ width: 14, height: 14, borderRadius: 4, background: "#fff" }} />
              </div>
            </div>
          </div>
          <div style={{ fontSize: 40, fontWeight: 600 }}>Opsflow</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2, maxWidth: 920 }}>
            Field-service ops, actually under control.
          </div>
          <div style={{ fontSize: 32, opacity: 0.85, maxWidth: 900, lineHeight: 1.3 }}>
            Rule-based automation, signed webhooks, and AI triage with guardrails — multi-tenant, with a test suite.
          </div>
        </div>

        <div style={{ display: "flex", gap: 14, fontSize: 24, opacity: 0.9 }}>
          {["Next.js", "Prisma", "Postgres", "Gemini", "n8n"].map((t) => (
            <div
              key={t}
              style={{
                padding: "8px 18px",
                borderRadius: 999,
                border: "2px solid rgba(255,255,255,0.35)",
              }}
            >
              {t}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
