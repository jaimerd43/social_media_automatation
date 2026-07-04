# JugadaMus PoC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `JugadaMus` Remotion composition to the existing `pipeline/remotion` project that renders a short vertical (1080×1920) video explaining a single player's mus hand — 4 cards, table context with the other 3 players' cards face down, position badge, word-by-word karaoke captions, and a batch render script driven by `data/episodios.json`.

**Architecture:** Reuses the existing `pipeline/remotion` Remotion project (does not touch the existing `Reel` composition/pipeline). Domain-critical logic (seat placement around the mus table, ElevenLabs character→word grouping, active-word lookup for captions) is extracted into small pure functions and unit-tested with Vitest — a new dependency, since this repo has no test runner yet. Purely presentational React components (cards, badge, composition assembly) are verified visually using `npx remotion still`, matching how the rest of this repo already validates Remotion work (no unit tests on JSX in `Reel.tsx`/`SubtitleOverlay.tsx` either).

**Tech Stack:** Remotion 4 (React 18, TypeScript), Vitest (new, for pure logic only), Node 24 native `fetch`, ElevenLabs `with-timestamps` TTS endpoint, ffprobe/ffmpeg (already used by the existing `render.mjs`).

## Global Constraints

- Reuse `pipeline/remotion` — do not create a separate project, do not modify `src/Reel.tsx`, `src/components/SubtitleOverlay.tsx`, or the existing `render.mjs` / `"render"` npm script.
- Frame size 1080×1920, 30fps, matching the existing `Reel` composition.
- Brand colors: dorado `#FFBF00` (badges, highlighted caption word), verde oscuro `#012214` (badge text, background fallback).
- Card asset naming: `{palo}_{valor}.png` with palos `oros|copas|espadas|bastos`, valores `01_as|02|03|04|05|06|07|10_sota|11_caballo|12_rey`; back of card is `dorso.png`. All 42 files already exist in `pipeline/remotion/public/assets/cartas/` and `pipeline/remotion/public/assets/tapete.jpg` — do not need to be created or renamed.
- Mus rules (verified, not assumed): 4 players, 2 teams of 2 (partners sit opposite each other), 4 cards dealt per player, each player only sees their own 4 cards. Speaking/seating order is a fixed cycle: `mano → segundo → tercero → postre`, where `mano`/`tercero` are partners and `segundo`/`postre` are partners; `segundo` sits to `mano`'s right, `postre` sits to `mano`'s left.
- Publishing and server deployment (factotum) are out of scope — this is a local PoC only.
- Use `render:jugadas` as the npm script name (not `render`) to avoid colliding with the existing Reel render script.

---

### Task 1: Shared types + example episode data

**Files:**
- Modify: `pipeline/remotion/src/types.ts`
- Modify: `pipeline/remotion/tsconfig.json`
- Create: `pipeline/remotion/data/episodios.json`

**Interfaces:**
- Produces: `Posicion` (`"mano"|"segundo"|"tercero"|"postre"`), `Jugada` (`{id, posicion, cartas: [string,string,string,string], etiqueta, explicacion, audioFile}`), `Palabra` (`{word, start, end}`), `JugadaMusProps` (`{jugada: Jugada, words: Palabra[], totalFrames: number}`) — all other tasks import these from `../types` (or `./types` from files directly under `src/`).

- [ ] **Step 1: Add the new types to `types.ts`**

Append to `pipeline/remotion/src/types.ts` (existing `ScriptSection`/`Script`/`ReelProps` stay untouched):

```ts
export type Posicion = "mano" | "segundo" | "tercero" | "postre";

export interface Jugada {
  id: string;
  posicion: Posicion;
  cartas: [string, string, string, string];
  etiqueta: string;
  explicacion: string;
  audioFile: string;
}

export interface Palabra {
  word: string;
  start: number;
  end: number;
}

export interface JugadaMusProps {
  jugada: Jugada;
  words: Palabra[];
  totalFrames: number;
}
```

- [ ] **Step 2: Enable JSON imports in `tsconfig.json`**

In `pipeline/remotion/tsconfig.json`, add `"resolveJsonModule": true` to `compilerOptions` (needed later so `Root.tsx` can `import episodios from "../data/episodios.json"`):

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react",
    "strict": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create the example episodes**

Create `pipeline/remotion/data/episodios.json`:

```json
[
  {
    "id": "mano-pares-reyes",
    "posicion": "mano",
    "cartas": ["oros_12_rey", "bastos_12_rey", "espadas_07", "copas_03"],
    "etiqueta": "Mano",
    "explicacion": "Eres mano con duples de reyes. En pares vas fuerte, y si hay empate en grande, ganas tú por ser mano.",
    "audioFile": "audio/mano-pares-reyes.mp3"
  },
  {
    "id": "postre-juego-31",
    "posicion": "postre",
    "cartas": ["oros_10_sota", "copas_10_sota", "espadas_11_caballo", "bastos_01_as"],
    "etiqueta": "Postre",
    "explicacion": "Como postre hablas el último, pero con sota, sota, caballo y as tienes juego de treinta y uno, el premio más alto.",
    "audioFile": "audio/postre-juego-31.mp3"
  },
  {
    "id": "segundo-pares-ases",
    "posicion": "segundo",
    "cartas": ["espadas_01_as", "bastos_01_as", "oros_02", "copas_04"],
    "etiqueta": "Segundo",
    "explicacion": "Vas segundo en hablar con pareja de ases. Es un par bajo, pero en chica esta mano puede ganarte la partida.",
    "audioFile": "audio/segundo-pares-ases.mp3"
  }
]
```

- [ ] **Step 4: Verify types compile**

Run: `cd pipeline/remotion && npx tsc --noEmit`
Expected: no output, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add pipeline/remotion/src/types.ts pipeline/remotion/tsconfig.json pipeline/remotion/data/episodios.json
git commit -m "feat(jugada-mus): add Jugada/Palabra types and example episodios.json"
```

---

### Task 2: Table seating logic (`calcularAsientos`)

**Files:**
- Create: `pipeline/remotion/src/lib/asientos.ts`
- Test: `pipeline/remotion/src/lib/asientos.test.ts`
- Modify: `pipeline/remotion/package.json`

**Interfaces:**
- Consumes: `Posicion` from `../types` (Task 1).
- Produces: `PosicionPantalla` (`"abajo"|"arriba"|"izquierda"|"derecha"`), `Asiento` (`{posicion: Posicion, pantalla: PosicionPantalla, esMano: boolean}`), `ORDEN_POSICIONES: Posicion[]`, `calcularAsientos(posicionExplicada: Posicion): Asiento[]` — consumed by `Mesa.tsx` (Task 6).

- [ ] **Step 1: Install Vitest (new test runner for this repo)**

Run: `cd pipeline/remotion && npm install --save-dev vitest`
Expected: `vitest` added to `devDependencies` in `package.json` and `package-lock.json` updated.

- [ ] **Step 2: Add the `test` script**

In `pipeline/remotion/package.json`, add to `"scripts"`:

```json
"test": "vitest run"
```

- [ ] **Step 3: Write the failing test**

Create `pipeline/remotion/src/lib/asientos.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { calcularAsientos } from "./asientos";

describe("calcularAsientos", () => {
  it("cuando el jugador explicado es mano, el resto queda en el orden real del juego", () => {
    const asientos = calcularAsientos("mano");
    expect(asientos).toEqual([
      { posicion: "mano", pantalla: "abajo", esMano: true },
      { posicion: "tercero", pantalla: "arriba", esMano: false },
      { posicion: "segundo", pantalla: "derecha", esMano: false },
      { posicion: "postre", pantalla: "izquierda", esMano: false },
    ]);
  });

  it("cuando el jugador explicado es postre, mano aparece a la derecha", () => {
    const asientos = calcularAsientos("postre");
    const mano = asientos.find((a) => a.posicion === "mano");
    expect(mano).toEqual({ posicion: "mano", pantalla: "derecha", esMano: true });
  });

  it("el compañero de quien explica siempre queda enfrente (arriba)", () => {
    const asientos = calcularAsientos("segundo");
    const abajo = asientos.find((a) => a.pantalla === "abajo");
    const arriba = asientos.find((a) => a.pantalla === "arriba");
    expect(abajo?.posicion).toBe("segundo");
    expect(arriba?.posicion).toBe("postre");
  });

  it("exactamente un asiento tiene esMano true, sea cual sea la posición explicada", () => {
    (["mano", "segundo", "tercero", "postre"] as const).forEach((pos) => {
      const asientos = calcularAsientos(pos);
      expect(asientos.filter((a) => a.esMano)).toHaveLength(1);
    });
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd pipeline/remotion && npx vitest run src/lib/asientos.test.ts`
Expected: FAIL — `Cannot find module './asientos'`.

- [ ] **Step 5: Implement `asientos.ts`**

Create `pipeline/remotion/src/lib/asientos.ts`:

```ts
import { Posicion } from "../types";

export type PosicionPantalla = "abajo" | "arriba" | "izquierda" | "derecha";

export interface Asiento {
  posicion: Posicion;
  pantalla: PosicionPantalla;
  esMano: boolean;
}

export const ORDEN_POSICIONES: Posicion[] = ["mano", "segundo", "tercero", "postre"];

export function calcularAsientos(posicionExplicada: Posicion): Asiento[] {
  const i = ORDEN_POSICIONES.indexOf(posicionExplicada);
  const crudos: { posicion: Posicion; pantalla: PosicionPantalla }[] = [
    { posicion: ORDEN_POSICIONES[i], pantalla: "abajo" },
    { posicion: ORDEN_POSICIONES[(i + 2) % 4], pantalla: "arriba" },
    { posicion: ORDEN_POSICIONES[(i + 1) % 4], pantalla: "derecha" },
    { posicion: ORDEN_POSICIONES[(i + 3) % 4], pantalla: "izquierda" },
  ];
  return crudos.map((a) => ({ ...a, esMano: a.posicion === "mano" }));
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd pipeline/remotion && npx vitest run src/lib/asientos.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add pipeline/remotion/package.json pipeline/remotion/package-lock.json pipeline/remotion/src/lib/asientos.ts pipeline/remotion/src/lib/asientos.test.ts
git commit -m "feat(jugada-mus): add table seating logic with vitest coverage"
```

---

### Task 3: ElevenLabs character→word grouping (`agruparPalabras`)

**Files:**
- Create: `pipeline/remotion/scripts/alignment.mjs`
- Test: `pipeline/remotion/scripts/alignment.test.mjs`

**Interfaces:**
- Consumes: nothing (pure function over a plain object).
- Produces: `agruparPalabras(alignment: {characters, character_start_times_seconds, character_end_times_seconds}): {word,start,end}[]` — consumed by `scripts/generar-voz.mjs` (Task 10).

- [ ] **Step 1: Write the failing test**

Create `pipeline/remotion/scripts/alignment.test.mjs`:

```js
import { describe, it, expect } from "vitest";
import { agruparPalabras } from "./alignment.mjs";

describe("agruparPalabras", () => {
  it("agrupa caracteres en palabras usando los espacios como separador", () => {
    const alignment = {
      characters: ["H", "o", "l", "a", " ", "m", "u", "s"],
      character_start_times_seconds: [0, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4],
      character_end_times_seconds: [0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45],
    };
    expect(agruparPalabras(alignment)).toEqual([
      { word: "Hola", start: 0, end: 0.25 },
      { word: "mus", start: 0.3, end: 0.45 },
    ]);
  });

  it("ignora espacios múltiples seguidos sin generar palabras vacías", () => {
    const alignment = {
      characters: ["a", " ", " ", "b"],
      character_start_times_seconds: [0, 0.1, 0.2, 0.3],
      character_end_times_seconds: [0.1, 0.2, 0.3, 0.4],
    };
    expect(agruparPalabras(alignment)).toEqual([
      { word: "a", start: 0, end: 0.1 },
      { word: "b", start: 0.3, end: 0.4 },
    ]);
  });

  it("devuelve array vacío si no hay caracteres", () => {
    expect(
      agruparPalabras({
        characters: [],
        character_start_times_seconds: [],
        character_end_times_seconds: [],
      })
    ).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pipeline/remotion && npx vitest run scripts/alignment.test.mjs`
Expected: FAIL — `Cannot find module './alignment.mjs'`.

- [ ] **Step 3: Implement `alignment.mjs`**

Create `pipeline/remotion/scripts/alignment.mjs`:

```js
export function agruparPalabras(alignment) {
  const { characters, character_start_times_seconds, character_end_times_seconds } = alignment;
  const palabras = [];
  let actual = null;

  for (let i = 0; i < characters.length; i++) {
    const c = characters[i];
    if (/\s/.test(c)) {
      if (actual) {
        palabras.push(actual);
        actual = null;
      }
      continue;
    }
    if (!actual) {
      actual = {
        word: c,
        start: character_start_times_seconds[i],
        end: character_end_times_seconds[i],
      };
    } else {
      actual.word += c;
      actual.end = character_end_times_seconds[i];
    }
  }
  if (actual) palabras.push(actual);
  return palabras;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pipeline/remotion && npx vitest run scripts/alignment.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add pipeline/remotion/scripts/alignment.mjs pipeline/remotion/scripts/alignment.test.mjs
git commit -m "feat(jugada-mus): add ElevenLabs character-to-word alignment grouping"
```

---

### Task 4: Active-word lookup for captions (`palabraActiva`)

**Files:**
- Create: `pipeline/remotion/src/lib/subtitulos.ts`
- Test: `pipeline/remotion/src/lib/subtitulos.test.ts`

**Interfaces:**
- Consumes: `Palabra` from `../types` (Task 1).
- Produces: `palabraActiva(frame: number, fps: number, words: Palabra[]): number` (index into `words`, or `-1` if none active yet / list empty) — consumed by `WordCaption.tsx` (Task 7).

- [ ] **Step 1: Write the failing test**

Create `pipeline/remotion/src/lib/subtitulos.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { palabraActiva } from "./subtitulos";
import { Palabra } from "../types";

const words: Palabra[] = [
  { word: "Hola", start: 0, end: 0.3 },
  { word: "mus", start: 0.35, end: 0.6 },
  { word: "amigos", start: 0.65, end: 1.1 },
];

describe("palabraActiva", () => {
  it("devuelve -1 si aún no ha empezado ninguna palabra", () => {
    expect(palabraActiva(-3, 30, words)).toBe(-1);
  });

  it("devuelve el índice de la primera palabra cuando el frame cae dentro de su rango", () => {
    expect(palabraActiva(3, 30, words)).toBe(0); // 3/30s = 0.1s, dentro de "Hola"
  });

  it("avanza al índice de la segunda palabra cuando toca su rango", () => {
    expect(palabraActiva(12, 30, words)).toBe(1); // 12/30s = 0.4s, dentro de "mus"
  });

  it("se queda en la última palabra tras su fin, hasta que acabe el vídeo", () => {
    expect(palabraActiva(60, 30, words)).toBe(2); // 60/30s = 2s, después de "amigos"
  });

  it("devuelve -1 si la lista de palabras está vacía", () => {
    expect(palabraActiva(10, 30, [])).toBe(-1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pipeline/remotion && npx vitest run src/lib/subtitulos.test.ts`
Expected: FAIL — `Cannot find module './subtitulos'`.

- [ ] **Step 3: Implement `subtitulos.ts`**

Create `pipeline/remotion/src/lib/subtitulos.ts`:

```ts
import { Palabra } from "../types";

export function palabraActiva(frame: number, fps: number, words: Palabra[]): number {
  if (words.length === 0) return -1;
  const t = frame / fps;
  let indice = -1;
  for (let i = 0; i < words.length; i++) {
    if (words[i].start <= t) {
      indice = i;
    } else {
      break;
    }
  }
  return indice;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pipeline/remotion && npx vitest run src/lib/subtitulos.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add pipeline/remotion/src/lib/subtitulos.ts pipeline/remotion/src/lib/subtitulos.test.ts
git commit -m "feat(jugada-mus): add active-word lookup for karaoke captions"
```

---

### Task 5: `Carta` component (single animated card)

**Files:**
- Create: `pipeline/remotion/src/components/Carta.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks (uses Remotion's own `spring`/`interpolate`).
- Produces: `<Carta archivo bocaArriba retrasoFrames alturaPx rotacionDeg? desplazamientoXPx? />` — consumed by `Mesa.tsx` (Task 6).

- [ ] **Step 1: Implement `Carta.tsx`**

Create `pipeline/remotion/src/components/Carta.tsx`:

```tsx
import React from "react";
import { Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

interface CartaProps {
  archivo: string;
  bocaArriba: boolean;
  retrasoFrames: number;
  alturaPx: number;
  rotacionDeg?: number;
  desplazamientoXPx?: number;
}

export const Carta: React.FC<CartaProps> = ({
  archivo,
  bocaArriba,
  retrasoFrames,
  alturaPx,
  rotacionDeg = 0,
  desplazamientoXPx = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progreso = spring({
    frame: frame - retrasoFrames,
    fps,
    config: { damping: 200 },
  });

  const opacity = interpolate(progreso, [0, 1], [0, 1]);
  const translateY = interpolate(progreso, [0, 1], [80, 0]);

  const nombreArchivo = bocaArriba ? archivo : "dorso";

  return (
    <Img
      src={staticFile(`assets/cartas/${nombreArchivo}.png`)}
      style={{
        position: "absolute",
        height: alturaPx,
        left: `calc(50% + ${desplazamientoXPx}px)`,
        transform: `translateX(-50%) translateY(${translateY}px) rotate(${rotacionDeg}deg)`,
        opacity,
      }}
    />
  );
};
```

- [ ] **Step 2: Verify it compiles**

Run: `cd pipeline/remotion && npx tsc --noEmit`
Expected: no output, exit code 0. (Visual verification happens in Task 6 once `Carta` is used inside `Mesa`.)

- [ ] **Step 3: Commit**

```bash
git add pipeline/remotion/src/components/Carta.tsx
git commit -m "feat(jugada-mus): add animated single-card component"
```

---

### Task 6: `Mesa` component (full table: 4 seats)

**Files:**
- Create: `pipeline/remotion/src/components/Mesa.tsx`
- Modify: `pipeline/remotion/src/Root.tsx` (temporary preview registration, superseded by Task 9)

**Interfaces:**
- Consumes: `calcularAsientos`, `ORDEN_POSICIONES`, `PosicionPantalla` from `../lib/asientos` (Task 2); `Carta` from `./Carta` (Task 5); `Posicion` from `../types` (Task 1).
- Produces: `<Mesa posicionExplicada cartasExplicadas />` — consumed by `JugadaMus.tsx` (Task 8).

- [ ] **Step 1: Implement `Mesa.tsx`**

Create `pipeline/remotion/src/components/Mesa.tsx`:

```tsx
import React from "react";
import { AbsoluteFill } from "remotion";
import { Carta } from "./Carta";
import { Posicion } from "../types";
import { calcularAsientos, ORDEN_POSICIONES, PosicionPantalla } from "../lib/asientos";

interface MesaProps {
  posicionExplicada: Posicion;
  cartasExplicadas: [string, string, string, string];
}

const ROTACIONES = [-15, -5, 5, 15];
const DESPLAZAMIENTOS_GRANDE = [-180, -60, 60, 180];
const DESPLAZAMIENTOS_PEQUENO = [-70, -25, 25, 70];

const RETRASO_ENTRE_ASIENTOS = 6;
const RETRASO_ENTRE_CARTAS = 4;

const ESTILO_CONTENEDOR: Record<PosicionPantalla, React.CSSProperties> = {
  abajo: { justifyContent: "center", alignItems: "flex-end", paddingBottom: 420 },
  arriba: { justifyContent: "center", alignItems: "flex-start", paddingTop: 140 },
  izquierda: { justifyContent: "flex-start", alignItems: "center", paddingLeft: 40 },
  derecha: { justifyContent: "flex-end", alignItems: "center", paddingRight: 40 },
};

export const Mesa: React.FC<MesaProps> = ({ posicionExplicada, cartasExplicadas }) => {
  const asientos = calcularAsientos(posicionExplicada);

  return (
    <>
      {asientos.map((asiento) => {
        const bocaArriba = asiento.pantalla === "abajo";
        const alturaPx = bocaArriba ? 340 : 140;
        const desplazamientos = bocaArriba ? DESPLAZAMIENTOS_GRANDE : DESPLAZAMIENTOS_PEQUENO;
        const retrasoAsiento = ORDEN_POSICIONES.indexOf(asiento.posicion) * RETRASO_ENTRE_ASIENTOS;

        return (
          <AbsoluteFill
            key={asiento.pantalla}
            style={{ display: "flex", flexDirection: "row", ...ESTILO_CONTENEDOR[asiento.pantalla] }}
          >
            <div style={{ position: "relative", width: bocaArriba ? 760 : 320, height: alturaPx }}>
              {[0, 1, 2, 3].map((i) => (
                <Carta
                  key={i}
                  archivo={bocaArriba ? cartasExplicadas[i] : "dorso"}
                  bocaArriba={bocaArriba}
                  retrasoFrames={retrasoAsiento + i * RETRASO_ENTRE_CARTAS}
                  alturaPx={alturaPx}
                  rotacionDeg={ROTACIONES[i]}
                  desplazamientoXPx={desplazamientos[i]}
                />
              ))}
              {asiento.esMano && (
                <div
                  style={{
                    position: "absolute",
                    top: -36,
                    left: "50%",
                    transform: "translateX(-50%)",
                    background: "#FFBF00",
                    color: "#012214",
                    fontWeight: 800,
                    fontSize: 22,
                    padding: "4px 16px",
                    borderRadius: 999,
                    boxShadow: "0 0 0 3px #FFBF00, 0 4px 12px rgba(0,0,0,0.5)",
                    letterSpacing: 1,
                    zIndex: 70,
                  }}
                >
                  MANO
                </div>
              )}
            </div>
          </AbsoluteFill>
        );
      })}
    </>
  );
};
```

- [ ] **Step 2: Temporarily register a preview composition to visually check the table**

This composition is throwaway — Task 9 replaces it with the final `JugadaMus` registration. Add to `pipeline/remotion/src/Root.tsx`, right after the existing `<Composition id="Reel" ... />` (inside the same `<>...</>` if one exists, or wrap both compositions in a fragment if `Root` currently returns a single `<Composition>`):

```tsx
import { Mesa } from "./components/Mesa";
// ...
<Composition
  id="MesaPreview__TEMP"
  component={() => (
    <AbsoluteFill style={{ background: "#046A3C" }}>
      <Mesa
        posicionExplicada="segundo"
        cartasExplicadas={["oros_12_rey", "bastos_12_rey", "espadas_07", "copas_03"]}
      />
    </AbsoluteFill>
  )}
  fps={30}
  width={1080}
  height={1920}
  durationInFrames={90}
/>
```

(Needs `AbsoluteFill` imported in `Root.tsx` if not already.)

- [ ] **Step 3: Render a still frame to verify visually**

Run: `cd pipeline/remotion && npx remotion still src/index.ts MesaPreview__TEMP /tmp/mesa-preview.png --frame=60`
Expected: a PNG is created. Read `/tmp/mesa-preview.png` (e.g. with the `Read` tool) and confirm: 4 cards face-up bottom-center, 3 small face-down fans (top/left/right), and exactly one "MANO" gold tag — on the **right** seat, since `posicionExplicada="segundo"` means `mano` sits to segundo's right per `calcularAsientos`.

- [ ] **Step 4: Remove the temporary composition**

Delete the `MesaPreview__TEMP` `<Composition>` block added in Step 2 from `Root.tsx` (keep the `Mesa` import removed too — it'll be re-added in Task 8/9).

- [ ] **Step 5: Verify `Root.tsx` is back to its Task-1 state plus nothing else**

Run: `cd pipeline/remotion && git diff src/Root.tsx`
Expected: no output (file identical to before this task).

- [ ] **Step 6: Commit**

```bash
git add pipeline/remotion/src/components/Mesa.tsx
git commit -m "feat(jugada-mus): add Mesa component rendering all 4 seats"
```

---

### Task 7: `WordCaption` component

**Files:**
- Create: `pipeline/remotion/src/components/WordCaption.tsx`

**Interfaces:**
- Consumes: `palabraActiva` from `../lib/subtitulos` (Task 4); `Palabra` from `../types` (Task 1).
- Produces: `<WordCaption words textoEstatico />` — consumed by `JugadaMus.tsx` (Task 8).

- [ ] **Step 1: Implement `WordCaption.tsx`**

Create `pipeline/remotion/src/components/WordCaption.tsx`:

```tsx
import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Palabra } from "../types";
import { palabraActiva } from "../lib/subtitulos";

interface WordCaptionProps {
  words: Palabra[];
  textoEstatico: string;
}

const VENTANA = 4;

function estiloPalabra(activa: boolean): React.CSSProperties {
  return {
    color: activa ? "#FFBF00" : "#F5E6C8",
    fontSize: 60,
    fontWeight: 800,
    letterSpacing: -0.5,
    textShadow: "0 3px 10px rgba(0,0,0,0.7)",
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", Roboto, sans-serif',
  };
}

export const WordCaption: React.FC<WordCaptionProps> = ({ words, textoEstatico }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  let contenido: React.ReactNode;
  if (words.length === 0) {
    contenido = <span style={estiloPalabra(false)}>{textoEstatico}</span>;
  } else {
    const indice = palabraActiva(frame, fps, words);
    const desde = Math.max(0, indice - (VENTANA - 1));
    const visibles = words.slice(desde, indice + 1);
    contenido = visibles.map((p, idx) => {
      const esActiva = desde + idx === indice;
      return (
        <span key={desde + idx} style={estiloPalabra(esActiva)}>
          {p.word}{" "}
        </span>
      );
    });
  }

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: 90,
        pointerEvents: "none",
        zIndex: 50,
      }}
    >
      <div
        style={{
          background: "rgba(0, 0, 0, 0.55)",
          borderRadius: 14,
          paddingTop: 14,
          paddingBottom: 14,
          paddingLeft: 28,
          paddingRight: 28,
          maxWidth: 900,
        }}
      >
        <span style={{ display: "block", textAlign: "center", lineHeight: 1.15 }}>
          {contenido}
        </span>
      </div>
    </AbsoluteFill>
  );
};
```

- [ ] **Step 2: Verify it compiles**

Run: `cd pipeline/remotion && npx tsc --noEmit`
Expected: no output, exit code 0. (The active-word logic itself is already covered by `subtitulos.test.ts` in Task 4; visual check happens in Task 8.)

- [ ] **Step 3: Commit**

```bash
git add pipeline/remotion/src/components/WordCaption.tsx
git commit -m "feat(jugada-mus): add karaoke-style WordCaption component"
```

---

### Task 8: `PosicionBadge` + `JugadaMus` composition assembly

**Files:**
- Create: `pipeline/remotion/src/components/PosicionBadge.tsx`
- Create: `pipeline/remotion/src/JugadaMus.tsx`

**Interfaces:**
- Consumes: `Mesa` (Task 6), `WordCaption` (Task 7), `JugadaMusProps` (Task 1).
- Produces: `<PosicionBadge etiqueta />`; `<JugadaMus jugada words totalFrames />` (React component, matches `JugadaMusProps`) — consumed by `Root.tsx` (Task 9).

- [ ] **Step 1: Implement `PosicionBadge.tsx`**

Create `pipeline/remotion/src/components/PosicionBadge.tsx`:

```tsx
import React from "react";

interface PosicionBadgeProps {
  etiqueta: string;
}

export const PosicionBadge: React.FC<PosicionBadgeProps> = ({ etiqueta }) => (
  <div
    style={{
      position: "absolute",
      top: 60,
      left: 40,
      background: "#FFBF00",
      color: "#012214",
      fontWeight: 800,
      fontSize: 32,
      padding: "10px 28px",
      borderRadius: 999,
      letterSpacing: 1,
      textTransform: "uppercase",
      boxShadow: "0 4px 14px rgba(0,0,0,0.4)",
      zIndex: 60,
    }}
  >
    {etiqueta}
  </div>
);
```

- [ ] **Step 2: Implement `JugadaMus.tsx`**

Create `pipeline/remotion/src/JugadaMus.tsx`:

```tsx
import React from "react";
import { AbsoluteFill, Audio, Img, staticFile } from "remotion";
import { Mesa } from "./components/Mesa";
import { PosicionBadge } from "./components/PosicionBadge";
import { WordCaption } from "./components/WordCaption";
import { JugadaMusProps } from "./types";

export const JugadaMus: React.FC<JugadaMusProps> = ({ jugada, words }) => (
  <AbsoluteFill style={{ background: "#012214" }}>
    <Img
      src={staticFile("assets/tapete.jpg")}
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
    />
    <Mesa posicionExplicada={jugada.posicion} cartasExplicadas={jugada.cartas} />
    <PosicionBadge etiqueta={jugada.etiqueta} />
    <WordCaption words={words} textoEstatico={jugada.explicacion} />
    <Audio src={staticFile(jugada.audioFile)} />
  </AbsoluteFill>
);
```

- [ ] **Step 3: Verify it compiles**

Run: `cd pipeline/remotion && npx tsc --noEmit`
Expected: no output, exit code 0.

- [ ] **Step 4: Commit**

```bash
git add pipeline/remotion/src/components/PosicionBadge.tsx pipeline/remotion/src/JugadaMus.tsx
git commit -m "feat(jugada-mus): assemble JugadaMus composition (tapete, mesa, badge, caption, audio)"
```

---

### Task 9: Register `JugadaMus` in `Root.tsx`

**Files:**
- Modify: `pipeline/remotion/src/Root.tsx`

**Interfaces:**
- Consumes: `JugadaMus` (Task 8), `Jugada`/`JugadaMusProps` (Task 1), `data/episodios.json` (Task 1).
- Produces: Remotion composition with `id="JugadaMus"` — consumed by `render-jugadas.mjs` (Task 11) via `selectComposition({ id: "JugadaMus" })`.

- [ ] **Step 1: Read the current `Root.tsx` before editing**

Run: `cat pipeline/remotion/src/Root.tsx`
(Confirm it still matches the Task-1 baseline — no leftover `MesaPreview__TEMP` from Task 6.)

- [ ] **Step 2: Replace `Root.tsx` with the version that registers both compositions**

Write `pipeline/remotion/src/Root.tsx`:

```tsx
import React from "react";
import { Composition } from "remotion";
import { Reel } from "./Reel";
import { JugadaMus } from "./JugadaMus";
import { ReelProps, Jugada, JugadaMusProps } from "./types";
import episodiosRaw from "../data/episodios.json";

const episodios = episodiosRaw as Jugada[];

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

const JUGADA_MUS_PREVIEW_PROPS: JugadaMusProps = {
  jugada: episodios[0],
  words: [],
  totalFrames: 630,
};

export const Root: React.FC = () => (
  <>
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
    <Composition
      id="JugadaMus"
      component={JugadaMus}
      fps={30}
      width={1080}
      height={1920}
      durationInFrames={JUGADA_MUS_PREVIEW_PROPS.totalFrames}
      defaultProps={JUGADA_MUS_PREVIEW_PROPS}
      calculateMetadata={async ({ props }) => ({
        durationInFrames: (props as unknown as JugadaMusProps).totalFrames,
      })}
    />
  </>
);
```

- [ ] **Step 3: Verify it compiles**

Run: `cd pipeline/remotion && npx tsc --noEmit`
Expected: no output, exit code 0.

- [ ] **Step 4: Render a still frame of each example episode to verify visually**

Run for each of the 3 episodes (note: `defaultProps` only covers `episodios[0]`; override `jugada` via `--props` to check the other two):

```bash
cd pipeline/remotion
npx remotion still src/index.ts JugadaMus /tmp/jugada-0.png --frame=90
npx remotion still src/index.ts JugadaMus /tmp/jugada-1.png --frame=90 --props='{"jugada":{"id":"postre-juego-31","posicion":"postre","cartas":["oros_10_sota","copas_10_sota","espadas_11_caballo","bastos_01_as"],"etiqueta":"Postre","explicacion":"Como postre hablas el último, pero con sota, sota, caballo y as tienes juego de treinta y uno, el premio más alto.","audioFile":"audio/postre-juego-31.mp3"},"words":[],"totalFrames":630}'
```

Expected: both PNGs render. Read them and confirm: tapete background fills the frame, 4 face-up cards for the explained player, gold "MANO" tag on the correct seat, position badge top-left matches the episode's `etiqueta`, and the full `explicacion` text shows as a static caption (since `words: []` in these previews — the fallback path is what's being exercised here).

- [ ] **Step 5: Commit**

```bash
git add pipeline/remotion/src/Root.tsx
git commit -m "feat(jugada-mus): register JugadaMus composition in Root.tsx"
```

---

### Task 10: `generar-voz.mjs` — ElevenLabs voice + timestamps generation

**Files:**
- Create: `pipeline/remotion/scripts/generar-voz.mjs`
- Modify: `pipeline/remotion/package.json`

**Interfaces:**
- Consumes: `agruparPalabras` from `./alignment.mjs` (Task 3); reads `data/episodios.json` (Task 1) from disk.
- Produces: `public/audio/{id}.mp3` and `data/{id}.timestamps.json` on disk (format: `Palabra[]`, matching Task 1's type) — consumed by `render-jugadas.mjs` (Task 11).

- [ ] **Step 1: Install dotenv (already present transitively, pin it explicitly)**

Run: `cd pipeline/remotion && npm install dotenv@17.3.1`
Expected: `dotenv` added to `dependencies` in `package.json` (it was already resolved in `node_modules`/`package-lock.json` transitively, so this should not require a network fetch).

- [ ] **Step 2: Add the `voz` script**

In `pipeline/remotion/package.json`, add to `"scripts"`:

```json
"voz": "node scripts/generar-voz.mjs"
```

- [ ] **Step 3: Implement `generar-voz.mjs`**

Create `pipeline/remotion/scripts/generar-voz.mjs`:

```js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { agruparPalabras } from "./alignment.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REMOTION_DIR = path.join(__dirname, "..");
const ROOT_DIR = path.join(REMOTION_DIR, "..", "..");

dotenv.config({ path: path.join(ROOT_DIR, ".env") });

const ELEVENLABS_API = "https://api.elevenlabs.io/v1";

async function generarVoz(jugada) {
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!voiceId || !apiKey) {
    throw new Error(
      "Faltan ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID en el .env de la raíz del repo."
    );
  }

  const url = `${ELEVENLABS_API}/text-to-speech/${voiceId}/with-timestamps`;

  console.log(`[${jugada.id}] Generando voz (${jugada.explicacion.split(/\s+/).length} palabras)...`);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      text: jugada.explicacion,
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.85,
        style: 0.0,
        use_speaker_boost: true,
      },
    }),
  });

  if (!response.ok) {
    const detalle = await response.text();
    throw new Error(`ElevenLabs devolvió ${response.status}: ${detalle}`);
  }

  const data = await response.json();

  const audioBuffer = Buffer.from(data.audio_base64, "base64");
  const audioDir = path.join(REMOTION_DIR, "public", "audio");
  fs.mkdirSync(audioDir, { recursive: true });
  const audioPath = path.join(audioDir, `${jugada.id}.mp3`);
  fs.writeFileSync(audioPath, audioBuffer);
  console.log(`  Audio guardado en: ${path.relative(REMOTION_DIR, audioPath)}`);

  const palabras = agruparPalabras(data.alignment);
  const dataDir = path.join(REMOTION_DIR, "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const timestampsPath = path.join(dataDir, `${jugada.id}.timestamps.json`);
  fs.writeFileSync(timestampsPath, JSON.stringify(palabras, null, 2));
  console.log(`  Timestamps guardados en: ${path.relative(REMOTION_DIR, timestampsPath)}`);
}

async function main() {
  const episodiosPath = path.join(REMOTION_DIR, "data", "episodios.json");
  const episodios = JSON.parse(fs.readFileSync(episodiosPath, "utf8"));

  const idFiltro = process.argv[2];
  const objetivo = idFiltro ? episodios.filter((j) => j.id === idFiltro) : episodios;

  if (objetivo.length === 0) {
    console.error(`No se encontró ninguna jugada con id "${idFiltro}" en episodios.json`);
    process.exit(1);
  }

  for (const jugada of objetivo) {
    await generarVoz(jugada);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
```

- [ ] **Step 4: Run it against one real episode to verify end-to-end**

(Requires `ELEVENLABS_API_KEY` / `ELEVENLABS_VOICE_ID` to be set in the repo-root `.env` — they already are, per the existing `pipeline/02_generate_voice.py` setup.)

Run: `cd pipeline/remotion && npm run voz -- mano-pares-reyes`
Expected: console shows "Generando voz...", then "Audio guardado en: public/audio/mano-pares-reyes.mp3" and "Timestamps guardados en: data/mano-pares-reyes.timestamps.json". Verify both files exist and the timestamps file is non-empty JSON:

Run: `cd pipeline/remotion && ls -la public/audio/mano-pares-reyes.mp3 data/mano-pares-reyes.timestamps.json && cat data/mano-pares-reyes.timestamps.json`
Expected: both files exist; the JSON is an array of `{word, start, end}` objects covering the words of the `explicacion` text in order, with increasing `start` times.

- [ ] **Step 5: Ignore the generated artifacts**

The root `.gitignore` already ignores `output/*.mp4` and (under `pipeline/remotion/public/`) `avatar.mp4`/`recording.mp4` as generated media — the new `public/audio/*.mp3` and `data/*.timestamps.json` are the same category and need the same treatment. Add to the root `.gitignore`, under the existing `# Node` section:

```
pipeline/remotion/public/audio/
pipeline/remotion/data/*.timestamps.json
```

- [ ] **Step 6: Commit**

```bash
git add pipeline/remotion/package.json pipeline/remotion/package-lock.json pipeline/remotion/scripts/generar-voz.mjs .gitignore
git commit -m "feat(jugada-mus): add ElevenLabs with-timestamps voice generation script"
```

---

### Task 11: `render-jugadas.mjs` — batch render script

**Files:**
- Create: `pipeline/remotion/render-jugadas.mjs`
- Modify: `pipeline/remotion/package.json`

**Interfaces:**
- Consumes: composition `id="JugadaMus"` (Task 9); `public/audio/{id}.mp3` + `data/{id}.timestamps.json` on disk (Task 10 output); `data/episodios.json` (Task 1).
- Produces: `output/jugada-{id}.mp4` at the repo root — final deliverable of this plan.

- [ ] **Step 1: Add the `render:jugadas` script**

In `pipeline/remotion/package.json`, add to `"scripts"`:

```json
"render:jugadas": "node render-jugadas.mjs"
```

- [ ] **Step 2: Implement `render-jugadas.mjs`**

Create `pipeline/remotion/render-jugadas.mjs`:

```js
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FPS = 30;

const episodiosArg = process.argv[2] ?? "data/episodios.json";
const episodiosPath = path.resolve(__dirname, episodiosArg);

if (!fs.existsSync(episodiosPath)) {
  console.error(`No existe el fichero de episodios: ${episodiosPath}`);
  process.exit(1);
}

const episodios = JSON.parse(fs.readFileSync(episodiosPath, "utf8"));

function frameTotalDesdeAudio(audioPath) {
  const probe = execSync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`,
    { encoding: "utf8" }
  ).trim();
  const durationS = parseFloat(probe);
  return Math.ceil(durationS * FPS) + FPS; // + 1s de margen
}

async function renderJugada(jugada, bundleLocation) {
  const audioPath = path.join(__dirname, "public", jugada.audioFile);
  const timestampsPath = path.join(__dirname, "data", `${jugada.id}.timestamps.json`);

  if (!fs.existsSync(audioPath) || !fs.existsSync(timestampsPath)) {
    console.warn(
      `[${jugada.id}] Faltan audio o timestamps. Ejecuta antes: npm run voz -- ${jugada.id}`
    );
    return;
  }

  const words = JSON.parse(fs.readFileSync(timestampsPath, "utf8"));
  const totalFrames = frameTotalDesdeAudio(audioPath);

  const inputProps = { jugada, words, totalFrames };

  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: "JugadaMus",
    inputProps,
  });

  const outputPath = path.join(__dirname, "..", "..", "output", `jugada-${jugada.id}.mp4`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  console.log(`[${jugada.id}] Renderizando (${totalFrames} frames)...`);
  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec: "h264",
    outputLocation: outputPath,
    inputProps,
    onProgress: ({ progress }) =>
      process.stdout.write(`\r  Render: ${Math.round(progress * 100)}%  `),
  });
  console.log(`\n[${jugada.id}] ✓ Guardado en: ${path.relative(process.cwd(), outputPath)}`);
}

async function main() {
  console.log("Empaquetando composición...");
  const bundleLocation = await bundle({
    entryPoint: path.join(__dirname, "src/index.ts"),
    onProgress: (p) => process.stdout.write(`\r  Bundle: ${p}%  `),
    cacheEnabled: false,
  });
  console.log("\nBundle listo.");

  for (const jugada of episodios) {
    await renderJugada(jugada, bundleLocation);
  }
}

main();
```

- [ ] **Step 3: Verify the "missing assets" path first (no audio generated yet for 2 of 3 episodes)**

Run: `cd pipeline/remotion && npm run render:jugadas`
Expected: `mano-pares-reyes` renders (assuming Task 10 Step 4 already generated its audio/timestamps); `postre-juego-31` and `segundo-pares-ases` print the "Faltan audio o timestamps..." warning and are skipped, not crashed.

- [ ] **Step 4: Generate voice for the remaining episodes and render all three**

Run:
```bash
cd pipeline/remotion
npm run voz -- postre-juego-31
npm run voz -- segundo-pares-ases
npm run render:jugadas
```
Expected: all three render without warnings, ending with three `[id] ✓ Guardado en: ...` lines.

- [ ] **Step 5: Verify the output files**

Run: `ffprobe -v error -show_entries format=duration,stream=width,height -of default=noprint_wrappers=1 /Users/jaimerubio/Desktop/social_media_automatation/output/jugada-mano-pares-reyes.mp4`
Expected: `width=1080`, `height=1920`, and a duration roughly equal to the `mano-pares-reyes.mp3` audio duration + 1 second.

- [ ] **Step 6: Commit**

```bash
git add pipeline/remotion/package.json pipeline/remotion/render-jugadas.mjs
git commit -m "feat(jugada-mus): add batch render script for episodios.json"
```

---

## Self-Review Notes

- **Spec coverage:** data model (Task 1), mesa/table logic (Tasks 2, 6), card animation (Task 5), badge (Task 8), karaoke captions (Tasks 4, 7), composition assembly + registration (Tasks 8–9), voice+timestamps generation (Task 10), batch render (Task 11) — all spec sections have a corresponding task.
- **Type consistency checked:** `Jugada`, `Palabra`, `JugadaMusProps`, `Posicion`, `Asiento`, `PosicionPantalla` are defined once (Tasks 1–2) and referenced identically by name in every later task.
- **npm script naming collision** (`render` vs `render:jugadas`) already resolved and reflected in both the spec and this plan.
- **Root.tsx churn:** Task 6 intentionally adds and then removes a temporary composition to get a visual checkpoint before the seating logic is wired into the real composition in Tasks 8–9 — Step 5 of Task 6 explicitly verifies no leftover diff.
