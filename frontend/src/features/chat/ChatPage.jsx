import { useChatController } from "./useChatController.js";
import ChatMessages from "./components/ChatMessages.jsx";
import {
  ArrowUp,
  Mic,
  Square,
  Volume2,
  VolumeX,
  Archive,
  RotateCcw,
  Download,
  Pencil,
} from "lucide-react";
import Avatar from "../../components/DragonAvatar.jsx";
export default function Chat({
  me,
  conversation,
  archived,
  notify,
  onCreate,
  onRefresh,
  onArchived,
  resetToken = 0,
}) {
  const {
    messages,
    input,
    setInput,
    busy,
    loading,
    playing,
    read,
    setRead,
    listening,
    title,
    switching,
    avatarReady,
    renameDraft,
    setRenameDraft,
    olderBusy,
    hasOlder,
    bottom,
    readRef,
    voice,
    play,
    send,
    editTitle,
    archive,
    mic,
    loadOlder,
    abort,
  } = useChatController({
    me,
    conversation,
    archived,
    notify,
    onCreate,
    onRefresh,
    onArchived,
    resetToken,
  });
  return (
    <main className="chat-workspace">
      <Avatar onReady={avatarReady} />
      <section className="conversation-panel">
        <header className="conversation-heading">
          <div>
            <span className="eyebrow">
              {conversation?.deleted_at
                ? "HỘI THOẠI ĐÃ LƯU TRỮ"
                : "GÓC TRÒ CHUYỆN"}
            </span>
            <h2 title={title}>{title || "Mình nghe đây."}</h2>
          </div>
          {conversation && (
            <div className="inline-actions">
              <button
                className="icon-btn"
                disabled={busy || switching || loading}
                title="Đổi tên"
                aria-label="Đổi tên hội thoại"
                onClick={() => {
                  setRenameDraft(title);
                  document.getElementById("rename").showModal();
                }}
              >
                <Pencil size={14} />
              </button>
              <a
                className="icon-btn"
                title="Xuất JSON"
                aria-label="Xuất hội thoại"
                href={"/api/conversations/" + conversation.id + "/export"}
                download
              >
                <Download size={15} />
              </a>
              <button
                className="icon-btn"
                disabled={busy || switching || loading}
                title={conversation.deleted_at ? "Khôi phục" : "Lưu trữ"}
                aria-label={
                  conversation.deleted_at
                    ? "Khôi phục hội thoại"
                    : "Lưu trữ hội thoại"
                }
                onClick={archive}
              >
                {conversation.deleted_at ? (
                  <RotateCcw size={15} />
                ) : (
                  <Archive size={15} />
                )}
              </button>
            </div>
          )}
        </header>
        <div className="chat-toolbar">
          <button
            className={"voice-toggle " + (read ? "on" : "")}
            onClick={() => {
              readRef.current = !readRef.current;
              setRead(readRef.current);
              if (!readRef.current) voice.current?.stop();
            }}
            aria-pressed={read}
            disabled={!me.config.ttsEnabled || me.config.ttsEngine === "off"}
          >
            {read ? <Volume2 size={14} /> : <VolumeX size={14} />}Đọc câu trả
            lời
            <span className="switch" />
          </button>
          {playing && (
            <button
              className="text-button"
              onClick={() => voice.current?.stop()}
            >
              <Square size={10} /> Dừng đọc
            </button>
          )}
        </div>
        <ChatMessages
          hasOlder={hasOlder}
          switching={switching}
          olderBusy={olderBusy}
          loadOlder={loadOlder}
          loading={loading}
          messages={messages}
          me={me}
          play={play}
          bottom={bottom}
        />
        {messages.length === 0 && !loading && !archived && (
          <div className="suggestions">
            <button onClick={() => send("Kể mình nghe một câu chuyện")}>
              Kể mình nghe một câu chuyện
            </button>
            <button onClick={() => send("Hôm nay mình hơi mệt")}>
              Hôm nay mình hơi mệt
            </button>
          </div>
        )}
        {conversation?.deleted_at ? (
          <div className="archive-notice">
            <Archive size={17} />
            <span>Hội thoại đang được lưu trữ.</span>
            <button className="btn small" onClick={archive}>
              Khôi phục
            </button>
          </div>
        ) : (
          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault();
              if (busy) abort.current?.abort();
              else send();
            }}
          >
            <textarea
              aria-label="Tin nhắn cho Long Vân"
              maxLength={4000}
              rows={2}
              placeholder="Nói với Long Vân điều gì đó…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  if (!busy) send();
                }
              }}
            />
            <div className="composer-actions">
              <button
                type="button"
                className={"mic " + (listening ? "listening" : "")}
                onClick={mic}
                disabled={
                  switching ||
                  !!conversation?.deleted_at ||
                  (archived && !conversation)
                }
                aria-pressed={listening}
              >
                <Mic size={16} />
                {listening ? "Đang nghe…" : "Nói chuyện"}
              </button>
              <span>
                {busy
                  ? "Đang trả lời…"
                  : listening
                    ? "Xem lại lời nói rồi bấm gửi"
                    : "Enter để gửi"}
              </span>
              <button
                className="send"
                disabled={
                  switching ||
                  (archived && !conversation) ||
                  loading ||
                  (!busy && !input.trim())
                }
                aria-label={busy ? "Dừng trả lời" : "Gửi tin nhắn"}
              >
                {busy ? <Square size={15} /> : <ArrowUp size={19} />}
              </button>
            </div>
          </form>
        )}
        <footer className="chat-foot">
          <span>
            <i className="dot" />
            Hội thoại được lưu vào tài khoản
          </span>
          <button onClick={() => play()}>Thử giọng rồng ↗</button>
        </footer>
      </section>
      <dialog id="rename">
        <form onSubmit={editTitle}>
          <h2>Đổi tên câu chuyện</h2>
          <label>
            Tên hội thoại
            <input
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              required
              maxLength={100}
            />
          </label>
          <div className="form-actions">
            <button
              type="button"
              className="btn"
              onClick={() => {
                document.getElementById("rename").close();
              }}
            >
              Hủy
            </button>
            <button className="btn primary">Lưu tên</button>
          </div>
        </form>
      </dialog>
    </main>
  );
}
