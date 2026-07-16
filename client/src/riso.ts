// Risograph print pipeline — implements docs/riso-effect.md (two-plate
// duotone: Blue + Fluorescent Pink) with Canvas 2D + one SVG filter per
// plate. No dependencies.
//
// The sticker sheet's printed content (pink card, red edge, white star
// knockouts, red slot numbers) is flat art, so instead of rasterizing it and
// CMYK-separating per pixel, each region's plate channel is computed
// analytically (identical result, one less 13-megapixel pass). Everything
// downstream follows the writeup: ink tint with per-plate density boost,
// ±2px plate misregistration, ±15 ink-tinted grain, feTurbulence paper
// texture, multiply composite over white paper.
//
// Deviations from the writeup, both deliberate:
// - The source art contains no cyan (all warm colors), which would leave the
//   blue plate blank. Per the writeup's "separate plates" note we hand-assign
//   the card surface a light blue-plate hit (CARD_BLUE_CHANNEL) so the
//   blue×pink pairing actually shows: violet paper tone, two-color fringe at
//   knockout edges.
// - The transcribed SVG texture filter is self-cancelling as written (its
//   last feComposite returns the unfiltered source) and raw feDiffuseLighting
//   output is ~0.2 luminance (would darken plates 5×). We keep the writeup's
//   turbulence params and light geometry but normalize the emboss around
//   multiply-neutral white via feComponentTransfer (TEXTURE_GAIN).

export interface SlotBox {
    x: number;
    y: number;
    size: number;
    number: number;
}

export interface SheetLayout {
    width: number;
    height: number;
    slots: SlotBox[];
}

export interface PrintStyle {
    cardColor: string; // hex, e.g. "#efd4ea"
    borderColor: string;
    scoreColor: string;
    strokeWidth: number; // px
    numberFont: string; // canvas font shorthand, e.g. "700 11px Helvetica"
}

interface Ink {
    rgb: [number, number, number];
    cmyk: [number, number, number]; // c, m, y percentages of the ink itself
    boost: number; // per-plate density boost ("ne" in the writeup)
    channel: "c" | "m"; // which CMYK channel of the source art this plate prints
    baseFrequency: string;
    seed: number;
}

const BLUE: Ink = {
    rgb: [0, 120, 191], // #0078BF
    cmyk: [99, 22, 0],
    boost: 1.1,
    channel: "c",
    baseFrequency: "1.735 1.771",
    seed: 256,
};

const PINK: Ink = {
    rgb: [255, 72, 176], // #FF48B0
    cmyk: [0, 72, 31],
    boost: 1.4,
    channel: "m",
    baseFrequency: "1.835 1.871",
    seed: 128,
};

const MISREGISTRATION = 2; // px, fixed magnitude / random sign per axis
const GRAIN = 33; // ±22 jitter (writeup default was 30; raised for a rougher print)
const GRAIN_SIZE = 2; // px — speckle clump size; 1 reads as digital static, 2 as ink
const CARD_BLUE_CHANNEL = 0.08; // hand-assigned c for the card surface
// Remap the emboss lightmap (mean ≈ 0.2) to multiply-neutral:
// out = LIFT + GAIN × light ⇒ mean ≈ 1.0, so the texture reads as relief
// rather than darkening the plate. GAIN sets the relief contrast.
const TEXTURE_GAIN = 2.4;
const TEXTURE_LIFT = 0.5;
const TEXTURE_TILE = 1024; // the texture is high-frequency noise, so tiling seams are invisible

// Star outline from the Figma star component (was client/src/assets
// star-empty SVG, viewBox 71.329 × 67.838). Printed as a knockout: unprinted
// paper showing through both plates.
const STAR_PATH = new Path2D(
    "M35.6646 0L44.0839 25.9119H71.3292L49.2873 41.9263L57.7066 67.8381L35.6646 51.8237L13.6227 67.8381L22.0419 41.9263L0 25.9119H27.2453L35.6646 0Z",
);
const STAR_W = 71.3292;
// The star occupies the same fraction of its slot as the Figma component did
// (95.1% of the width, flush to the top).
const STAR_SCALE = 0.951;

function hexToRgb(hex: string): [number, number, number] {
    const n = parseInt(hex.trim().slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Deterministic PRNG: misregistration stays put across resize re-renders,
// and StarSlot uses it for stable per-sticker placement jitter.
export function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Source CMYK channel value (0..1) of a flat color for the given plate.
function channelOf(rgb: [number, number, number], channel: "c" | "m"): number {
    const r = rgb[0] / 255;
    const g = rgb[1] / 255;
    const b = rgb[2] / 255;
    const k = 1 - Math.max(r, g, b);
    if (k === 1) return 0;
    return channel === "c" ? (1 - r - k) / (1 - k) : (1 - g - k) / (1 - k);
}

// Ink-on-white tint of a channel value: the plate's printed color.
function tint(channelValue: number, ink: Ink): string {
    const part = (inkCmyk: number) =>
        Math.round(
            255 * Math.max(0, 1 - (channelValue * inkCmyk * ink.boost) / 100),
        );
    return `rgb(${part(ink.cmyk[0])},${part(ink.cmyk[1])},${part(ink.cmyk[2])})`;
}

// Rasterize the per-plate paper texture: feTurbulence noise embossed by a
// distant light (azimuth 240°, elevation 45°), normalized around white so it
// multiplies onto a plate as relief instead of darkening it wholesale.
function makeTexture(ink: Ink): Promise<HTMLImageElement> {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${TEXTURE_TILE}" height="${TEXTURE_TILE}">
  <defs><filter id="f" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="${ink.baseFrequency}" numOctaves="3" seed="${ink.seed}"/>
    <feGaussianBlur stdDeviation="0.3"/>
    <feDiffuseLighting surfaceScale="1" diffuseConstant="0.3" lighting-color="white">
      <feDistantLight azimuth="240" elevation="45"/>
    </feDiffuseLighting>
    <feComponentTransfer>
      <feFuncR type="linear" slope="${TEXTURE_GAIN}" intercept="${TEXTURE_LIFT}"/>
      <feFuncG type="linear" slope="${TEXTURE_GAIN}" intercept="${TEXTURE_LIFT}"/>
      <feFuncB type="linear" slope="${TEXTURE_GAIN}" intercept="${TEXTURE_LIFT}"/>
    </feComponentTransfer>
  </filter></defs>
  <rect width="100%" height="100%" fill="#fff" filter="url(#f)"/>
</svg>`;
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("riso texture failed to rasterize"));
        };
        img.src = url;
    });
}

// Draw one plate: white paper, then the sheet's art in this plate's tints,
// offset by the plate's misregistration.
function drawPlate(
    ink: Ink,
    layout: SheetLayout,
    style: PrintStyle,
    offset: { x: number; y: number },
): HTMLCanvasElement {
    const plate = document.createElement("canvas");
    plate.width = layout.width;
    plate.height = layout.height;
    const ctx = plate.getContext("2d")!;

    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, layout.width, layout.height);
    ctx.translate(offset.x, offset.y);

    // Card surface. Hand-assigned blue channel — see header comment.
    const cardChannel =
        ink.channel === "c"
            ? CARD_BLUE_CHANNEL
            : channelOf(hexToRgb(style.cardColor), "m");
    ctx.fillStyle = tint(cardChannel, ink);
    ctx.fillRect(0, 0, layout.width, layout.height);

    // Card edge. Red has no cyan, so it only exists on the pink plate; skip
    // no-op white strokes/text to keep the draw cheap.
    const borderChannel = channelOf(hexToRgb(style.borderColor), ink.channel);
    if (borderChannel > 0.01) {
        // Inset by the misregistration amplitude so a shifted plate never pushes
        // the frame off the sheet.
        const inset = MISREGISTRATION + style.strokeWidth / 2;
        ctx.strokeStyle = tint(borderChannel, ink);
        ctx.lineWidth = style.strokeWidth;
        ctx.strokeRect(
            inset,
            inset,
            layout.width - 2 * inset,
            layout.height - 2 * inset,
        );
    }

    // Star knockouts (unprinted paper) and printed slot numbers.
    const numberChannel = channelOf(hexToRgb(style.scoreColor), ink.channel);
    const drawNumbers = numberChannel > 0.01;
    if (drawNumbers) {
        ctx.font = style.numberFont;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
    }
    const numberColor = tint(numberChannel, ink);
    ctx.fillStyle = "#fff";
    for (const slot of layout.slots) {
        const k = (slot.size * STAR_SCALE) / STAR_W;
        ctx.save();
        ctx.translate(slot.x + (slot.size - STAR_W * k) / 2, slot.y);
        ctx.scale(k, k);
        ctx.fillStyle = "#fff";
        ctx.fill(STAR_PATH);
        ctx.restore();
        if (drawNumbers) {
            ctx.fillStyle = numberColor;
            ctx.fillText(
                String(slot.number),
                slot.x + slot.size / 2,
                slot.y + slot.size / 2,
            );
            ctx.fillStyle = "#fff";
        }
    }

    return plate;
}

// ±GRAIN/2 jitter in GRAIN_SIZE-px clumps, scaled by the ink's RGB so grain
// stays in its hue.
function applyGrain(plate: HTMLCanvasElement, ink: Ink): void {
    const ctx = plate.getContext("2d")!;
    const { width, height } = plate;
    const image = ctx.getImageData(0, 0, width, height);
    const data = image.data;
    const sr = ink.rgb[0] / 255;
    const sg = ink.rgb[1] / 255;
    const sb = ink.rgb[2] / 255;
    for (let y = 0; y < height; y += GRAIN_SIZE) {
        for (let x = 0; x < width; x += GRAIN_SIZE) {
            const n = (Math.random() - 0.5) * GRAIN;
            const nr = n * sr;
            const ng = n * sg;
            const nb = n * sb;
            const yMax = Math.min(y + GRAIN_SIZE, height);
            const xMax = Math.min(x + GRAIN_SIZE, width);
            for (let py = y; py < yMax; py++) {
                for (let px = x; px < xMax; px++) {
                    const i = (py * width + px) * 4;
                    data[i] = Math.max(0, Math.min(255, data[i] + nr));
                    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + ng));
                    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + nb));
                }
            }
        }
    }
    ctx.putImageData(image, 0, 0);
}

function multiplyTexture(
    plate: HTMLCanvasElement,
    texture: HTMLImageElement,
): void {
    const ctx = plate.getContext("2d")!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "multiply";
    for (let y = 0; y < plate.height; y += TEXTURE_TILE) {
        for (let x = 0; x < plate.width; x += TEXTURE_TILE) {
            ctx.drawImage(texture, x, y);
        }
    }
    ctx.globalCompositeOperation = "source-over";
}

// Render the full sheet print offscreen. `seed` fixes the misregistration
// shuffle so re-renders (e.g. on resize) don't shift the plates around.
export async function renderRisoSheet(
    layout: SheetLayout,
    style: PrintStyle,
    seed: number,
): Promise<HTMLCanvasElement> {
    const rand = mulberry32(seed);
    const shift = () => (rand() > 0.5 ? MISREGISTRATION : -MISREGISTRATION);

    const out = document.createElement("canvas");
    out.width = layout.width;
    out.height = layout.height;
    const ctx = out.getContext("2d")!;
    ctx.fillStyle = "#fff"; // the paper
    ctx.fillRect(0, 0, layout.width, layout.height);
    ctx.globalCompositeOperation = "multiply"; // ink overprint

    for (const ink of [BLUE, PINK]) {
        const offset = { x: shift(), y: shift() };
        const plate = drawPlate(ink, layout, style, offset);
        applyGrain(plate, ink);
        multiplyTexture(plate, await makeTexture(ink));
        ctx.drawImage(plate, 0, 0);
    }
    return out;
}

// Pull the print's source colors/typography from the design tokens so Figma
// changes flow through :root without touching this module.
export function readPrintStyle(): PrintStyle {
    const tokens = getComputedStyle(document.documentElement);
    const token = (name: string) => tokens.getPropertyValue(name).trim();
    return {
        cardColor: token("--color-card"),
        borderColor: token("--color-card-border"),
        scoreColor: token("--color-score"),
        strokeWidth: parseFloat(token("--card-stroke")),
        numberFont: `700 ${token("--font-size-score")} ${token("--font-star-number")}`,
    };
}
