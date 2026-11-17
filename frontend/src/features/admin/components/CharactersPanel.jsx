import { useState, useRef, useEffect } from "react";
import { Upload, Check, Trash2, Box } from "lucide-react";
import Avatar from "../../../components/DragonAvatar.jsx";
import { write } from "../../../services/api.js";

export default function CharactersPanel({ data, me, notify, onSaved }) {
  const [items, setItems] = useState(data.items);
  const [selected, setSelected] = useState(data.activeId);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [name, setName] = useState("");
  const [file, setFile] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const request = useRef(null);
  useEffect(() => () => request.current?.abort(), []);
  const model = items.find((item) => item.id === selected) || items[0];
  async function upload(event) {
    event.preventDefault();
    if (!file) return;
    if (
      !file.name.toLowerCase().endsWith(".glb") ||
      file.size > 100 * 1024 * 1024
    ) {
      notify("Chọn file .glb tối đa 100 MB.");
      return;
    }
    setBusy(true);
    setProgress(0);
    const form = event.currentTarget;
    const xhr = new XMLHttpRequest();
    request.current = xhr;
    xhr.open(
      "POST",
      "/api/admin/characters?name=" +
        encodeURIComponent(name.trim() || file.name.replace(/\.glb$/i, "")),
    );
    xhr.setRequestHeader("X-CSRF-Token", me.csrf);
    xhr.setRequestHeader("Content-Type", "model/gltf-binary");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable)
        setProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      setBusy(false);
      request.current = null;
      let result;
      try {
        result = JSON.parse(xhr.responseText);
      } catch {
        notify("Máy chủ trả về dữ liệu chưa hợp lệ.");
        return;
      }
      if (xhr.status !== 201) {
        notify(result.error || "Chưa tải được mô hình.");
        return;
      }
      setItems((current) => [result, ...current]);
      setSelected(result.id);
      form.reset();
      setFile(null);
      setName("");
      notify("Đã tải mô hình. Xem thử rồi bấm Áp dụng cho người dùng.");
    };
    xhr.onerror = () => {
      setBusy(false);
      notify("Mất kết nối khi tải mô hình. Thử lại.");
    };
    xhr.onabort = () => {
      request.current = null;
    };
    xhr.send(file);
  }
  async function action(path, method, payload = {}) {
    setBusy(true);
    try {
      await write(path, payload, me.csrf, method);
      setConfirmDelete(false);
      onSaved();
      notify(
        method === "DELETE"
          ? "Đã xóa mô hình."
          : "Đã áp dụng nhân vật. Trang trò chuyện sẽ tải nhân vật này.",
      );
    } catch (error) {
      notify(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="character-manager">
      <div className="character-library">
        <form className="panel character-upload" onSubmit={upload}>
          <span className="eyebrow">THÊM NGƯỜI BẠN MỚI</span>
          <h2>Tải nhân vật 3D</h2>
          <p>GLB 2.0 · tối đa 100 MB · texture nhúng trong file.</p>
          <label>
            Tên nhân vật
            <input
              maxLength={80}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ví dụ: Rồng nhỏ"
              disabled={busy}
            />
          </label>
          <label className="model-file">
            <Upload size={24} />
            <strong>{file?.name || "Chọn mô hình .glb"}</strong>
            <span>
              {file
                ? (file.size / 1048576).toFixed(1) + " MB"
                : "Từ máy tính của bạn"}
            </span>
            <input
              aria-label="File mô hình GLB"
              type="file"
              accept=".glb"
              disabled={busy}
              onChange={(event) => setFile(event.target.files[0] || null)}
            />
          </label>
          {busy && progress > 0 && (
            <>
              <progress max={100} value={progress} />
              <small>
                {progress === 100
                  ? "Đang kiểm tra mô hình…"
                  : `Đang tải ${progress}%`}
              </small>
            </>
          )}
          <button className="btn primary full" disabled={busy || !file}>
            <Upload size={16} />
            {busy ? "Đang xử lý…" : "Tải lên thư viện"}
          </button>
        </form>
        <section className="panel">
          <h2>Thư viện nhân vật</h2>
          <div className="model-list">
            {items.map((item) => (
              <button
                className={
                  "model-option " + (item.id === model.id ? "selected" : "")
                }
                key={item.id}
                disabled={busy}
                onClick={() => {
                  setSelected(item.id);
                  setConfirmDelete(false);
                }}
              >
                <Box size={20} />
                <span>
                  <strong>{item.name}</strong>
                  <small>
                    {item.builtin
                      ? "Nhân vật mặc định"
                      : (item.bytes / 1048576).toFixed(1) + " MB"}
                  </small>
                </span>
                {item.id === data.activeId && (
                  <span className="badge green">Đang dùng</span>
                )}
              </button>
            ))}
          </div>
        </section>
      </div>
      <section className="character-preview">
        <Avatar key={model.id} model={model} />
        <div className="panel">
          <span className="eyebrow">XEM TRƯỚC</span>
          <h2>{model.name}</h2>
          <p>
            GLB có thể chứa animation. Khẩu hình chỉ hoạt động khi mô hình có
            các morph target tương thích; tải file lên không tự tạo khẩu hình.
          </p>
          <div className="model-actions">
            <button
              className="btn primary"
              disabled={busy || model.id === data.activeId}
              onClick={() =>
                action("admin/characters/active", "PATCH", { id: model.id })
              }
            >
              <Check size={16} />
              {model.id === data.activeId
                ? "Đang được sử dụng"
                : "Áp dụng cho người dùng"}
            </button>
            {!model.builtin && model.id !== data.activeId && (
              <button
                className="btn"
                disabled={busy}
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 size={16} />
                Xóa
              </button>
            )}
          </div>
          {confirmDelete && (
            <div className="form-error">
              Xóa mô hình “{model.name}” khỏi thư viện?
              <div className="model-actions">
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() =>
                    action("admin/characters/" + model.id, "DELETE")
                  }
                >
                  Xác nhận xóa
                </button>
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() => setConfirmDelete(false)}
                >
                  Hủy
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
