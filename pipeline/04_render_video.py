"""
Renderiza el Reel final usando ffmpeg puro — sin Remotion, sin navegador headless.

Estructura del vídeo:
  ① Hook  — avatar pantalla completa  (0 → hook_end)
  ② Demo  — grabación full-screen + burbuja circular del avatar abajo-izquierda
  ③ CTA   — avatar pantalla completa  (demo_end → fin)

Subtítulos quemados: amarillos, 3 palabras/línea, distribuidos uniformemente.

La burbuja usa alphamerge con máscaras PNG generadas por Pillow.
Los PNG se cargan con -framerate 30 -loop 1 para que ffmpeg los trate como
streams a 30fps (igual que el vídeo) y alphamerge no se quede esperando sync.

Uso:
    python pipeline/04_render_video.py \
        output/feature-001_script.json \
        output/feature-001_avatar.mp4 \
        content/recordings/demo.MOV \
        output/feature-001_reel.mp4
"""

import json
import subprocess
import sys
import tempfile
from pathlib import Path
from PIL import Image, ImageDraw

# ── Parámetros del canvas ────────────────────────────────────────────────────
FPS    = 30
W, H   = 1080, 1920

# ── Burbuja del avatar (demo) ────────────────────────────────────────────────
BUBBLE       = 210        # diámetro del círculo (px)
BUBBLE_X     = 30         # margen izquierdo (px)
BUBBLE_BOT   = 130        # margen inferior (px)
BUBBLE_Y     = H - BUBBLE - BUBBLE_BOT   # = 1580 — coordenada Y superior
BORDER       = 5          # grosor del borde dorado (px)

# ── Recorte facial en la burbuja ─────────────────────────────────────────────
# El avatar (1080×1920) tiene la cara en y≈480–920:
#   top of head ≈ 350 px, eyes ≈ 650 px, chin ≈ 920 px.
# FACE_Y      — dónde empieza el recorte (px desde arriba del avatar)
# FACE_CROP_H — alto del recorte (px); el resultado se escala al bubble.
# Para centrar la cara: face_center ≈ FACE_Y + FACE_CROP_H*0.5
FACE_Y       = 620        # empieza justo sobre el pelo (cara en y≈864 del avatar)
FACE_CROP_H  = 700        # 700px captura pelo→barbilla, escala a 210px burbuja


# ── Helpers ──────────────────────────────────────────────────────────────────
def ff(*args, show_output=False):
    """Lanza ffmpeg. Con show_output=True muestra stderr (para debug)."""
    cmd = ["ffmpeg"] + [str(a) for a in args] + ["-y"]
    if show_output:
        subprocess.run(cmd, check=True)
    else:
        subprocess.run(cmd, check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def probe_duration(path: Path) -> float:
    r = subprocess.run(
        ["ffprobe", "-v", "error",
         "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True, text=True, check=True,
    )
    return float(r.stdout.strip())


# ── Generar máscaras PNG con Pillow (una sola vez, instantáneo) ─────────────
def make_masks(tmp: Path) -> tuple[Path, Path]:
    """
    Genera dos PNGs:
      • circle_mask.png — blanco dentro del círculo, negro fuera (escala de grises)
      • gold_ring.png   — disco dorado RGBA con hueco interior transparente

    IMPORTANTE: al usar estos PNGs como entradas de ffmpeg se DEBE especificar
    -framerate 30 antes de cada -loop 1, para que ffmpeg los trate como stream
    de 30fps (igual que el vídeo). Sin eso, el demuxer de imagen usa 25fps por
    defecto → alphamerge y overlay esperan sincronía que nunca llega → hang.
    """
    bs   = BUBBLE
    ring = bs + BORDER * 2

    # Máscara circular (escala de grises: blanco=opaco, negro=transparente)
    mask_img = Image.new("L", (bs, bs), 0)
    ImageDraw.Draw(mask_img).ellipse([0, 0, bs - 1, bs - 1], fill=255)
    circle_mask = tmp / "circle_mask.png"
    mask_img.save(circle_mask)

    # Borde dorado: disco exterior dorado con hueco interior transparente
    ring_img = Image.new("RGBA", (ring, ring), (0, 0, 0, 0))
    d = ImageDraw.Draw(ring_img)
    d.ellipse([0, 0, ring - 1, ring - 1], fill=(255, 191, 0, 255))
    d.ellipse([BORDER, BORDER, ring - BORDER - 1, ring - BORDER - 1],
              fill=(0, 0, 0, 0))
    gold_ring = tmp / "gold_ring.png"
    ring_img.save(gold_ring)

    return circle_mask, gold_ring


# ── Subtítulos con Pillow + overlay (sin libass) ─────────────────────────────
def _load_font(size: int):
    """Carga la mejor fuente TrueType disponible en el sistema."""
    candidates = [
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/HelveticaNeue.ttc",
        "/Library/Fonts/Arial.ttf",
        "/System/Library/Fonts/Arial.ttf",
        "/System/Library/Fonts/SFNS.ttf",
    ]
    from PIL import ImageFont
    for path in candidates:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                pass
    try:
        return ImageFont.load_default(size=size)   # Pillow 10+
    except Exception:
        return ImageFont.load_default()


def burn_subtitles(no_subs: Path, full_script: str, total_dur: float,
                   tmp: Path, output_path: str):
    """
    Quema subtítulos amarillos (3 palabras/línea) sobre el vídeo.
    Usa Pillow para generar PNGs transparentes + cadena de overlay en ffmpeg.
    No requiere libass/freetype compilado en ffmpeg.
    """
    from PIL import ImageFont

    words  = full_script.split()
    chunks = [" ".join(words[i:i+3]) for i in range(0, len(words), 3)]
    if not chunks:
        import shutil; shutil.copy(no_subs, output_path)
        return

    chunk_dur = total_dur / len(chunks)
    font      = _load_font(68)

    # Banda de subtítulo: encima de la burbuja del avatar
    sub_h = 160                        # alto del PNG de subtítulo (px)
    sub_y = BUBBLE_Y - sub_h - 40     # Y de la banda, 40px sobre la burbuja

    # Generar PNGs
    sub_dir = tmp / "subs"
    sub_dir.mkdir(exist_ok=True)
    sub_pngs: list[Path] = []
    for i, chunk in enumerate(chunks):
        img  = Image.new("RGBA", (W, sub_h), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        # Calcular posición centrada
        bbox = draw.textbbox((0, 0), chunk, font=font)
        tw   = bbox[2] - bbox[0]
        th   = bbox[3] - bbox[1]
        x    = (W - tw) // 2
        y    = (sub_h - th) // 2
        # Contorno negro para legibilidad sobre cualquier fondo
        for dx, dy in [(-3,0),(3,0),(0,-3),(0,3),(-2,-2),(2,2),(-2,2),(2,-2)]:
            draw.text((x+dx, y+dy), chunk, font=font, fill=(0, 0, 0, 220))
        # Texto principal amarillo
        draw.text((x, y), chunk, font=font, fill=(255, 230, 0, 255))
        p = sub_dir / f"s{i:04d}.png"
        img.save(p)
        sub_pngs.append(p)

    # Construir cadena de overlays
    # [0:v] = no_subs   [1:v]..[N:v] = PNGs de subtítulo
    n = len(sub_pngs)
    extra_inputs: list[str] = []
    for png in sub_pngs:
        extra_inputs += ["-framerate", "30", "-loop", "1", "-i", str(png)]

    filt_parts: list[str] = []
    for i in range(n):
        t0    = i * chunk_dur
        t1    = (i + 1) * chunk_dur
        in_v  = "[0:v]"      if i == 0     else f"[sv{i}]"
        out_v = "[out]"      if i == n - 1 else f"[sv{i+1}]"
        filt_parts.append(
            f"{in_v}[{i+1}:v]overlay"
            f"=x=(main_w-overlay_w)/2:y={sub_y}"
            f":enable='between(t,{t0:.4f},{t1:.4f})'"
            f":eof_action=endall{out_v}"
        )

    ff(
        "-i", str(no_subs),
        *extra_inputs,
        "-filter_complex", ";".join(filt_parts),
        "-map", "[out]", "-map", "0:a",
        "-c:v", "libx264", "-preset", "fast", "-crf", "18",
        "-c:a", "copy", "-movflags", "+faststart",
        "-t", str(total_dur), output_path,
    )


# ── Filtro ffmpeg para la demo ────────────────────────────────────────────────
def build_demo_filter(scale_w: int, crop_x: int) -> str:
    """
    Entradas del filtergraph:
      [0:v] grabación de pantalla (background)
      [1:v] avatar (vídeo para la burbuja)
      [2:v] circle_mask.png (-framerate 30 -loop 1) — máscara circular gris
      [3:v] gold_ring.png   (-framerate 30 -loop 1) — borde dorado RGBA

    El -framerate 30 en los inputs de imagen es CRÍTICO: sin él ffmpeg genera
    streams a 25fps por defecto, lo que provoca esperas de sincronía perpetuas
    en alphamerge y overlay (el LCM(25,30)=150 frames bloquea cada 5 segundos).

    Salida: [out] vídeo compuesto.
    """
    bs     = BUBBLE   # 210
    border = BORDER   # 5
    bx     = BUBBLE_X - border       # 25
    by_    = BUBBLE_Y - border       # 1575

    # ① Recorte facial (desde FACE_Y) + escala cuadrada del avatar
    avatar_sq = (
        f"[1:v]"
        f"crop={W}:{FACE_CROP_H}:0:{FACE_Y},"
        f"scale={scale_w}:{bs},"
        f"crop={bs}:{bs}:{crop_x}:0,"
        f"format=rgba"
        f"[avatar_sq]"
    )

    # ② Máscara circular por alphamerge (O(n) channel-copy, instantáneo)
    #    [2:v] = circle_mask.png gris (blanco=opaco, negro=transparente) a 30fps
    apply_mask = "[avatar_sq][2:v]alphamerge[circ]"

    # ③ Borde dorado ([3:v]) + avatar circular superpuesto
    # eof_action=endall en inner overlay también, por si [circ] acaba antes
    composite = f"[3:v][circ]overlay={border}:{border}:eof_action=endall[bubble]"

    # ④ Fondo: grabación escalada al canvas
    bg = f"[0:v]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},setsar=1[bg]"

    # ⑤ Burbuja sobre fondo
    # eof_action=endall → termina el filtro cuando [bg] (stream finito) acaba,
    # evitando que los inputs -loop 1 (infinitos) bloqueen el proceso.
    final = f"[bg][bubble]overlay={bx}:{by_}:eof_action=endall[out]"

    return ";".join([avatar_sq, apply_mask, composite, bg, final])


# ── Pipeline principal ────────────────────────────────────────────────────────
def main():
    if len(sys.argv) < 5:
        sys.exit("Uso: python pipeline/04_render_video.py "
                 "script.json avatar.mp4 recording.ext output.mp4")

    script_path   = sys.argv[1]
    avatar_in     = sys.argv[2]
    recording_in  = sys.argv[3]
    output_path   = sys.argv[4]

    script       = json.loads(Path(script_path).read_text())
    full_script  = script["full_script"]
    dur_est      = script["duration_estimate_s"]
    hook_end_est = script["sections"]["hook"]["end"]
    demo_end_est = script["sections"]["demo"]["end"]

    # Duración real del avatar → escalar timestamps del guión
    real_dur = probe_duration(avatar_in)
    scale    = real_dur / dur_est
    hook_end = min(hook_end_est * scale, real_dur - 4.0)
    demo_end = min(demo_end_est * scale, real_dur - 1.0)
    demo_dur = demo_end - hook_end

    print(f"Avatar: {real_dur:.2f}s  (escala {scale:.2f}x)")
    print(f"  ① Hook  0 → {hook_end:.2f}s")
    print(f"  ② Demo  {hook_end:.2f}s → {demo_end:.2f}s  ({demo_dur:.2f}s)")
    print(f"  ③ CTA   {demo_end:.2f}s → {real_dur:.2f}s", flush=True)

    # Cálculo de escala de la burbuja
    bs       = BUBBLE
    scale_w  = int(bs * W / FACE_CROP_H)   # ancho tras escalar al alto del círculo
    crop_x   = (scale_w - bs) // 2          # recorte centrado en X

    with tempfile.TemporaryDirectory() as _tmp:
        tmp = Path(_tmp)

        # ── A. Máscaras PNG (Pillow, instantáneo) ────────────────────────────
        print("\n[1/6] Generando máscaras (Pillow)...", flush=True)
        circle_mask, gold_ring = make_masks(tmp)

        # ── B. Preparar avatar (H.264 8-bit 30fps, keyframes cada 1s) ───────
        print("[2/6] Preparando avatar...", flush=True)
        av = tmp / "avatar.mp4"
        ff("-i", avatar_in,
           "-r", FPS, "-c:v", "libx264", "-preset", "fast",
           "-crf", "18", "-pix_fmt", "yuv420p",
           "-g", FPS, "-keyint_min", FPS, "-sc_threshold", "0",
           "-c:a", "aac", "-movflags", "+faststart", av)

        # ── C. Preparar grabación (H.264 8-bit 30fps, ffmpeg auto-rota MOV) ─
        print("[3/6] Preparando grabación de pantalla...", flush=True)
        rec = tmp / "recording.mp4"
        ff("-i", recording_in,
           "-r", FPS, "-c:v", "libx264", "-preset", "fast",
           "-crf", "18", "-pix_fmt", "yuv420p",
           "-g", FPS, "-keyint_min", FPS, "-sc_threshold", "0",
           "-c:a", "aac", "-movflags", "+faststart", rec)

        # ── D. Clip HOOK: avatar pantalla completa (0 → hook_end) ────────────
        print(f"[4/6] Clip HOOK  (0 → {hook_end:.2f}s)...", flush=True)
        hook_clip = tmp / "hook.mp4"
        ff("-ss", "0", "-t", str(hook_end), "-i", str(av),
           "-c:v", "libx264", "-preset", "fast", "-crf", "18",
           "-c:a", "aac", "-movflags", "+faststart", str(hook_clip))

        # ── E. Clip DEMO: grabación full + burbuja avatar ─────────────────────
        print(f"[5/6] Clip DEMO  ({hook_end:.2f}s → {demo_end:.2f}s)...", flush=True)
        demo_clip = tmp / "demo.mp4"
        ff(
            # [0] grabación: empieza desde 0, dura demo_dur
            "-t", str(demo_dur), "-i", str(rec),
            # [1] avatar: continúa desde hook_end para mantener lip-sync
            "-ss", str(hook_end), "-t", str(demo_dur), "-i", str(av),
            # [2] máscara círculo (30fps explícito → sin desincronía con el vídeo)
            "-framerate", "30", "-loop", "1", "-i", str(circle_mask),
            # [3] borde dorado (30fps explícito)
            "-framerate", "30", "-loop", "1", "-i", str(gold_ring),
            "-filter_complex", build_demo_filter(scale_w, crop_x),
            "-map", "[out]",
            "-map", "1:a",
            "-c:v", "libx264", "-preset", "fast", "-crf", "18",
            "-c:a", "aac", "-movflags", "+faststart",
            # Límite de duración de OUTPUT (cinturón+tirantes junto con eof_action=endall)
            "-t", str(demo_dur), str(demo_clip),
        )

        # ── F. Clip CTA: avatar pantalla completa (demo_end → fin) ───────────
        cta_dur = real_dur - demo_end
        print(f"[6/6] Clips CTA + concat + subtítulos...", flush=True)
        cta_clip = tmp / "cta.mp4"
        ff("-ss", str(demo_end), "-t", str(cta_dur), "-i", str(av),
           "-c:v", "libx264", "-preset", "fast", "-crf", "18",
           "-c:a", "aac", "-movflags", "+faststart", str(cta_clip))

        # ── G. Concatenar ─────────────────────────────────────────────────────
        concat_file = tmp / "concat.txt"
        concat_file.write_text(
            f"file '{hook_clip}'\nfile '{demo_clip}'\nfile '{cta_clip}'\n"
        )
        no_subs = tmp / "no_subs.mp4"
        ff("-f", "concat", "-safe", "0", "-i", str(concat_file),
           "-c:v", "libx264", "-preset", "fast", "-crf", "18",
           "-c:a", "aac", "-movflags", "+faststart", str(no_subs))

        # ── H. Subtítulos (Pillow + overlay, sin libass) ──────────────────
        final_dur = probe_duration(no_subs)
        n_chunks  = len(full_script.split()) // 3 + 1
        print(f"     Quemando subtítulos (~{n_chunks} chunks)...", flush=True)
        burn_subtitles(no_subs, full_script, final_dur, tmp, output_path)

        print(f"\n✓  Reel guardado en: {output_path}  ({final_dur:.1f}s)", flush=True)


if __name__ == "__main__":
    main()
