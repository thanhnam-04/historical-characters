import { adminNav } from "./navigationItems.js";
import {
  MessageCircle,
  Plus,
  ShieldCheck,
  Archive,
  UserRound,
  LogOut,
  X,
} from "lucide-react";
export default function Sidebar({
  side,
  setSide,
  me,
  page,
  go,
  adminTab,
  navigateAdmin,
  archived,
  newConversation,
  openHistory,
  items,
  active,
  openConversation,
  listMore,
  listBusy,
  loadMore,
  logout,
}) {
  return (
    <aside className={"sidebar " + (side ? "open" : "")}>
      <a className="brand" href="/app">
        <span className="brand-mark">龍</span>
        <span>
          {me.config.appName}
          <small>NGƯỜI BẠN TỪ MÂY</small>
        </span>
      </a>
      <button
        className="mobile-close icon-btn"
        aria-label="Đóng menu"
        onClick={() => setSide(false)}
      >
        <X size={18} />
      </button>
      <div className="workspace-switch">
        <button
          className={page !== "admin" ? "selected" : ""}
          onClick={() => go("chat")}
        >
          <MessageCircle size={15} /> Của bạn
        </button>
        {me.user.role === "admin" && (
          <button
            className={page === "admin" ? "selected" : ""}
            onClick={() => go("admin")}
          >
            <ShieldCheck size={15} /> Quản trị
          </button>
        )}
      </div>
      {page === "admin" ? (
        <>
          <span className="nav-label">KHÔNG GIAN QUẢN TRỊ</span>
          <nav className="main-nav">
            {adminNav.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                className={adminTab === id ? "active" : ""}
                onClick={() => {
                  navigateAdmin(id);
                }}
              >
                <Icon size={17} />
                {label}
                {adminTab === id && <i />}
              </button>
            ))}
          </nav>
          <div className="sidebar-note">
            <ShieldCheck size={18} />
            <p>Những thay đổi quản trị được lưu trong nhật ký hệ thống.</p>
          </div>
        </>
      ) : (
        <>
          <button className="btn new-chat" onClick={newConversation}>
            <Plus size={17} /> Cuộc trò chuyện mới
          </button>
          <nav className="main-nav">
            <button
              className={page === "chat" && !archived ? "active" : ""}
              onClick={() => openHistory(false)}
            >
              <MessageCircle size={17} />
              Trò chuyện
            </button>
            <button
              className={page === "profile" ? "active" : ""}
              onClick={() => go("profile")}
            >
              <UserRound size={17} />
              Hồ sơ & lượt dùng
            </button>
            <button
              className={archived && page === "chat" ? "active" : ""}
              onClick={() => openHistory(true)}
            >
              <Archive size={17} />
              Đã lưu trữ
            </button>
          </nav>
          <div className="history-heading">
            <span className="nav-label">
              {archived ? "HỘI THOẠI ĐÃ LƯU TRỮ" : "NHỮNG CÂU CHUYỆN GẦN ĐÂY"}
            </span>
            <span>{items.length}</span>
          </div>
          <div className="history-list">
            {items.length === 0 ? (
              <p className="sidebar-empty">
                {archived
                  ? "Chưa có hội thoại được lưu trữ."
                  : "Câu chuyện đầu tiên đang chờ bạn."}
              </p>
            ) : (
              items.map((c) => (
                <button
                  key={c.id}
                  title={c.title}
                  className={
                    active?.id === c.id && page === "chat" ? "active" : ""
                  }
                  onClick={() => openConversation(c)}
                >
                  <MessageCircle size={13} />
                  <span>{c.title}</span>
                </button>
              ))
            )}
          </div>
          {listMore && (
            <button
              className="btn small load-more"
              disabled={listBusy}
              onClick={loadMore}
            >
              Tải thêm hội thoại
            </button>
          )}
          <div className="quota-card">
            <div>
              <span>Lượt AI hôm nay</span>
              <strong>
                {me.used}
                <small> / {me.user.quota}</small>
              </strong>
            </div>
            <progress max={Math.max(1, me.user.quota)} value={me.used} />
            <small>Chat và tạo giọng nói đều tính lượt.</small>
          </div>
        </>
      )}
      <div className="sidebar-account">
        <button className="account-person" onClick={() => go("profile")}>
          <span className="initials">
            {me.user.name.slice(0, 1).toUpperCase()}
          </span>
          <span>
            <strong>{me.user.name}</strong>
            <small>
              {me.user.role === "admin" ? "Quản trị viên" : "Thành viên"}
            </small>
          </span>
        </button>
        <button
          className="icon-btn"
          onClick={logout}
          title="Đăng xuất"
          aria-label="Đăng xuất"
        >
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  );
}
