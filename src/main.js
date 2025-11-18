/* Full patched VR + Rapier + Teleport script
   - Fixed: grab offset (no jump to face)
   - Fixed: re-add physics with proper transform so objects don't fall through floor
   - Preserves teleport and ray gun
*/

import "./style.css";
import * as THREE from "three";

import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";

import { VRButton } from "three/addons/webxr/VRButton.js";
import { XRControllerModelFactory } from "three/addons/webxr/XRControllerModelFactory.js";

import { RapierPhysics } from "three/addons/physics/RapierPhysics.js";
import { RapierHelper } from "three/addons/helpers/RapierHelper.js";
import Stats from "three/addons/libs/stats.module.js";

////////////////////////////////////////////////////////////////////////////////
// CONFIG
////////////////////////////////////////////////////////////////////////////////
const THROW_MULTIPLIER = 3; // multiply controller velocity to compute throw velocity
const EXCLUDED_NAMES = ["Landscape", "Plane", "Grid"];

////////////////////////////////////////////////////////////////////////////////
// GLOBALS
////////////////////////////////////////////////////////////////////////////////
let camera, scene, renderer, controls;
let controller1, controller2;
let controllerGrip1, controllerGrip2;
let raycaster;

let group; // pickable & physics-enabled meshes
let teleportGroup; // objects/floor for teleporting
let marker; // teleport marker

let physics, physicsHelper, stats;

let baseReferenceSpace; // for teleport reference space
let INTERSECTION = undefined; // teleport intersection point

// temp helpers
const tempPos = new THREE.Vector3();
const tempMatrix = new THREE.Matrix4();

let lastTime = performance.now() / 1000;

////////////////////////////////////////////////////////////////////////////////
// ENTRY
////////////////////////////////////////////////////////////////////////////////
init().catch((err) => console.error("Init error:", err));

////////////////////////////////////////////////////////////////////////////////
// INIT
////////////////////////////////////////////////////////////////////////////////
async function init() {
  initScene();
  initRenderer();

  initGroup();
  initTeleportGroup();

  await initPhysics();

  initVR();
  initLights();
  initControls();

  loadHDRAndModel();

  window.addEventListener("resize", onResize, false);
  renderer.setAnimationLoop(animate);
}

////////////////////////////////////////////////////////////////////////////////
// SCENE & RENDERER
////////////////////////////////////////////////////////////////////////////////
function initScene() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.set(0, 1.6, 3);
}

function initRenderer() {
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  if (THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;
  document.body.appendChild(renderer.domElement);
}

////////////////////////////////////////////////////////////////////////////////
// GROUPS
////////////////////////////////////////////////////////////////////////////////
function initGroup() {
  group = new THREE.Group();
  group.name = "Pickable-Group";
  scene.add(group);
}

function initTeleportGroup() {
  teleportGroup = new THREE.Group();
  teleportGroup.name = "Teleport-Group";
  scene.add(teleportGroup);

  marker = new THREE.Mesh(
    new THREE.CircleGeometry(0.25, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x808080 })
  );
  marker.visible = false;
  scene.add(marker);
}

////////////////////////////////////////////////////////////////////////////////
// HDR + glTF world loading
////////////////////////////////////////////////////////////////////////////////
function loadHDRAndModel() {
  new HDRLoader().setPath("./").load("spring-field.hdr", (texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = texture;
    scene.environment = texture;

    const loader = new GLTFLoader().setPath("./");
    loader.load(
      "world.glb",
      async (gltf) => {
        const model = gltf.scene;
        model.position.x = -20;

        await renderer.compileAsync(model, camera, scene);

        group.add(model);

        const modelClone = model.clone(true);
        teleportGroup.add(modelClone);

        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            if (child.name && child.name.startsWith("Collider_")) {
              try {
                physics.addMesh(child, 0);
              } catch (e) {
                console.warn("Failed to add world collider:", child.name, e);
              }
            }
          }
        });
      },
      undefined,
      (err) => console.error("Failed to load world.glb:", err)
    );
  });
}

////////////////////////////////////////////////////////////////////////////////
// LIGHTS & CONTROLS
////////////////////////////////////////////////////////////////////////////////
function initLights() {
  const hemi = new THREE.HemisphereLight(0x555555, 0x111122, 1.0);
  scene.add(hemi);

  const dirLight = new THREE.DirectionalLight(0xffffff, 2);
  dirLight.position.set(5, 10, 7);
  dirLight.castShadow = true;
  scene.add(dirLight);
}

function initControls() {
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1, 0);
  controls.update();
}

////////////////////////////////////////////////////////////////////////////////
// PHYSICS
////////////////////////////////////////////////////////////////////////////////
async function initPhysics() {
  stats = new Stats();
  document.body.appendChild(stats.dom);

  physics = await RapierPhysics();
  physics.addScene(scene);

  const floorGeo = new THREE.BoxGeometry(10, 0.2, 10);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x808080 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.position.y = -0.1;
  floor.receiveShadow = true;
  scene.add(floor);
  teleportGroup.add(floor);
  physics.addMesh(floor, 0);

  const SPAWN_RANGE = 8;
  for (let i = 0; i < 5; i++) {
    addBox(
      new THREE.Vector3(
        (Math.random() - 0.5) * SPAWN_RANGE,
        1.5 + i * 0.5,
        (Math.random() - 0.5) * SPAWN_RANGE
      )
    );
  }

  physicsHelper = new RapierHelper(physics.world);
  scene.add(physicsHelper);
}

function addBox(position) {
  const geo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
  const mat = new THREE.MeshStandardMaterial({
    color: Math.floor(Math.random() * 0xffffff),
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.position.copy(position);

  group.add(mesh);
  physics.addMesh(mesh, 1, 0.2);
}

////////////////////////////////////////////////////////////////////////////////
// VR setup (controllers, grips, lasers)
////////////////////////////////////////////////////////////////////////////////
function initVR() {
  document.body.appendChild(VRButton.createButton(renderer));

  renderer.xr.addEventListener("sessionstart", () => {
    baseReferenceSpace = renderer.xr.getReferenceSpace();
  });

  const factory = new XRControllerModelFactory();

  controller1 = renderer.xr.getController(0);
  controller2 = renderer.xr.getController(1);

  scene.add(controller1);
  scene.add(controller2);

  controller1.addEventListener("selectstart", onSelectStart);
  controller1.addEventListener("selectend", onSelectEnd);
  controller2.addEventListener("selectstart", onSelectStart);
  controller2.addEventListener("selectend", onSelectEnd);

  controller1.addEventListener("squeezestart", onSqueezeStart);
  controller1.addEventListener("squeezeend", onSqueezeEnd);
  controller2.addEventListener("squeezestart", onSqueezeStart);
  controller2.addEventListener("squeezeend", onSqueezeEnd);

  controllerGrip1 = renderer.xr.getControllerGrip(0);
  controllerGrip1.add(factory.createControllerModel(controllerGrip1));
  scene.add(controllerGrip1);

  controllerGrip2 = renderer.xr.getControllerGrip(1);
  scene.add(controllerGrip2);

  initControllerLine(controller1);
  initControllerLine(controller2);

  raycaster = new THREE.Raycaster();

  new GLTFLoader().load(
    "./ray_gun.glb",
    (gltf) => {
      const gun = gltf.scene;
      gun.scale.set(0.1, 0.1, 0.1);
      gun.position.set(0, -0.1, 0.05);
      gun.rotation.set(-Math.PI / 5, 0, 0);
      controllerGrip2.add(gun);
    },
    undefined,
    (err) => console.warn("ray_gun load failed:", err)
  );
}

function initControllerLine(controller) {
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -1),
  ]);
  const line = new THREE.Line(geometry);
  line.name = "line";
  line.scale.z = 5;
  controller.add(line);
}

////////////////////////////////////////////////////////////////////////////////
// TELEPORT handlers
////////////////////////////////////////////////////////////////////////////////
function onSqueezeStart(event) {
  const controller = event.target;
  controller.userData.isSqueezing = true;
  if (!controller.userData.prevPos) {
    controller.userData.prevPos = new THREE.Vector3().setFromMatrixPosition(
      controller.matrixWorld
    );
    controller.userData.velocity = new THREE.Vector3();
  }
}

function onSqueezeEnd(event) {
  const controller = event.target;
  controller.userData.isSqueezing = false;

  if (INTERSECTION && baseReferenceSpace) {
    const offsetPosition = {
      x: -INTERSECTION.x,
      y: -INTERSECTION.y,
      z: -INTERSECTION.z,
      w: 1,
    };
    const offsetRotation = new THREE.Quaternion();
    const transform = new XRRigidTransform(offsetPosition, offsetRotation);
    const teleportSpaceOffset = baseReferenceSpace.getOffsetReferenceSpace(transform);
    renderer.xr.setReferenceSpace(teleportSpaceOffset);

    INTERSECTION = undefined;
    marker.visible = false;
  }
}

////////////////////////////////////////////////////////////////////////////////
// PICKUP handlers
////////////////////////////////////////////////////////////////////////////////
function onSelectStart(event) {
  const controller = event.target;
  const intersections = getIntersections(controller);
  if (!intersections?.length) return;

  const hit = intersections[0];
  const object = hit.object;
  if (!object || EXCLUDED_NAMES.includes(object.name)) return;

  // --- HIGHLIGHTING (Keep) ---
  if (object.material && !object.userData._materialCloned) {
    const matClone = Array.isArray(object.material)
      ? object.material.map((m) => m.clone())
      : object.material.clone();
    if (Array.isArray(matClone)) {
      matClone.forEach((m) => (m.userData._materialCloned = true));
    } else {
      matClone.userData._materialCloned = true;
    }
    object.material = matClone;
    object.userData._materialCloned = true;
  }

  if (object.material) {
    if (Array.isArray(object.material)) {
      object.material.forEach((m) => m.emissive && m.emissive.setHex && m.emissive.setHex(0x333333));
    } else {
      object.material.emissive && object.material.emissive.setHex && object.material.emissive.setHex(0x333333);
    }
  }

  // --- GRAB FIX: Get world position, remove from physics, REPARENT to controller ---
  // Get the object's current position/rotation in world space
  object.updateWorldMatrix(true, true);
  tempMatrix.copy(object.matrixWorld);

  try {
    physics.removeMesh(object); // Remove physics body
  } catch (e) {}

  // Detach object from its current parent (group) and attach to the controller
  controller.attach(object); // THREE.js utility to reparent while preserving world transform

  // Save the state to controller's user data
  controller.userData.selected = {
    mesh: object,
    // Since we are attaching it to the controller, we don't need a static world offset anymore.
    // The object's local position/rotation now represents the offset *from the controller*.
  };

  // Update controller velocity calculation (Keep)
  if (!controller.userData.prevPos) {
    controller.userData.prevPos = new THREE.Vector3().setFromMatrixPosition(controller.matrixWorld);
    controller.userData.velocity = new THREE.Vector3();
  }
}

function onSelectEnd(event) {
  const controller = event.target;
  const sel = controller.userData.selected;
  if (!sel) return;

  const object = sel.mesh;

  // 1. Un-highlighting
  if (object.material) {
      if (Array.isArray(object.material)) {
          object.material.forEach((m) => m.emissive && m.emissive.setHex && m.emissive.setHex(0x000000));
      } else {
          object.material.emissive && object.material.setHex && object.material.emissive.setHex(0x000000);
      }
  }

  // --- CRITICAL FIX: Reparent and Update World Matrix ---
  // Reparent back to the world group. This updates object.position/quaternion
  // to reflect its world transform relative to the group.
  group.attach(object);

  // Ensure the world matrix is fully up-to-date before physics reads it.
  object.updateWorldMatrix(true, true);
  // -----------------------------------------------------

  // 2. Re-add physics body
  try {
      physics.addMesh(object, 1, 0.2);
  } catch (e) {
      console.warn("Failed to re-add mesh to physics on release:", e);
  }

  // 3. Explicitly set physics body's position and rotation
  // This is the step that guarantees Rapier starts the object at the correct position.
  try {
      physics.setMeshPosition(object, object.position);
      physics.setMeshRotation(object, object.quaternion);
  } catch (e) {
      console.warn("Failed to set mesh transform after re-add:", e);
  }

  // 4. Apply throwing velocity
  const ctrlVel = controller.userData.velocity?.clone();
  if (ctrlVel) {
      const throwVel = ctrlVel.multiplyScalar(THROW_MULTIPLIER);
      try {
          physics.setMeshVelocity(object, throwVel);
      } catch (e) {}
  }

  controller.userData.selected = undefined;
}

////////////////////////////////////////////////////////////////////////////////
// RAYCAST helpers
////////////////////////////////////////////////////////////////////////////////
function getIntersections(controller) {
  controller.updateMatrixWorld();
  const origin = new THREE.Vector3().setFromMatrixPosition(controller.matrixWorld);
  const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(controller.quaternion);
  raycaster.set(origin, direction);

  return raycaster.intersectObjects(group.children, true);
}

////////////////////////////////////////////////////////////////////////////////
// CONTROLLER velocity
////////////////////////////////////////////////////////////////////////////////
function updateControllerVelocity(controller, deltaSeconds) {
  if (!controller) return;
  if (!controller.userData.prevPos) {
    controller.userData.prevPos = new THREE.Vector3().setFromMatrixPosition(controller.matrixWorld);
    controller.userData.velocity = new THREE.Vector3();
    return;
  }

  tempPos.setFromMatrixPosition(controller.matrixWorld);
  if (deltaSeconds > 0) {
    controller.userData.velocity.copy(tempPos).sub(controller.userData.prevPos).divideScalar(deltaSeconds);
  } else {
    controller.userData.velocity.set(0, 0, 0);
  }
  controller.userData.prevPos.copy(tempPos);
}

////////////////////////////////////////////////////////////////////////////////
// Teleport marker mover
////////////////////////////////////////////////////////////////////////////////
function moveMarker() {
  INTERSECTION = undefined;
  const ctrlA = controller1;
  const ctrlB = controller2;

  const handleController = (ctrl) => {
    if (!ctrl?.userData?.isSqueezing) return undefined;
    tempMatrix.identity().extractRotation(ctrl.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(ctrl.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
    const intersects = raycaster.intersectObjects(teleportGroup.children, true);
    return intersects.length ? intersects[0].point : undefined;
  };

  let p = handleController(ctrlA);
  if (!p) p = handleController(ctrlB);

  if (p) {
    INTERSECTION = p;
    marker.position.copy(INTERSECTION);
    marker.visible = true;
  } else {
    marker.visible = false;
    INTERSECTION = undefined;
  }
}

////////////////////////////////////////////////////////////////////////////////
// Highlight laser
////////////////////////////////////////////////////////////////////////////////
function highlightController(controller) {
  const line = controller.getObjectByName("line");
  if (!line || controller.userData.selected) return;

  raycaster.set(
    new THREE.Vector3().setFromMatrixPosition(controller.matrixWorld),
    new THREE.Vector3(0, 0, -1).applyQuaternion(controller.quaternion)
  );

  const intersections = raycaster.intersectObjects(group.children, true);
  line.scale.z = intersections?.length ? intersections[0].distance : 5;
}

////////////////////////////////////////////////////////////////////////////////
// Update held object
////////////////////////////////////////////////////////////////////////////////
function updateHeldObject(controller) {
  // If the object is selected, it's a child of the controller and moves automatically.
  // We just ensure it's selected to prevent any other movement logic from running.
  if (!controller?.userData?.selected) return;

  // The line below is no longer needed after reparenting in onSelectStart.
  // The object moves with the controller automatically.
  /*
    const sel = controller.userData.selected;
    const mesh = sel.mesh;
    // ... rest of old code ...
  */
}

////////////////////////////////////////////////////////////////////////////////
// ANIMATE loop
////////////////////////////////////////////////////////////////////////////////
function animate() {
  const now = performance.now() / 1000;
  const delta = Math.max(0, now - lastTime);
  lastTime = now;

  updateControllerVelocity(controller1, delta);
  updateControllerVelocity(controller2, delta);

  for (let i = group.children.length - 1; i >= 0; i--) {
    const mesh = group.children[i];
    if (mesh.position?.y < -5) {
      try { physics.removeMesh(mesh); } catch(e) {}
      group.remove(mesh);
      scene.remove(mesh);
    }
  }

  updateHeldObject(controller1);
  updateHeldObject(controller2);

  moveMarker();

  if (controller1) highlightController(controller1);
  if (controller2) highlightController(controller2);

  physicsHelper?.update?.();
  controls?.update();

  renderer.render(scene, camera);
  stats?.update();
}

////////////////////////////////////////////////////////////////////////////////
// RESIZE
////////////////////////////////////////////////////////////////////////////////
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
