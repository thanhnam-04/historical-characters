import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { DragonLipSync, createBodyOnlyClip } from "./assets/DragonLipSync.js";

export class DragonAvatar {
  constructor({
    host,
    modelUrl,
    name,
    builtin = true,
    onLoaded,
    onError,
  } = {}) {
    this.host = host || document.querySelector("#view");
    this.modelUrl = modelUrl || "/dragon/assets/dragon.glb";
    this.name = name || "Long Vân";
    this.builtin = builtin;
    this.onLoaded = onLoaded;
    this.onError = onError;
    this.stage = this.host?.closest(".dragon-stage");
    this.destroyed = false;
    if (!this.host || !this.stage)
      throw new Error("Dragon stage is unavailable.");
    this.speaking = false;
    this.motion = false;
    this.dirty = true;
    this.frames = 0;
    this.last = 0;
    this.lastShape = "viseme_sil";
    this.settleUntil = 0;
    this.mobile = matchMedia("(max-width:720px)").matches;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(33, 1, 0.005, 30);
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "low-power",
    });
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.host.append(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false;
    this.controls.minDistance = 0.38;
    this.controls.maxDistance = this.builtin ? 3 : 12;
    this.controls.enablePan = false;
    this.controls.addEventListener("change", () => this.invalidate());
    this.scene.add(new THREE.HemisphereLight("#ffffea", "#58705b", 2.7));
    const key = new THREE.DirectionalLight("#fff3d6", 2.1);
    key.position.set(2, 4, 4);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight("#d3efed", 1.6);
    rim.position.set(-3, 2, -2);
    this.scene.add(rim);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.host);
    this.visibilityHandler = () => {
      this.last = 0;
      if (!document.hidden) this.invalidate();
    };
    document.addEventListener("visibilitychange", this.visibilityHandler);
    this.tick = this.tick.bind(this);
    this.raf = requestAnimationFrame(this.tick);
    this.load();
  }
  setUi(selector, property, value) {
    if (this.destroyed || !this.stage?.isConnected) return;
    const element = this.stage.querySelector(selector);
    if (element) element[property] = value;
  }
  invalidate() {
    if (!this.destroyed) this.dirty = true;
  }
  resize() {
    if (this.destroyed || !this.host.isConnected) return;
    const { width, height } = this.host.getBoundingClientRect();
    if (!width || !height) return;
    const scale = Math.min(1, 1200 / width, 1000 / height);
    this.renderer.setSize(
      Math.round(width * scale),
      Math.round(height * scale),
      false,
    );
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.invalidate();
  }
  load() {
    new GLTFLoader().load(
      this.modelUrl || "/dragon/assets/dragon.glb",
      (gltf) => {
        try {
          if (this.destroyed) {
            gltf.scene.traverse((o) => {
              if (o.isMesh) {
                o.geometry.dispose();
                for (const material of [o.material].flat()) material.dispose();
              }
            });
            return;
          }
          this.root = gltf.scene;
          this.scene.add(this.root);
          this.root.updateMatrixWorld(true);
          try {
            this.lip = new DragonLipSync(this.root);
          } catch {
            this.lip = null;
          }
          if (!this.builtin) {
            const bounds = new THREE.Box3().setFromObject(this.root);
            const size = bounds.getSize(new THREE.Vector3());
            const largest = Math.max(size.x, size.y, size.z);
            if (!Number.isFinite(largest) || largest <= 0)
              throw new Error("Empty model");
            this.root.scale.multiplyScalar(1.8 / largest);
            this.root.updateMatrixWorld(true);
            const box = new THREE.Box3().setFromObject(this.root);
            const center = box.getCenter(new THREE.Vector3());
            this.root.position.sub(
              new THREE.Vector3(center.x, box.min.y, center.z),
            );
            this.root.updateMatrixWorld(true);
          }

          this.mixer = new THREE.AnimationMixer(this.root);
          const clip =
            gltf.animations.find((c) => c.name === "MOTION") ||
            gltf.animations[0];
          if (clip)
            this.action = this.mixer.clipAction(
              this.lip ? createBodyOnlyClip(clip) : clip,
            );
          this.viewBody();
          this.ready = true;
          this.onLoaded?.();
          this.setUi("#loading", "hidden", true);
          this.setUi(
            "#avatarState",
            "textContent",
            (this.name || "Long Vân") + " đang ở đây",
          );
          this.invalidate();
          this.setUi(
            "#mouthLabel",
            "textContent",
            this.lip ? "Khẩu hình sẵn sàng" : "Mô hình không có khẩu hình",
          );
          window.dispatchEvent(new CustomEvent("avatar-ready"));
        } catch (error) {
          this.onError?.(error);
          this.setUi("#loading", "hidden", true);
        }
      },
      (e) => {
        if (!this.destroyed && e.total) {
          const n = Math.round((e.loaded / e.total) * 100);
          this.setUi(
            "#loadingText",
            "textContent",
            `Đang đánh thức rồng… ${n}%`,
          );
          this.setUi("#loadProgress", "value", n);
        }
      },
      () => {
        if (this.destroyed) return;
        this.onError?.();
        this.setUi("#loadingText", "textContent", "Chưa tải được rồng 3D");
        this.setUi(
          "#loading small",
          "textContent",
          "Thử tải lại trang. Chat vẫn dùng được khi đã kết nối AI.",
        );
        this.setUi("#loading .loader", "hidden", true);
        this.setUi("#loadProgress", "hidden", true);
        this.setUi("#avatarState", "textContent", "Chưa tải được mô hình");
      },
    );
  }
  viewHead() {
    if (this.builtin === false) {
      this.viewBody(); this.camera.position.lerp(this.controls.target, .35);
      this.fullView = false; this.controls.update(); this.invalidate(); return;
    }
    this.fullView = false;
    this.camera.position.set(0.48, 1.48, 1.2);
    this.controls.target.set(-0.06, 1.34, 0.1);
    this.controls.update();
    this.invalidate();
  }
  viewBody() {
    this.fullView = true;
    if (this.builtin === false && this.root) {
      const box = new THREE.Box3().setFromObject(this.root);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const halfFov = THREE.MathUtils.degToRad(this.camera.fov / 2);
      const aspect = Math.max(.2, this.camera.aspect);
      const distance = Math.max(size.y / (2 * Math.tan(halfFov)), size.x / (2 * Math.tan(halfFov) * aspect), .4) * 1.3 + size.z / 2;
      this.controls.target.copy(center);
      this.camera.position.copy(center).add(new THREE.Vector3(distance * .15, distance * .1, distance));
      this.controls.update(); this.invalidate(); return;
    }
    this.camera.position.set(1.05, 1.04, 2.9);
    this.controls.target.set(0, 0.9, 0);
    this.controls.update();
    this.invalidate();
  }
  toggleCamera() {
    this.fullView ? this.viewHead() : this.viewBody();
  }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.speaking = false;
    this.analyser = null;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    document.removeEventListener("visibilitychange", this.visibilityHandler);
    this.controls.dispose();
    this.mixer?.stopAllAction();
    const textures = new Set();
    this.scene.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
        for (const m of [o.material].flat()) {
          for (const value of Object.values(m))
            if (value?.isTexture) textures.add(value);
          m.dispose();
        }
      }
    });
    for (const t of textures) t.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
  toggleMotion() {
    if (!this.ready || this.destroyed) return false;
    if (!this.action) return false;
    this.motion = !this.motion;
    if (this.action) {
      if (this.motion) this.action.reset().play();
      else {
        this.action.stop();
        this.mixer.update(0);
      }
    }
    this.invalidate();
    return this.motion;
  }
  beginSpeech(analyser = null) {
    if (this.destroyed) return;
    this.speaking = true;
    this.analyser = analyser;
    this.started = performance.now();
    this.lastShape = "";
    if (analyser) this.wave = new Uint8Array(analyser.fftSize);
    this.setUi(
      "#avatarState",
      "textContent",
      (this.name || "Long Vân") + " đang nói",
    );
    this.setUi(
      "#mouthLabel",
      "textContent",
      analyser ? "Miệng theo âm lượng" : "Khẩu hình mô phỏng",
    );
    this.invalidate();
  }
  endSpeech() {
    if (this.destroyed) return;
    this.speaking = false;
    this.analyser = null;
    this.lip?.setViseme("viseme_sil");
    this.settleUntil = performance.now() + 450;
    this.setUi(
      "#avatarState",
      "textContent",
      this.ready
        ? (this.name || "Long Vân") + " đang ở đây"
        : "Đang tải mô hình",
    );
    this.setUi("#mouthLabel", "textContent", "Rồng 3D tương tác");
    this.invalidate();
  }
  tick(now) {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.tick);
    if (document.hidden) return;
    if (now - this.last < 1000 / 30) return;
    const dt = Math.min(0.1, (now - (this.last || now - 33)) / 1000);
    this.last = now;
    if (this.motion) this.mixer?.update(dt);
    if (this.speaking && this.lip) {
      let shape = "jawOpen",
        strength = 0.5;
      if (this.analyser) {
        this.analyser.getByteTimeDomainData(this.wave);
        let rms = 0;
        for (const v of this.wave) rms += ((v - 128) / 128) ** 2;
        strength = Math.min(0.95, Math.sqrt(rms / this.wave.length) * 6);
        if (strength < 0.045) shape = "viseme_sil";
      } else {
        const t = (now - this.started) / 1000;
        shape = [
          "viseme_aa",
          "viseme_E",
          "viseme_O",
          "viseme_PP",
          "viseme_I",
          "viseme_U",
        ][Math.floor(t * 6) % 6];
        strength = 0.38 + 0.25 * Math.abs(Math.sin(t * 8));
      }
      this.lip.setViseme(shape, strength);
    }
    const active = this.speaking || this.motion || now < this.settleUntil;
    if (active) this.lip?.update(dt);
    if (this.dirty || active) {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      this.frames++;
      this.dirty = false;
    }
  }
}
