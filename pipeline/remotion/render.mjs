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
const hookEndFrame = Math.round(script.sections.hook.end * FPS);
const demoEndFrame = Math.round(script.sections.demo.end * FPS);

const inputProps = { script, hookEndFrame, demoEndFrame, totalFrames };

// ── 2. Copiar vídeos al public/ ──────────────────────────────────────────────
const publicDir = path.join(__dirname, "public");
fs.mkdirSync(publicDir, { recursive: true });

const avatarDest = path.join(publicDir, "avatar.mp4");
const recordingDest = path.join(publicDir, "recording.mp4");

console.log("Copiando vídeos al directorio público...");
fs.copyFileSync(path.resolve(avatarVideoPath), avatarDest);
fs.copyFileSync(path.resolve(recordingPath), recordingDest);

// ── 3. Bundle + render ───────────────────────────────────────────────────────
try {
  console.log("Empaquetando composición...");
  const bundleLocation = await bundle({
    entryPoint: path.join(__dirname, "src/index.ts"),
    onProgress: (p) => process.stdout.write(`\r  Bundle: ${p}%  `),
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
