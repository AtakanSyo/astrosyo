import * as THREE from 'three';

// Black hole: drawn on a camera-facing quad centred on the hole.
//
// - Event horizon: the dark disc, at the true Schwarzschild radius. That is
//   the black hole's physical size, the one the page compares. (A distant
//   telescope would see a larger shadow, about 2.6 times this radius, because
//   gravity magnifies the image; the post explains the difference.)
// - Photon ring: a thin bright ring at the disc's edge, brighter on one side
//   (gas moving towards us is beamed brighter), with a faint glow outside it.
//   Real photon rings appear at the shadow's edge; drawing it here keeps one
//   honest size on screen.
// - Lensing: the background (rendered to uBackground beforehand) is sampled
//   through a thin point-mass lens. A ray seen at angle θ from the centre comes
//   from β = θ − θ_E²/θ, so the stars crowd and stretch around the disc. The
//   bend fades to zero towards the quad's edge so it meets the unlensed sky
//   without a seam.
//
// Sizes arrive in device pixels each frame; quadScale is the quad's half size
// in event-horizon radii.
export const LENS_QUAD_SCALE = 6;

export function createBlackHoleMaterial(background) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      uBackground: { value: background },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uCenter: { value: new THREE.Vector2(0, 0) },
      uHorizonPx: { value: 100 },
      uQuadScale: { value: LENS_QUAD_SCALE },
      uTime: { value: 0 },
      uDpr: { value: 1 },
    },
    vertexShader: /* glsl */ `
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uBackground;
      uniform vec2 uResolution;
      uniform vec2 uCenter;
      uniform float uHorizonPx;
      uniform float uQuadScale;
      uniform float uTime;
      uniform float uDpr;

      void main() {
        vec2 rel = gl_FragCoord.xy - uCenter;
        float th = length(rel);
        float r = th / uHorizonPx; // distance in event-horizon radii
        float edge = 1.0 - smoothstep(uQuadScale * 0.6, uQuadScale * 0.98, r);

        // Thin-lens bend, Einstein radius a little outside the disc.
        float thetaE = 1.4 * uHorizonPx;
        vec2 bent = rel * (1.0 - (thetaE * thetaE) / max(th * th, 1.0));
        vec2 src = uCenter + mix(rel, bent, edge);
        vec3 col = texture2D(uBackground, src / uResolution).rgb;

        // Photon ring and its glow, brighter on the approaching (left) side.
        float ang = atan(rel.y, rel.x);
        float beaming = 0.25 + 0.75 * pow(0.5 + 0.5 * cos(ang - 2.6), 1.5);
        float shimmer = 0.94 + 0.06 * sin(ang * 9.0 + uTime * 0.7);
        float ringWidth = max(0.018, 1.2 * uDpr / uHorizonPx);
        float ring = exp(-pow((r - 1.0) / ringWidth, 2.0));
        float ring2 = 0.35 * exp(-pow((r - 1.045) / (ringWidth * 0.6), 2.0));
        float glow = r > 1.0 ? exp(-(r - 1.0) / 0.12) * 0.32 + exp(-(r - 1.0) / 0.6) * 0.05 : 0.0;
        vec3 warm = vec3(1.0, 0.72, 0.42);
        vec3 hot = vec3(1.0, 0.9, 0.75);
        col += hot * (ring + ring2) * beaming * shimmer * 0.95 + warm * glow * beaming;

        // The event horizon itself: black.
        float inside = 1.0 - smoothstep(0.985, 1.0, r);
        col = mix(col, vec3(0.0), inside);

        gl_FragColor = vec4(col, edge);
        #include <colorspace_fragment>
      }
    `,
  });
}

// Star: a plain glowing sphere. The colour runs from a bright centre to a
// darker, warmer edge (limb darkening), with either a crisp edge (the Sun) or
// a soft, fuzzy one (a red supergiant's vast, thin outer layers). No texture
// or surface pattern, so it stays clean at any size.
//
// limb: how quickly it darkens towards the edge (higher = darker edge).
// edge: width of the soft fade at the limb, in units of μ (0 = crisp).
export function createStarSurfaceMaterial({ deep, bright, limb = 0.5, edge = 0 }) {
  return new THREE.ShaderMaterial({
    transparent: edge > 0,
    depthWrite: edge === 0,
    toneMapped: false,
    uniforms: {
      uDeep: { value: new THREE.Color(deep) },
      uBright: { value: new THREE.Color(bright) },
      uLimb: { value: limb },
      uEdge: { value: edge },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormalView;
      void main() {
        vNormalView = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uDeep;
      uniform vec3 uBright;
      uniform float uLimb;
      uniform float uEdge;
      varying vec3 vNormalView;
      void main() {
        float mu = clamp(vNormalView.z, 0.0, 1.0); // orthographic: view direction is +z
        vec3 col = mix(uDeep, uBright, pow(mu, uLimb));
        float alpha = uEdge > 0.0 ? smoothstep(0.0, uEdge, mu) : 1.0;
        gl_FragColor = vec4(col, alpha);
        #include <colorspace_fragment>
      }
    `,
  });
}
