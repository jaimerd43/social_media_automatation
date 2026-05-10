export interface ScriptSection {
  text: string;
  start: number;
  end: number;
}

export interface Script {
  feature_id: string;
  sections: {
    hook: ScriptSection;
    demo: ScriptSection;
    cta: ScriptSection;
  };
  full_script: string;
  duration_estimate_s: number;
  recording: string;
}

export interface ReelProps {
  script: Script;
  hookEndFrame: number;
  demoEndFrame: number;
  totalFrames: number;
}
