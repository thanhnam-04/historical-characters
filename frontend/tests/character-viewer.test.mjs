import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as THREE from "../public/dragon/vendor/three.module.js";

test("Uploaded model without lip morphs is centered, fitted and ready without crashing", () => {
  const source = readFileSync(
    new URL("../public/dragon/avatar.js", import.meta.url),
    "utf8",
  )
    .replace(/^import .*;\r?\n/gm, "")
    .replace("export class DragonAvatar", "class DragonAvatar");
  let loaded;
  const sandbox = {
    THREE,
    GLTFLoader: class {
      load(url, callback) {
        loaded = callback;
      }
    },
    DragonLipSync: class {
      constructor() {
        throw Error("No morphs");
      }
    },
    window: { dispatchEvent() {} },
    CustomEvent: class {},
    createBodyOnlyClip: (clip) => clip,
  };
  const Viewer = vm.runInNewContext(source + "\nDragonAvatar;", sandbox);
  const viewer = Object.create(Viewer.prototype);
  let ready = false,
    error = false;
  Object.assign(viewer, {
    builtin: false,
    destroyed: false,
    scene: new THREE.Scene(),
    stage: {
      isConnected: true,
      querySelector() {
        return null;
      },
    },
    viewBody() {},
    onLoaded() {
      ready = true;
    },
    onError() {
      error = true;
    },
    invalidate() {},
  });
  viewer.load();
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(10, 20, 10),
    new THREE.MeshStandardMaterial(),
  );
  mesh.position.set(200, 500, -100);
  root.add(mesh);
  loaded({ scene: root, animations: [] });
  assert(ready);
  assert(!error);
  assert.equal(viewer.lip, null);
  const bounds = new THREE.Box3().setFromObject(root),
    size = bounds.getSize(new THREE.Vector3()),
    center = bounds.getCenter(new THREE.Vector3());
  assert(Math.abs(Math.max(size.x, size.y, size.z) - 1.8) < 1e-6);
  assert(
    Math.abs(center.x) < 1e-6 &&
      Math.abs(center.z) < 1e-6 &&
      Math.abs(bounds.min.y) < 1e-6,
  );
});
