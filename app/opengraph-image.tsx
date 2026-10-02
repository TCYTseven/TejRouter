import { ImageResponse } from "next/og";

export const alt = "TejRouter: find out which LLM router is actually better.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ROUTERS = [
  { name: "Ramp Router", color: "#3987e5", model: "gpt-4.1-mini", time: "1.2 s", correct: true },
  { name: "Enclave Cyberouter", color: "#d95926", model: "claude-sonnet-4", time: "2.3 s", correct: true },
  { name: "OpenRouter", color: "#199e70", model: "llama-3.1-8b", time: "0.6 s", correct: false },
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
          background: "#fafafa",
          padding: "64px 72px",
          color: "#0a0a0a",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <svg width="48" height="48" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="8" fill="#0a0a0a" />
            <path d="M9 16C14 16 15 9 23 9M9 16C14 16 15 23 23 23" stroke="#fafafa" strokeOpacity=".45" strokeWidth="1.75" strokeLinecap="round" />
            <path d="M9 16H23" stroke="#fafafa" strokeWidth="2" strokeLinecap="round" />
            <circle cx="9" cy="16" r="2.5" fill="#fafafa" />
            <circle cx="23" cy="16" r="2.5" fill="#fafafa" />
          </svg>
          <div style={{ display: "flex", fontSize: 34, fontWeight: 600 }}>TejRouter</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", maxWidth: 900 }}>
          <div style={{ display: "flex", fontSize: 64, fontWeight: 700, lineHeight: 1.08, letterSpacing: -1.5 }}>
            Find out which LLM router is actually better.
          </div>
          <div style={{ display: "flex", marginTop: 22, fontSize: 28, color: "#525252", lineHeight: 1.4 }}>
            Same prompts, every router: the model it picked, speed, cost and accuracy.
          </div>
        </div>

        <div style={{ display: "flex", border: "1px solid #e5e5e5", borderRadius: 16, background: "#ffffff" }}>
          {ROUTERS.map((r, i) => (
            <div
              key={r.name}
              style={{
                display: "flex",
                flexDirection: "column",
                flex: 1,
                gap: 8,
                padding: "20px 24px",
                borderLeft: i === 0 ? "none" : "1px solid #e5e5e5",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 22, fontWeight: 600 }}>
                <div style={{ width: 12, height: 12, borderRadius: 2, background: r.color }} />
                {r.name}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 20, color: "#525252" }}>
                <span>{r.model}</span>
                <span>{r.time}</span>
              </div>
              <div style={{ display: "flex", fontSize: 20, fontWeight: 600, color: r.correct ? "#15803d" : "#b91c1c" }}>
                {r.correct ? "Correct" : "Wrong"}
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
