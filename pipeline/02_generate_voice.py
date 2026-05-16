"""
Genera el audio MP3 a partir del guión usando la voz clonada en ElevenLabs.

Uso:
    python pipeline/02_generate_voice.py output/feature-001_script.json
"""

import json
import os
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(override=True)

ELEVENLABS_API = "https://api.elevenlabs.io/v1"


def generate_voice(script_path: str) -> str:
    script = json.loads(Path(script_path).read_text())
    full_text = script["full_script"]
    feature_id = script["feature_id"]

    voice_id = os.environ["ELEVENLABS_VOICE_ID"]
    api_key = os.environ["ELEVENLABS_API_KEY"]

    url = f"{ELEVENLABS_API}/text-to-speech/{voice_id}"
    headers = {
        "xi-api-key": api_key,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
    }
    body = {
        "text": full_text,
        "model_id": "eleven_multilingual_v2",
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.85,
            "style": 0.0,
            "use_speaker_boost": True,
        },
    }

    word_count = len(full_text.split())
    print(f"Generando voz ({word_count} palabras)...")

    response = requests.post(url, headers=headers, json=body)
    response.raise_for_status()

    output_path = Path(f"output/{feature_id}_voice.mp3")
    output_path.write_bytes(response.content)
    print(f"Voz guardada en: {output_path}")
    return str(output_path)


def main():
    if len(sys.argv) < 2:
        print("Uso: python pipeline/02_generate_voice.py output/feature-001_script.json")
        sys.exit(1)

    generate_voice(sys.argv[1])


if __name__ == "__main__":
    main()
