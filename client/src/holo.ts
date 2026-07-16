// Holographic shine layer — raw WebGL2, no dependencies (DECISIONS.md next
// step #1). One viewport-fixed transparent canvas draws an iridescent gloss
// masked to the placed gold stickers, additively blended over the DOM (the
// stickers stay the base; this layer only adds light).
//
// The gloss field is computed in *sheet* coordinates, so it is one global,
// continuous foil texture across all stars — two stars far apart sample the
// same field. Scroll position feeds the phase uniform, so the rainbow bands
// and glitter sweep as the sheet moves, like tilting a holographic sticker
// sheet under a light. Nothing animates while the page is still.

export interface HoloStar {
    x: number; // sticker center, sheet px
    y: number;
    size: number; // sticker width, sheet px
    rotation: number; // radians
}

export interface HoloRenderer {
    setStars(stars: HoloStar[]): void;
    render(originX: number, originY: number, phase: number): void;
    dispose(): void;
}

// Same star polygon as assets/star-placed.svg (viewBox 80 × 80.5; the 0.5px
// vertical excess is squashed into the square mask — invisible).
const STICKER_PATH = new Path2D(
    "M40 0.5L48.9806 28.1393H78.0423L54.5309 45.2214L63.5114 72.8607L40 55.7786L16.4886 72.8607L25.4691 45.2214L1.95774 28.1393H31.0194L40 0.5Z",
);
const MASK_SIZE = 128;

const VERT = `#version 300 es
layout(location=0) in vec2 a_corner;   // unit quad corner, -0.5..0.5
layout(location=1) in vec2 a_center;   // sticker center, sheet px
layout(location=2) in float a_size;    // sticker width, sheet px
layout(location=3) in float a_rot;     // sticker tilt, radians
uniform vec2 u_origin;                 // sheet top-left in viewport px
uniform vec2 u_viewport;               // viewport size, CSS px
out vec2 v_uv;
out vec2 v_world;
void main() {
  float c = cos(a_rot), s = sin(a_rot);
  vec2 corner = a_corner * a_size;
  vec2 world = a_center + vec2(corner.x * c - corner.y * s,
                               corner.x * s + corner.y * c);
  v_world = world;
  v_uv = a_corner + 0.5;
  vec2 clip = ((world + u_origin) / u_viewport) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
in vec2 v_world;
uniform sampler2D u_mask;
uniform float u_phase;
out vec4 outColor;

// Holographic foil over the silver sticker base: saturated rainbow bands
// warped by smooth noise (colors sit in irregular patches, like real foil),
// a sharp specular streak, and glitter. Everything is driven by the global
// sheet-space field + the scroll phase.

vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  float mask = texture(u_mask, v_uv).a;
  if (mask < 0.01) discard;

  vec2 w = v_world;
  // Global diagonal field, continuous across the sheet.
  float t = (w.x + w.y) * 0.003;
  // Smooth warp so rainbow colors pool in irregular patches; a faint
  // micro-facet dither keeps it foil-like up close.
  float warp = vnoise(w / 26.0) * 0.45 + vnoise(w / 9.0) * 0.12;
  float facet = (hash(floor(w / 3.0)) - 0.5) * 0.05;

  float hue = fract(t + u_phase + warp + facet);
  vec3 rainbow = hsv2rgb(vec3(hue, 0.8, 1.0));
  // How much foil color covers the silver base: banded, sweeping with phase.
  float bands = 0.5 + 0.5 * sin(6.28318 * (t * 0.8 + warp - u_phase * 1.4));
  float coverage = mask * (0.30 + 0.38 * bands);

  // Sharp specular streak sweeping diagonally, plus glitter that flares as
  // the phase moves.
  float streak = pow(0.5 + 0.5 * sin(6.28318 * (t * 0.5 - u_phase * 1.7)), 8.0);
  float spark = smoothstep(0.96, 1.0, fract(hash(floor(w) + 31.7) + u_phase * 2.0));
  float shine = (streak * 0.85 + spark * 0.8) * mask;

  // Premultiplied: rainbow tints the base at "coverage"; the white shine on
  // top exceeds the alpha, which the ONE/ONE_MINUS_SRC_ALPHA blend treats
  // as added light.
  outColor = vec4(rainbow * coverage + vec3(shine), coverage);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("holo shader:", gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

function makeMaskTexture(gl: WebGL2RenderingContext): WebGLTexture {
    const canvas = document.createElement("canvas");
    canvas.width = MASK_SIZE;
    canvas.height = MASK_SIZE;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(MASK_SIZE / 80, MASK_SIZE / 80.5);
    ctx.fillStyle = "#fff";
    ctx.fill(STICKER_PATH);
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
}

// Two triangles per sticker; per-vertex attributes carry the instance data
// (a plain buffer is trivial at ≤1000 stars — no instancing needed).
const QUAD: [number, number][] = [
    [-0.5, -0.5],
    [0.5, -0.5],
    [0.5, 0.5],
    [-0.5, -0.5],
    [0.5, 0.5],
    [-0.5, 0.5],
];
const FLOATS_PER_VERTEX = 6; // corner(2) center(2) size(1) rot(1)

export function createHoloRenderer(
    canvas: HTMLCanvasElement,
): HoloRenderer | null {
    const gl = canvas.getContext("webgl2", {
        alpha: true,
        premultipliedAlpha: true,
        antialias: true,
    });
    if (!gl) return null; // no WebGL2 — the sheet works, just without shine

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return null;
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error("holo program:", gl.getProgramInfoLog(program));
        return null;
    }
    gl.useProgram(program);

    const uOrigin = gl.getUniformLocation(program, "u_origin");
    const uViewport = gl.getUniformLocation(program, "u_viewport");
    const uPhase = gl.getUniformLocation(program, "u_phase");
    const uMask = gl.getUniformLocation(program, "u_mask");

    const mask = makeMaskTexture(gl);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, mask);
    gl.uniform1i(uMask, 0);

    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const buffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    const stride = FLOATS_PER_VERTEX * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 16);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 20);

    gl.enable(gl.BLEND);
    // Premultiplied-alpha "over": tints cover the base, excess rgb adds light.
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    let vertexCount = 0;

    return {
        setStars(stars: HoloStar[]) {
            const data = new Float32Array(stars.length * QUAD.length * FLOATS_PER_VERTEX);
            let i = 0;
            for (const star of stars) {
                for (const [cx, cy] of QUAD) {
                    data[i++] = cx;
                    data[i++] = cy;
                    data[i++] = star.x;
                    data[i++] = star.y;
                    data[i++] = star.size;
                    data[i++] = star.rotation;
                }
            }
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
            vertexCount = stars.length * QUAD.length;
        },

        render(originX: number, originY: number, phase: number) {
            const dpr = window.devicePixelRatio || 1;
            const w = window.innerWidth;
            const h = window.innerHeight;
            if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
                canvas.width = w * dpr;
                canvas.height = h * dpr;
            }
            gl.viewport(0, 0, canvas.width, canvas.height);
            gl.clear(gl.COLOR_BUFFER_BIT);
            if (vertexCount === 0) return;
            gl.uniform2f(uOrigin, originX, originY);
            gl.uniform2f(uViewport, w, h);
            gl.uniform1f(uPhase, phase);
            gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
        },

        dispose() {
            gl.deleteBuffer(buffer);
            gl.deleteVertexArray(vao);
            gl.deleteTexture(mask);
            gl.deleteProgram(program);
        },
    };
}
