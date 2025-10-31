import {HDRLoader} from 'three/examples/jsm/Addons.js';
import './style.css';
import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {RGBELoader} from 'three/examples/jsm/loaders/RGBELoader.js'; // HDRLoader → RGBELoader

let scene, camera, renderer, controls;

const init = () => {
  // Scene
  scene = new THREE.Scene();

  // Camera
  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.z = 5;

  // Renderer
  renderer = new THREE.WebGLRenderer({antialias: true});
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  document.body.appendChild(renderer.domElement);

  // Lights
  const ambientLight = new THREE.AmbientLight(0x404040);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.set(5, 10, 7.5);
  scene.add(directionalLight);

  // Axes helper
  const axesHelper = new THREE.AxesHelper(5);
  scene.add(axesHelper);

  // Orbit controls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.screenSpacePanning = false;
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

  // Event listeners
  window.addEventListener('resize', onWindowResize);

  // Start rendering loop
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

// Initialize
init();
