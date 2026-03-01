import { PostProcessStage } from "cesium";
import type { Viewer } from "cesium";

export const NIGHT_VISION_SHADER = /* glsl */ `
  uniform sampler2D colorTexture;
  uniform float u_time;
  in vec2 v_textureCoordinates;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main() {
    vec2 uv = v_textureCoordinates;
    vec4 color = texture(colorTexture, uv);
    float lum = dot(color.rgb, vec3(0.299, 0.587, 0.114));

    // Bloom — bright-pass averaged from neighborhood
    float bloom = 0.0;
    float texel = 1.0 / 960.0;
    for (int i = -2; i <= 2; i++) {
      for (int j = -2; j <= 2; j++) {
        vec4 s = texture(colorTexture, uv + vec2(float(i), float(j)) * texel * 2.0);
        bloom += max(0.0, dot(s.rgb, vec3(0.299, 0.587, 0.114)) - 0.55);
      }
    }
    bloom /= 25.0;
    lum += bloom * 1.3;

    // Temporal grain
    float grain = hash(uv * 800.0 + u_time * 6.0) * 0.12 - 0.06;
    lum = clamp(lum + grain, 0.0, 1.4);

    // Phosphor green tint
    vec3 nvg = vec3(0.08, 1.0, 0.08) * lum;

    // Vignette — smooth circular falloff
    vec2 d = uv - 0.5;
    float vig = 1.0 - dot(d, d) * 2.2;
    vig = clamp(vig * vig, 0.0, 1.0);

    out_FragColor = vec4(nvg * vig, 1.0);
  }
`;

export function createNightVisionStage(_viewer: Viewer): PostProcessStage {
  return new PostProcessStage({
    fragmentShader: NIGHT_VISION_SHADER,
    uniforms: {
      u_time: () => performance.now() * 0.001,
    },
  });
}
