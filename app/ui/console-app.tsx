'use client';
import { useCallback, useEffect, useState } from 'react';
import { MessageCircle, Plus, ShieldCheck, LayoutDashboard, Users, Settings, ScrollText, Archive, UserRound, LogOut, Menu, X, ChevronRight, LoaderCircle } from 'lucide-react';
import { api, write, type Me, type Conversation } from './api';
import Chat from './chat';
import Admin from './admin';
import Profile from './profile';
const adminNav = [{ id: 'overview', label: 'Tổng quan', icon: LayoutDashboard }, { id: 'users', label: 'Người dùng', icon: Users }, { id: 'conversations', label: 'Hội thoại', icon: MessageCircle }, { id: 'config', label: 'Cấu hình AI', icon: Settings }, { id: 'audit', label: 'Nhật ký quản trị', icon: ScrollText }];
export default function ConsoleApp({ initialPage }: {
    initialPage: 'chat' | 'admin';
}) {
    const [me, setMe] = useState<Me | null>(null), [error, setError] = useState(''), [page, setPage] = useState<string>(initialPage), [adminTab, setAdminTab] = useState('overview'), [items, setItems] = useState<Conversation[]>([]), [active, setActive] = useState<Conversation | null>(null), [archived, setArchived] = useState(false), [side, setSide] = useState(false), [toast, setToast] = useState('');
    const notify = useCallback((text: string) => setToast(text), []);
    const refreshMe = useCallback(async () => { const data = await api('me'); setError(''); setMe(data); return data; }, []);
    const refreshConversations = useCallback(async () => { const data = await api('conversations?archived=' + archived); setItems(data.items); }, [archived]);
    useEffect(() => { refreshMe().then(data => { if (initialPage === 'admin' && data.user.role !== 'admin') {
        setPage('chat');
        history.replaceState(null, '', '/app');
    } }).catch(e => { if (e.status === 401)
        location.replace('/login');
    else
        setError(e.message); }); }, [refreshMe, initialPage]);
    useEffect(() => { if (me)
        refreshConversations().catch(e => notify(e.message)); }, [me?.user.id, refreshConversations]);
    useEffect(() => { if (!toast)
        return; const timer = setTimeout(() => setToast(''), 6500); return () => clearTimeout(timer); }, [toast]);
    const go = (next: string) => { setPage(next); setSide(false); history.replaceState(null, '', next === 'admin' ? '/admin' : '/app'); };
    async function logout() { if (!me)
        return; try {
        const data = await write('auth/logout', {}, me.csrf);
        location.assign(data.redirect);
    }
    catch (e) {
        notify((e as Error).message);
    } }
    if (error)
        return <div className="fatal"><span className="brand-mark">龍</span><h1>Chưa vào được không gian của bạn</h1><p>{error}</p><a href="/login" className="btn primary">Về trang đăng nhập</a><button className="btn" onClick={() => location.reload()}>Thử lại</button></div>;
    if (!me)
        return <div className="fatal"><LoaderCircle className="spin"/><p>Đang mở không gian Long Vân…</p></div>;
    return <div className="app-shell"><aside className={'sidebar ' + (side ? 'open' : '')}><a className="brand" href="/app"><span className="brand-mark">龍</span><span>{me.config.appName}<small>NGƯỜI BẠN TỪ MÂY</small></span></a><button className="mobile-close icon-btn" aria-label="Đóng menu" onClick={() => setSide(false)}><X size={18}/></button><div className="workspace-switch"><button className={page !== 'admin' ? 'selected' : ''} onClick={() => go('chat')}><MessageCircle size={15}/> Của bạn</button>{me.user.role === 'admin' && <button className={page === 'admin' ? 'selected' : ''} onClick={() => go('admin')}><ShieldCheck size={15}/> Quản trị</button>}</div>
 {page === 'admin' ? <><span className="nav-label">KHÔNG GIAN QUẢN TRỊ</span><nav className="main-nav">{adminNav.map(({ id, label, icon: Icon }) => <button key={id} className={adminTab === id ? 'active' : ''} onClick={() => { setAdminTab(id); setSide(false); }}><Icon size={17}/>{label}{adminTab === id && <i />}</button>)}</nav><div className="sidebar-note"><ShieldCheck size={18}/><p>Những thay đổi quản trị được lưu trong nhật ký hệ thống.</p></div></> : <><button className="btn new-chat" onClick={() => { setArchived(false); setActive(null); go('chat'); }}><Plus size={17}/> Cuộc trò chuyện mới</button><nav className="main-nav"><button className={page === 'chat' && !archived ? 'active' : ''} onClick={() => { setArchived(false); go('chat'); }}><MessageCircle size={17}/>Trò chuyện</button><button className={page === 'profile' ? 'active' : ''} onClick={() => go('profile')}><UserRound size={17}/>Hồ sơ & lượt dùng</button><button className={archived && page === 'chat' ? 'active' : ''} onClick={() => { setArchived(true); setActive(null); go('chat'); }}><Archive size={17}/>Đã lưu trữ</button></nav><div className="history-heading"><span className="nav-label">{archived ? 'HỘI THOẠI ĐÃ LƯU TRỮ' : 'NHỮNG CÂU CHUYỆN GẦN ĐÂY'}</span><span>{items.length}</span></div><div className="history-list">{items.length === 0 ? <p className="sidebar-empty">{archived ? 'Chưa có hội thoại được lưu trữ.' : 'Câu chuyện đầu tiên đang chờ bạn.'}</p> : items.map(c => <button key={c.id} title={c.title} className={active?.id === c.id && page === 'chat' ? 'active' : ''} onClick={() => { setActive(c); go('chat'); }}><MessageCircle size={13}/><span>{c.title}</span></button>)}</div><div className="quota-card"><div><span>Lượt AI hôm nay</span><strong>{me.used}<small> / {me.user.quota}</small></strong></div><progress max={Math.max(1, me.user.quota)} value={me.used}/><small>Chat và tạo giọng nói đều tính lượt.</small></div></>}
 <div className="sidebar-account"><button className="account-person" onClick={() => go('profile')}><span className="initials">{me.user.name.slice(0, 1).toUpperCase()}</span><span><strong>{me.user.name}</strong><small>{me.user.role === 'admin' ? 'Quản trị viên' : 'Thành viên'}</small></span></button><button className="icon-btn" onClick={logout} title="Đăng xuất" aria-label="Đăng xuất"><LogOut size={16}/></button></div></aside>{side && <button className="sidebar-backdrop" aria-label="Đóng menu" onClick={() => setSide(false)}/>}
 <div className="app-content"><header className="app-topbar"><div className="breadcrumb"><button className="icon-btn mobile-menu" aria-label="Mở menu" onClick={() => setSide(true)}><Menu size={20}/></button><span>{page === 'admin' ? 'Không gian quản trị' : 'Không gian của bạn'}</span><ChevronRight size={13}/><strong>{page === 'admin' ? adminNav.find(n => n.id === adminTab)?.label : page === 'profile' ? 'Hồ sơ' : archived ? 'Đã lưu trữ' : 'Trò chuyện'}</strong></div><div className="topbar-right"><span className={'connection-pill ' + (me.config.ready ? 'ready' : '')}><i />{me.config.ready ? 'AI đã kết nối' : 'Chưa kết nối AI'}</span><button className="initials small" title="Hồ sơ" onClick={() => go('profile')}>{me.user.name.slice(0, 1).toUpperCase()}</button></div></header>
 {page === 'chat' ? <Chat me={me} conversation={active} archived={archived} notify={notify} onCreate={c => { setActive(c); refreshConversations(); }} onRefresh={() => { refreshConversations(); refreshMe().catch(() => { }); }} onArchived={() => { setActive(null); refreshConversations(); }}/> : page === 'admin' ? <Admin tab={adminTab} me={me} notify={notify} onNavigate={setAdminTab} refreshMe={refreshMe}/> : <Profile me={me} notify={notify} refreshMe={refreshMe}/>}
 </div>{toast && <div className="toast" role="status"><span>{toast}</span><button onClick={() => setToast('')} aria-label="Đóng thông báo"><X size={15}/></button></div>}</div>;
}
