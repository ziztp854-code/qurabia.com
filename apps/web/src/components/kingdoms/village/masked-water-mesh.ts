import { GlProgram, Mesh, MeshGeometry, Shader, UniformGroup, type Container, type Rectangle, type Texture } from 'pixi.js';
import type { WorldSize } from '@/lib/kingdoms/village/types';

const vertex = `
in vec2 aPosition;
in vec2 aUV;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
out vec2 vUV;
void main() {
  vUV = aUV;
  vec3 position = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix * vec3(aPosition, 1.0);
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;
const fragment = `
in vec2 vUV;
uniform sampler2D uRipple;
uniform sampler2D uMask;
uniform vec2 uWorldSize;
uniform vec2 uRippleSize;
uniform vec4 uOffsets;
uniform vec4 uColor;
out vec4 finalColor;
vec4 ripple(vec2 scale, vec2 offset) {
  vec2 coord = fract((vUV * uWorldSize - offset) / (uRippleSize * scale));
  vec2 inset = 0.5 / uRippleSize;
  return texture(uRipple, clamp(coord, inset, vec2(1.0) - inset));
}
void main() {
  vec4 mask = texture(uMask, vUV);
  // Match MaskFilter's default red channel and premultiplied-alpha behavior.
  float coverage = mask.r * mask.a;
  if (coverage == 0.0) discard;
  vec4 first = ripple(vec2(0.8, 0.56), uOffsets.xy) * 0.45;
  vec4 second = ripple(vec2(0.57, 0.43), uOffsets.zw) * 0.30;
  finalColor = (second + first * (1.0 - second.a)) * coverage * uColor;
}`;

/** Draw the two original ripple passes and authored mask directly, without a
 * temporary render target. The photograph stays in its separate DOM layer. */
export function createMaskedWaterMesh(layer: Container, world: WorldSize, mask: Texture, ripple: Texture, bounds: Rectangle) {
  const x = bounds.x, y = bounds.y, right = x + bounds.width, bottom = y + bounds.height;
  const geometry = new MeshGeometry({
    positions: new Float32Array([x, y, right, y, right, bottom, x, bottom]),
    uvs: new Float32Array([x / world.width, y / world.height, right / world.width, y / world.height,
      right / world.width, bottom / world.height, x / world.width, bottom / world.height]),
  });
  const uniforms = new UniformGroup({
    uWorldSize: { value: new Float32Array([world.width, world.height]), type: 'vec2<f32>' },
    uRippleSize: { value: new Float32Array([ripple.width, ripple.height]), type: 'vec2<f32>' },
    uOffsets: { value: new Float32Array([0, 0, 113, 49]), type: 'vec4<f32>' },
  });
  const shader = new Shader({
    glProgram: GlProgram.from({ vertex, fragment, name: 'masked-water-ripples' }),
    resources: { waterUniforms: uniforms, uRipple: ripple.source, uMask: mask.source },
  });
  layer.addChild(new Mesh({ geometry, shader }));
  let time = 0;
  return {
    layer,
    update(elapsed: number, animate: boolean) {
      if (animate) time = elapsed / 1000;
      uniforms.uniforms.uOffsets.set([time * 3.1, time * .48, time * 3.1 * -.36 + 113, time * .48 + 49]);
    },
    destroy() {
      layer.destroy({ children: true }); shader.destroy(); geometry.destroy(); ripple.destroy(true);
    },
  };
}
