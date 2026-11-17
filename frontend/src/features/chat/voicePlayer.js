export class VoicePlayer {
  context = null;
  source = null;
  controller = null;
  id = 0;
  disposed = false;
  avatar;
  onState;
  constructor(avatar, onState) {
    this.avatar = avatar;
    this.onState = onState;
  }
  current(id) {
    return !this.disposed && id === this.id;
  }
  stop() {
    this.id++;
    this.controller?.abort();
    this.controller = null;
    const source = this.source;
    const context = this.context;
    this.source = null;
    this.context = null;
    if (source) {
      source.onended = null;
      try {
        source.stop();
      } catch {}
    }
    if (context && context.state !== "closed") context.close().catch(() => {});
    window.speechSynthesis?.cancel();
    this.avatar?.endSpeech();
    if (!this.disposed) this.onState(false);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    this.avatar = null;
  }
  async play({ text, messageId, sample, engine, csrf }) {
    if (this.disposed) return;
    this.stop();
    if (engine === "off") throw new Error("Giọng đọc đang tắt.");
    const id = this.id;
    this.onState(true);
    try {
      if (engine === "browser") {
        const voice = window.speechSynthesis
          ?.getVoices()
          .find((v) => /^vi(-|_)/i.test(v.lang));
        if (!voice)
          throw new Error(
            "Thiết bị chưa có giọng tiếng Việt cho trang web. Admin có thể chọn OpenRouter trong cấu hình.",
          );
        const utterance = new SpeechSynthesisUtterance(
          text.replace(/[#*`_>]/g, ""),
        );
        utterance.lang = "vi-VN";
        utterance.voice = voice;
        utterance.rate = 0.95;
        utterance.onstart = () => {
          if (this.current(id)) this.avatar?.beginSpeech();
        };
        const finish = () => {
          if (!this.current(id)) return;
          this.avatar?.endSpeech();
          this.onState(false);
        };
        utterance.onend = finish;
        utterance.onerror = finish;
        window.speechSynthesis.speak(utterance);
        return;
      }
      const controller = new AbortController();
      const context = new AudioContext();
      this.controller = controller;
      this.context = context;
      await context.resume();
      if (!this.current(id)) return;
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify({ messageId, sample }),
        signal: controller.signal,
      });
      if (!this.current(id)) return;
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Chưa tạo được giọng nói.");
      }
      const bytes = await res.arrayBuffer();
      if (!this.current(id)) return;
      const audio = await context.decodeAudioData(bytes);
      if (!this.current(id)) return;
      const source = context.createBufferSource();
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      source.buffer = audio;
      source.connect(analyser);
      analyser.connect(context.destination);
      this.source = source;
      source.onended = () => {
        if (!this.current(id)) return;
        this.source = null;
        this.controller = null;
        this.avatar?.endSpeech();
        this.onState(false);
        if (context.state !== "closed") context.close().catch(() => {});
        if (this.context === context) this.context = null;
      };
      this.avatar?.beginSpeech(analyser);
      source.start();
    } catch (e) {
      if (!this.current(id)) return;
      this.stop();
      if (e.name !== "AbortError") throw e;
    }
  }
}
