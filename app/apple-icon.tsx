import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#0f1013" }}>
        <svg width="180" height="180" viewBox="0 0 32 32" fill="none">
          <path d="M8 16C13.5 16 14.5 8 23.5 8" stroke="#80818b" strokeWidth="1.9" strokeLinecap="round" />
          <path d="M8 16C13.5 16 14.5 24 23.5 24" stroke="#80818b" strokeWidth="1.9" strokeLinecap="round" />
          <path d="M8 16H23.5" stroke="#c6f24e" strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="8" cy="16" r="2.8" fill="#ededf0" />
          <circle cx="23.5" cy="8" r="2.1" fill="#80818b" />
          <circle cx="23.5" cy="24" r="2.1" fill="#80818b" />
          <circle cx="23.5" cy="16" r="2.8" fill="#c6f24e" />
        </svg>
      </div>
    ),
    size,
  );
}
