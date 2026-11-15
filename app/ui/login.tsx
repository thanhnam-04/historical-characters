'use client';
import { useEffect, useState } from 'react';
import { ArrowRight, ShieldCheck, MessageCircle, Mic, LoaderCircle } from 'lucide-react';
import { api, write } from './api';
export default function Login() {
    const [status, setStatus] = useState<{
        mode: string;
        setupRequired: boolean;
        registrationOpen: boolean;
    } | null>(null), [tab, setTab] = useState('login'), [reset, setReset] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [success, setSuccess] = useState('');
    useEffect(() => { const token = new URLSearchParams(location.search).get('reset'); if (token) {
        setReset(token);
        setTab('reset');
    } api('auth/status').then(s => { setStatus(s); if (s.setupRequired && s.mode === 'password')
        setTab('setup'); }).catch(e => setError(e.message)); }, []);
    async function submit(e: React.FormEvent<HTMLFormElement>) { e.preventDefault(); setBusy(true); setError(''); const form = new FormData(e.currentTarget); try {
        await write('auth/' + tab, { name: form.get('name'), email: form.get('email'), password: form.get('password'), token: reset }, '');
        if (tab === 'reset') {
            setSuccess('Đã đặt mật khẩu. Bạn có thể đăng nhập ngay.');
            setTab('login');
            history.replaceState(null, '', '/login');
        }
        else
            location.assign('/app');
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    return <main className="login-shell"><section className="login-story"><a className="brand" href="/"><span className="brand-mark">龍</span><span>Long Vân<small>NGƯỜI BẠN TỪ MÂY</small></span></a><div className="login-quote"><span className="eyebrow">MỘT KHÔNG GIAN ĐỂ LẮNG NGHE</span><h1>Chuyện gì cũng có thể bắt đầu bằng một lời chào<span>.</span></h1><p>Một người bạn rồng, những cuộc trò chuyện của riêng bạn. Gõ một dòng, hoặc kể bằng giọng nói.</p><div className="login-features"><span><MessageCircle size={16}/> Hội thoại được lưu</span><span><Mic size={16}/> Trò chuyện bằng giọng nói</span><span><ShieldCheck size={16}/> Không gian có phân quyền</span></div></div><span className="login-orbit one"/><span className="login-orbit two"/><p className="login-bottom">Một cuộc trò chuyện, một chút diệu kỳ. ✦</p></section><section className="login-form-section"><div className="login-card"><span className="eyebrow">CHÀO MỪNG ĐẾN LONG VÂN</span><h2>{tab === 'setup' ? 'Tạo quản trị viên đầu tiên' : tab === 'register' ? 'Làm quen nhé.' : tab === 'reset' ? 'Đặt mật khẩu mới' : 'Thật vui khi gặp bạn.'}</h2><p>{tab === 'setup' ? 'Hoàn tất bước này để mở không gian admin và cấu hình AI.' : tab === 'reset' ? 'Link do admin cấp có hiệu lực trong một giờ và chỉ dùng một lần.' : 'Đăng nhập để tiếp tục những câu chuyện còn dang dở.'}</p>
 {!status && !error ? <div className="empty"><LoaderCircle className="spin"/>Đang kết nối máy chủ…</div> : status?.mode === 'chatgpt' ? <><a className="btn primary full" href="/signin-with-chatgpt?return_to=/app" target="_top">Tiếp tục với ChatGPT <ArrowRight size={17}/></a><p className="field-help">Tài khoản quản trị gốc được xác định từ chủ Site. Những tài khoản khác có quyền người dùng.</p></> : <><div className="auth-tabs">{['login', 'register'].map(t => <button disabled={tab === 'setup' || tab === 'reset' || (t === 'register' && !status?.registrationOpen)} className={tab === t ? 'active' : ''} key={t} onClick={() => { setTab(t); setError(''); }}>{t === 'login' ? 'Đăng nhập' : 'Đăng ký'}</button>)}</div><form onSubmit={submit}>{['register', 'setup'].includes(tab) && <label>Tên hiển thị<input required name="name" autoComplete="name" maxLength={80} placeholder="Bạn muốn được gọi là gì?"/></label>}{tab !== 'reset' && <label>Email<input name="email" type="email" required autoComplete="email" placeholder="ban@example.com"/></label>}<label>{tab === 'reset' ? 'Mật khẩu mới' : 'Mật khẩu'}<input name="password" type="password" required minLength={tab === 'login' ? 1 : 12} maxLength={128} autoComplete={tab === 'login' ? 'current-password' : 'new-password'} placeholder={tab === 'login' ? 'Nhập mật khẩu của bạn' : 'Ít nhất 12 ký tự'}/></label>{error && <p className="form-error" role="alert">{error}</p>}{success && <p className="form-success" role="status">{success}</p>}<button disabled={busy} className="btn primary full">{busy ? <LoaderCircle className="spin" size={17}/> : <ArrowRight size={17}/>} {tab === 'setup' ? 'Tạo tài khoản admin' : tab === 'register' ? 'Tạo tài khoản' : tab === 'reset' ? 'Lưu mật khẩu mới' : 'Vào không gian của bạn'}</button></form>{tab === 'login' && <p className="field-help">Quên mật khẩu? Liên hệ admin để nhận link đặt lại. Trang chưa cấu hình gửi email tự động.</p>}</>}{error && status?.mode === 'chatgpt' && <p className="form-error">{error}</p>}<p className="login-fine">Long Vân là AI và có thể trả lời chưa chính xác. Bạn có thể quản lý, lưu trữ hoặc xuất hội thoại của mình.</p></div></section></main>;
}
