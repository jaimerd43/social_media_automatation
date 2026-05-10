"""
Orquestador principal. Genera un Reel completo a partir de un feature.json.

Uso:
    python run.py content/features/feature-001.json

Requisitos previos:
    1. Copia .env.example → .env y rellena las API keys
    2. pip3 install -r requirements.txt
    3. cd pipeline/remotion && npm install && cd ../..
    4. Sube tu grabación del móvil a content/recordings/
"""

import json
import subprocess
import sys
from pathlib import Path


def step(label: str, cmd: list[str]):
    bar = "─" * 52
    print(f"\n┌{bar}┐")
    print(f"│  {label:<50}│")
    print(f"└{bar}┘")
    subprocess.run(cmd, check=True)


def main():
    if len(sys.argv) < 2:
        print("Uso: python run.py content/features/<feature>.json")
        sys.exit(1)

    feature_path = Path(sys.argv[1])
    if not feature_path.exists():
        print(f"Error: no se encuentra {feature_path}")
        sys.exit(1)

    feature = json.loads(feature_path.read_text())
    fid = feature["id"]
    recording = feature["recording"]

    if not Path(recording).exists():
        print(f"Error: grabación del móvil no encontrada en '{recording}'")
        print("Graba la demo en el móvil y copia el fichero a esa ruta.")
        sys.exit(1)

    script_path = f"output/{fid}_script.json"
    voice_path = f"output/{fid}_voice.mp3"
    avatar_path = f"output/{fid}_avatar.mp4"
    reel_path = f"output/{fid}_reel.mp4"

    step("1/4  Generando guión (Claude API)", [
        "python3", "pipeline/01_generate_script.py", str(feature_path),
    ])

    step("2/4  Generando voz (ElevenLabs)", [
        "python3", "pipeline/02_generate_voice.py", script_path,
    ])

    step("3/4  Generando avatar (HeyGen)", [
        "python3", "pipeline/03_generate_avatar.py", script_path, voice_path,
    ])

    step("4/4  Renderizando Reel (Remotion)", [
        "node", "pipeline/remotion/render.mjs",
        script_path, avatar_path, recording, reel_path,
    ])

    print(f"\n✓  Reel listo: {reel_path}\n")


if __name__ == "__main__":
    main()
