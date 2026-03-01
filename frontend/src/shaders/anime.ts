import { PostProcessStage } from "cesium";
import type { Viewer } from "cesium";

export const ANIME_SHADER = /* glsl */ `
  uniform sampler2D colorTexture;
  in vec2 v_textureCoordinates;

  void main() {
    vec2 uv = v_textureCoordinates;
    vec4 color = texture(colorTexture, uv);

    // Posterize — quantize each channel to 5 discrete levels
    float levels = 5.0;
    vec3 posterized = floor(color.rgb * levels + 0.5) / levels;

    // Boost saturation
    float gray = dot(posterized, vec3(0.299, 0.587, 0.114));
    vec3 saturated = mix(vec3(gray), posterized, 1.5);

    // Sobel edge detection for black outlines
    float px = 1.0 / 1280.0;
    float py = 1.0 / 720.0;

    float tl = dot(texture(colorTexture, uv + vec2(-px,  py)).rgb, vec3(0.333));
    float t  = dot(texture(colorTexture, uv + vec2(0.0,  py)).rgb, vec3(0.333));
    float tr = dot(texture(colorTexture, uv + vec2( px,  py)).rgb, vec3(0.333));
    float l  = dot(texture(colorTexture, uv + vec2(-px, 0.0)).rgb, vec3(0.333));
    float r  = dot(texture(colorTexture, uv + vec2( px, 0.0)).rgb, vec3(0.333));
    float bl = dot(texture(colorTexture, uv + vec2(-px, -py)).rgb, vec3(0.333));
    float b  = dot(texture(colorTexture, uv + vec2(0.0, -py)).rgb, vec3(0.333));
    float br = dot(texture(colorTexture, uv + vec2( px, -py)).rgb, vec3(0.333));

    float sobelX = -tl - 2.0 * l - bl + tr + 2.0 * r + br;
    float sobelY = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
    float edge = length(vec2(sobelX, sobelY));

    // Thick ink outlines
    float outline = 1.0 - smoothstep(0.04, 0.14, edge);

    // Lighten slightly to mimic anime brightness
    vec3 result = saturated * outline * 1.08;

    out_FragColor = vec4(clamp(result, 0.0, 1.0), 1.0);
  }
`;

export function createAnimeStage(_viewer: Viewer): PostProcessStage {
  return new PostProcessStage({
    fragmentShader: ANIME_SHADER,
  });
}
