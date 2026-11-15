'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUp, Mic, Square, Volume2, VolumeX, Archive, RotateCcw, Download, Pencil, MessageCircle, LoaderCircle } from 'lucide-react';
import { api, write, type Me, type Conversation, type Message } from './api';
import Avatar from './avatar';
import { VoicePlayer } from './voice';
type Props = {
    me: Me;
    conversation: Conversation | null;
    archived: boolean;
    notify: (t: string) => void;
    onCreate: (c: Conversation) => void;
    onRefresh: () => void;
    onArchived: () => void;
};
export default function Chat({ me, conversation, archived, notify, onCreate, onRefresh, onArchived }: Props) {
    const [messages, setMessages] = useState<Message[]>([]), [input, setInput] = useState(''), [busy, setBusy] = useState(false), [loading, setLoading] = useState(false), [playing, setPlaying] = useState(false), [read, setRead] = useState(true), [listening, setListening] = useState(false), [title, setTitle] = useState('');
    const activeId = useRef<string | null>(null), abort = useRef<AbortController | null>(null), epoch = useRef(0), bottom = useRef<HTMLDivElement>(null), voice = useRef<VoicePlayer | null>(null), avatar = useRef<any>(null), recognition = useRef<any>(null);
    const avatarReady = useCallback((a: any) => { avatar.current = a; if (voice.current)
        voice.current.avatar = a; }, []);
    useEffect(() => { const player = new VoicePlayer(avatar.current, setPlaying); voice.current = player; const speech = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition; if (speech) {
        const r = new speech();
        r.lang = 'vi-VN';
        r.interimResults = true;
        r.onstart = () => setListening(true);
        r.onresult = (e: any) => { let value = ''; for (let i = 0; i < e.results.length; i++)
            value += e.results[i][0].transcript; setInput(value); };
        r.onend = () => setListening(false);
        r.onerror = (e: any) => { setListening(false); notify(e.error === 'not-allowed' ? 'Hãy cấp quyền micro cho trang web.' : e.error === 'network' ? 'Nhận giọng nói cần kết nối mạng. Bạn có thể gõ tin nhắn.' : 'Chưa nhận được giọng nói. Thử lại hoặc gõ tin nhắn.'); };
        recognition.current = r;
    } const hidden = () => { if (document.hidden)
        recognition.current?.stop(); }; document.addEventListener('visibilitychange', hidden); return () => { epoch.current++; abort.current?.abort(); if (recognition.current) { recognition.current.onstart = recognition.current.onresult = recognition.current.onend = recognition.current.onerror = null; recognition.current.abort(); } player.dispose(); if (voice.current === player) voice.current = null; document.removeEventListener('visibilitychange', hidden); }; }, []);
    useEffect(() => { const id = conversation?.id || null; if (id === activeId.current) {
        if (conversation)
            setTitle(conversation.title);
        return;
    } activeId.current = id; epoch.current++; abort.current?.abort(); setBusy(false); voice.current?.stop(); setInput(''); setMessages([]); setTitle(conversation?.title || ''); if (!id) {
        setLoading(false);
        return;
    } let cancelled = false; setLoading(true); api('conversations/' + id).then(d => { if (!cancelled)
        setMessages(d.messages); }).catch(e => { if (!cancelled)
        notify(e.message); }).finally(() => { if (!cancelled)
        setLoading(false); }); return () => { cancelled = true; }; }, [conversation?.id]);
    useEffect(() => { bottom.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [messages, busy]);
    async function play(message?: Message) { if (!me.config.ttsEnabled) {
        notify('Admin đang tắt giọng đọc.');
        return;
    } try {
        await voice.current?.play({ text: message?.content || 'Xin chào! Mình là Long Vân, người bạn rồng của bạn.', messageId: message?.id, sample: !message, engine: me.config.ttsEngine, csrf: me.csrf });
        onRefresh();
    }
    catch (e) {
        notify((e as Error).message);
    } }
    async function send(text = input) {
        if(archived&&!conversation){notify('Chọn một hội thoại đã lưu trữ để xem lại.');return;}
        if (busy || loading || !text.trim())
            return;
        if (!me.config.ready) {
            notify('Admin cần cấu hình OpenRouter trước khi bắt đầu chat.');
            return;
        }
        if (conversation?.deleted_at) {
            notify('Khôi phục cuộc trò chuyện trước khi gửi tiếp.');
            return;
        }
        voice.current?.stop();
        recognition.current?.stop();
        setBusy(true);
        setInput('');
        const run = ++epoch.current;
        let conversationId = activeId.current;
        try {
            if (!conversationId) {
                const d = await write('conversations', {}, me.csrf);
                if (run !== epoch.current)
                    return;
                conversationId = d.conversation.id;
                activeId.current = conversationId;
                setTitle(text.slice(0, 65));
                onCreate({ ...d.conversation, title: text.slice(0, 65) });
            }
            const userMessage: Message = { id: 'local-user-' + run, role: 'user', content: text.trim(), created_at: Date.now() }, answer: Message = { id: 'local-answer-' + run, role: 'assistant', content: '', created_at: Date.now() };
            setMessages(m => [...m, userMessage, answer]);
            abort.current = new AbortController();
            const res = await fetch('/api/conversations/' + conversationId + '/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': me.csrf }, body: JSON.stringify({ content: text.trim() }), signal: abort.current.signal });
            if (!res.ok) {
                const d: any = await res.json();
                throw new Error(d.error || 'Chưa gửi được tin nhắn.');
            }
            if (!res.body)
                throw new Error('Không nhận được dữ liệu từ máy chủ.');
            const reader = res.body.getReader(), decoder = new TextDecoder();
            let buffer = '', event = '';
            let final: Message | null = null;
            const line = (s: string) => { if (s.startsWith('event:'))
                event = s.slice(6).trim(); if (s.startsWith('data:')) {
                const data = JSON.parse(s.slice(5));
                if (run !== epoch.current)
                    return;
                if (event === 'delta') {
                    answer.content += data.text;
                    setMessages(m => m.map(x => x.id === answer.id ? { ...answer } : x));
                }
                else if (event === 'meta') {
                    setMessages(m => m.map(x => x.id === userMessage.id ? { ...x, id: data.userMessageId } : x));
                }
                else if (event === 'error')
                    notify(data.error);
                else if (event === 'done') {
                    final = data.message;
                    if (data.message)
                        setMessages(m => m.map(x => x.id === answer.id ? data.message : x));
                    else
                        setMessages(m => m.filter(x => x.id !== answer.id));
                }
            } };
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const s of lines)
                    line(s.replace(/\r$/, ''));
            }
            if (buffer.trim())
                line(buffer.trim());
            if (run === epoch.current) {
                onRefresh();
                if (read && final)
                    play(final);
            }
        }
        catch (e) {
            if (run !== epoch.current)
                return;
            if ((e as Error).name !== 'AbortError')
                notify((e as Error).message);
            if (conversationId) {
                try {
                    const d = await api('conversations/' + conversationId);
                    if (run === epoch.current)
                        setMessages(d.messages);
                }
                catch { }
            }
        }
        finally {
            if (run === epoch.current) {
                setBusy(false);
                abort.current = null;
                onRefresh();
            }
        }
    }
    async function editTitle(e: React.FormEvent<HTMLFormElement>) { e.preventDefault(); if (!conversation)
        return; try {
        await write('conversations/' + conversation.id, { title }, me.csrf, 'PATCH');
        (document.getElementById('rename') as HTMLDialogElement).close();
        onRefresh();
        notify('Đã đổi tên cuộc trò chuyện.');
    }
    catch (e) {
        notify((e as Error).message);
    } }
    async function archive() { if (!conversation)
        return; try {
        await write('conversations/' + conversation.id, { archived: !conversation.deleted_at }, me.csrf, 'PATCH');
        onArchived();
        notify(conversation.deleted_at ? 'Đã khôi phục hội thoại.' : 'Đã chuyển hội thoại vào mục lưu trữ.');
    }
    catch (e) {
        notify((e as Error).message);
    } }
    function mic() { if (!recognition.current) {
        notify('Trình duyệt chưa hỗ trợ nhận giọng nói. Thử Chrome hoặc Edge, hoặc gõ tin nhắn.');
        return;
    } voice.current?.stop(); if (listening)
        recognition.current.stop();
    else
        try {
            recognition.current.start();
        }
        catch {
            notify('Micro đang bận. Thử lại sau một chút.');
        } }
    return <main className="chat-workspace"><Avatar onReady={avatarReady}/><section className="conversation-panel"><header className="conversation-heading"><div><span className="eyebrow">{conversation?.deleted_at ? 'HỘI THOẠI ĐÃ LƯU TRỮ' : 'GÓC TRÒ CHUYỆN'}</span><h2 title={title}>{title || 'Mình nghe đây.'}</h2></div>{conversation && <div className="inline-actions"><button className="icon-btn" disabled={busy} title="Đổi tên" aria-label="Đổi tên hội thoại" onClick={() => { (document.getElementById('rename') as HTMLDialogElement).showModal(); }}><Pencil size={14}/></button><a className="icon-btn" title="Xuất JSON" aria-label="Xuất hội thoại" href={'/api/conversations/' + conversation.id + '/export'} download><Download size={15}/></a><button className="icon-btn" disabled={busy} title={conversation.deleted_at ? 'Khôi phục' : 'Lưu trữ'} aria-label={conversation.deleted_at ? 'Khôi phục hội thoại' : 'Lưu trữ hội thoại'} onClick={archive}>{conversation.deleted_at ? <RotateCcw size={15}/> : <Archive size={15}/>}</button></div>}</header><div className="chat-toolbar"><button className={'voice-toggle ' + (read ? 'on' : '')} onClick={() => { setRead(!read); if (read)
        voice.current?.stop(); }} aria-pressed={read}>{read ? <Volume2 size={14}/> : <VolumeX size={14}/>}Đọc câu trả lời<span className="switch"/></button>{playing && <button className="text-button" onClick={() => voice.current?.stop()}><Square size={10}/> Dừng đọc</button>}</div><div className="messages" role="log" aria-live="polite" aria-label="Tin nhắn">{loading ? <div className="empty"><LoaderCircle className="spin" size={19}/>Đang tải câu chuyện…</div> : messages.length === 0 ? <article className="message assistant"><span className="message-author">LONG VÂN <span>✦</span></span><div className="bubble">Chào {me.user.name}! Mình là Long Vân. 🐉<br />{me.config.welcome}</div>{!me.config.ready && <div className="connection-note">Admin chưa kết nối AI. Sau khi cấu hình OpenRouter, bạn có thể bắt đầu trò chuyện ngay.</div>}</article> : messages.map(m => <article className={'message ' + m.role} key={m.id}><span className="message-author">{m.role === 'user' ? 'BẠN' : 'LONG VÂN ✦'}</span><div className="bubble">{m.content || <span className="thinking">Long Vân đang nghĩ…</span>}</div>{m.status === 'interrupted' && <small className="muted">Câu trả lời đã dừng giữa chừng.</small>}{m.role === 'assistant' && m.content && !m.id.startsWith('local-') && <button className="read-message" onClick={() => play(m)}><Volume2 size={12}/>Nghe lại</button>}</article>)}<div ref={bottom}/></div>
 {messages.length === 0 && !loading && !archived && <div className="suggestions"><button onClick={() => send('Kể mình nghe một câu chuyện')}>Kể mình nghe một câu chuyện</button><button onClick={() => send('Hôm nay mình hơi mệt')}>Hôm nay mình hơi mệt</button></div>}
 {conversation?.deleted_at ? <div className="archive-notice"><Archive size={17}/><span>Hội thoại đang được lưu trữ.</span><button className="btn small" onClick={archive}>Khôi phục</button></div> : <form className="composer" onSubmit={e => { e.preventDefault(); if (busy)
        abort.current?.abort();
    else
        send(); }}><textarea aria-label="Tin nhắn cho Long Vân" maxLength={4000} rows={2} placeholder="Nói với Long Vân điều gì đó…" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        if (!busy)
            send();
    } }}/><div className="composer-actions"><button type="button" className={'mic ' + (listening ? 'listening' : '')} onClick={mic} aria-pressed={listening}><Mic size={16}/>{listening ? 'Đang nghe…' : 'Nói chuyện'}</button><span>{busy ? 'Đang trả lời…' : listening ? 'Xem lại lời nói rồi bấm gửi' : 'Enter để gửi'}</span><button className="send" disabled={(archived&&!conversation)||loading || (!busy && !input.trim())} aria-label={busy ? 'Dừng trả lời' : 'Gửi tin nhắn'}>{busy ? <Square size={15}/> : <ArrowUp size={19}/>}</button></div></form>}
 <footer className="chat-foot"><span><i className="dot"/>Hội thoại được lưu vào tài khoản</span><button onClick={() => play()}>Thử giọng rồng ↗</button></footer></section><dialog id="rename"><form onSubmit={editTitle}><h2>Đổi tên câu chuyện</h2><label>Tên hội thoại<input value={title} onChange={e => setTitle(e.target.value)} required maxLength={100}/></label><div className="form-actions"><button type="button" className="btn" onClick={() => { (document.getElementById('rename') as HTMLDialogElement).close(); }}>Hủy</button><button className="btn primary">Lưu tên</button></div></form></dialog></main>;
}
