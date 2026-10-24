import * as THREE from 'three';

// Earth's surface extras, patched into its MeshStandardMaterial: city lights
// that glow only on the night side, and a smoother (shinier) ocean so the sun
// leaves a soft glint. Oceans are picked out of the day texture by colour, since
// there is no separate water mask. `lightDirView` is the direction toward the
// sun in view space. Chains any onBeforeCompile already on the material.
export function applyEarthSurface(material, { nightMap, lightDirView, nightIntensity = 2.6 }) {
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous?.(shader, renderer);
    shader.uniforms.uNightMap = { value: nightMap };
    shader.uniforms.uSunDirView = { value: lightDirView };
    shader.uniforms.uNightIntensity = { value: nightIntensity };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D uNightMap;
        uniform vec3 uSunDirView;
        uniform float uNightIntensity;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        float ocean = smoothstep(0.02, 0.12, diffuseColor.b - max(diffuseColor.r, diffuseColor.g));
        roughnessFactor = mix(roughnessFactor, 0.38, ocean);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float sunFacing = dot(normalize(normal), uSunDirView);
        float night = 1.0 - smoothstep(-0.22, 0.08, sunFacing);
        // Keep the city lights and drop the night map's faint blue base.
        vec3 nightTexel = texture2D(uNightMap, vMapUv).rgb;
        float cityLights = smoothstep(0.015, 0.12, dot(nightTexel, vec3(0.2126, 0.7152, 0.0722)));
        totalEmissiveRadiance += nightTexel * cityLights * night * uNightIntensity;`,
      );
  };
  material.needsUpdate = true;
}

const SHELL_VERTEX = `
  varying vec3 vNormalView;
  varying vec3 vToCamera;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormalView = normalize(normalMatrix * normal);
    // Orthographic cameras look along -z everywhere; perspective ones toward the eye.
    bool ortho = projectionMatrix[3][3] == 1.0;
    vToCamera = ortho ? vec3(0.0, 0.0, 1.0) : normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

// A two-layer atmosphere: a thin haze hugging the limb and a soft halo just
// outside it, both brightest on the sunlit side.
export function createAtmosphere({ radius, color = '#6fb6ff', lightDirView, haloScale = 1.14, strength = 1 }) {
  const shared = {
    uColor: { value: new THREE.Color(color) },
    uSunDirView: { value: lightDirView },
    uStrength: { value: strength },
  };
  const common = {
    vertexShader: SHELL_VERTEX,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  };

  // Halo: seen from inside (back faces). The planet's limb sits where the view
  // ray grazes the planet, i.e. dot(normal, toCamera) = -sqrt(1 - 1/haloScale²).
  const limb = Math.sqrt(1 - 1 / (haloScale * haloScale));
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(radius * haloScale, 96, 64),
    new THREE.ShaderMaterial({
      ...common,
      side: THREE.BackSide,
      uniforms: { ...shared, uLimb: { value: limb } },
      fragmentShader: `
        uniform vec3 uColor;
        uniform vec3 uSunDirView;
        uniform float uStrength;
        uniform float uLimb;
        varying vec3 vNormalView;
        varying vec3 vToCamera;
        void main() {
          float t = clamp(-dot(vNormalView, vToCamera) / uLimb, 0.0, 1.0);
          float glow = pow(t, 3.0);
          float day = smoothstep(-0.35, 0.6, dot(vNormalView, uSunDirView));
          gl_FragColor = vec4(uColor * glow * (0.03 + 0.97 * day) * 0.9 * uStrength, 1.0);
        }
      `,
    }),
  );

  // Haze: front faces just above the surface, strongest toward the edge.
  const haze = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.012, 96, 64),
    new THREE.ShaderMaterial({
      ...common,
      side: THREE.FrontSide,
      uniforms: shared,
      fragmentShader: `
        uniform vec3 uColor;
        uniform vec3 uSunDirView;
        uniform float uStrength;
        varying vec3 vNormalView;
        varying vec3 vToCamera;
        void main() {
          float facing = clamp(dot(vNormalView, vToCamera), 0.0, 1.0);
          // Rises toward the limb but fades out at the shell's own edge, so it has no hard rim.
          float fresnel = pow(1.0 - facing, 2.6) * smoothstep(0.0, 0.3, facing);
          float day = smoothstep(-0.25, 0.5, dot(vNormalView, uSunDirView));
          vec3 tint = mix(uColor, vec3(1.0), 0.15);
          gl_FragColor = vec4(tint * (0.04 + fresnel) * day * 0.85 * uStrength, 1.0);
        }
      `,
    }),
  );

  const group = new THREE.Group();
  group.add(halo, haze);
  const dispose = () => {
    [halo, haze].forEach((m) => {
      m.geometry.dispose();
      m.material.dispose();
    });
  };
  return { group, dispose };
}
