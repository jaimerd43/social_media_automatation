import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Script } from "../types";

interface SubtitleOverlayProps {
  script: Script;
  totalFrames: number;
}

const CHUNK_SIZE = 3; // palabras por línea

function splitIntoChunks(text: string, size: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += size) {
    chunks.push(words.slice(i, i + size).join(" "));
  }
  return chunks;
}

export const SubtitleOverlay: React.FC<SubtitleOverlayProps> = ({
  script,
  totalFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const chunks = splitIntoChunks(script.full_script, CHUNK_SIZE);
  if (chunks.length === 0) return null;

  const framesPerChunk = totalFrames / chunks.length;
  const chunkIndex = Math.min(
    Math.floor(frame / framesPerChunk),
    chunks.length - 1
  );

  // Fade suave al cambiar de chunk
  const frameInChunk = frame - chunkIndex * framesPerChunk;
  const opacity = interpolate(
    frameInChunk,
    [0, 4, framesPerChunk - 4, framesPerChunk],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: 370,      // encima de la burbuja del avatar (bottom 130 + height 210 + margen)
        pointerEvents: "none",
        zIndex: 50,
      }}
    >
      <div
        style={{
          opacity,
          background: "rgba(0, 0, 0, 0.55)",
          borderRadius: 14,
          paddingTop: 14,
          paddingBottom: 14,
          paddingLeft: 28,
          paddingRight: 28,
          maxWidth: 900,
        }}
      >
        <span
          style={{
            color: "#FFBF00",
            fontSize: 68,
            fontWeight: 800,
            textAlign: "center",
            display: "block",
            lineHeight: 1.15,
            letterSpacing: -0.5,
            textShadow: "0 3px 10px rgba(0,0,0,0.7)",
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "SF Pro Display", Roboto, sans-serif',
          }}
        >
          {chunks[chunkIndex]}
        </span>
      </div>
    </AbsoluteFill>
  );
};
