export class VoicePlayer {
    context: AudioContext | null = null;
    source: AudioBufferSourceNode | null = null;
    controller: AbortController | null = null;
    id = 0;
    avatar: any;
    onState: (playing: boolean) => void;
    constructor(avatar: any, onState: (v: boolean) => void) { this.avatar = avatar; this.onState = onState; }
    stop() { this.id++; this.controller?.abort(); this.controller = null; try {
        this.source?.stop();
    }
    catch { } this.source = null; this.context?.close().catch(() => { }); this.context = null; window.speechSynthesis?.cancel(); this.avatar?.endSpeech(); this.onState(false); }
    async play({ text, messageId, sample, engine, csrf }: {
        text: string;
        messageId?: string;
        sample?: boolean;
        engine: string;
        csrf: string;
    }) {
        this.stop();
        if (engine === 'off')
            throw new Error('Giọng đọc đang tắt.');
        const id = this.id;
        this.onState(true);
        try {
            if (engine === 'browser') {
                const voice = window.speechSynthesis?.getVoices().find(v => /^vi(-|_)/i.test(v.lang));
                if (!voice)
                    throw new Error('Thiết bị chưa có giọng tiếng Việt cho trang web. Admin có thể chọn OpenRouter trong cấu hình.');
                const utterance = new SpeechSynthesisUtterance(text.replace(/[#*`_>]/g, ''));
                utterance.lang = 'vi-VN';
                utterance.voice = voice;
                utterance.rate = .95;
                utterance.onstart = () => { if (id === this.id)
                    this.avatar?.beginSpeech(); };
                utterance.onend = () => { if (id === this.id) {
                    this.avatar?.endSpeech();
                    this.onState(false);
                } };
                utterance.onerror = () => { if (id === this.id) {
                    this.avatar?.endSpeech();
                    this.onState(false);
                } };
                speechSynthesis.speak(utterance);
                return;
            }
            this.controller = new AbortController();
            this.context = new AudioContext();
            await this.context.resume();
            const context = this.context;
            const res = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ messageId, sample }), signal: this.controller.signal });
            if (!res.ok) {
                const d: any = await res.json();
                throw new Error(d.error || 'Chưa tạo được giọng nói.');
            }
            const bytes = await res.arrayBuffer();
            if (id !== this.id)
                return;
            const audio = await context.decodeAudioData(bytes);
            if (id !== this.id)
                return;
            const source = context.createBufferSource(), analyser = context.createAnalyser();
            analyser.fftSize = 256;
            source.buffer = audio;
            source.connect(analyser);
            analyser.connect(context.destination);
            this.source = source;
            source.onended = () => { if (id === this.id) {
                this.avatar?.endSpeech();
                this.onState(false);
                context.close().catch(() => { });
                this.context = null;
            } };
            this.avatar?.beginSpeech(analyser);
            source.start();
        }
        catch (e) {
            if (id === this.id) {
                this.stop();
                if ((e as Error).name !== 'AbortError')
                    throw e;
            }
        }
    }
}
