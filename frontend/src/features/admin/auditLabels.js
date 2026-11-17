const labels = {
  "admin.bootstrap": "Khởi tạo admin gốc",
  "auth.register": "Đăng ký tài khoản",
  "auth.password_reset": "Đặt lại mật khẩu",
  "auth.password_change": "Đổi mật khẩu",
  "user.create": "Tạo người dùng",
  "user.update": "Cập nhật tài khoản",
  "user.revoke_sessions": "Thu hồi phiên đăng nhập",
  "user.reset_link": "Cấp link đặt mật khẩu",
  "config.update": "Cập nhật cấu hình AI",
  "conversation.admin_read": "Xem nội dung hội thoại",
};
export const actionLabel = (s) => labels[s] || s;
export const auditDetail = (value) => {
  try {
    const detail = JSON.parse(value);
    return Object.keys(detail).length
      ? Object.entries(detail)
          .map(([k, v]) => k + ": " + String(v))
          .join(" · ")
      : "—";
  } catch {
    return "Chi tiết chưa khả dụng";
  }
};
