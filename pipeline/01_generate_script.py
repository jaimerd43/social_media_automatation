"""
Genera el guión de un Reel a partir de un feature.json.
Usa Claude API con prompt caching para abaratar llamadas repetidas.

Uso:
    python pipeline/01_generate_script.py content/features/feature-001.json
"""

import json
import sys
from pathlib import Path

import anthropic
from dotenv import load_dotenv

load_dotenv()

WORDS_PER_SECOND = 2.5  # ritmo de habla en español

SYSTEM_PROMPT = """Eres el copywriter de Órdago, una app móvil de mus (iOS y Android).

Órdago digitaliza y profesionaliza el ecosistema del mus: torneos, partidas, rankings, \
perfiles de jugadores y herramientas para organizadores.

TONO DE VOZ:
- Profesional, cercano y ambicioso
- Claro y directo, sin tecnicismos fríos
- Con carácter: el mus tiene tradición, comunidad y competición
- Evita: lenguaje de casino, frases genéricas de "app de eventos", promesas exageradas

ESTRUCTURA DEL REEL (30-40 segundos totales):
1. HOOK (3-5 s, ~10 palabras): frase gancho que para el scroll. Puede ser una pregunta \
retórica, un dato sorprendente o una promesa directa.
2. DEMO (20-25 s, ~55-65 palabras): el avatar explica en voz alta lo que el espectador \
ve en pantalla. Describe la acción paso a paso, con naturalidad. Como si se lo estuvieras \
enseñando a un amigo.
3. CTA (5-7 s, ~12-15 palabras): cierre con llamada a la acción. Directo. Sin exclamaciones \
vacías.

REGLAS:
- No uses emojis en el guión (se añaden en los overlays de vídeo)
- El texto debe funcionar como locución, no como texto escrito
- Frases cortas, ritmo ágil
- Cada sección debe fluir de forma natural hacia la siguiente"""


def estimate_duration(text: str) -> float:
    words = len(text.split())
    return round(words / WORDS_PER_SECOND, 1)


def build_timestamps(hook: str, demo: str, cta: str) -> dict:
    hook_end = estimate_duration(hook)
    demo_end = hook_end + estimate_duration(demo)
    cta_end = demo_end + estimate_duration(cta)
    return {
        "hook": {"start": 0.0, "end": hook_end},
        "demo": {"start": hook_end, "end": demo_end},
        "cta": {"start": demo_end, "end": cta_end},
        "total": cta_end,
    }


def generate_script(feature: dict) -> dict:
    client = anthropic.Anthropic()

    user_message = f"""Genera el guión para este Reel de Órdago:

Feature: {feature["title"]}
Hook sugerido: {feature["hook"]}
Puntos clave a demostrar en la demo:
{chr(10).join(f"- {p}" for p in feature["key_points"])}
CTA sugerido: {feature["cta"]}

Devuelve ÚNICAMENTE un JSON válido con esta estructura exacta:
{{
  "hook": "texto del hook",
  "demo": "texto de la demo",
  "cta": "texto del cta"
}}"""

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=512,
        system=[
            {
                "type": "text",
                "text": SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[{"role": "user", "content": user_message}],
    )

    raw = response.content[0].text.strip()
    # Limpia posibles bloques markdown que el modelo añada
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    sections = json.loads(raw.strip())

    timestamps = build_timestamps(
        sections["hook"], sections["demo"], sections["cta"]
    )

    return {
        "feature_id": feature["id"],
        "sections": {
            "hook": {"text": sections["hook"], **timestamps["hook"]},
            "demo": {"text": sections["demo"], **timestamps["demo"]},
            "cta": {"text": sections["cta"], **timestamps["cta"]},
        },
        "full_script": f"{sections['hook']} {sections['demo']} {sections['cta']}",
        "duration_estimate_s": timestamps["total"],
        "recording": feature.get("recording", ""),
    }


def main():
    if len(sys.argv) < 2:
        print("Uso: python pipeline/01_generate_script.py <path/to/feature.json>")
        sys.exit(1)

    feature_path = Path(sys.argv[1])
    feature = json.loads(feature_path.read_text())

    print(f"Generando guión para: {feature['title']}")
    script = generate_script(feature)

    output_path = Path("output") / f"{feature['id']}_script.json"
    output_path.write_text(json.dumps(script, ensure_ascii=False, indent=2))

    print(f"\nGuión generado ({script['duration_estimate_s']}s estimados):")
    print(f"  HOOK : {script['sections']['hook']['text']}")
    print(f"  DEMO : {script['sections']['demo']['text']}")
    print(f"  CTA  : {script['sections']['cta']['text']}")
    print(f"\nGuardado en: {output_path}")


if __name__ == "__main__":
    main()
