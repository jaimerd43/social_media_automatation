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
import { ReelProps } from "./types";

const FPS = 30;
const TRANSITION = 18; // frames (~0.6s)
const BUBBLE_SIZE = 180;
const BUBBLE_LEFT = 44;
const BUBBLE_BOTTOM = 90;

export const Reel: React.FC<ReelProps> = ({
  script,
  hookEndFrame,
  demoEndFrame,
  totalFrames,
}) => {
  const frame = useCurrentFrame();

  // 0→1 as we enter demo, 1→0 as we leave demo (into CTA)
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

  // demoMix: 1 during demo, 0 during hook/CTA
  const demoMix = Math.max(0, enterDemo - exitDemo);

  // Avatar container geometry (full screen → bubble)
  const bubbleTop = 1920 - BUBBLE_SIZE - BUBBLE_BOTTOM;
  const avatarW = interpolate(demoMix, [0, 1], [1080, BUBBLE_SIZE]);
  const avatarH = interpolate(demoMix, [0, 1], [1920, BUBBLE_SIZE]);
  const avatarLeft = interpolate(demoMix, [0, 1], [0, BUBBLE_LEFT]);
  const avatarTop = interpolate(demoMix, [0, 1], [0, bubbleTop]);
  const avatarRadius = interpolate(demoMix, [0, 1], [0, BUBBLE_SIZE / 2]);

  // Phone mockup fade
  const phoneOpacity = Math.min(
    interpolate(frame, [hookEndFrame, hookEndFrame + TRANSITION], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
    interpolate(frame, [demoEndFrame - TRANSITION, demoEndFrame], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    })
  );

  // Text opacities
  const hookTextOpacity = interpolate(
    frame,
    [8, 24, hookEndFrame - TRANSITION, hookEndFrame],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const ctaTextOpacity = interpolate(
    frame,
    [demoEndFrame + 8, demoEndFrame + TRANSITION, totalFrames - 8, totalFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill
      style={{
        background: "#0D1B12",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "SF Pro Display", Roboto, sans-serif',
        overflow: "hidden",
      }}
    >
      {/* Avatar — always playing, transitions between full-screen and bubble */}
      <div
        style={{
          position: "absolute",
          width: avatarW,
          height: avatarH,
          left: avatarLeft,
          top: avatarTop,
          borderRadius: avatarRadius,
          overflow: "hidden",
          boxShadow:
            demoMix > 0.05
              ? "0 0 0 3px #FFBF00, 0 8px 32px rgba(0,0,0,0.6)"
              : "none",
          zIndex: 20,
        }}
      >
        <Video
          src={staticFile("avatar.mp4")}
          onError={() => undefined}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center top",
          }}
        />
      </div>

      {/* Phone mockup — only during demo, synced to demo start */}
      {phoneOpacity > 0 && (
        <div
          style={{ position: "absolute", inset: 0, opacity: phoneOpacity, zIndex: 10 }}
        >
          <Sequence from={hookEndFrame}>
            <PhoneMockup recordingSrc={staticFile("recording.mp4")} />
          </Sequence>
        </div>
      )}

      {/* Hook text */}
      {hookTextOpacity > 0 && (
        <div style={{ position: "absolute", inset: 0, zIndex: 30 }}>
          <BrandText
            text={script.sections.hook.text}
            position="bottom"
            opacity={hookTextOpacity}
          />
        </div>
      )}

      {/* CTA text */}
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
