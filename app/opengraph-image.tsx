import { ImageResponse } from "next/og";

export const alt = "TejRouter: the router that tests routers. Side-by-side LLM router benchmarks with rigorous statistics.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ROUTERS = [
  { name: "Ramp Router", color: "#3b82f6" },
  { name: "Enclave Cyberouter", color: "#f97316" },
  { name: "OpenRouter", color: "#a855f7" },
  { name: "Requesty", color: "#10b981" },
  { name: "FastLLM", color: "#eab308" },
  { name: "Martian", color: "#ec4899" },
];

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#07080a",
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
          padding: "64px 72px",
          color: "#ededf0",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <svg width="64" height="64" viewBox="0 0 32 32" fill="none">
            <rect x="0.75" y="0.75" width="30.5" height="30.5" rx="8" fill="#15171b" stroke="#33363e" strokeWidth="1.5" />
            <path d="M9 16C14 16 15 8.5 23 8.5" stroke="#80818b" strokeWidth="1.9" strokeLinecap="round" />
            <path d="M9 16C14 16 15 23.5 23 23.5" stroke="#80818b" strokeWidth="1.9" strokeLinecap="round" />
            <path d="M9 16H23" stroke="#c6f24e" strokeWidth="2.2" strokeLinecap="round" />
            <circle cx="9" cy="16" r="2.8" fill="#ededf0" />
            <circle cx="23" cy="8.5" r="2.1" fill="#80818b" />
            <circle cx="23" cy="23.5" r="2.1" fill="#80818b" />
            <circle cx="23" cy="16" r="2.8" fill="#c6f24e" />
          </svg>
          <div style={{ display: "flex", fontSize: 40, fontWeight: 700 }}>
            <span>Tej</span>
            <span style={{ color: "#c6f24e" }}>Router</span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 48 }}>
          <div style={{ display: "flex", flexDirection: "column", maxWidth: 600 }}>
            <div style={{ display: "flex", fontSize: 68, fontWeight: 700, lineHeight: 1.04 }}>
              The router that tests routers.
            </div>
            <div style={{ display: "flex", marginTop: 24, fontSize: 26, color: "#a3a4ad", lineHeight: 1.35 }}>
              Race LLM routers side by side. Grade them. Prove it with statistics.
            </div>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: 420,
              border: "1px solid #33363e",
              borderRadius: 14,
              background: "#0f1013",
              padding: "18px 20px",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "#80818b", letterSpacing: 2 }}>
              <span>ONE PROMPT</span>
              <span>EVERY ROUTER</span>
            </div>
            {ROUTERS.map((r) => (
              <div key={r.name} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 20 }}>
                <div style={{ width: 12, height: 12, borderRadius: 3, background: r.color }} />
                <div style={{ display: "flex", flex: 1, color: "#ededf0" }}>{r.name}</div>
                <div style={{ display: "flex", color: "#80818b", fontFamily: "monospace", fontSize: 16 }}>
                  TTFT · cost · model
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 28, fontSize: 18, color: "#80818b", fontFamily: "monospace" }}>
          <span>95% CIs</span>
          <span>McNemar · Wilcoxon</span>
          <span>Bradley-Terry Elo</span>
          <span>Pareto frontier</span>
        </div>
      </div>
    ),
    size,
  );
}
