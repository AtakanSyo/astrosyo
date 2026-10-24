// Darken the parts of Saturn's rings that sit in the planet's shadow. The light is
// directional, so a ring point is shadowed when the ray from it toward the light
// passes through the planet's sphere.
export function applyRingShadow(material, { center, radius, lightDir }) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPlanetCenter = { value: center };
    shader.uniforms.uPlanetRadius = { value: radius };
    shader.uniforms.uLightDir = { value: lightDir };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRingWorldPos;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvRingWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vRingWorldPos;
        uniform vec3 uPlanetCenter;
        uniform float uPlanetRadius;
        uniform vec3 uLightDir;`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        vec3 toPoint = vRingWorldPos - uPlanetCenter;
        float along = dot(toPoint, uLightDir);
        // Only points on the far side of the planet from the light can be shadowed.
        float missBy = length(toPoint - along * uLightDir);
        float inShadow = (1.0 - smoothstep(uPlanetRadius * 0.97, uPlanetRadius * 1.03, missBy)) * step(along, 0.0);
        diffuseColor.rgb *= mix(1.0, 0.08, inShadow);`,
      );
  };
  material.needsUpdate = true;
}
