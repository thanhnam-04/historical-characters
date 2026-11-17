import { useEffect, useState } from "react";
import {
  ArrowRight,
  ShieldCheck,
  MessageCircle,
  Mic,
  LoaderCircle,
} from "lucide-react";
import { api, write } from "../../services/api.js";
export default function Login() {
  const [status, setStatus] = useState(null);
  const [tab, setTab] = useState("login");
  const [reset, setReset] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const token = new URLSearchParams(location.search).get("reset");
    if (token) {
      setReset(token);
      setTab("reset");
    }
    setLoading(true);
    setError("");
    api("auth/status", { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        if (data.mode !== "password")
          throw new Error("Máy chủ chưa trả về chế độ đăng nhập hợp lệ.");
        setStatus(data);
        if (data.setupRequired && data.mode === "password") setTab("setup");
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [revision]);
  async function submit(event) {
    event.preventDefault();
    if (busy || !status) return;
    const form = new FormData(event.currentTarget);
    if (tab !== "login" && form.get("password") !== form.get("confirm")) {
      setError("Hai mật khẩu chưa khớp.");
      return;
    }
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await write(
        "auth/" + tab,
        {
          name: form.get("name"),
          email: form.get("email"),
          password: form.get("password"),
          token: reset,
        },
        "",
      );
      if (tab === "reset") {
        setSuccess("Đã đặt mật khẩu. Bạn có thể đăng nhập ngay.");
        setReset("");
        setTab("login");
        history.replaceState(null, "", "/login");
      } else location.assign("/app");
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }
  function backToLogin() {
    setTab("login");
    setReset("");
    setError("");
    setSuccess("");
    history.replaceState(null, "", "/login");
  }
  return (
    <main className="login-shell">
      <section className="login-story">
        <a className="brand" href="/">
          <span className="brand-mark">龍</span>
          <span>
            Historical Characters<small>NGƯỜI BẠN TỪ MÂY</small>
          </span>
        </a>
        <div className="login-quote">
          <span className="eyebrow">MỘT KHÔNG GIAN ĐỂ LẮNG NGHE</span>
          <h1>
            Chuyện gì cũng có thể bắt đầu bằng một lời chào<span>.</span>
          </h1>
          <p>
            Một người bạn rồng, những cuộc trò chuyện của riêng bạn. Gõ một
            dòng, hoặc kể bằng giọng nói.
          </p>
          <div className="login-features">
            <span>
              <MessageCircle size={16} /> Hội thoại được lưu
            </span>
            <span>
              <Mic size={16} /> Trò chuyện bằng giọng nói
            </span>
            <span>
              <ShieldCheck size={16} /> Không gian có phân quyền
            </span>
          </div>
        </div>
        <span className="login-orbit one" />
        <span className="login-orbit two" />
        <p className="login-bottom">Một cuộc trò chuyện, một chút diệu kỳ. ✦</p>
      </section>
      <section className="login-form-section">
        <div className="login-card">
          <span className="eyebrow">CHÀO MỪNG ĐẾN HISTORICAL CHARACTERS</span>
          <h2>
            {tab === "setup"
              ? "Tạo quản trị viên đầu tiên"
              : tab === "register"
                ? "Làm quen nhé."
                : tab === "reset"
                  ? "Đặt mật khẩu mới"
                  : "Thật vui khi gặp bạn."}
          </h2>
          <p>
            {tab === "setup"
              ? "Hoàn tất bước này để mở không gian admin và cấu hình AI."
              : tab === "reset"
                ? "Link do admin cấp có hiệu lực trong một giờ và chỉ dùng một lần."
                : "Đăng nhập để tiếp tục những câu chuyện còn dang dở."}
          </p>
          {loading ? (
            <div className="empty">
              <LoaderCircle className="spin" />
              Đang kết nối máy chủ…
            </div>
          ) : !status ? (
            <div className="empty" role="alert">
              <p>{error || "Chưa kết nối được máy chủ."}</p>
              <button className="btn" onClick={() => setRevision((n) => n + 1)}>
                Thử lại
              </button>
            </div>
          ) : (
            <>
              <div className="auth-tabs">
                {["login", "register"].map((value) => (
                  <button
                    disabled={
                      busy ||
                      tab === "setup" ||
                      tab === "reset" ||
                      (value === "register" && !status.registrationOpen)
                    }
                    className={tab === value ? "active" : ""}
                    key={value}
                    onClick={() => {
                      setTab(value);
                      setError("");
                      setSuccess("");
                    }}
                  >
                    {value === "login" ? "Đăng nhập" : "Đăng ký"}
                  </button>
                ))}
              </div>
              <form onSubmit={submit}>
                {["register", "setup"].includes(tab) && (
                  <label>
                    Tên hiển thị
                    <input
                      required
                      name="name"
                      autoComplete="name"
                      maxLength={80}
                      placeholder="Bạn muốn được gọi là gì?"
                    />
                  </label>
                )}
                {tab !== "reset" && (
                  <label>
                    Email
                    <input
                      name="email"
                      type="email"
                      required
                      autoComplete="email"
                      placeholder="ban@example.com"
                    />
                  </label>
                )}
                <label>
                  {tab === "reset" ? "Mật khẩu mới" : "Mật khẩu"}
                  <input
                    name="password"
                    type="password"
                    required
                    minLength={tab === "login" ? 1 : 12}
                    maxLength={128}
                    autoComplete={
                      tab === "login" ? "current-password" : "new-password"
                    }
                    placeholder={
                      tab === "login"
                        ? "Nhập mật khẩu của bạn"
                        : "Ít nhất 12 ký tự"
                    }
                  />
                </label>
                {tab !== "login" && (
                  <label>
                    Nhập lại mật khẩu
                    <input
                      name="confirm"
                      type="password"
                      required
                      minLength={12}
                      maxLength={128}
                      autoComplete="new-password"
                    />
                  </label>
                )}
                {error && (
                  <p className="form-error" role="alert">
                    {error}
                  </p>
                )}
                {success && (
                  <p className="form-success" role="status">
                    {success}
                  </p>
                )}
                <button disabled={busy} className="btn primary full">
                  {busy ? (
                    <LoaderCircle className="spin" size={17} />
                  ) : (
                    <ArrowRight size={17} />
                  )}
                  {tab === "setup"
                    ? "Tạo tài khoản admin"
                    : tab === "register"
                      ? "Tạo tài khoản"
                      : tab === "reset"
                        ? "Lưu mật khẩu mới"
                        : "Vào không gian của bạn"}
                </button>
              </form>
              {tab === "reset" && (
                <button className="text-button" onClick={backToLogin}>
                  Quay lại đăng nhập
                </button>
              )}
              {tab === "login" && (
                <p className="field-help">
                  Quên mật khẩu? Liên hệ admin để nhận link đặt lại. Link được
                  admin gửi riêng; hệ thống chưa gửi email tự động.
                </p>
              )}
            </>
          )}
          <p className="login-fine">
            Historical Characters là AI và có thể trả lời chưa chính xác. Bạn có thể quản lý,
            lưu trữ hoặc xuất hội thoại của mình.
          </p>
        </div>
      </section>
    </main>
  );
}
