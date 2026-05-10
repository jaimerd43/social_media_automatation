import React from "react";
import { AbsoluteFill, Video } from "remotion";

interface PhoneMockupProps {
  recordingSrc: string;
}

const FRAME_WIDTH = 460;
const FRAME_HEIGHT = 920;
const BORDER = 14;
const RADIUS = 52;
const INNER_RADIUS = 40;

export const PhoneMockup: React.FC<PhoneMockupProps> = ({ recordingSrc }) => {
  const innerW = FRAME_WIDTH - BORDER * 2;
  const innerH = FRAME_HEIGHT - BORDER * 2;

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {/* Outer glow */}
      <div
        style={{
          position: "absolute",
          width: FRAME_WIDTH + 40,
          height: FRAME_HEIGHT + 40,
          borderRadius: RADIUS + 20,
          background:
            "radial-gradient(ellipse at center, rgba(4,106,60,0.25) 0%, transparent 70%)",
        }}
      />

      {/* Phone frame */}
      <div
        style={{
          width: FRAME_WIDTH,
          height: FRAME_HEIGHT,
          borderRadius: RADIUS,
          background: "#111",
          border: `${BORDER}px solid #222`,
          position: "relative",
          overflow: "hidden",
          boxShadow:
            "0 50px 100px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.06), inset 0 0 0 1px rgba(255,255,255,0.04)",
        }}
      >
        {/* Screen */}
        <div
          style={{
            width: innerW,
            height: innerH,
            borderRadius: INNER_RADIUS,
            overflow: "hidden",
            position: "absolute",
            top: 0,
            left: 0,
            background: "#000",
          }}
        >
          <Video
            src={recordingSrc}
            onError={() => undefined}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </div>

        {/* Dynamic Island */}
        <div
          style={{
            position: "absolute",
            top: 12,
            left: "50%",
            transform: "translateX(-50%)",
            width: 120,
            height: 34,
            background: "#111",
            borderRadius: 17,
            zIndex: 10,
          }}
        />

        {/* Side buttons reflection */}
        <div
          style={{
            position: "absolute",
            right: 0,
            top: FRAME_HEIGHT * 0.3,
            width: 4,
            height: 80,
            background: "rgba(255,255,255,0.06)",
            borderRadius: 2,
          }}
        />
      </div>

      {/* Órdago badge on phone */}
      <div
        style={{
          position: "absolute",
          bottom: (1920 - FRAME_HEIGHT) / 2 - 8,
          right: (1080 - FRAME_WIDTH) / 2 - 20,
          background: "#046A3C",
          borderRadius: 20,
          padding: "8px 18px",
          boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        }}
      >
        <span
          style={{
            color: "#fff",
            fontSize: 28,
            fontWeight: 700,
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Roboto", sans-serif',
            letterSpacing: -0.3,
          }}
        >
          Órdago
        </span>
      </div>
    </AbsoluteFill>
  );
};
