"""
Genera el vídeo del avatar en HeyGen usando el audio de ElevenLabs.
El fondo lo configuras con HEYGEN_BACKGROUND_COLOR (hex, default #012214)
o con HEYGEN_BACKGROUND_IMAGE_URL para un fondo de imagen (habitación, árboles, etc.).

Uso:
    python pipeline/03_generate_avatar.py output/feature-001_script.json output/feature-001_voice.mp3
"""

import json
import os
import sys
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(override=True)

HEYGEN_API = "https://api.heygen.com"
HEYGEN_UPLOAD = "https://upload.heygen.com"


def upload_audio(api_key: str, audio_path: str) -> str:
    """Sube el MP3 a HeyGen Assets y devuelve el asset_id."""
    url = f"{HEYGEN_UPLOAD}/v1/asset"
    headers = {"X-Api-Key": api_key, "Content-Type": "audio/mpeg"}

    with open(audio_path, "rb") as f:
        data = f.read()

    response = requests.post(url, headers=headers, data=data)
    response.raise_for_status()
    asset_id = response.json()["data"]["id"]
    print(f"  Audio subido: {asset_id}")
    return asset_id


def build_background() -> dict:
    """Construye el objeto background para la API de HeyGen."""
    image_url = os.environ.get("HEYGEN_BACKGROUND_IMAGE_URL")
    if image_url:
        return {"type": "image", "url": image_url}
    color = os.environ.get("HEYGEN_BACKGROUND_COLOR", "#012214")
    return {"type": "color", "value": color}


def create_video(api_key: str, avatar_id: str, audio_asset_id: str) -> str:
    """Lanza la generación del vídeo y devuelve el video_id."""
    url = f"{HEYGEN_API}/v2/video/generate"
    headers = {"X-Api-Key": api_key, "Content-Type": "application/json"}

    body = {
        "video_inputs": [
            {
                "character": {
                    "type": "avatar",
                    "avatar_id": avatar_id,
                    "avatar_style": "normal",
                },
                "voice": {
                    "type": "audio",
                    "audio_asset_id": audio_asset_id,
                },
                "background": build_background(),
            }
        ],
        "dimension": {"width": 1080, "height": 1920},
        "aspect_ratio": "9:16",
    }

    response = requests.post(url, headers=headers, json=body)
    response.raise_for_status()
    video_id = response.json()["data"]["video_id"]
    print(f"  video_id: {video_id}")
    return video_id


def poll_until_ready(api_key: str, video_id: str, timeout_s: int = 600) -> str:
    """Espera a que HeyGen termine y devuelve la URL de descarga."""
    url = f"{HEYGEN_API}/v1/video_status.get"
    headers = {"X-Api-Key": api_key}
    deadline = time.time() + timeout_s

    while time.time() < deadline:
        response = requests.get(url, params={"video_id": video_id}, headers=headers)
        response.raise_for_status()
        data = response.json()["data"]
        status = data["status"]

        if status == "completed":
            return data["video_url"]
        if status == "failed":
            raise RuntimeError(f"HeyGen falló: {data.get('error', 'desconocido')}")

        elapsed = int(time.time() - (deadline - timeout_s))
        print(f"  [{elapsed}s] Estado: {status} — esperando 10s...")
        time.sleep(10)

    raise TimeoutError(f"HeyGen no terminó en {timeout_s}s")


def download_video(url: str, output_path: str):
    response = requests.get(url, stream=True)
    response.raise_for_status()
    with open(output_path, "wb") as f:
        for chunk in response.iter_content(chunk_size=8192):
            f.write(chunk)


def generate_avatar(script_path: str, voice_path: str) -> str:
    script = json.loads(Path(script_path).read_text())
    feature_id = script["feature_id"]

    api_key = os.environ["HEYGEN_API_KEY"]
    avatar_id = os.environ["HEYGEN_AVATAR_ID"]

    print("1/3  Subiendo audio a HeyGen...")
    audio_asset_id = upload_audio(api_key, voice_path)

    print("2/3  Enviando solicitud de vídeo...")
    video_id = create_video(api_key, avatar_id, audio_asset_id)

    print("3/3  Esperando procesamiento de HeyGen (puede tardar 2-5 min)...")
    video_url = poll_until_ready(api_key, video_id)

    output_path = f"output/{feature_id}_avatar.mp4"
    print(f"  Descargando vídeo...")
    download_video(video_url, output_path)
    print(f"Avatar guardado en: {output_path}")
    return output_path


def main():
    if len(sys.argv) < 3:
        print(
            "Uso: python pipeline/03_generate_avatar.py "
            "output/feature-001_script.json output/feature-001_voice.mp3"
        )
        sys.exit(1)

    generate_avatar(sys.argv[1], sys.argv[2])


if __name__ == "__main__":
    main()
