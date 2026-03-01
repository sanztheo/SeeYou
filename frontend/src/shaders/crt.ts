import { PostProcessStage } from "cesium";
import type { Viewer } from "cesium";

export const CRT_SHADER = /* glsl */ `
  uniform sampler2D colorTexture;
  uniform float u_time;
  varying vec2 v_textureCoordinates;

  vec2 barrel(vec2 uv) {
    vec2 cc = uv - 0.5;
    float dist = dot(cc, cc);
    return uv + cc * dist * 0.18;
  }

  void main() {
    vec2 uv = barrel(v_textureCoordinates);

    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }

    float ab = 0.0025;
    float r = texture2D(colorTexture, uv + vec2( ab, 0.0)).r;
    float g = texture2D(colorTexture, uv).g;
    float b = texture2D(colorTexture, uv + vec2(-ab, 0.0)).b;
    vec3 color = vec3(r, g, b);

    float scan = sin(uv.y * 900.0 * 3.14159) * 0.5 + 0.5;
    color *= mix(0.72, 1.0, scan);

    float flicker = 1.0 + 0.025 * sin(u_time * 8.0);
    color *= flicker;

    float col = mod(gl_FragCoord.x, 3.0);
    vec3 mask = vec3(
      step(0.5, 1.0 - abs(col - 0.0)),
      step(0.5, 1.0 - abs(col - 1.0)),
      step(0.5, 1.0 - abs(col - 2.0))
    );
    color *= mix(vec3(1.0), mask, 0.12);

    color *= vec3(1.05, 1.0, 0.92);

    vec2 d = uv - 0.5;
    float vig = 1.0 - dot(d, d) * 2.5;
    color *= clamp(vig, 0.0, 1.0);

    gl_FragColor = vec4(color, 1.0);
  }
`;

export function createCrtStage(_viewer: Viewer): PostProcessStage {
  return new PostProcessStage({
    fragmentShader: CRT_SHADER,
    uniforms: {
      u_time: () => performance.now() * 0.001,
    },
  });
}
