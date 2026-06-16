import './styles.css';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const MODEL_URL = new URL('../Stairs.glb', import.meta.url).href;
const canvas = document.querySelector('#scene');
const status = document.querySelector('#status');
const buttons = {
  full: document.querySelector('[data-action="full-view"]'),
  front: document.querySelector('[data-action="front-view"]'),
  shadows: document.querySelector('[data-action="shadows"]'),
  reset: document.querySelector('[data-action="reset"]')
};
const lightInputs = [...document.querySelectorAll('[data-light-axis]')];
const intensityInput = document.querySelector('[data-light-intensity]');
const temperatureInput = document.querySelector('[data-light-temperature]');
const navHelp = document.querySelector('.nav-help');
const navHelpClose = document.querySelector('[data-action="close-nav-help"]');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x10100e);
scene.fog = new THREE.Fog(0x10100e, 11, 26);

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(5, 4, 8);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance'
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 2.5;
controls.maxDistance = 14;
controls.target.set(0, 1.2, 0);
controls.update();
const rightSideCenterAzimuth = Math.PI / 2;
controls.minAzimuthAngle = rightSideCenterAzimuth - Math.PI / 2;
controls.maxAzimuthAngle = rightSideCenterAzimuth + Math.PI / 2;
controls.enablePan = false;

const ambientLight = new THREE.HemisphereLight(0xd8fff8, 0x23180f, 1.1);
scene.add(ambientLight);

const keyLight = new THREE.SpotLight(0xfff3cf, 12, 36, Math.PI / 5.2, 0.42, 0.75);
keyLight.position.set(4, 6, 4);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 0.5;
keyLight.shadow.camera.far = 42;
keyLight.shadow.bias = -0.00012;
scene.add(keyLight);
scene.add(keyLight.target);

const lightHandle = new THREE.Mesh(
  new THREE.SphereGeometry(0.13, 24, 24),
  new THREE.MeshBasicMaterial({ color: 0xf6b154 })
);
lightHandle.position.copy(keyLight.position);
scene.add(lightHandle);

const floorMaterial = new THREE.ShadowMaterial({
  color: 0x000000,
  opacity: 0.42
});

const floor = new THREE.Mesh(new THREE.PlaneGeometry(18, 18), floorMaterial);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.025;
floor.receiveShadow = true;
scene.add(floor);


const modelCenter = new THREE.Vector3(0, 1.2, 0);
const modelSize = new THREE.Vector3(3, 3, 3);

let model = null;
let shadowsEnabled = true;
let activeView = 'full';
let viewTransition = null;

loadModel();
bindUi();
animate();

function loadModel() {
  const loader = new GLTFLoader();

  loader.load(
    MODEL_URL,
    (gltf) => {
      model = gltf.scene;
      model.name = 'loaded-stairs-model';
      scene.add(model);

      normalizeModel(model);
      prepareModelMeshes(model);
      frameFullView(false);

      status.textContent = 'Model ready';
    },
    (event) => {
      if (!event.lengthComputable) {
        return;
      }

      const percent = Math.round((event.loaded / event.total) * 100);
      status.textContent = `Loading Stairs.glb ${percent}%`;
    },
    (error) => {
      status.textContent = 'Could not load Stairs.glb';
      console.error(error);
    }
  );
}

function normalizeModel(root) {
  const initialBox = new THREE.Box3().setFromObject(root);
  const initialSize = initialBox.getSize(new THREE.Vector3());
  const maxAxis = Math.max(initialSize.x, initialSize.y, initialSize.z) || 1;
  const scale = 4.4 / maxAxis;
  root.scale.setScalar(scale);

  const box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  root.position.x -= center.x;
  root.position.z -= center.z;
  root.position.y -= box.min.y;

  const fittedBox = new THREE.Box3().setFromObject(root);
  fittedBox.getCenter(modelCenter);
  fittedBox.getSize(modelSize);

  floor.position.y = Math.max(-0.03, fittedBox.min.y - 0.025);
  keyLight.target.position.copy(modelCenter);
}

function prepareModelMeshes(root) {
  root.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
    child.material = cloneMaterial(child.material);
  });
}

function cloneMaterial(material) {
  if (Array.isArray(material)) {
    return material.map((item) => cloneMaterial(item));
  }

  const clone = material ? material.clone() : new THREE.MeshStandardMaterial();
  clone.side = THREE.DoubleSide;

  if ('roughness' in clone) {
    clone.roughness = Math.max(0.52, clone.roughness);
  }

  if ('envMapIntensity' in clone) {
    clone.envMapIntensity = 0.7;
  }

  return clone;
}

function bindUi() {
  buttons.full.addEventListener('click', () => {
    activeView = 'full';
    frameFullView(true);
    setActiveViewButton();
  });

  buttons.front.addEventListener('click', () => {
    activeView = 'front';
    frameFrontView(true);
    setActiveViewButton();
  });

  buttons.shadows.addEventListener('click', () => {
    shadowsEnabled = !shadowsEnabled;
    // Toggle renderer shadow map and update all mesh flags
    renderer.shadowMap.enabled = shadowsEnabled;
    renderer.shadowMap.needsUpdate = true;
    keyLight.castShadow = shadowsEnabled;
    if (floor) floor.receiveShadow = shadowsEnabled;
    if (model) {
      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = shadowsEnabled;
          child.receiveShadow = shadowsEnabled;
        }
      });
    }

    buttons.shadows.classList.toggle('is-active', shadowsEnabled);
    buttons.shadows.setAttribute('aria-pressed', String(shadowsEnabled));
  });

  buttons.reset.addEventListener('click', () => {
    activeView = 'full';
    frameFullView(true);
    setActiveViewButton();
  });

  for (const input of lightInputs) {
    input.addEventListener('input', () => {
      const nextPosition = lightHandle.position.clone();
      nextPosition[input.dataset.lightAxis] = Number(input.value);
      lightHandle.position.copy(nextPosition);
    });
  }

  if (intensityInput) {
    intensityInput.addEventListener('input', () => {
      keyLight.intensity = Number(intensityInput.value);
    });
    keyLight.intensity = Number(intensityInput.value);
  }

  if (temperatureInput) {
    temperatureInput.addEventListener('input', () => {
      const kelvin = Number(temperatureInput.value);
      keyLight.color.copy(kelvinToColor(kelvin));
    });
    keyLight.color.copy(kelvinToColor(Number(temperatureInput.value)));
  }

  if (navHelp && navHelpClose) {
    navHelpClose.addEventListener('click', () => {
      navHelp.hidden = true;
    });
  }

  window.addEventListener('resize', onResize);
}

function frameFullView(animated) {
  const distance = Math.max(6, modelSize.length() * 1.05);
  const position = new THREE.Vector3(distance * 0.62, distance * 0.48, distance * 0.72);
  setView(position, modelCenter, true, animated);
}

function frameFrontView(animated) {
  const distance = Math.max(6, modelSize.length() * 0.95);
  const position = new THREE.Vector3(modelCenter.x + distance, modelCenter.y + 0.12, modelCenter.z);
  setView(position, modelCenter, false, animated);
}

function setView(position, target, canRotate, animated) {
  controls.enableRotate = canRotate;
  const nextPosition = constrainOrbitPosition(position, target);

  if (!animated) {
    camera.position.copy(nextPosition);
    controls.target.copy(target);
    controls.update();
    viewTransition = null;
    controls.enabled = true;
    return;
  }

  controls.enabled = false;
  viewTransition = {
    fromPosition: camera.position.clone(),
    fromTarget: controls.target.clone(),
    toPosition: nextPosition,
    toTarget: target.clone(),
    startTime: performance.now(),
    durationMs: 520
  };
}

function setActiveViewButton() {
  buttons.full.classList.toggle('is-active', activeView === 'full');
  buttons.front.classList.toggle('is-active', activeView === 'front');
}

function updateViewTransition() {
  if (!viewTransition) {
    return;
  }

  const elapsed = performance.now() - viewTransition.startTime;
  const t = Math.min(1, elapsed / viewTransition.durationMs);
  const eased = 1 - Math.pow(1 - t, 3);

  camera.position.lerpVectors(viewTransition.fromPosition, viewTransition.toPosition, eased);
  controls.target.lerpVectors(viewTransition.fromTarget, viewTransition.toTarget, eased);
  controls.update();

  if (t >= 1) {
    camera.position.copy(viewTransition.toPosition);
    controls.target.copy(viewTransition.toTarget);
    viewTransition = null;
    controls.enabled = true;
  }
}

function constrainOrbitPosition(position, target) {
  const offset = position.clone().sub(target);
  const radius = THREE.MathUtils.clamp(offset.length(), controls.minDistance, controls.maxDistance);
  const azimuth = THREE.MathUtils.clamp(
    Math.atan2(offset.x, offset.z),
    controls.minAzimuthAngle,
    controls.maxAzimuthAngle
  );

  const xz = Math.hypot(offset.x, offset.z) || 0.0001;
  const polar = Math.atan2(xz, offset.y);
  const minPolar = controls.minPolarAngle ?? 0;
  const maxPolar = controls.maxPolarAngle ?? Math.PI;
  const clampedPolar = THREE.MathUtils.clamp(polar, minPolar, maxPolar);
  const sinPolar = Math.sin(clampedPolar);

  return new THREE.Vector3(
    target.x + radius * sinPolar * Math.sin(azimuth),
    target.y + radius * Math.cos(clampedPolar),
    target.z + radius * sinPolar * Math.cos(azimuth)
  );
}

function updateLight() {
  keyLight.position.copy(lightHandle.position);
  keyLight.target.position.copy(modelCenter);

  for (const input of lightInputs) {
    const axis = input.dataset.lightAxis;
    input.value = lightHandle.position[axis].toFixed(1);
  }

  if (intensityInput) {
    intensityInput.value = keyLight.intensity.toFixed(1);
  }
}

function kelvinToColor(kelvin) {
  const temp = THREE.MathUtils.clamp(kelvin, 1000, 40000) / 100;
  let red;
  let green;
  let blue;

  if (temp <= 66) {
    red = 255;
    green = 99.4708025861 * Math.log(temp) - 161.1195681661;
    blue = temp <= 19 ? 0 : 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
  } else {
    red = 329.698727446 * Math.pow(temp - 60, -0.1332047592);
    green = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
    blue = 255;
  }

  const color = new THREE.Color();
  color.setRGB(
    THREE.MathUtils.clamp(red, 0, 255) / 255,
    THREE.MathUtils.clamp(green, 0, 255) / 255,
    THREE.MathUtils.clamp(blue, 0, 255) / 255
  );
  return color;
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  requestAnimationFrame(animate);
  updateViewTransition();
  updateLight();
  controls.update();
  renderer.render(scene, camera);
}
