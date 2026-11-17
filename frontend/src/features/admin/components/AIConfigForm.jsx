import { GptPicker, VoicePicker } from "./ModelVoicePicker.jsx";
import { useEffect, useRef, useState } from "react";
import { ShieldCheck, LoaderCircle, Check, AlertCircle } from "lucide-react";
import { api, write } from "../../../services/api.js";
import { VoicePlayer } from "../../chat/voicePlayer.js";
import { validAdminData } from "../../../utils/adminResource.js";

export default function AIConfigForm({ data, me, notify, refreshMe, onSaved }) {
  const [models, setModels] = useState([]);
  const [busy, setBusy] = useState(false);
  const [clear, setClear] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [modelError, setModelError] = useState("");
  const [modelRevision, setModelRevision] = useState(0);
  const [checking, setChecking] = useState(false);
  const [ttsModel, setTtsModel] = useState(data?.config?.ttsModel || "");
  const [freeOnly, setFreeOnly] = useState(data.config.freeOnly);
  const [chatModel, setChatModel] = useState(data.config.chatModel);
  const [ttsVoice, setTtsVoice] = useState(data.config.ttsVoice);
  useEffect(() => {
    const controller = new AbortController();
    setModelError("");
    api("admin/models?include_paid=true", { signal: controller.signal })
      .then((d) => {
        if (!Array.isArray(d.items))
          throw new Error("Danh sách model chưa hợp lệ.");
        if (!controller.signal.aborted)
          setModels(
            d.items.filter(
              (model) =>
                typeof model.id === "string" && Array.isArray(model.output),
            ),
          );
      })
      .catch((e) => {
        if (!controller.signal.aborted) setModelError(e.message);
      });
    return () => controller.abort();
  }, [modelRevision]);
  async function checkConnection() {
    setChecking(true);
    try {
      const result = await api("admin/connection");
      notify(result.message);
    } catch (e) {
      notify(e.message);
    } finally {
      setChecking(false);
    }
  }
  async function save(e) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const form = e.currentTarget;
    const c = {};
    for (const k of [
      "appName",
      "welcome",
      "chatModel",
      "ttsModel",
      "ttsVoice",
      "ttsEngine",
      "systemPrompt",
    ])
      c[k] = f.get(k);
    for (const k of ["dailyQuota", "maxTokens"]) c[k] = Number(f.get(k));
    for (const k of ["registrationOpen", "ttsEnabled", "freeOnly"])
      c[k] = f.get(k) === "on";
    setBusy(true);
    try {
      await write(
        "admin/config",
        { config: c, apiKey: f.get("apiKey"), clearKey: clear },
        me.csrf,
        "PATCH",
      );
      form.elements.namedItem("apiKey").value = "";
      setClear(false);
      await refreshMe();
      notify("Đã lưu cấu hình. Các yêu cầu mới sẽ dùng thiết lập này.");
      onSaved();
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  }
  const player = useRef(null);
  useEffect(() => {
    const instance = new VoicePlayer(null, setTestBusy);
    player.current = instance;
    return () => {
      instance.dispose();
      if (player.current === instance) player.current = null;
    };
  }, []);
  async function test() {
    if (testBusy) {
      player.current?.stop();
      return;
    }
    try {
      await player.current?.play({
        text: "Xin chào! Mình là Long Vân, người bạn rồng của bạn.",
        sample: true,
        engine: data.config.ttsEngine,
        csrf: me.csrf,
      });
      await refreshMe();
    } catch (e) {
      notify(e.message);
    }
  }
  if (!validAdminData("config", data))
    return (
      <div className="panel empty" role="alert">
        <AlertCircle />
        <p>Chưa tải được cấu hình AI hợp lệ.</p>
        <button className="btn" onClick={onSaved}>
          Thử lại
        </button>
      </div>
    );
  return (
    <form className="settings-grid" onSubmit={save}>
      <div>
        <section className="panel">
          <div className="panel-heading">
            <h2>Kết nối OpenRouter</h2>
            <span className={"badge " + (data.keyConfigured ? "green" : "")}>
              {data.keyConfigured ? "Đã có key trên server" : "Chưa kết nối"}
            </span>
          </div>
          <p className="panel-description">
            Người dùng sử dụng chung cấu hình này. Key được mã hóa trong
            database và không trả về trình duyệt.
          </p>
          <label>
            {data.keyConfigured
              ? "Thay API key (để trống để giữ nguyên)"
              : "OpenRouter API key"}
            <input
              type="password"
              name="apiKey"
              autoComplete="new-password"
              placeholder="sk-or-v1-…"
              maxLength={512}
              disabled={clear}
            />
          </label>
          <button
            type="button"
            className="btn small"
            disabled={checking || !data.keyConfigured}
            onClick={checkConnection}
          >
            {checking ? "Đang kiểm tra…" : "Kiểm tra kết nối"}
          </button>
          <a
            className="field-link"
            href="https://openrouter.ai/settings/keys"
            target="_blank"
            rel="noreferrer"
          >
            Tạo key trên OpenRouter ↗
          </a>
          {data.keyConfigured && data.keySource !== "environment" && (
            <label className="check-line danger">
              <input
                type="checkbox"
                checked={clear}
                onChange={(e) => setClear(e.target.checked)}
              />
              Xóa key đã lưu khi bấm Lưu cấu hình
            </label>
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>Cách Long Vân trò chuyện</h2>
          </div>
          {modelError && (
            <div className="form-error" role="alert">
              {modelError}
              <button
                type="button"
                className="text-button"
                onClick={() => setModelRevision((n) => n + 1)}
              >
                Tải lại danh sách
              </button>
            </div>
          )}
          <GptPicker
            models={models}
            freeOnly={freeOnly}
            value={chatModel}
            onChange={setChatModel}
          />
          <label>
            Model chat
            <input
              name="chatModel"
              value={chatModel}
              onChange={(event) => setChatModel(event.target.value)}
              list="chat-models"
              required
              maxLength={160}
            />
          </label>
          <datalist id="chat-models">
            <option value="openrouter/free" />
            {models
              .filter((m) => m.output.includes("text") && (!freeOnly || m.free))
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
          </datalist>
          <label>
            Hướng dẫn dành cho AI
            <textarea
              name="systemPrompt"
              rows={7}
              defaultValue={data.config.systemPrompt}
              required
              maxLength={6000}
            />
          </label>
          <label>
            Độ dài tối đa (token)
            <input
              name="maxTokens"
              type="number"
              min={50}
              max={2000}
              defaultValue={data.config.maxTokens}
              required
            />
          </label>
          <label className="check-line">
            <input
              name="freeOnly"
              type="checkbox"
              checked={freeOnly}
              onChange={(event) => setFreeOnly(event.target.checked)}
            />
            Chỉ cho phép model miễn phí
          </label>
          <p className="field-help">
            Không tự chuyển sang model trả phí khi gặp lỗi hoặc hết lượt.
          </p>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>Giọng nói</h2>
            <button
              type="button"
              className="text-button"
              onClick={test}
              disabled={
                !data.config.ttsEnabled ||
                data.config.ttsEngine === "off" ||
                (!data.keyConfigured && data.config.ttsEngine === "openrouter")
              }
            >
              {testBusy ? "Dừng giọng mẫu" : "Thử giọng đã lưu ↗"}
            </button>
          </div>
          <label className="check-line">
            <input
              name="ttsEnabled"
              type="checkbox"
              defaultChecked={data.config.ttsEnabled}
            />
            Cho phép đọc câu trả lời
          </label>
          <label>
            Nguồn giọng đọc
            <select name="ttsEngine" defaultValue={data.config.ttsEngine}>
              <option value="openrouter">OpenRouter TTS</option>
              <option value="browser">Giọng tiếng Việt của trình duyệt</option>
              <option value="off">Tắt giọng đọc</option>
            </select>
          </label>
          <VoicePicker
            models={models}
            freeOnly={freeOnly}
            model={ttsModel}
            voice={ttsVoice}
            onModel={setTtsModel}
            onVoice={setTtsVoice}
          />
          <p className="field-help">
            Chất lượng tiếng Việt phụ thuộc model và giọng. Hãy thử nghe trước
            khi dùng cho người dùng.
          </p>
        </section>
      </div>
      <div>
        <section className="panel">
          <div className="panel-heading">
            <h2>Không gian người dùng</h2>
          </div>
          <label>
            Tên ứng dụng
            <input
              name="appName"
              defaultValue={data.config.appName}
              required
              maxLength={80}
            />
          </label>
          <label>
            Lời chào
            <textarea
              name="welcome"
              defaultValue={data.config.welcome}
              rows={3}
              maxLength={400}
            />
          </label>
          <label>
            Hạn mức/ngày cho tài khoản mới
            <input
              name="dailyQuota"
              type="number"
              min={1}
              max={10000}
              defaultValue={data.config.dailyQuota}
              required
            />
          </label>
          <p className="field-help">
            Tài khoản hiện có giữ hạn mức riêng. Điều chỉnh ở mục Người dùng.
          </p>
          <label className="check-line">
            <input
              name="registrationOpen"
              type="checkbox"
              defaultChecked={data.config.registrationOpen}
            />
            Mở đăng ký người dùng mới
          </label>
        </section>
        <section className="panel settings-save">
          <ShieldCheck size={22} />
          <h3>Cấu hình được áp dụng từ server.</h3>
          <p>User không thể tự đổi model, nâng hạn mức hoặc xem API key.</p>
          <button className="btn primary full" disabled={busy}>
            {busy ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <Check size={16} />
            )}
            Lưu cấu hình
          </button>
        </section>
      </div>
    </form>
  );
}
