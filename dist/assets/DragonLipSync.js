/** Basic dragon viseme controller. Works with GLTFLoader's morph targets. */
export const RHUBARB_TO_VISEME = Object.freeze({
  X: 'viseme_sil', A: 'viseme_PP', B: 'viseme_I', C: 'viseme_E',
  D: 'viseme_aa', E: 'viseme_O', F: 'viseme_U', G: 'viseme_FF', H: 'viseme_E',
});
export const VISEMES = Object.freeze([
  'jawOpen', 'viseme_sil', 'viseme_PP', 'viseme_FF',
  'viseme_aa', 'viseme_E', 'viseme_I', 'viseme_O', 'viseme_U',
]);

export class DragonLipSync {
  constructor(root, { smoothing = 24, anticipation = 0.025 } = {}) {
    this.meshes = [];
    root.traverse((object) => {
      if (object.isMesh && object.morphTargetDictionary?.viseme_aa !== undefined) {
        this.meshes.push(object);
      }
    });
    if (!this.meshes.length) throw new Error('Model chưa có các khẩu hình của DragonLipSync.');
    this.smoothing = smoothing;
    this.anticipation = anticipation;
    this.weights = Object.fromEntries(VISEMES.map(name => [name, 0]));
    this.target = 'viseme_sil';
    this.intensity = 1;
    this.audio = null;
    this.cues = [];
    this.mode = 'manual';
  }

  setViseme(name, intensity = 1) {
    if (!VISEMES.includes(name)) throw new Error('Khẩu hình không hợp lệ: ' + name);
    this.mode = 'manual';
    this.target = name;
    this.intensity = Math.min(1, Math.max(0, Number(intensity) || 0));
  }

  setCues(document) {
    const cues = Array.isArray(document) ? document : document?.mouthCues;
    if (!Array.isArray(cues)) throw new Error('Cần JSON mouthCues do Rhubarb tạo.');
    this.cues = cues.map(cue => {
      if (!Number.isFinite(cue.start) || !Number.isFinite(cue.end) ||
          cue.start < 0 || cue.end <= cue.start || !RHUBARB_TO_VISEME[cue.value]) {
        throw new Error('Thời điểm hoặc mã khẩu hình không hợp lệ.');
      }
      return { start: cue.start, end: cue.end, value: cue.value };
    }).sort((a, b) => a.start - b.start);
    this.mode = 'audio';
  }

  setAudio(audio) { this.audio = audio; this.mode = 'audio'; }

  visemeAt(seconds) {
    const time = Math.max(0, seconds + this.anticipation);
    let lo = 0, hi = this.cues.length - 1, found = -1;
    while (lo <= hi) {
      const middle = (lo + hi) >> 1;
      if (this.cues[middle].start <= time) { found = middle; lo = middle + 1; }
      else hi = middle - 1;
    }
    const cue = this.cues[found];
    return cue && time < cue.end ? RHUBARB_TO_VISEME[cue.value] : 'viseme_sil';
  }

  update(deltaSeconds, explicitAudioTime) {
    const delta = Math.min(0.1, Math.max(0, Number(deltaSeconds) || 0));
    let target = this.target;
    if (Number.isFinite(explicitAudioTime)) target = this.visemeAt(explicitAudioTime);
    else if (this.mode === 'audio') {
      target = this.audio && !this.audio.paused && !this.audio.ended
        ? this.visemeAt(this.audio.currentTime) : 'viseme_sil';
    }
    const factor = 1 - Math.exp(-this.smoothing * delta);
    for (const name of VISEMES) {
      const wanted = name === target && name !== 'viseme_sil' ? this.intensity : 0;
      this.weights[name] += (wanted - this.weights[name]) * factor;
      for (const mesh of this.meshes) {
        const index = mesh.morphTargetDictionary[name];
        if (index !== undefined) mesh.morphTargetInfluences[index] = this.weights[name];
      }
    }
    this.currentViseme = target;
    return target;
  }

  reset() {
    this.mode = 'manual'; this.target = 'viseme_sil';
    for (const name of VISEMES) {
      this.weights[name] = 0;
      for (const mesh of this.meshes) {
        const index = mesh.morphTargetDictionary[name];
        if (index !== undefined) mesh.morphTargetInfluences[index] = 0;
      }
    }
    this.currentViseme = 'viseme_sil';
  }
}

/** The original body clip has placeholder morph tracks. Remove those tracks
 * from a clone so the AnimationMixer does not overwrite speaking shapes. */
export function createBodyOnlyClip(clip) {
  const body = clip.clone();
  body.tracks = body.tracks.filter(track => !track.name.includes('.morphTargetInfluences'));
  return body;
}
