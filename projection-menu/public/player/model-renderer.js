// Live rendering of a dish's .glb 3D model (photogrammetry scan or Blender
// model) with a slow turntable. Loaded on demand: three.js is only downloaded
// when a dish with a model is on the table.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export function renderModel(container, url, { onReady, onError }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0); // transparent: the themed backdrop shows through
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 1000);
  // Warm restaurant lighting: soft sky fill plus a key light from above.
  scene.add(new THREE.HemisphereLight(0xfff1dc, 0x1a1410, 1.4));
  const key = new THREE.DirectionalLight(0xffe2b8, 2.6);
  key.position.set(2, 5, 3);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.8);
  rim.position.set(-3, 2, -4);
  scene.add(rim);

  let model = null;
  let mixer = null;
  let frame = 0;
  let disposed = false;
  const clock = new THREE.Clock();

  const resize = () => {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  new GLTFLoader().load(
    url,
    (gltf) => {
      if (disposed) return;
      model = gltf.scene;
      // Center the model and look at it from a 3/4 angle, like at a plate.
      const box = new THREE.Box3().setFromObject(model);
      const radius = box.getSize(new THREE.Vector3()).length() / 2 || 1;
      model.position.sub(box.getCenter(new THREE.Vector3()));
      camera.position.set(0, radius * 1.3, radius * 2.7);
      camera.lookAt(0, 0, 0);
      scene.add(model);
      if (gltf.animations.length) {
        mixer = new THREE.AnimationMixer(model);
        for (const clip of gltf.animations) mixer.clipAction(clip).setLoop(THREE.LoopRepeat).play();
      }
      onReady?.();
    },
    undefined,
    (err) => !disposed && onError?.(err),
  );

  const tick = () => {
    if (disposed) return;
    frame = requestAnimationFrame(tick);
    const dt = clock.getDelta();
    mixer?.update(dt);
    if (model) model.rotation.y += dt * 0.35; // slow turntable
    renderer.render(scene, camera);
  };
  tick();

  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    observer.disconnect();
    scene.traverse((obj) => {
      obj.geometry?.dispose();
      for (const material of [obj.material].flat()) {
        if (!material) continue;
        for (const value of Object.values(material)) if (value?.isTexture) value.dispose();
        material.dispose();
      }
    });
    renderer.dispose();
    renderer.forceContextLoss?.();
    renderer.domElement.remove();
  };
}
