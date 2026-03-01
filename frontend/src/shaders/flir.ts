import { PostProcessStage } from "cesium";
import type { Viewer } from "cesium";

export const FLIR_SHADER = /* glsl */ `
  uniform sampler2D colorTexture;
  in vec2 v_textureCoordinates;

  vec3 thermalPalette(float t) {
    vec3 a = vec3(0.0);
    vec3 b = vec3(0.0, 0.0, 0.6);
    vec3 c = vec3(0.6, 0.0, 0.6);
    vec3 d = vec3(1.0, 0.1, 0.0);
    vec3 e = vec3(1.0, 1.0, 0.0);
    vec3 f = vec3(1.0);

    if (t < 0.2) return mix(a, b, t / 0.2);
    if (t < 0.4) return mix(b, c, (t - 0.2) / 0.2);
    if (t < 0.6) return mix(c, d, (t - 0.4) / 0.2);
    if (t < 0.8) return mix(d, e, (t - 0.6) / 0.2);
    return mix(e, f, (t - 0.8) / 0.2);
  }

  void main() {
    vec2 uv = v_textureCoordinates;

    // 3x3 Gaussian blur for heat-haze softness
    float px = 1.0 / 1024.0;
    vec4 color = texture(colorTexture, uv) * 0.25
      + texture(colorTexture, uv + vec2(-px, -px)) * 0.0625
      + texture(colorTexture, uv + vec2( 0.0, -px)) * 0.125
      + texture(colorTexture, uv + vec2( px, -px)) * 0.0625
      + texture(colorTexture, uv + vec2(-px,  0.0)) * 0.125
      + texture(colorTexture, uv + vec2( px,  0.0)) * 0.125
      + texture(colorTexture, uv + vec2(-px,  px)) * 0.0625
      + texture(colorTexture, uv + vec2( 0.0,  px)) * 0.125
      + texture(colorTexture, uv + vec2( px,  px)) * 0.0625;

    float lum = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    vec3 thermal = thermalPalette(clamp(lum, 0.0, 1.0));

    // Targeting reticle — crosshair + circle
    vec2 c = uv - 0.5;
    float crossH = step(abs(c.y), 0.0008) * step(0.006, abs(c.x)) * step(abs(c.x), 0.035);
    float crossV = step(abs(c.x), 0.0008) * step(0.006, abs(c.y)) * step(abs(c.y), 0.035);
    float ring = 1.0 - smoothstep(0.0, 0.0015, abs(length(c) - 0.028));
    float reticle = max(max(crossH, crossV), ring);

    thermal = mix(thermal, vec3(1.0), reticle * 0.85);

    out_FragColor = vec4(thermal, 1.0);
  }
`;

export function createFlirStage(_viewer: Viewer): PostProcessStage {
  return new PostProcessStage({
    fragmentShader: FLIR_SHADER,
  });
}
