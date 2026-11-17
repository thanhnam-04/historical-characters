import { KeyRound, Copy, X } from "lucide-react";
import { write, date } from "../../../services/api.js";

export default function AdminDialogs({
  modalRef,
  view,
  invite,
  editUser,
  resetLink,
  me,
  data,
  busy,
  closeModal,
  createUser,
  saveUser,
  resetUser,
  perform,
  loadReviewOlder,
  notify,
}) {
  return (
    <div className="modal-backdrop">
      <section
        ref={modalRef}
        className={"modal " + (view ? "wide" : "")}
        role="dialog"
        aria-modal="true"
        aria-label={
          invite
            ? "Thêm người dùng"
            : editUser
              ? "Quản lý tài khoản"
              : view
                ? "Nội dung hội thoại"
                : "Link đặt mật khẩu"
        }
      >
        <button
          className="icon-btn modal-close"
          aria-label="Đóng"
          onClick={closeModal}
        >
          <X size={18} />
        </button>
        {invite ? (
          <>
            <span className="eyebrow">MỜI MỘT NGƯỜI BẠN</span>
            <h2>Thêm người dùng</h2>
            <form onSubmit={createUser}>
              <label>
                Tên hiển thị
                <input name="name" required maxLength={80} />
              </label>
              <label>
                Email
                <input name="email" type="email" required />
              </label>
              <label>
                Vai trò
                <select name="role">
                  <option value="user">User — sử dụng chat và voice</option>
                  <option value="admin">Admin — có quyền quản trị</option>
                </select>
              </label>
              <p className="field-help">
                {
                  "Sau khi tạo, bạn sẽ nhận link để người dùng tự đặt mật khẩu. Link có hiệu lực một giờ."
                }
              </p>
              <button className="btn primary full" disabled={busy}>
                Tạo người dùng
              </button>
            </form>
          </>
        ) : resetLink ? (
          <>
            <KeyRound size={26} />
            <h2>Link đặt mật khẩu</h2>
            <p>
              Gửi riêng cho đúng người nhận. Link dùng một lần, hết hạn sau một
              giờ. Hệ thống chưa gửi email tự động.
            </p>
            <textarea
              readOnly
              value={resetLink}
              rows={4}
              aria-label="Link đặt mật khẩu"
            />
            <button
              className="btn primary full"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(resetLink);
                  notify("Đã sao chép link.");
                } catch {
                  notify("Bạn có thể chọn và sao chép link trong ô phía trên.");
                }
              }}
            >
              <Copy size={15} />
              Sao chép link
            </button>
          </>
        ) : editUser ? (
          <>
            <span className="eyebrow">QUẢN LÝ TÀI KHOẢN</span>
            <h2>{editUser.name}</h2>
            <p>{editUser.email}</p>
            <form onSubmit={saveUser}>
              <label>
                Vai trò
                <select
                  disabled={
                    editUser.id === data?.ownerId || editUser.id === me.user.id
                  }
                  name="role"
                  defaultValue={editUser.role}
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
              <label>
                Trạng thái
                <select
                  disabled={
                    editUser.id === data?.ownerId || editUser.id === me.user.id
                  }
                  name="status"
                  defaultValue={editUser.status}
                >
                  <option value="active">Hoạt động</option>
                  <option value="suspended">Khóa tài khoản</option>
                </select>
              </label>
              <label>
                Hạn mức yêu cầu AI mỗi ngày
                <input
                  name="quota"
                  type="number"
                  min={0}
                  max={10000}
                  defaultValue={editUser.quota}
                  required
                />
              </label>
              <button className="btn primary full" disabled={busy}>
                Lưu thay đổi
              </button>
            </form>
            <div className="modal-secondary">
              {
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => resetUser(editUser.id)}
                >
                  Cấp link đặt lại mật khẩu
                </button>
              }
              {
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() =>
                    perform(async () => {
                      await write(
                        "admin/users/" + editUser.id + "/sessions",
                        {},
                        me.csrf,
                      );
                      notify("Đã thu hồi các phiên đăng nhập của tài khoản.");
                    })
                  }
                >
                  Thu hồi phiên đăng nhập
                </button>
              }
            </div>
          </>
        ) : view ? (
          <>
            <span className="eyebrow">
              NỘI DUNG HỘI THOẠI · ĐÃ GHI NHẬT KÝ TRUY CẬP
            </span>
            <h2>{view.conversation.title}</h2>
            <div className="review-messages">
              {view.hasMore && (
                <button
                  className="btn small"
                  disabled={busy}
                  onClick={loadReviewOlder}
                >
                  Tải tin nhắn cũ hơn
                </button>
              )}
              {view.messages.length ? (
                view.messages.map((m) => (
                  <article className={"message " + m.role} key={m.id}>
                    <span className="message-author">
                      {m.role === "user" ? "NGƯỜI DÙNG" : "LONG VÂN"}
                    </span>
                    <div className="bubble">{m.content}</div>
                    <small className="muted">{date(m.created_at)}</small>
                  </article>
                ))
              ) : (
                <p>Chưa có tin nhắn.</p>
              )}
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}
