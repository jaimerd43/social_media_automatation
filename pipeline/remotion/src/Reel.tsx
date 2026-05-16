import React from "react";
import {
  AbsoluteFill,
  Easing,
  Sequence,
  Video,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { BrandText } from "./components/BrandText";
import { PhoneMockup } from "./components/PhoneMockup";
import { SubtitleOverlay } from "./components/SubtitleOverlay";
import { ReelProps } from "./types";

const TRANSITION = 18;   // frames (~0.6s a 30fps)
const BUBBLE_SIZE = 180;
const BUBBLE_LEFT = 40;
const BUBBLE_BOTTOM = 90;

// Zoom + offset vertical para centrar la cara del avatar en la burbuja.
// El avatar de HeyGen aparece en el tercio superior del vídeo 9:16.
// Con FACE_ZOOM=2.2, mostramos el 45% superior del vídeo escalado → cara centrada.
const FACE_ZOOM   = 2.2;   // escala relativa al tamaño de la burbuja
const FACE_OFFSET = "-8%"; // desplazamiento vertical (negativo = sube)

export const Reel: React.FC<ReelProps> = ({
  script,
  hookEndFrame,
  demoEndFrame,
  totalFrames,
}) => {
  const frame = useCurrentFrame();

  // 0→1 al entrar en demo, 1→0 al salir hacia CTA
  const enterDemo = interpolate(
    frame,
    [hookEndFrame - TRANSITION, hookEndFrame + TRANSITION],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.ease) }
  );
  const exitDemo = interpolate(
    frame,
    [demoEndFrame - TRANSITION, demoEndFrame + TRANSITION],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.ease) }
  );

  const demoMix = Math.max(0, enterDemo - exitDemo);

  // Geometría del contenedor del avatar
  const bubbleTop  = 1920 - BUBBLE_SIZE - BUBBLE_BOTTOM;
  const avatarW    = interpolate(demoMix, [0, 1], [1080, BUBBLE_SIZE]);
  const avatarH    = interpolate(demoMix, [0, 1], [1920, BUBBLE_SIZE]);
  const avatarLeft = interpolate(demoMix, [0, 1], [0, BUBBLE_LEFT]);
  const avatarTop  = interpolate(demoMix, [0, 1], [0, bubbleTop]);
  const avatarRadius = interpolate(demoMix, [0, 1], [0, BUBBLE_SIZE / 2]);

  // Phone mockup
  const phoneOpacity = Math.min(
    interpolate(frame, [hookEndFrame, hookEndFrame + TRANSITION], [0, 1], {
      extrapolateLeft: "clamp", extrapolateRight: "clamp",
    }),
    interpolate(frame, [demoEndFrame - TRANSITION, demoEndFrame], [1, 0], {
      extrapolateLeft: "clamp", extrapolateRight: "clamp",
    })
  );

  // Textos hook / CTA
  const hookFadeOut = Math.max(hookEndFrame - TRANSITION, 25);
  const hookTextOpacity = interpolate(
    frame,
    [8, 24, hookFadeOut, Math.max(hookEndFrame, hookFadeOut + 1)],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const ctaFadeInStart  = demoEndFrame + 8;
  const ctaFadeInEnd    = demoEndFrame + TRANSITION;
  const ctaFadeOutStart = Math.max(totalFrames - 8, ctaFadeInEnd + 1);
  const ctaFadeOutEnd   = Math.max(totalFrames,     ctaFadeOutStart + 1);
  const ctaTextOpacity  = interpolate(
    frame,
    [ctaFadeInStart, ctaFadeInEnd, ctaFadeOutStart, ctaFadeOutEnd],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill style={{
      background: "#0D1B12",
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", Roboto, sans-serif',
      overflow: "hidden",
    }}>

      {/* ── Avatar — siempre en reproducción, cambia tamaño/posición ── */}
      <div style={{
        position:     "absolute",
        width:        avatarW,
        height:       avatarH,
        left:         avatarLeft,
        top:          avatarTop,
        borderRadius: avatarRadius,
        overflow:     "hidden",
        boxShadow:    demoMix > 0.05
          ? "0 0 0 3px #FFBF00, 0 8px 32px rgba(0,0,0,0.6)"
          : "none",
        zIndex: 20,
      }}>
        {/* En full-screen: video normal */}
        {demoMix < 0.95 && (
          <Video
            src={staticFile("avatar.mp4")}
            onError={() => undefined}
            style={{
              position: "absolute",
              width: "100%", height: "100%",
              objectFit: "cover",
              objectPosition: "center top",
              opacity: 1 - demoMix,
            }}
          />
        )}

        {/* En burbuja: zoom centrado en la cara */}
        {demoMix > 0.05 && (
          <Video
            src={staticFile("avatar.mp4")}
            onError={() => undefined}
            style={{
              position:  "absolute",
              height:    `${FACE_ZOOM * 100}%`,  // zoom
              width:     "auto",
              left:      "50%",
              top:       FACE_OFFSET,
              transform: "translateX(-50%)",
              opacity:   demoMix,
            }}
          />
        )}
      </div>

      {/* ── Phone mockup ── */}
      {phoneOpacity > 0 && (
        <div style={{ position: "absolute", inset: 0, opacity: phoneOpacity, zIndex: 10 }}>
          <Sequence from={hookEndFrame}>
            <PhoneMockup recordingSrc={staticFile("recording.mp4")} />
          </Sequence>
        </div>
      )}

      {/* ── Subtítulos karaoke — durante todo el vídeo ── */}
      <SubtitleOverlay script={script} totalFrames={totalFrames} />

      {/* ── Hook text ── */}
      {hookTextOpacity > 0 && (
        <div style={{ position: "absolute", inset: 0, zIndex: 30 }}>
          <BrandText
            text={script.sections.hook.text}
            position="bottom"
            opacity={hookTextOpacity}
          />
        </div>
      )}

      {/* ── CTA text ── */}
      {ctaTextOpacity > 0 && (
        <div style={{ position: "absolute", inset: 0, zIndex: 30 }}>
          <BrandText
            text={script.sections.cta.text}
            position="bottom"
            accent
            opacity={ctaTextOpacity}
          />
        </div>
      )}
    </AbsoluteFill>
  );
};
