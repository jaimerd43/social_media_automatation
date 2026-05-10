import React from "react";
import { Composition } from "remotion";
import { Reel } from "./Reel";
import { ReelProps } from "./types";

const PREVIEW_PROPS: ReelProps = {
  script: {
    feature_id: "preview",
    sections: {
      hook: { text: "Encuentra tu próximo torneo en segundos", start: 0, end: 4 },
      demo: { text: "Busca torneos por tu ubicación, filtra por distancia y apúntate con un solo toque.", start: 4, end: 28 },
      cta: { text: "Descarga Órdago y empieza a competir", start: 28, end: 35 },
    },
    full_script: "",
    duration_estimate_s: 35,
    recording: "",
  },
  hookEndFrame: 120,
  demoEndFrame: 840,
  totalFrames: 1050,
};

export const Root: React.FC = () => (
  <Composition
    id="Reel"
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    component={Reel as React.ComponentType<any>}
    fps={30}
    width={1080}
    height={1920}
    durationInFrames={PREVIEW_PROPS.totalFrames}
    defaultProps={PREVIEW_PROPS}
    calculateMetadata={async ({ props }) => ({
      durationInFrames: (props as unknown as ReelProps).totalFrames,
    })}
  />
);
