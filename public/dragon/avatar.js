import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DragonLipSync, createBodyOnlyClip } from './assets/DragonLipSync.js';

export class DragonAvatar {
  constructor(){
    this.host=document.querySelector('#view');this.speaking=false;this.motion=false;this.dirty=true;this.frames=0;
    this.last=0;this.lastShape='viseme_sil';this.settleUntil=0;this.mobile=matchMedia('(max-width:720px)').matches;
    this.scene=new THREE.Scene();
    this.camera=new THREE.PerspectiveCamera(33,1,.005,30);
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});
    this.renderer.setPixelRatio(1);this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.25;
    this.host.append(this.renderer.domElement);
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enableDamping=false;
    this.controls.minDistance=.38;this.controls.maxDistance=3;this.controls.enablePan=false;
    this.controls.addEventListener('change',()=>this.invalidate());
    this.scene.add(new THREE.HemisphereLight('#ffffea','#58705b',2.7));
    const key=new THREE.DirectionalLight('#fff3d6',2.1);key.position.set(2,4,4);this.scene.add(key);
    const rim=new THREE.DirectionalLight('#d3efed',1.6);rim.position.set(-3,2,-2);this.scene.add(rim);
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(this.host);
    this.visibilityHandler=()=>{this.last=0;if(!document.hidden)this.invalidate();};document.addEventListener('visibilitychange',this.visibilityHandler);
    this.tick=this.tick.bind(this);this.raf=requestAnimationFrame(this.tick);
    this.load();
  }
  invalidate(){this.dirty=true;}
  resize(){const {width,height}=this.host.getBoundingClientRect();if(!width||!height)return;
    const scale=Math.min(1,1200/width,1000/height);this.renderer.setSize(Math.round(width*scale),Math.round(height*scale),false);
    this.camera.aspect=width/height;this.camera.updateProjectionMatrix();this.invalidate();
  }
  load(){new GLTFLoader().load('/dragon/assets/dragon.glb',gltf=>{
    if(this.destroyed){gltf.scene.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});return;}
    this.root=gltf.scene;this.root.traverse(o=>{if(o.isMesh){o.frustumCulled=false;
      const old=o.material;const mat=new THREE.MeshLambertMaterial({map:old.map,color:old.color,side:old.side,transparent:old.transparent,opacity:old.opacity,alphaTest:old.alphaTest,emissive:old.emissive,emissiveMap:old.emissiveMap,emissiveIntensity:Math.min(old.emissiveIntensity??1,.75)});
      o.material=mat;old.dispose();}});
    this.scene.add(this.root);this.root.updateMatrixWorld(true);this.lip=new DragonLipSync(this.root);
    this.mixer=new THREE.AnimationMixer(this.root);const clip=gltf.animations.find(c=>c.name==='MOTION');
    if(clip)this.action=this.mixer.clipAction(createBodyOnlyClip(clip));
    this.viewHead();this.ready=true;document.querySelector('#loading').hidden=true;
    document.querySelector('#avatarState').textContent='Long Vân đang ở đây';this.invalidate();
    window.dispatchEvent(new CustomEvent('avatar-ready'));
  },e=>{if(!this.destroyed&&e.total){const n=Math.round(e.loaded/e.total*100);document.querySelector('#loadingText').textContent=`Đang đánh thức rồng… ${n}%`;document.querySelector('#loadProgress').value=n;}},()=>{
    if(this.destroyed)return;
    document.querySelector('#loadingText').textContent='Chưa tải được rồng 3D';document.querySelector('#loading small').textContent='Thử tải lại trang. Chat vẫn dùng được khi đã kết nối AI.';
    document.querySelector('#loading .loader').hidden=true;document.querySelector('#loadProgress').hidden=true;document.querySelector('#avatarState').textContent='Chưa tải được mô hình';
  });}
  viewHead(){this.fullView=false;this.camera.position.set(.48,1.48,1.2);this.controls.target.set(-.06,1.34,.1);this.controls.update();this.invalidate();}
  viewBody(){this.fullView=true;this.camera.position.set(1.05,1.04,2.9);this.controls.target.set(0,.9,0);this.controls.update();this.invalidate();}
  toggleCamera(){this.fullView?this.viewHead():this.viewBody();}
  destroy(){this.destroyed=true;cancelAnimationFrame(this.raf);this.resizeObserver.disconnect();document.removeEventListener('visibilitychange',this.visibilityHandler);this.controls.dispose();this.mixer?.stopAllAction();const textures=new Set();this.scene.traverse(o=>{if(o.isMesh){o.geometry.dispose();for(const m of [o.material].flat()){for(const value of Object.values(m))if(value?.isTexture)textures.add(value);m.dispose();}}});for(const t of textures)t.dispose();this.renderer.dispose();this.renderer.forceContextLoss();this.renderer.domElement.remove();}
  toggleMotion(){this.motion=!this.motion;if(this.action){if(this.motion)this.action.reset().play();else{this.action.stop();this.mixer.update(0);}}this.invalidate();return this.motion;}
  beginSpeech(analyser=null){if(this.destroyed)return;this.speaking=true;this.analyser=analyser;this.started=performance.now();this.lastShape='';
    if(analyser)this.wave=new Uint8Array(analyser.fftSize);document.querySelector('#avatarState').textContent='Long Vân đang nói';
    document.querySelector('#mouthLabel').textContent=analyser?'Miệng theo âm lượng':'Khẩu hình mô phỏng';this.invalidate();}
  endSpeech(){if(this.destroyed)return;this.speaking=false;this.analyser=null;this.lip?.setViseme('viseme_sil');this.settleUntil=performance.now()+450;
    document.querySelector('#avatarState').textContent=this.ready?'Long Vân đang ở đây':'Đang tải mô hình';document.querySelector('#mouthLabel').textContent='Rồng 3D tương tác';this.invalidate();}
  tick(now){this.raf=requestAnimationFrame(this.tick);if(document.hidden)return;
    if(now-this.last<1000/30)return;const dt=Math.min(.1,(now-(this.last||now-33))/1000);
    this.last=now;
    if(this.motion)this.mixer?.update(dt);
    if(this.speaking&&this.lip){let shape='jawOpen',strength=.5;
      if(this.analyser){this.analyser.getByteTimeDomainData(this.wave);let rms=0;for(const v of this.wave)rms+=((v-128)/128)**2;strength=Math.min(.95,Math.sqrt(rms/this.wave.length)*6);if(strength<.045)shape='viseme_sil';}
      else{const t=(now-this.started)/1000;shape=['viseme_aa','viseme_E','viseme_O','viseme_PP','viseme_I','viseme_U'][Math.floor(t*6)%6];strength=.38+.25*Math.abs(Math.sin(t*8));}
      this.lip.setViseme(shape,strength);
    }
    const active=this.speaking||this.motion||now<this.settleUntil;
    if(active)this.lip?.update(dt);
    if(this.dirty||active){this.controls.update();this.renderer.render(this.scene,this.camera);this.frames++;this.dirty=false;}
  }
}
