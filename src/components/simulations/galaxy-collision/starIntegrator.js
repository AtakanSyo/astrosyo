import * as THREE from 'three';

// Moves every star at once on the GPU.
//
// Each star's position and velocity live in one texel of two float textures,
// written together in a single pass (two render-target attachments). A step
// computes the pull of both galaxy cores (Hernquist halos) on every star and
// advances it with a symplectic Euler step (kick, then drift), which keeps
// orbits stable over thousands of steps. Stars don't pull on each other; that
// is what makes the model cheap (see collisionModel.js).
//
// Checkpoints copy the whole state, so the timeline can jump backwards by
// restoring the nearest earlier one and re-running forward.

const STEP_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform sampler2D uPos;
  uniform sampler2D uVel;
  uniform vec3 uCore0;
  uniform vec3 uCore1;
  uniform vec2 uMass;
  uniform vec2 uScale;
  uniform float uG;
  uniform float uDt;
  layout(location = 0) out vec4 outPos;
  layout(location = 1) out vec4 outVel;

  vec3 pull(vec3 p, vec3 core, float mass, float scale) {
    vec3 d = core - p;
    float r = max(length(d), 0.05);
    return d * (uG * mass / (r * (r + scale) * (r + scale)));
  }

  void main() {
    ivec2 texel = ivec2(gl_FragCoord.xy);
    vec4 p = texelFetch(uPos, texel, 0);
    vec4 v = texelFetch(uVel, texel, 0);
    vec3 a = pull(p.xyz, uCore0, uMass.x, uScale.x) + pull(p.xyz, uCore1, uMass.y, uScale.y);
    v.xyz += a * uDt;
    p.xyz += v.xyz * uDt;
    outPos = p;
    outVel = v;
  }
`;

const COPY_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform sampler2D uPos;
  uniform sampler2D uVel;
  layout(location = 0) out vec4 outPos;
  layout(location = 1) out vec4 outVel;
  void main() {
    ivec2 texel = ivec2(gl_FragCoord.xy);
    outPos = texelFetch(uPos, texel, 0);
    outVel = texelFetch(uVel, texel, 0);
  }
`;

const VERTEX = /* glsl */ `
  in vec3 position;
  void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// Float render targets need WebGL2 with EXT_color_buffer_float.
export const supportsStarIntegrator = (renderer) =>
  renderer.capabilities.isWebGL2 && renderer.extensions.has('EXT_color_buffer_float');

export class StarIntegrator {
  constructor(renderer, { width, height, galaxies, G }) {
    this.renderer = renderer;
    this.width = width;
    this.height = height;
    const makeTarget = () =>
      new THREE.WebGLRenderTarget(width, height, {
        count: 2,
        type: THREE.FloatType,
        format: THREE.RGBAFormat,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        depthBuffer: false,
        generateMipmaps: false,
      });
    this.makeTarget = makeTarget;
    this.read = makeTarget();
    this.write = makeTarget();
    this.checkpoints = new Map(); // step -> render target

    this.stepMaterial = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VERTEX,
      fragmentShader: STEP_FRAGMENT,
      uniforms: {
        uPos: { value: null },
        uVel: { value: null },
        uCore0: { value: new THREE.Vector3() },
        uCore1: { value: new THREE.Vector3() },
        uMass: { value: new THREE.Vector2(galaxies[0].mass, galaxies[1].mass) },
        uScale: { value: new THREE.Vector2(galaxies[0].scale, galaxies[1].scale) },
        uG: { value: G },
        uDt: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.copyMaterial = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VERTEX,
      fragmentShader: COPY_FRAGMENT,
      uniforms: { uPos: { value: null }, uVel: { value: null } },
      depthTest: false,
      depthWrite: false,
    });

    // One triangle that covers the whole target.
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.quad = new THREE.Mesh(geometry, this.stepMaterial);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.camera = new THREE.Camera();
    this.pixel = new Float32Array(4);
  }

  get positionTexture() {
    return this.read.textures[0];
  }

  renderTo(target, material, pos, vel) {
    material.uniforms.uPos.value = pos;
    material.uniforms.uVel.value = vel;
    this.quad.material = material;
    const previous = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(previous);
  }

  // Load initial positions/velocities (Float32Array, RGBA per star).
  load(positions, velocities) {
    const toTexture = (data) => {
      const tex = new THREE.DataTexture(data, this.width, this.height, THREE.RGBAFormat, THREE.FloatType);
      tex.needsUpdate = true;
      return tex;
    };
    const pos = toTexture(positions);
    const vel = toTexture(velocities);
    this.renderTo(this.read, this.copyMaterial, pos, vel);
    pos.dispose();
    vel.dispose();
    this.clearCheckpoints();
  }

  step(core0, core1, dt) {
    const u = this.stepMaterial.uniforms;
    u.uCore0.value.set(core0[0], core0[1], core0[2]);
    u.uCore1.value.set(core1[0], core1[1], core1[2]);
    u.uDt.value = dt;
    this.renderTo(this.write, this.stepMaterial, this.read.textures[0], this.read.textures[1]);
    [this.read, this.write] = [this.write, this.read];
  }

  saveCheckpoint(step) {
    let target = this.checkpoints.get(step);
    if (!target) {
      target = this.makeTarget();
      this.checkpoints.set(step, target);
    }
    this.renderTo(target, this.copyMaterial, this.read.textures[0], this.read.textures[1]);
  }

  // Restore the latest checkpoint at or before `step`; returns its step.
  restoreBefore(step) {
    let best = -1;
    for (const s of this.checkpoints.keys()) if (s <= step && s > best) best = s;
    if (best < 0) return -1;
    const target = this.checkpoints.get(best);
    this.renderTo(this.read, this.copyMaterial, target.textures[0], target.textures[1]);
    return best;
  }

  clearCheckpoints() {
    this.checkpoints.forEach((t) => t.dispose());
    this.checkpoints.clear();
  }

  // Read one star's position (used to put the night-sky camera at the Sun).
  readPosition(index) {
    const x = index % this.width;
    const y = Math.floor(index / this.width);
    this.renderer.readRenderTargetPixels(this.read, x, y, 1, 1, this.pixel, undefined, 0);
    return this.pixel;
  }

  dispose() {
    this.read.dispose();
    this.write.dispose();
    this.clearCheckpoints();
    this.stepMaterial.dispose();
    this.copyMaterial.dispose();
    this.quad.geometry.dispose();
  }
}
