import React from "react";
import { AbsoluteFill, Video, staticFile } from "remotion";
import { SubtitleOverlay } from "./components/SubtitleOverlay";
import { ReelProps } from "./types";

// Burbuja del avatar — esquina inferior izquierda
const BUBBLE_SIZE   = 210;
const BUBBLE_LEFT   = 30;
const BUBBLE_BOTTOM = 130;

export const Reel: React.FC<ReelProps> = ({ script, totalFrames }) => (
  <AbsoluteFill style={{ background: "#000", overflow: "hidden" }}>

    {/* ── Grabación de pantalla — fondo completo, audio silenciado ── */}
    <Video
      src={staticFile("recording.mp4")}
      muted
      style={{
        width:      "100%",
        height:     "100%",
        objectFit:  "cover",
      }}
      onError={() => undefined}
    />

    {/* ── Avatar en burbuja circular — esquina inferior izquierda ── */}
    <div style={{
      position:     "absolute",
      width:        BUBBLE_SIZE,
      height:       BUBBLE_SIZE,
      left:         BUBBLE_LEFT,
      bottom:       BUBBLE_BOTTOM,
      borderRadius: BUBBLE_SIZE / 2,
      overflow:     "hidden",
      // Borde dorado + sombra para que destaque sobre la grabación
      boxShadow:    "0 0 0 4px #FFBF00, 0 8px 32px rgba(0,0,0,0.7)",
      zIndex:       20,
    }}>
      {/*
        objectFit: cover → escala el vídeo 9:16 para llenar el cuadrado 1:1,
        recortando los laterales.
        objectPosition: 50% 12% → desplaza la ventana de recorte hacia la zona
        de la cara (evita mostrar la coronilla o el pecho).
        Si la cara queda demasiado arriba/abajo, ajusta el segundo valor (%).
      */}
      <Video
        src={staticFile("avatar.mp4")}
        style={{
          width:           "100%",
          height:          "100%",
          objectFit:       "cover",
          objectPosition:  "50% 12%",
        }}
        onError={() => undefined}
      />
    </div>

    {/* ── Subtítulos karaoke — durante todo el vídeo ── */}
    <SubtitleOverlay script={script} totalFrames={totalFrames} />

  </AbsoluteFill>
);
