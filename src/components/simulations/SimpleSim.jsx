import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import SimStage from './lib/simStage.jsx';

// React component: renders a 3D rainbow-shaded sphere with play/pause control
export default function SimpleSim({
  id = 'sphere-demo',     // unique id for the canvas & wrapper
  aspect = '16 / 9',      // aspect ratio of the canvas (CSS aspect-ratio)
  showPause = true,       // whether to show the Play/Pause button
  dprCap = 1.5,           // max devicePixelRatio to avoid super high-res rendering
}) {
  // --- Refs to DOM elements & state
  const containerRef = useRef(null);  // <div> container for scene
  const canvasRef = useRef(null);     // <canvas> element where we render
  const pausedRef = useRef(true);     // mutable paused state used in render loop
  const [paused, setPaused] = useState(true); // React state for button UI
  const madeVisibleRef = useRef(false); // tracks if "is-visible" CSS class was applied

  // --- Effect: setup Three.js scene after component mounts
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return; // bail out if refs not ready

    // --- Create WebGL renderer
    const renderer = new THREE.WebGLRenderer({
      canvas,               // attach to our canvas
      antialias: true,      // smoother edges
      alpha: false,         // opaque background
      powerPreference: 'high-performance', // request GPU performance
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace; // proper color space

    // --- Scene & Camera
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000); // black background
    const camera = new THREE.PerspectiveCamera(
      50,    // field of view (degrees)
      1,     // aspect ratio (placeholder, fixed later in resize)
      0.1,   // near clip plane
      1000   // far clip plane
    );
    camera.position.z = 5; // move camera away from origin to view sphere

    // --- Rainbow gradient shader material
    const rainbowMaterial = new THREE.ShaderMaterial({
      vertexShader: /* glsl */`
        varying vec3 vPos;
        void main() {
          vPos = position; // pass vertex position to fragment shader
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        varying vec3 vPos;
        // Function to generate a rainbow color palette
        vec3 rainbow(float t) {
          return vec3(
            0.5 + 0.5 * cos(6.28318 * (t + 0.0)),  // red channel
            0.5 + 0.5 * cos(6.28318 * (t + 0.33)), // green channel
            0.5 + 0.5 * cos(6.28318 * (t + 0.67))  // blue channel
          );
        }
        void main() {
          // Map vertex y position [-1,1] to [0,1]
          float mixFactor = (vPos.y + 1.0) / 2.0;
          vec3 color = rainbow(mixFactor); // assign rainbow color
          gl_FragColor = vec4(color, 1.0); // output final fragment color
        }
      `,
    });

    // --- Sphere mesh with custom rainbow shader
    const geometry = new THREE.SphereGeometry(1, 64, 64); // radius 1, hi-res segments
    const sphere = new THREE.Mesh(geometry, rainbowMaterial);
    scene.add(sphere);

    // --- Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4); // soft fill light
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0); // main light
    directionalLight.position.set(5, 5, 5); // place light diagonally
    scene.add(directionalLight);

    // --- Handle resizing & device pixel ratio
    const fit = () => {
      const dpr = Math.min(dprCap, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.floor(container.clientWidth * dpr));
      const h = Math.max(1, Math.floor(container.clientHeight * dpr));
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      renderer.setSize(w, h, false);
      camera.aspect = w / h || 1;
      camera.updateProjectionMatrix();
    };

    const ro = new ResizeObserver(fit);
    ro.observe(container);
    window.addEventListener('resize', fit, { passive: true });
    fit();

    // --- Animation loop
    renderer.setAnimationLoop(() => {
      if (!pausedRef.current) {
        sphere.rotation.y += 0.01; // spin around Y
        sphere.rotation.x += 0.005; // tilt around X
      }
      renderer.render(scene, camera);
    });

    // --- Cleanup
    return () => {
      try { ro.disconnect(); } catch {}
      window.removeEventListener('resize', fit);
      renderer.setAnimationLoop(null);
      renderer.dispose();
      geometry.dispose();
      rainbowMaterial.dispose();
    };
  }, [dprCap]);

  // --- Play/Pause toggle
  const onToggle = () => {
    pausedRef.current = !pausedRef.current;
    const nowPaused = pausedRef.current;
    setPaused(nowPaused);

    if (!nowPaused && !madeVisibleRef.current) {
      madeVisibleRef.current = true;
      const figure = containerRef.current?.closest('figure.sim-stage');
      if (figure && !figure.classList.contains('is-visible')) {
        figure.classList.add('is-visible');
      }
    }
  };

  return (
    <SimStage
      id={id}
      aspect={aspect}
      containerRef={containerRef}
      canvasRef={canvasRef}
      paused={paused}
      onToggle={onToggle}
      showPause={showPause}
    />
  );
}
