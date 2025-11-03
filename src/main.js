
import './style.css';
import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/examples/jsm/Addons.js';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';

let scene, camera, renderer, controls;

const init = () => {
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.z = 5;

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  document.body.appendChild(renderer.domElement);

  const ambientLight = new THREE.AmbientLight(0x404040);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.set(5, 10, 7.5);
  scene.add(directionalLight);

  const axesHelper = new THREE.AxesHelper(5);
  scene.add(axesHelper);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = 2;
  controls.maxDistance = 10;
  controls.maxPolarAngle = Math.PI / 2;

  // HDR environment map
  new HDRLoader().setPath('/').load('pathway_morning_2k.hdr', (texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = texture;
    scene.environment = texture;

    // Load GLTF model
    const loader = new GLTFLoader().setPath('/');
    loader.load('world.glb', async (gltf) => {
      const model = gltf.scene;
      await renderer.compileAsync(model, camera, scene);
      scene.add(model);
    });
  });

  window.addEventListener('resize', onWindowResize);

  renderer.setAnimationLoop(animate);
};

const animate = () => {
  controls.update();
  renderer.render(scene, camera);
};

const onWindowResize = () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
};

const initVR = () => {
  document.body.appendChild(VRButton.createButton(renderer));
  renderer.xr.enabled = true;
};

// Initialize in correct order
init();
initVR();
