// Live rendering of a .glb 3D model (e.g. a dish scanned with photogrammetry
// or modelled in Blender) inside a seat zone. Pre-rendered video is lighter
// and looks the same for most dishes; use .glb when you want the model to
// rotate/animate live or swap materials without re-rendering.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export function renderModel(container, url, { loop, onPlaying, onEnded, onError }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 1); // black = no light on the table
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 1000);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x202020, 1.5));
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
  keyLight.position.set(2, 4, 3);
  scene.add(keyLight);

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
      // Center the model and frame it at a 3/4 angle, like looking at a plate.
      const box = new THREE.Box3().setFromObject(model);
      const radius = box.getSize(new THREE.Vector3()).length() / 2 || 1;
      model.position.sub(box.getCenter(new THREE.Vector3()));
      camera.position.set(0, radius * 1.4, radius * 2.6);
      camera.lookAt(0, 0, 0);
      scene.add(model);

      if (gltf.animations.length) {
        mixer = new THREE.AnimationMixer(model);
        let running = gltf.animations.length;
        for (const clip of gltf.animations) {
          const action = mixer.clipAction(clip);
          action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce);
          action.clampWhenFinished = true;
          action.play();
        }
        if (!loop) mixer.addEventListener('finished', () => --running === 0 && onEnded());
      }
      onPlaying();
    },
    undefined,
    (err) => onError(err?.message ?? 'تعذر تحميل النموذج ثلاثي الأبعاد'),
  );

  const tick = () => {
    if (disposed) return;
    frame = requestAnimationFrame(tick);
    const dt = clock.getDelta();
    mixer?.update(dt);
    if (model) model.rotation.y += dt * 0.4; // slow turntable
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
    renderer.domElement.remove();
  };
}
