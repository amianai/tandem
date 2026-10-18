import { Geometry, GlProgram, Mesh, MeshGeometry, Shader, type TextureSource } from 'pixi.js';

/**
 * Sorgenti GLSL (WebGL2, GLSL ES 3.0) della pipeline di rendering.
 *
 * Tutti i passaggi a schermo intero sono Mesh con shader propri invece di
 * filtri: un filtro Pixi ridisegna prima l'oggetto in una texture temporanea,
 * qui invece si campiona direttamente la render texture che serve.
 */

/** Vertex shader standard per Mesh in Pixi v8 (matrici globali + locali). */
export const MESH_VERT = /* glsl */ `
in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;

void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUV = aUV;
}
`;

/**
 * Ingrandimento "sharp bilinear" del mondo a bassa risoluzione.
 *
 * Il mondo viene disegnato a 1 pixel di texture = 1 pixel di mondo, poi
 * ingrandito di un fattore NON intero (2.05..3). Col filtro "nearest" i pixel
 * verrebbero larghi a volte 2 e a volte 3 pixel schermo, e con la camera in
 * movimento sfarfallerebbero. Qui ogni texel resta un blocco pieno e solo
 * l'ultimo pixel schermo del bordo viene sfumato: pixel tutti uguali e
 * scorrimento sub-pixel morbido. (Tecnica nota come "sharp bilinear".)
 */
export const UPSCALE_FRAG = /* glsl */ `
in vec2 vUV;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec2 uTexSize;
uniform float uScale;

void main() {
  vec2 texel = vUV * uTexSize;
  vec2 base = floor(texel);
  vec2 f = fract(texel) - 0.5;
  float range = 0.5 - 0.5 / max(uScale, 1.0);
  vec2 g = (f - clamp(f, -range, range)) * uScale + 0.5;
  finalColor = texture(uTexture, (base + g) / uTexSize);
}
`;

/**
 * Bright pass per il bloom: riduce la scena di 4 volte con 4 campioni
 * bilineari (copre un blocco 4x4: le scintille da 1 pixel non spariscono e
 * non sfarfallano) e tiene solo la parte luminosa, con un ginocchio morbido.
 */
export const BRIGHT_FRAG = /* glsl */ `
in vec2 vUV;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec2 uSrcTexel;
uniform float uThreshold;
uniform float uKnee;

void main() {
  vec3 c = texture(uTexture, vUV + uSrcTexel * vec2(-1.0, -1.0)).rgb;
  c += texture(uTexture, vUV + uSrcTexel * vec2( 1.0, -1.0)).rgb;
  c += texture(uTexture, vUV + uSrcTexel * vec2(-1.0,  1.0)).rgb;
  c += texture(uTexture, vUV + uSrcTexel * vec2( 1.0,  1.0)).rgb;
  c *= 0.25;
  float l = max(c.r, max(c.g, c.b));
  float soft = clamp(l - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-4);
  float w = max(soft, l - uThreshold) / max(l, 1e-4);
  finalColor = vec4(c * w, 1.0);
}
`;

/**
 * Composizione finale, in un solo passaggio a schermo intero:
 * onde d'urto (distorsione) -> aberrazione cromatica locale -> bloom ->
 * color grading -> vignettatura -> grana. L'HUD viene disegnato dopo, pulito.
 *
 * Gli effetti d'impatto sono LOCALI (decadono con la distanza dall'epicentro):
 * a schermo diviso lo Schianto di uno non acceca la metà dell'altro.
 */
export const POST_FRAG = /* glsl */ `
in vec2 vUV;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform sampler2D uBloom;
uniform vec2 uRes;
uniform float uTime;
uniform float uBloomStrength;
uniform float uVignette;
uniform float uGrain;
uniform vec4 uShock0;   // centro (px), raggio (px), forza
uniform vec4 uShock1;
uniform vec4 uImpact;   // centro (px), raggio (px), intensità (aberrazione + lampo)
uniform vec3 uLift;
uniform vec3 uGain;
uniform float uSaturation;
uniform float uContrast;

vec2 shockOffset(vec2 p, vec4 s) {
  if (s.w <= 0.0) return vec2(0.0);
  vec2 d = p - s.xy;
  float dist = length(d) + 1e-3;
  float x = (dist - s.z) / 26.0;
  float ring = exp(-x * x * 3.0) * sin(x * 2.4);
  return (d / dist) * ring * s.w * 10.0;
}

float hash(vec2 p) {
  p = fract(p * vec2(443.897, 441.423));
  p += dot(p, p.yx + 19.19);
  return fract((p.x + p.y) * p.x);
}

void main() {
  vec2 p = vUV * uRes;
  p -= shockOffset(p, uShock0);
  p -= shockOffset(p, uShock1);
  vec2 uv = p / uRes;

  // aberrazione cromatica solo vicino all'impatto
  vec2 toI = p - uImpact.xy;
  float near = uImpact.w * exp(-dot(toI, toI) / max(uImpact.z * uImpact.z, 1.0));
  vec2 ca = normalize(toI + 1e-3) * near * 3.0 / uRes;
  vec3 col;
  col.r = texture(uTexture, uv + ca).r;
  col.g = texture(uTexture, uv).g;
  col.b = texture(uTexture, uv - ca).b;

  col += texture(uBloom, uv).rgb * uBloomStrength;
  col += vec3(1.0, 0.92, 0.8) * near * 0.35;

  // grading: lift/gain, contrasto morbido, saturazione
  col = uLift + col * (uGain - uLift);
  col = clamp(col, 0.0, 1.0);
  col = mix(col, col * col * (3.0 - 2.0 * col), uContrast);
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, uSaturation);

  // vignettatura ellittica, morbida
  vec2 q = vUV - 0.5;
  q.x *= uRes.x / uRes.y * 0.75;
  col *= 1.0 - uVignette * smoothstep(0.25, 0.85, length(q) * 1.25);

  // grana animata, più visibile nelle ombre
  float n = hash(floor(p) + fract(uTime * 7.31) * 113.0) - 0.5;
  col += n * uGrain * (1.15 - l);

  finalColor = vec4(col, 1.0);
}
`;

/**
 * Contorno e luce di taglio per i personaggi (filtro sulla loro vista,
 * eseguito alla risoluzione del mondo: 1 texel = 1 pixel di mondo).
 * - pixel vuoti accanto alla sagoma -> contorno scuro;
 * - pixel della sagoma col vuoto sopra -> filo di luce fredda (luna);
 * - pixel col vuoto dietro (lato opposto allo sguardo) -> filo del colore
 *   del giocatore: lo si riconosce anche quando è in ombra.
 */
export const OUTLINE_FRAG = /* glsl */ `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform highp vec4 uInputSize;
uniform vec3 uOutline;
uniform vec3 uRim;
uniform vec3 uTint;
uniform float uFacing;
uniform float uTintRim;

float A(vec2 o) { return texture(uTexture, vTextureCoord + o * uInputSize.zw).a; }

void main() {
  vec4 c = texture(uTexture, vTextureCoord);
  if (c.a < 0.5) {
    float n = max(max(A(vec2(1.0, 0.0)), A(vec2(-1.0, 0.0))), max(A(vec2(0.0, 1.0)), A(vec2(0.0, -1.0))));
    finalColor = n > 0.5 ? vec4(uOutline, 1.0) : vec4(0.0);
    return;
  }
  vec3 rgb = c.rgb / max(c.a, 1e-4);
  if (A(vec2(0.0, -1.0)) < 0.5) rgb = mix(rgb, uRim, 0.55);
  else if (A(vec2(-uFacing, 0.0)) < 0.5 && A(vec2(0.0, 3.0)) > 0.5) rgb = mix(rgb, uTint, uTintRim);
  finalColor = vec4(rgb, 1.0);
}
`;

/* ------------------------------------------------------------------ */

/** Rettangolo w x h con UV 0..1. */
function quadGeometry(w: number, h: number): Geometry {
  return new MeshGeometry({
    positions: new Float32Array([0, 0, w, 0, w, h, 0, h]),
    uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  });
}

export type UniformSpec = Record<string, { value: unknown; type: string }>;

/**
 * Mesh rettangolare (w x h in coordinate locali) con uno shader fragment
 * personalizzato. `textures` diventano sampler col nome indicato; le uniform
 * si aggiornano da `mesh.shader.resources.uniforms.uniforms`.
 */
export function shaderQuad(
  fragment: string,
  textures: Record<string, TextureSource>,
  uniforms: UniformSpec,
  w: number,
  h: number,
): Mesh<Geometry, Shader> {
  const shader = new Shader({
    glProgram: GlProgram.from({ vertex: MESH_VERT, fragment }),
    resources: { ...textures, uniforms },
  });
  return new Mesh<Geometry, Shader>({ geometry: quadGeometry(w, h), shader });
}

/** Accesso tipizzato alle uniform di un quad creato con `shaderQuad`. */
export function uniformsOf(mesh: Mesh<Geometry, Shader>): Record<string, unknown> {
  return (mesh.shader!.resources['uniforms'] as { uniforms: Record<string, unknown> }).uniforms;
}
