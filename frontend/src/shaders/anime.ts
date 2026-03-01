import { PostProcessStage } from "cesium";
import type { Viewer } from "cesium";

export const ANIME_SHADER = /* glsl */ `
  uniform sampler2D colorTexture;
  varying vec2 v_textureCoordinates;

  void main() {
    vec2 uv = v_textureCoordinates;
    vec4 color = texture2D(colorTexture, uv);

    float levels = 5.0;
    vec3 posterized = floor(color.rgb * levels + 0.5) / levels;

    float gray = dot(posterized, vec3(0.299, 0.587, 0.114));
    vec3 saturated = mix(vec3(gray), posterized, 1.5);

    float px = 1.0 / 1280.0;
    float py = 1.0 / 720.0;

    float tl = dot(texture2D(colorTexture, uv + vec2(-px,  py)).rgb, vec3(0.333));
    float tc = dot(texture2D(colorTexture, uv + vec2(0.0,  py)).rgb, vec3(0.333));
    float tr = dot(texture2D(colorTexture, uv + vec2( px,  py)).rgb, vec3(0.333));
    float ml = dot(texture2D(colorTexture, uv + vec2(-px, 0.0)).rgb, vec3(0.333));
    float mr = dot(texture2D(colorTexture, uv + vec2( px, 0.0)).rgb, vec3(0.333));
    float bl = dot(texture2D(colorTexture, uv + vec2(-px, -py)).rgb, vec3(0.333));
    float bc = dot(texture2D(colorTexture, uv + vec2(0.0, -py)).rgb, vec3(0.333));
    float br = dot(texture2D(colorTexture, uv + vec2( px, -py)).rgb, vec3(0.333));

    float sobelX = -tl - 2.0 * ml - bl + tr + 2.0 * mr + br;
    float sobelY = -tl - 2.0 * tc - tr + bl + 2.0 * bc + br;
    float edge = length(vec2(sobelX, sobelY));

    float outline = 1.0 - smoothstep(0.04, 0.14, edge);

    vec3 result = saturated * outline * 1.08;

    gl_FragColor = vec4(clamp(result, 0.0, 1.0), 1.0);
  }
`;

export function createAnimeStage(_viewer: Viewer): PostProcessStage {
  return new PostProcessStage({
    fragmentShader: ANIME_SHADER,
  });
}
