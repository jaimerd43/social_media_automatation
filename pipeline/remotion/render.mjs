/**
 * Renderiza un Reel de Órdago a partir de los artefactos generados por la pipeline.
 *
 * Uso:
 *   node pipeline/remotion/render.mjs \
 *     output/feature-001_script.json \
 *     output/feature-001_avatar.mp4 \
 *     content/recordings/feature-001.mp4 \
 *     output/feature-001_reel.mp4
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const [, , scriptJsonPath, avatarVideoPath, recordingPath, outputPath] =
  process.argv;

if (!scriptJsonPath || !avatarVideoPath || !recordingPath || !outputPath) {
  console.error(
    "Uso: node render.mjs <script.json> <avatar.mp4> <recording.mp4> <output.mp4>"
  );
  process.exit(1);
}

// ── 1. Leer script y calcular frames ────────────────────────────────────────
const script = JSON.parse(fs.readFileSync(scriptJsonPath, "utf8"));
const FPS = 30;

// Obtener duración real del vídeo del avatar con ffprobe
let durationS = script.duration_estimate_s;
try {
  const probe = execSync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${path.resolve(avatarVideoPath)}"`,
    { encoding: "utf8" }
  ).trim();
  durationS = parseFloat(probe);
  console.log(`Duración real del avatar: ${durationS.toFixed(2)}s`);
} catch {
  console.warn("ffprobe no disponible, usando duración estimada del script.");
}

const totalFrames = Math.ceil(durationS * FPS);

// Escalar los timestamps del script a la duración real del vídeo.
// ElevenLabs puede hablar más rápido o lento que la estimación de palabras/segundo,
// y HeyGen genera exactamente la duración del audio → los timestamps del script
// pueden quedar fuera del rango real del vídeo si no se escalan.
const scale = durationS / script.duration_estimate_s;
const hookEndFrame = Math.min(
  Math.round(script.sections.hook.end * scale * FPS),
  totalFrames - 60  // mínimo 2s para la demo
);
const demoEndFrame = Math.min(
  Math.round(script.sections.demo.end * scale * FPS),
  totalFrames - 20  // mínimo ~0.7s para el CTA
);

console.log(`Frames → total: ${totalFrames}  hook: ${hookEndFrame}  demo: ${demoEndFrame}  (escala: ${scale.toFixed(2)}x)`);

const inputProps = { script, hookEndFrame, demoEndFrame, totalFrames };

// ── 2. Preparar vídeos en public/ ───────────────────────────────────────────
const publicDir = path.join(__dirname, "public");
fs.mkdirSync(publicDir, { recursive: true });

const avatarDest = path.join(publicDir, "avatar.mp4");
const recordingDest = path.join(publicDir, "recording.mp4");

const resolvedRecording = path.resolve(recordingPath);
const isMov = resolvedRecording.toLowerCase().endsWith(".mov");

console.log("Preparando vídeos...");

// Re-codificar avatar con keyframe cada segundo para que Remotion pueda
// buscar frames exactos sin desincronizar el audio de labios.
console.log("  Re-codificando avatar (keyframes frecuentes para lip sync)...");
execSync(
  `ffmpeg -i "${path.resolve(avatarVideoPath)}" -c:v libx264 -g ${FPS} -keyint_min ${FPS} -sc_threshold 0 -c:a aac -movflags +faststart "${avatarDest}" -y`,
  { stdio: "pipe" }
);

// Siempre re-encodificamos la grabación a H.264 8-bit 30fps para Chromium.
// - HEVC 10-bit 60fps (iPhone 17) provoca "trompicones" en el headless browser.
// - ffmpeg 8.x auto-aplica la rotación del Display Matrix del iPhone (portrait).
// - -r 30        → convierte a 30 fps para que coincida con la composición Remotion.
// - -pix_fmt yuv420p → baja de 10-bit a 8-bit (Chromium requiere 8-bit para H.264).
// - -g 30 -keyint_min 30 → keyframe cada segundo para seeks exactos.
console.log(`  Preparando grabación${isMov ? " (.MOV → H.264)" : ""}...`);
execSync(
  `ffmpeg -i "${resolvedRecording}" -r 30 -c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p -c:a aac -movflags +faststart "${recordingDest}" -y`,
  { stdio: "inherit" }
);
console.log("  Grabación lista.");

// ── 3. Bundle + render ───────────────────────────────────────────────────────
try {
  console.log("Empaquetando composición...");
  const bundleLocation = await bundle({
    entryPoint: path.join(__dirname, "src/index.ts"),
    onProgress: (p) => process.stdout.write(`\r  Bundle: ${p}%  `),
    cacheEnabled: false,   // siempre rebuild limpio para evitar código cacheado obsoleto
  });
  console.log("\nRenderizando vídeo...");

  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: "Reel",
    inputProps,
  });

  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec: "h264",
    outputLocation: path.resolve(outputPath),
    inputProps,
    // Aumentamos el timeout: con dos vídeos simultáneos (recording + avatar)
    // el headless browser necesita más tiempo para cargar y buscar frames.
    timeoutInMilliseconds: 90000,
    // Limitamos la concurrencia para evitar que los dos vídeos compitan
    // por recursos de decodificación en el headless browser.
    concurrencyPerCpu: 0.5,
    onProgress: ({ progress }) =>
      process.stdout.write(`\r  Render: ${Math.round(progress * 100)}%  `),
  });

  console.log(`\n✓ Reel guardado en: ${outputPath}`);
} finally {
  // ── 4. Limpiar public/ ────────────────────────────────────────────────────
  [avatarDest, recordingDest].forEach((f) => {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  });
}
