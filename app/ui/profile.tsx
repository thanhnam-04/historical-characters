'use client';
import { useEffect, useState } from 'react';
import { UserRound, ShieldCheck, KeyRound, Activity } from 'lucide-react';
import { api, write, date, type Me } from './api';
export default function Profile({ me, notify, refreshMe }: {
    me: Me;
    notify: (s: string) => void;
    refreshMe: () => Promise<any>;
}) {
    const [usage, setUsage] = useState<any[]>([]), [busy, setBusy] = useState(false);
    useEffect(() => { api('usage').then(d => setUsage(d.items)).catch(e => notify(e.message)); }, []);
    async function save(e: React.FormEvent<HTMLFormElement>) { e.preventDefault(); setBusy(true); const f = new FormData(e.currentTarget); try {
        await write('profile', { name: f.get('name') }, me.csrf, 'PATCH');
        await refreshMe();
        notify('Đã lưu hồ sơ.');
    }
    catch (e) {
        notify((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    async function changePassword(e: React.FormEvent<HTMLFormElement>) { e.preventDefault(); setBusy(true); const form = e.currentTarget, f = new FormData(form); if (f.get('password') !== f.get('confirm')) {
        notify('Hai mật khẩu mới chưa khớp.');
        setBusy(false);
        return;
    } try {
        await write('profile/password', { currentPassword: f.get('current'), password: f.get('password') }, me.csrf);
        await refreshMe();
        form.reset();
        notify('Đã đổi mật khẩu và kết thúc các phiên đăng nhập cũ.');
    }
    catch (e) {
        notify((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    return <main className="dashboard"><div className="page-heading"><div><span className="eyebrow">KHÔNG GIAN CỦA BẠN</span><h1>Hồ sơ & lượt dùng<span>.</span></h1><p>Những thông tin để Long Vân hiểu bạn hơn.</p></div><span className="role-pill"><ShieldCheck size={14}/>{me.user.role === 'admin' ? 'Quản trị viên' : 'Thành viên'}</span></div><div className="profile-grid"><section className="panel"><div className="panel-heading"><UserRound size={18}/><h2>Thông tin cá nhân</h2></div><form onSubmit={save}><label>Tên hiển thị<input name="name" defaultValue={me.user.name} required maxLength={80}/></label><label>Email<input value={me.user.email} readOnly/></label><p className="field-help">Tham gia từ {date(me.user.createdAt)}.</p><button disabled={busy} className="btn primary">Lưu thông tin</button></form></section><section className="panel usage-panel"><div className="panel-heading"><Activity size={18}/><h2>Hạn mức hôm nay</h2></div><div className="big-number">{me.used}<span> / {me.user.quota}</span></div><progress max={Math.max(1, me.user.quota)} value={me.used}/><p>Chat và mỗi lần tạo giọng nói đều tính một lượt AI. Hạn mức được làm mới theo ngày, múi giờ Việt Nam.</p><small>Yêu cầu gặp lỗi dịch vụ được hoàn lại lượt.</small></section>{me.mode === 'password' && <section className="panel"><div className="panel-heading"><KeyRound size={18}/><h2>Đổi mật khẩu</h2></div><form onSubmit={changePassword}><label>Mật khẩu hiện tại<input name="current" type="password" required autoComplete="current-password"/></label><label>Mật khẩu mới<input name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password"/></label><label>Nhập lại mật khẩu mới<input name="confirm" type="password" required minLength={12} maxLength={128} autoComplete="new-password"/></label><button className="btn primary" disabled={busy}>Cập nhật mật khẩu</button></form></section>}</div><section className="panel"><div className="panel-heading"><h2>Hoạt động gần đây</h2><span className="muted">50 yêu cầu gần nhất</span></div>{usage.length === 0 ? <div className="empty">Bạn chưa có yêu cầu AI nào. Bắt đầu một câu chuyện để gặp Long Vân.</div> : <div className="table-scroll"><table><thead><tr><th>Thời gian</th><th>Hoạt động</th><th>Model</th><th>Trạng thái</th></tr></thead><tbody>{usage.map((u, i) => <tr key={i}><td>{date(u.created_at)}</td><td>{u.kind === 'chat' ? 'Trò chuyện' : 'Tạo giọng nói'}</td><td className="mono">{u.model}</td><td><span className={'badge ' + (u.status === 'success' ? 'green' : u.status === 'error' ? 'red' : '')}>{({ success: 'Hoàn tất', error: 'Gặp lỗi', pending: 'Đang xử lý', cancelled: 'Đã dừng' } as any)[u.status] || u.status}</span></td></tr>)}</tbody></table></div>}</section></main>;
}
