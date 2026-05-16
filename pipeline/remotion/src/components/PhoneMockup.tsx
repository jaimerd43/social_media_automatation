import React from "react";
import { AbsoluteFill, Sequence, Video } from "remotion";

interface PhoneMockupProps {
  recordingSrc: string;
}

// Marco grande que llena la mayor parte del canvas 1080×1920
const INNER_W = 700;
const INNER_H = 1300;    // proporción ~9:16.7 (moderna)
const BORDER   = 18;
const RADIUS   = 56;
const INNER_R  = 42;

const FRAME_W = INNER_W + BORDER * 2;
const FRAME_H = INNER_H + BORDER * 2;

export const PhoneMockup: React.FC<PhoneMockupProps> = ({ recordingSrc }) => (
  <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>

    {/* Glow de fondo */}
    <div style={{
      position: "absolute",
      width: FRAME_W + 60,
      height: FRAME_H + 60,
      borderRadius: RADIUS + 30,
      background: "radial-gradient(ellipse at center, rgba(4,106,60,0.22) 0%, transparent 70%)",
    }} />

    {/* Cuerpo del teléfono */}
    <div style={{
      width:        FRAME_W,
      height:       FRAME_H,
      borderRadius: RADIUS,
      background:   "#111",
      border:       `${BORDER}px solid #1e1e1e`,
      position:     "relative",
      overflow:     "hidden",
      boxShadow:    "0 60px 120px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.06)",
    }}>

      {/* Pantalla */}
      <div style={{
        width:        INNER_W,
        height:       INNER_H,
        borderRadius: INNER_R,
        overflow:     "hidden",
        position:     "absolute",
        top: 0, left: 0,
        background:   "#000",
      }}>
        <Video
          src={recordingSrc}
          onError={() => undefined}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </div>

      {/* Dynamic Island */}
      <div style={{
        position:     "absolute",
        top:          14,
        left:         "50%",
        transform:    "translateX(-50%)",
        width:        130,
        height:       36,
        background:   "#111",
        borderRadius: 18,
        zIndex:       10,
      }} />

      {/* Reflejo lateral */}
      <div style={{
        position:     "absolute",
        right:        0,
        top:          "30%",
        width:        4,
        height:       90,
        background:   "rgba(255,255,255,0.05)",
        borderRadius: 2,
      }} />
    </div>

    {/* Badge Órdago */}
    <div style={{
      position:   "absolute",
      bottom:     (1920 - FRAME_H) / 2 - 12,
      right:      (1080 - FRAME_W) / 2 - 16,
      background: "#046A3C",
      borderRadius: 22,
      paddingTop: 10, paddingBottom: 10,
      paddingLeft: 22, paddingRight: 22,
      boxShadow:  "0 4px 20px rgba(0,0,0,0.45)",
    }}>
      <span style={{
        color:       "#fff",
        fontSize:    30,
        fontWeight:  700,
        fontFamily:  '-apple-system, BlinkMacSystemFont, "SF Pro Display", Roboto, sans-serif',
        letterSpacing: -0.3,
      }}>Órdago</span>
    </div>
  </AbsoluteFill>
);
