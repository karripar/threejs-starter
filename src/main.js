import './style.css';
import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';

let scene, camera, renderer, cube, controls;

const init = () => {
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.z = 5;

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  // Lighting
  const ambientLight = new THREE.AmbientLight(0x404040, 1);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.set(5, 10, 7.5);
  scene.add(directionalLight);

  /* Snowman parts */
  const snowmanBody = new THREE.SphereGeometry(1, 32, 32);
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
  const body = new THREE.Mesh(snowmanBody, bodyMaterial);
  body.scale.set(1, 1.2, 1);
  body.position.set(0, -0.5, 0);
  scene.add(body);

  const snowmanHead = new THREE.SphereGeometry(0.6, 32, 32);
  const head = new THREE.Mesh(snowmanHead, bodyMaterial);
  head.position.set(0, 1.1, 0);
  scene.add(head);

  const eyeGeometry = new THREE.SphereGeometry(0.05, 16, 16);
  const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x000000 });
  const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
  leftEye.position.set(-0.15, 1.25, 0.55);
  scene.add(leftEye);

  const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
  rightEye.position.set(0.15, 1.25, 0.55);
  scene.add(rightEye);

  const noseGeometry = new THREE.ConeGeometry(0.1, 0.75, 16); // radius - height - segments
  const noseMaterial = new THREE.MeshStandardMaterial({ color: 0xffa500 });
  const nose = new THREE.Mesh(noseGeometry, noseMaterial);
  nose.position.set(0, 1.1, 0.6);
  nose.rotation.x = Math.PI / 2;
  scene.add(nose);

  // komeat kulmakarvat lumiukolle
  const eyebrowsGeometry = new THREE.CylinderGeometry(0.02, 0.02, 0.2, 16);
  const eyebrowsMaterial = new THREE.MeshStandardMaterial({ color: 0x000000 });
  const leftEyebrow = new THREE.Mesh(eyebrowsGeometry, eyebrowsMaterial);
  leftEyebrow.position.set(-0.15, 1.4, 0.5);
  leftEyebrow.rotation.z = Math.PI / 8;
  scene.add(leftEyebrow);

  const rightEyebrow = new THREE.Mesh(eyebrowsGeometry, eyebrowsMaterial);
  rightEyebrow.position.set(0.15, 1.4, 0.5);
  rightEyebrow.rotation.z = -Math.PI / 8;
  scene.add(rightEyebrow);


  // Axes
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

init();
