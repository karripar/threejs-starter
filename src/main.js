import './style.css';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
import {VRButton} from 'three/addons/webxr/VRButton.js';
import {XRControllerModelFactory} from 'three/addons/webxr/XRControllerModelFactory.js';

//////////////
// Initialize variables
//////////////
let camera, scene, renderer, controls, cube;
let controller1, controller2;
let controllerGrip1, controllerGrip2;
let raycaster;

const intersected = [];
const tempMatrix = new THREE.Matrix4();
const excludedNames = ['Landscape', 'Plane', 'Grid'];

let group;

//////////////
// Initialization
//////////////
const init = () => {
  initScene();
  initRenderer();
  initVR();
  initObjects();
  initLights();
  initControls();
  initGroup();
  window.addEventListener('resize', resize, false);
  renderer.setAnimationLoop(animate);
};

const initScene = () => {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
};

const initRenderer = () => {
  renderer = new THREE.WebGLRenderer({antialias: true});
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);
};

const initVR = () => {
  // Enable VR
  document.body.appendChild(VRButton.createButton(renderer));
  renderer.xr.enabled = true;

  // ---------- Controllers ----------
  [controller1, controller2] = [0, 1].map((i) => {
    const ctrl = renderer.xr.getController(i);
    ctrl.addEventListener('selectstart', onSelectStart);
    ctrl.addEventListener('selectend', onSelectEnd);
    scene.add(ctrl);
    return ctrl;
  });

  // ---------- Controller Grips ----------
  const controllerModelFactory = new XRControllerModelFactory();

  // Left hand grip - default controller model
  controllerGrip1 = renderer.xr.getControllerGrip(0);
  controllerGrip1.add(
    controllerModelFactory.createControllerModel(controllerGrip1)
  );
  scene.add(controllerGrip1);

  // Right hand grip - ray gun model
  controllerGrip2 = renderer.xr.getControllerGrip(1);
  scene.add(controllerGrip2);

  const loader = new GLTFLoader();
  loader.load('./ray_gun.glb', async (gltf) => {
    const rayGun = gltf.scene;

    // Adjust scale, rotation, and position to fit the controller
    rayGun.scale.set(0.1, 0.1, 0.1); // adjust if needed
    rayGun.rotation.set(-Math.PI / 5, 0, 0); // rotate X to point forward
    rayGun.position.set(0, -0.1, 0.05); // slightly adjust to hand

    // Attach to right-hand grip
    controllerGrip2.add(rayGun);
  });

  // ---------- Controller Lines ----------
  initControllerLine(controller1); // laser for left controller
  initControllerLine(controller2);

  // ---------- Raycaster ----------
  raycaster = new THREE.Raycaster();
};

const initControllerLine = (controller) => {
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -1),
  ]);
  const line = new THREE.Line(geometry);
  line.name = 'line';
  line.scale.z = 5;
  controller.add(line.clone());
};

const initObjects = () => {
  const geometry = new THREE.BoxGeometry(3, 3, 3);
  const material = new THREE.MeshPhongMaterial({color: 0x00ff00});
  cube = new THREE.Mesh(geometry, material);
  // scene.add(cube);

  loadHDRAndModel();
};

const loadHDRAndModel = () => {
  new HDRLoader().setPath('./').load('spring-field.hdr', (texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = texture;
    scene.environment = texture;

    const loader = new GLTFLoader().setPath('./');
    loader.load('world.glb', async (gltf) => {
      const model = gltf.scene;
      model.position.x = -20;
      await renderer.compileAsync(model, camera, scene);
      group.add(model);
    });
  });
};

const initGroup = () => {
  group = new THREE.Group();
  scene.add(group);
};

const initLights = () => {
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.6);
  directionalLight.position.set(1, 1, 1);
  scene.add(directionalLight);

  const ambientLight = new THREE.AmbientLight(0xffffff);
  scene.add(ambientLight);
};

const initControls = () => {
  controls = new OrbitControls(camera, renderer.domElement);
  controls.listenToKeyEvents(window);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.screenSpacePanning = false;
  controls.minDistance = 1;
  controls.maxDistance = 10;
  camera.position.set(4, 4, 4);
  camera.lookAt(new THREE.Vector3(0, 0, 0));
};

//////////////
// VR Interaction Handlers
//////////////
const onSelectStart = (event) => {
  const controller = event.target;
  const intersections = getIntersections(controller);

  if (intersections.length > 0) {
    const object = intersections[0].object;
    if (!excludedNames.includes(object.name)) {
      object.material.emissive.b = 1;
      controller.attach(object);
    }
    controller.userData.selected = object;
  }

  controller.userData.targetRayMode = event.data.targetRayMode;
};

const onSelectEnd = (event) => {
  const controller = event.target;
  if (controller.userData.selected) {
    const object = controller.userData.selected;
    object.material.emissive.b = 0;
    group.attach(object);
    controller.userData.selected = undefined;
  }
};

const getIntersections = (controller) => {
  controller.updateMatrixWorld();
  raycaster.setFromXRController(controller);
  return raycaster.intersectObjects(group.children, true);
};

const intersectObjects = (controller) => {
  if (
    controller.userData.targetRayMode === 'screen' ||
    controller.userData.selected
  )
    return;

  const line = controller.getObjectByName('line');
  const intersections = getIntersections(controller);

  if (intersections.length > 0) {
    const object = intersections[0].object;
    if (!excludedNames.includes(object.name))
      (object.material.emissive.r = 1), intersected.push(object);
    line.scale.z = intersections[0].distance;
  } else line.scale.z = 5;
};

const cleanIntersected = () => {
  while (intersected.length) {
    const object = intersected.pop();
    object.material.emissive.r = 0;
  }
};

//////////////
// Animation Loop
//////////////
const animate = () => {
  cleanIntersected();
  intersectObjects(controller1);
  intersectObjects(controller2);
  renderer.render(scene, camera);
};

const resize = () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
};

//////////////
// Start
//////////////
init();
