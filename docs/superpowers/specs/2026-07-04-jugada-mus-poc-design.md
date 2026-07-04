# PoC Remotion: JugadaMus — vídeos explicativos de jugadas de mus

## Contexto

Primer paso hacia un agente de generación de contenido que vivirá en el
servidor (factotum). Por ahora, PoC local: generar vídeos verticales
(9:16, ~20-25s) que explican una jugada de mus (la mano de 4 cartas de
un jugador, en una posición concreta) con voz narrada y subtítulos
palabra-por-palabra.

Se reutiliza el proyecto Remotion existente en `pipeline/remotion`
("ordago-reels"), añadiendo una composición nueva sin tocar la
composición `Reel` actual (Reels de feature explanation con
avatar+grabación).

## Reglas del mus relevantes (investigado, no asumido)

- Se juega con 4 jugadores en 2 parejas, sentados alternados (compañero
  enfrente).
- Se reparten 4 cartas a cada jugador. Cada jugador solo ve sus propias
  4 cartas — las de los demás son secretas.
- Posiciones de habla en orden fijo cíclico: **mano** (primero en
  hablar, gana empates) → **segundo** (a la derecha de mano) →
  **tercero** (pareja/compañero de mano, sentado enfrente) → **postre**
  (a la izquierda de mano, el que reparte, último en hablar).
- `mano` y `tercero` son pareja; `segundo` y `postre` son la otra
  pareja.
- Se apuesta en 4 lances: Grande, Chica, Pares, Juego (o Punto si nadie
  tiene Juego).

Fuentes: elespanol.com/como/jugar-mus-reglas-senas, cccj.es/reglaments/mus,
ludoteka.com/games/mus/rules, mustotal.com/jugar-al-mus.

## Modelo de datos

```ts
type Posicion = "mano" | "segundo" | "tercero" | "postre";

type Jugada = {
  id: string;                        // "postre-reyes-01" — usado para nombrar mp3/json/mp4
  posicion: Posicion;                // posición del jugador cuya mano se explica
  cartas: [string, string, string, string]; // 4 cartas del jugador explicado, ["oros_12_rey", ...]
  etiqueta: string;                  // texto corto del badge, p.ej. "Postre"
  explicacion: string;               // texto narrado (fuente para TTS y fallback de subtítulo)
  audioFile: string;                 // "audio/{id}.mp3", relativo a public/
};
```

`episodios.json` en `pipeline/remotion/data/` contiene 2-3 `Jugada` de
ejemplo.

Los nombres de carta siguen la nomenclatura ya usada en los assets:
`{palo}_{valor}.png` con palos `oros|copas|espadas|bastos` y valores
`01_as|02|03|04|05|06|07|10_sota|11_caballo|12_rey`.

## Estructura de ficheros

```
pipeline/remotion/
├── src/
│   ├── types.ts                 (+ Posicion, Jugada)
│   ├── Root.tsx                 (+ composición "JugadaMus")
│   ├── JugadaMus.tsx             composición nueva
│   └── components/
│       ├── Carta.tsx              carta individual animada (fade+slide via spring())
│       ├── Mesa.tsx               calcula posiciones de los 4 asientos a partir de `posicion`
│       ├── PosicionBadge.tsx      badge esquina superior izquierda
│       └── WordCaption.tsx        subtítulo palabra-por-palabra (karaoke)
├── public/
│   ├── assets/tapete.jpg          (ya existe — en realidad WebP 800x800, ver nota)
│   ├── assets/cartas/*.png        (ya existen, 40 cartas + dorso.png)
│   └── audio/{id}.mp3             generado por scripts/generar-voz.mjs
├── data/
│   ├── episodios.json
│   └── {id}.timestamps.json       generado por scripts/generar-voz.mjs
├── scripts/
│   └── generar-voz.mjs            llama ElevenLabs with-timestamps
└── render-jugadas.mjs             batch render → /output/jugada-{id}.mp4
```

**Notas de assets (no bloqueantes):**
- `tapete.jpg` es realmente un WebP 800×800 con extensión `.jpg`. Al
  cubrir 1080×1920 con `object-fit: cover` se recorta lateralmente y se
  escala ~2.4x — aceptable para una textura, pero puede verse algo
  blanda. No se re-encoda como parte de esta PoC.
- Hay ficheros `... copy.png` duplicados en `public/assets/cartas/` —
  no se tocan; no interfieren porque el código referencia los nombres
  sin `copy`.

## Composición `<JugadaMus>`

**Mesa (`Mesa.tsx`):** dado el `posicion` del jugador explicado, coloca
los 4 asientos usando el orden cíclico real
`mano → segundo → tercero → postre`:
- Asiento del jugador explicado → **abajo-centro**, cartas boca arriba,
  grandes (~320px alto), en abanico.
- Su compañero (posición `+2` en el ciclo) → **arriba-centro**, cartas
  boca abajo (`dorso.png`), escala ~40%.
- Los otros dos (posición `+1` y `-1` en el ciclo) → **izquierda** y
  **derecha**, cartas boca abajo, misma escala reducida.
- El asiento que sea `mano` (sea cual sea, incluido si es el propio
  jugador explicado) lleva anillo dorado (#FFBF00) + etiqueta "MANO"
  superpuesta, para identificarlo a simple vista.

**Entrada:** reparto escalonado por asiento en el orden real de reparto
(mano→segundo→tercero→postre); dentro del asiento explicado, las 4
cartas individuales se escalonan además 4 frames entre sí (fade
0→1 + `translateY` +80→0 vía `spring()`).

**Badge de posición (`PosicionBadge.tsx`):** esquina superior
izquierda, pastilla dorada (#FFBF00) con texto verde oscuro (#012214),
muestra `etiqueta` en mayúsculas.

**Subtítulo (`WordCaption.tsx`):** barra semitransparente inferior
(`rgba(0,0,0,0.55)`, texto dorado), ventana de 3-4 palabras con la
palabra activa resaltada, calculada por frame vs. un array de
timestamps recibido como prop (`words: {word,start,end}[]`). Quien
compone las `inputProps` (Root.tsx para el preview, render-jugadas.mjs
para el render) lee `data/{id}.timestamps.json` de disco de forma
síncrona y lo inyecta ya parseado — el componente no hace `fetch` ni
I/O propio. Si el array llega vacío (timestamps aún no generados),
`WordCaption` cae a mostrar `explicacion` completa de forma estática
(no rompe el preview).

**Audio:** `<Audio src={staticFile(audioFile)} />`.

**Duración total:** `calculateMetadata` en `Root.tsx` (mismo patrón que
`Reel`) — duración real del audio (ffprobe) × 30fps + 30 frames (1s de
margen).

## Generación de voz + timestamps

`scripts/generar-voz.mjs`: por cada `Jugada`, llama a
`POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/with-timestamps`
con el texto de `explicacion` (usa `ELEVENLABS_API_KEY` /
`ELEVENLABS_VOICE_ID` del `.env` raíz, mismo patrón que
`pipeline/02_generate_voice.py` pero en Node).

De la respuesta (audio en base64 + alignment por carácter):
- Decodifica y guarda `public/audio/{id}.mp3`.
- Agrupa los timestamps de carácter en palabras (split por espacios) y
  guarda `data/{id}.timestamps.json` →
  `[{ word, start, end }, ...]` (segundos).

## Render por lotes

`render-jugadas.mjs` (mismo patrón que el `render.mjs` existente, con
`@remotion/bundler` + `@remotion/renderer`):

```
npm run render:jugadas -- data/episodios.json
```

(Se usa el nombre `render:jugadas` en vez de `render` a secas para no
chocar con el script `render` ya existente, que renderiza la
composición `Reel` con una firma de argumentos distinta —
`<script.json> <avatar.mp4> <recording.mp4> <output.mp4>`.)

Por cada `Jugada`: valida que existan `public/audio/{id}.mp3` y
`data/{id}.timestamps.json` (si faltan, avisa y sugiere correr
`generar-voz.mjs` primero); calcula frames totales vía `ffprobe`;
renderiza `JugadaMus` con esos `inputProps`; exporta a
`output/jugada-{id}.mp4`. Log simple por consola, sin barra de
progreso.

## Fuera de alcance de esta PoC

- Mesa "realista" con perspectiva/dorsos individuales de precisión
  fotográfica — se usa una representación esquemática simple.
- Automatizar publicación — sigue siendo manual, fuera de scope (igual
  que el pipeline de Reels existente).
- Despliegue en factotum / servidor — esta PoC es solo validación
  local.
