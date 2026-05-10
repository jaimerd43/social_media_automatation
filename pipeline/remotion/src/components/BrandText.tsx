import React from "react";
import { AbsoluteFill } from "remotion";

interface BrandTextProps {
  text: string;
  position: "bottom" | "top";
  accent?: boolean;
  opacity?: number;
}

export const BrandText: React.FC<BrandTextProps> = ({
  text,
  position,
  accent = false,
  opacity = 1,
}) => {
  const isBottom = position === "bottom";

  return (
    <AbsoluteFill
      style={{
        justifyContent: isBottom ? "flex-end" : "flex-start",
        alignItems: "center",
        padding: isBottom ? "0 48px 72px" : "72px 48px 0",
        opacity,
        pointerEvents: "none",
      }}
    >
      {/* Gradient backdrop */}
      <div
        style={{
          position: "absolute",
          [isBottom ? "bottom" : "top"]: 0,
          left: 0,
          right: 0,
          height: 480,
          background: isBottom
            ? "linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.4) 60%, transparent 100%)"
            : "linear-gradient(to bottom, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.4) 60%, transparent 100%)",
        }}
      />
      <p
        style={{
          color: accent ? "#FFBF00" : "#FFFFFF",
          fontSize: 56,
          fontWeight: 700,
          textAlign: "center",
          lineHeight: 1.2,
          margin: 0,
          textShadow: "0 3px 16px rgba(0,0,0,0.6)",
          position: "relative",
          zIndex: 1,
          letterSpacing: -0.5,
          maxWidth: 900,
        }}
      >
        {text}
      </p>
    </AbsoluteFill>
  );
};
