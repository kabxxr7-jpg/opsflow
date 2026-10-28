import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#3d3a99",
          borderRadius: 7,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <div style={{ display: "flex", gap: 3 }}>
            <div style={{ width: 7, height: 7, borderRadius: 2, background: "#fff" }} />
            <div style={{ width: 7, height: 7, borderRadius: 2, background: "#fff", opacity: 0.55 }} />
          </div>
          <div style={{ display: "flex", gap: 3 }}>
            <div style={{ width: 7, height: 7, borderRadius: 2, background: "#fff", opacity: 0.55 }} />
            <div style={{ width: 7, height: 7, borderRadius: 2, background: "#fff" }} />
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
