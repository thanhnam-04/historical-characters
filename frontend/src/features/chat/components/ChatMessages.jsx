import { Volume2, LoaderCircle } from "lucide-react";
export default function ChatMessages({
  hasOlder,
  switching,
  olderBusy,
  loadOlder,
  loading,
  messages,
  me,
  play,
  bottom,
}) {
  return (
    <div
      className="messages"
      role="log"
      aria-live="polite"
      aria-label="Tin nhắn"
    >
      {hasOlder && !switching && (
        <button className="btn small" disabled={olderBusy} onClick={loadOlder}>
          Tải tin nhắn cũ hơn
        </button>
      )}
      {loading || switching ? (
        <div className="empty">
          <LoaderCircle className="spin" size={19} />
          Đang tải câu chuyện…
        </div>
      ) : messages.length === 0 ? (
        <article className="message assistant">
          <span className="message-author">
            LONG VÂN <span>✦</span>
          </span>
          <div className="bubble">
            Chào {me.user.name}! Mình là Long Vân. 🐉
            <br />
            {me.config.welcome}
          </div>
          {!me.config.ready && (
            <div className="connection-note">
              Admin chưa kết nối AI. Sau khi cấu hình OpenRouter, bạn có thể bắt
              đầu trò chuyện ngay.
            </div>
          )}
        </article>
      ) : (
        messages.map((m) => (
          <article className={"message " + m.role} key={m.id}>
            <span className="message-author">
              {m.role === "user" ? "BẠN" : "LONG VÂN ✦"}
            </span>
            <div className="bubble">
              {m.content || (
                <span className="thinking">Long Vân đang nghĩ…</span>
              )}
            </div>
            {m.status === "interrupted" && (
              <small className="muted">Câu trả lời đã dừng giữa chừng.</small>
            )}
            {m.role === "assistant" &&
              m.content &&
              !m.id.startsWith("local-") && (
                <button className="read-message" onClick={() => play(m)}>
                  <Volume2 size={12} />
                  Nghe lại
                </button>
              )}
          </article>
        ))
      )}
      <div ref={bottom} />
    </div>
  );
}
