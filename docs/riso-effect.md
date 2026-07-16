# Risograph effect — reference & implementation instructions

Reverse-engineered from https://instantrisograph.com/ (read directly from its production JS bundle, so all constants below are the site's actual values). No libraries needed: the whole effect is Canvas 2D + one inline SVG filter per ink plate.

## The look we want

The target look is the site's **two-plate duotone: "cyan" plate + "magenta" plate only** (yellow and black toggled off). Important subtlety: the plates are _not_ printed in literal cyan/magenta. The default inks are real Riso ink colors:

- "cyan" plate → **Blue** `#0078BF` (cmyk 99, 22, 0)
- "magenta" plate → **Fluorescent Pink** `#FF48B0` (cmyk 0, 72, 31)

Blue + fluoro pink multiplied over white paper is what gives the signature violet overlaps and warm/cool split. That specific ink pairing is most of the magic.

## Pipeline overview

For a source image:

1. **Downscale** so the longest side ≤ 1800 px (keeps per-pixel work fast).
2. **CMYK-separate** the image into per-channel plates (we only need C and M).
3. **Tint each plate** with its ink color, scaled by a per-plate density boost.
4. **Misregister**: offset each plate by a random ±2 px independently in x and y.
5. **Add per-pixel grain** (ink-tinted random noise).
6. **Multiply an SVG paper/ink texture** (feTurbulence + feDiffuseLighting) onto each plate.
7. **Composite** all plates onto a white canvas with `globalCompositeOperation = "multiply"`.

## Step-by-step with exact values

### 1. CMYK separation (per pixel)

Standard RGB→CMYK. `r,g,b` normalized 0–1:

```js
const k = 1 - Math.max(r, g, b);
const c = k === 1 ? 0 : (1 - r - k) / (1 - k);
const m = k === 1 ? 0 : (1 - g - k) / (1 - k);
// (y and black plates analogous; not needed for the duotone)
```

### 2. Plate tinting

Each plate is rendered as _ink on white_: the channel value scales the ink's own CMYK components, converted straight to RGB. Each plate has a density boost `ne`:

| plate   | ink                                            | boost `ne` |
| ------- | ---------------------------------------------- | ---------- |
| cyan    | Blue `#0078BF`, cmyk `[99, 22, 0]`             | **1.1**    |
| magenta | Fluorescent Pink `#FF48B0`, cmyk `[0, 72, 31]` | **1.4**    |
| yellow  | Yellow `#FFE800`, cmyk `[0, 9, 100]`           | 1.1        |
| black   | Black (uses k channel directly as gray)        | 0.7        |

```js
// for the cyan plate, per pixel (ink = blue, channel value = c):
out.r = Math.round(255 * (1 - (c * ink.cmyk[0] * ne) / 100));
out.g = Math.round(255 * (1 - (c * ink.cmyk[1] * ne) / 100));
out.b = Math.round(255 * (1 - (c * ink.cmyk[2] * ne) / 100));
out.a = srcAlpha; // preserve source alpha
```

Same formula for the magenta plate with `m` and the pink ink. The extra 1.4 boost on pink is deliberate — it makes the pink read as saturated/fluorescent rather than pastel.

### 3. Misregistration

Each plate gets an independent offset before compositing, mimicking imperfect plate alignment:

```js
const intensity = 2; // site default; UI allows 1–3
const off = () => (Math.random() > 0.5 ? intensity : -intensity);
offsets.cyan = { x: off(), y: off() };
offsets.magenta = { x: off(), y: off() };
```

The plate is drawn centered on the output canvas plus its offset. Re-randomize on each new image (or a "shuffle" action) — fixed magnitude, random sign, per axis.

### 4. Ink grain (per-pixel noise)

After drawing the offset plate onto its own canvas, walk the pixels and jitter them, scaled by the ink's RGB so the grain stays in the ink's hue:

```js
for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const n = (Math.random() - 0.5) * 30; // ±15
    data[i] = clamp(data[i] + n * (ink.rgb[0] / 255));
    data[i + 1] = clamp(data[i + 1] + n * (ink.rgb[1] / 255));
    data[i + 2] = clamp(data[i + 2] + n * (ink.rgb[2] / 255));
}
```

### 5. SVG texture filter (the "riso paper" feel)

Each plate multiplies in a rasterized SVG filter. This is where the fibrous, slightly embossed print texture comes from. Template (one per plate, differing only in `baseFrequency`, `seed`, and the color-matrix row):

```html
<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0">
    <defs>
        <filter id="{id}">
            <feTurbulence
                type="fractalNoise"
                baseFrequency="{fx} {fy}"
                numOctaves="3"
                seed="{seed}"
            />
            <feColorMatrix type="matrix" values="{matrix}" />
            <feGaussianBlur stdDeviation="0.3" />
            <feComposite
                in="SourceGraphic"
                operator="arithmetic"
                k1="1"
                k2="0"
                k3="0.8"
                k4="0"
            />
            <feDiffuseLighting surfaceScale="1" diffuseConstant="0.3">
                <feDistantLight azimuth="240" elevation="45" />
            </feDiffuseLighting>
            <feBlend mode="multiply" in="SourceGraphic" />
            <feComposite in="SourceGraphic" operator="in" />
        </filter>
    </defs>
</svg>
```

Per-plate parameters (note the slightly anisotropic x/y frequencies — that's what makes the texture feel like paper fiber rather than uniform static):

| plate   | baseFrequency | seed | feColorMatrix values                               |
| ------- | ------------- | ---- | -------------------------------------------------- |
| cyan    | `1.735 1.771` | 256  | `0 0 0 0 0.2  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0`     |
| magenta | `1.835 1.871` | 128  | `0 0 0 0 0  0 0 0 0 0.2  0 0 0 0 0  0 0 0 1 0`     |
| yellow  | `1.635 1.671` | 64   | `0 0 0 0 0  0 0 0 0 0  0 0 0 0 0.2  0 0 0 1 0`     |
| black   | `1.435 1.471` | 4    | `0.2 0 0 0 0  0 0.2 0 0 0  0 0 0.2 0 0  0 0 0 1 0` |

To apply it to a canvas plate: serialize the SVG to a `Blob` → `URL.createObjectURL` → load into an `Image` sized to the plate → `ctx.globalCompositeOperation = "multiply"; ctx.drawImage(textureImg, 0, 0)`. (Alternatively, set the filter as a CSS `filter: url(#id)` on the plate canvas — the site rasterizes via Blob/Image so the texture bakes into the exported bitmap.)

How the filter reads, top to bottom: turbulence noise → tinted faintly toward the plate's channel color (0.2) → softened → `arithmetic` composite mixes noise with the plate (`plate*noise + 0.8*plate`) → `feDiffuseLighting` with a distant light at azimuth 240°/elevation 45° turns the noise into a subtle embossed paper relief → multiplied back over the plate → clipped to the plate's alpha.

### 6. Final composite

```js
outCtx.fillStyle = "white"; // the "paper"
outCtx.fillRect(0, 0, w, h);
outCtx.globalCompositeOperation = "multiply"; // ink overprint
outCtx.drawImage(cyanPlateCanvas, 0, 0);
outCtx.drawImage(magentaPlateCanvas, 0, 0);
```

`multiply` is the whole trick for overlaps: blue × pink → deep violet, either ink × white paper → itself. Order doesn't matter (multiply is commutative).

## Full Riso ink palette (from the site, for other duotone combos)

| key                | hex       | rgb           | cmyk          |
| ------------------ | --------- | ------------- | ------------- |
| fluorescent_pink   | `#FF48B0` | 255, 72, 176  | 0, 72, 31, 0  |
| coral              | `#FF8E91` | 255, 142, 145 | 0, 44, 43, 0  |
| fluorescent_orange | `#FF7477` | 255, 116, 119 | 0, 55, 53, 0  |
| red                | `#FF665E` | 255, 102, 94  | 0, 60, 63, 0  |
| orange             | `#FF6C2F` | 255, 108, 47  | 0, 58, 82, 0  |
| sunflower          | `#FFB511` | 255, 181, 17  | 0, 29, 93, 0  |
| yellow             | `#FFE800` | 255, 232, 0   | 0, 9, 100, 0  |
| light_lime         | `#E3ED55` | 227, 237, 85  | 10, 0, 60, 0  |
| kelly_green        | `#67B346` | 103, 179, 70  | 52, 0, 86, 0  |
| seafoam            | `#62C2B1` | 98, 194, 177  | 53, 0, 33, 0  |
| aqua               | `#5EC8E5` | 94, 200, 229  | 49, 0, 11, 0  |
| cornflower         | `#62A8E5` | 98, 168, 229  | 54, 10, 0, 0  |
| blue               | `#0078BF` | 0, 120, 191   | 99, 22, 0, 1  |
| flat_gold          | `#BB8B41` | 187, 139, 65  | 6, 26, 97, 15 |
| metallic_gold      | `#AC936E` | 172, 147, 110 | 22, 33, 68, 8 |

(These match the real Risograph ink chart — RGB proxies of actual soy inks.)

## Recipe card: the "magenta + cyan" duotone

1. White canvas.
2. Cyan plate: CMYK `c` channel → Blue `#0078BF` tint, boost 1.1.
3. Magenta plate: CMYK `m` channel → Fluorescent Pink `#FF48B0` tint, boost 1.4.
4. Offset each plate ±2 px randomly per axis.
5. ±15 ink-tinted per-pixel grain on each plate.
6. Multiply each plate with its feTurbulence/feDiffuseLighting texture (params in table above).
7. Multiply both plates onto the white canvas.

## Notes for the implementing agent

- Pure browser APIs — Canvas 2D `getImageData`/`putImageData`, `globalCompositeOperation`, inline SVG filters. **Do not add dependencies** (project rule).
- The pixel loops are O(w×h) per plate; the 1800 px cap exists for this reason. Cache the result — recompute only when the source or settings change.
- The SVG texture image loads async (`Image.onload`); the final composite of each plate must happen in that callback.
- For a _live_ CSS-only approximation on DOM content (no canvas): you can get ~80% of the feel by layering the element twice with `mix-blend-mode: multiply`, tinting one layer blue and one pink via `filter`, offsetting them 2px apart, and overlaying a `feTurbulence` SVG filter — but the true CMYK separation + ink-scaled tint only works with pixel access.
- The site also has a "separate plates" mode (user uploads one image per ink): each image is silhouette-filled with the ink hex via `source-atop`, given ±15 uniform grain, and drawn at `globalAlpha = 0.75` with multiply. Useful if we ever want hand-authored plates instead of automatic separation.
