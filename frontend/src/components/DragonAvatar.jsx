import { useEffect, useRef, useState } from "react";
import { Focus, Play, Info, Maximize, RotateCcw } from "lucide-react";
import { api } from "../services/api.js";

export default function Avatar({ onReady, model = null }) {
  const stage = useRef(null),
    host = useRef(null),
    instance = useRef(null),
    callback = useRef(onReady);
  callback.current = onReady;
  const [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0),
    [motion, setMotion] = useState(false);
  const [character, setCharacter] = useState(model);
  useEffect(() => {
    const controller = new AbortController();
    let gone = false;
    setReady(false);
    setError("");
    setMotion(false);
    async function load() {
      try {
        const selected =
          model || (await api("character", { signal: controller.signal }));
        if (gone) return;
        setCharacter(selected);
        const moduleUrl = new URL(
          "/dragon/avatar.js?v=characters-v1",
          window.location.href,
        ).href;
        const { DragonAvatar } = await import(/* @vite-ignore */ moduleUrl);
        if (gone) return;
        const avatar = new DragonAvatar({
          host: host.current,
          modelUrl: selected.url,
          name: selected.name,
          builtin: selected.id === "default",
          onLoaded: () => {
            if (!gone) setReady(true);
          },
          onError: () => {
            if (!gone)
              setError(
                "Chưa hiển thị được mô hình. Kiểm tra file hoặc thử lại.",
              );
          },
        });
        instance.current = avatar;
        callback.current?.(avatar);
      } catch (cause) {
        if (!gone)
          setError(cause.message || "Thiết bị chưa hỗ trợ hiển thị 3D.");
      }
    }
    load();
    return () => {
      gone = true;
      controller.abort();
      callback.current?.(null);
      instance.current?.destroy();
      instance.current = null;
    };
  }, [model, revision]);
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stage.current.requestFullscreen();
    } catch {
      setError("Trình duyệt chưa cho phép toàn màn hình.");
    }
  }
  return (
    <section
      ref={stage}
      className={
        "dragon-stage character-stage " + (model ? "preview-stage" : "")
      }
      aria-label="Nhân vật 3D"
    >
      <div className="character-stage-heading">
        <span className="eyebrow">KHÔNG GIAN NHÂN VẬT</span>
        <h1>
          {character?.name || "Long Vân"}
          <span> ✦</span>
        </h1>
        <p>Một người bạn, luôn ở đây lắng nghe.</p>
      </div>
      <div className="character-floor" aria-hidden="true" />
      <div id="view" ref={host} />
      <div className="loading" id="loading" hidden={ready || !!error}>
        <span className="loader" />
        <strong id="loadingText">Đang tải nhân vật…</strong>
        <small>Bạn vẫn có thể chat trong lúc chờ.</small>
        <progress id="loadProgress" max={100} value={0} />
      </div>
      {error && (
        <div className="character-error" role="alert">
          <p>{error}</p>
          <button
            className="btn"
            onClick={() => setRevision((value) => value + 1)}
          >
            Thử lại mô hình
          </button>
        </div>
      )}
      <div className="stage-tools">
        <button
          className="icon-btn"
          disabled={!ready}
          title="Đổi góc nhìn"
          aria-label="Đổi góc nhìn"
          onClick={() => instance.current?.toggleCamera()}
        >
          <Focus size={18} />
        </button>
        <button
          className="icon-btn"
          disabled={!ready}
          title="Đặt lại góc nhìn"
          aria-label="Đặt lại góc nhìn"
          onClick={() => instance.current?.viewBody()}
        >
          <RotateCcw size={17} />
        </button>
        <button
          className="icon-btn"
          disabled={!ready}
          aria-label="Bật tắt chuyển động"
          title="Bật/tắt chuyển động"
          aria-pressed={motion}
          onClick={() => setMotion(!!instance.current?.toggleMotion())}
        >
          <Play size={17} />
        </button>
        <button
          className="icon-btn"
          title="Toàn màn hình"
          aria-label="Toàn màn hình"
          onClick={fullscreen}
        >
          <Maximize size={17} />
        </button>
      </div>
      <div className="avatar-caption">
        <i className="dot" />
        <span id="avatarState">Đang tải mô hình</span>
        <span className="divider" />
        <span id="mouthLabel">Nhân vật 3D tương tác</span>
      </div>
      <div className="stage-footer">
        <span>Kéo để xoay · Cuộn để thu phóng</span>
        <button
          onClick={() => stage.current.querySelector("dialog").showModal()}
        >
          <Info size={12} />
          Thông tin nhân vật
        </button>
      </div>
      <dialog>
        <h2>{character?.name || "Nhân vật 3D"}</h2>
        {character?.id === "default" ? (
          <p>
            Dragon Character 3D của OSCAR CREATIVO ·{" "}
            <a
              href="https://creativecommons.org/licenses/by-nc/4.0/"
              target="_blank"
              rel="noreferrer"
            >
              CC BY-NC 4.0
            </a>
            , dành cho mục đích phi thương mại. Bản đã giảm dung lượng và bổ
            sung khẩu hình.
          </p>
        ) : (
          <p>
            Mô hình do quản trị viên tải lên. Người tải chịu trách nhiệm về
            quyền sử dụng tài sản.
          </p>
        )}
        <p>
          Khẩu hình phụ thuộc morph target có trong mô hình. Việc tải lên không
          tự tạo khẩu hình. Nội dung chat và TTS được gửi đến OpenRouter; admin
          có thể xem hội thoại và thao tác được ghi nhật ký.
        </p>
        <button
          className="btn primary"
          onClick={() => stage.current.querySelector("dialog").close()}
        >
          Đóng
        </button>
      </dialog>
    </section>
  );
}
