"use client";

// Last-resort boundary: replaces the whole document, so it can't rely on the app's layout,
// fonts, or stylesheet — hence the inline styles.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#f8f9fc",
          color: "#1b1f3b",
        }}
      >
        <main style={{ textAlign: "center", padding: "1.5rem", maxWidth: 420 }}>
          <h1 style={{ fontSize: "1.5rem", margin: "0 0 .5rem" }}>Opsflow hit an unexpected error</h1>
          <p style={{ margin: "0 0 1.25rem", lineHeight: 1.5, color: "#4a5070" }}>
            Reload to try again. Your data is untouched.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              background: "#3d3a99",
              color: "#fff",
              border: 0,
              borderRadius: 8,
              padding: ".6rem 1.1rem",
              fontSize: "1rem",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
