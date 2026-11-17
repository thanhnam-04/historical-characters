export function GptPicker({ models, freeOnly, value, onChange }) {
  const gpts = models.filter(
    (model) =>
      model.id.startsWith("openai/gpt-") &&
      model.output.includes("text") &&
      !model.id.includes(":batch") &&
      !model.output.includes("image"),
  );
  return (
    <div className="model-picker">
      <label>
        Chọn nhanh GPT
        <select
          aria-label="Chọn model GPT"
          disabled={freeOnly}
          value={gpts.some((model) => model.id === value) ? value : ""}
          onChange={(event) => {
            if (event.target.value) onChange(event.target.value);
          }}
        >
          <option value="">Chọn một model GPT…</option>
          {gpts.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name} · Có phí
            </option>
          ))}
        </select>
      </label>
      <p className="field-help">
        {freeOnly
          ? "Bỏ chọn “Chỉ cho phép model miễn phí” bên dưới để chọn GPT."
          : "GPT dùng số dư OpenRouter của admin. Chọn model rồi bấm Lưu cấu hình."}
      </p>
    </div>
  );
}

export function VoicePicker({
  models,
  freeOnly,
  model,
  voice,
  onModel,
  onVoice,
}) {
  const speech = models.filter((item) => item.output.includes("speech"));
  const visible = speech.filter((item) => !freeOnly || item.free);
  const selected = speech.find((item) => item.id === model);
  const voices = selected?.voices || [];
  const gemini =
    speech.find((item) => item.id === "google/gemini-3.8-flash-tts") ||
    speech.find((item) => item.id === "google/gemini-3.1-flash-tts-preview");
  const suggestions = [
    ["Sulafat", "Ấm áp"],
    ["Aoede", "Nhẹ nhàng"],
    ["Puck", "Tươi vui"],
  ];
  function chooseModel(id) {
    onModel(id);
    onVoice("");
  }
  return (
    <>
      <label>
        Model giọng đọc
        <select
          name="ttsModel"
          aria-label="Model giọng đọc"
          value={model}
          onChange={(event) => chooseModel(event.target.value)}
        >
          <option value="">Chọn model TTS…</option>
          {!visible.some((item) => item.id === model) && model && (
            <option value={model}>{model} · Đang lưu</option>
          )}
          {visible.map((item) => (
            <option value={item.id} key={item.id}>
              {item.name} · {item.free ? "Miễn phí" : "Có phí"}
            </option>
          ))}
        </select>
      </label>
      <label>
        Giọng đọc
        <select
          name="ttsVoice"
          aria-label="Giọng đọc"
          value={voice}
          onChange={(event) => onVoice(event.target.value)}
        >
          <option value="">Giọng mặc định của model</option>
          {voice && !voices.includes(voice) && (
            <option value={voice}>{voice} · Đang lưu</option>
          )}
          {voices.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>
      {gemini && (
        <div className="voice-suggestions">
          <span className="eyebrow">GỢI Ý NGHE THỬ · GEMINI TTS · CÓ PHÍ</span>
          <div className="model-actions">
            {suggestions
              .filter(([id]) => gemini.voices.includes(id))
              .map(([id, label]) => (
                <button
                  type="button"
                  className="btn small"
                  key={id}
                  disabled={freeOnly}
                  onClick={() => {
                    onModel(gemini.id);
                    onVoice(id);
                  }}
                >
                  {id} · {label}
                </button>
              ))}
          </div>
          <p className="field-help">
            Hỗ trợ tiếng Việt.{" "}
            {freeOnly
              ? "Tắt chế độ chỉ miễn phí để chọn các giọng này."
              : "Lưu cấu hình rồi bấm Thử giọng đã lưu để so sánh."}{" "}
            <a
              href="https://ai.google.dev/gemini-api/docs/speech-generation"
              target="_blank"
              rel="noreferrer"
            >
              Thông tin giọng
            </a>
          </p>
        </div>
      )}
      {freeOnly && (
        <p className="field-help">
          Ưu tiên miễn phí: Fish Audio hoặc HeyGen nếu còn trong danh mục. Chất
          lượng và hạn mức phụ thuộc nhà cung cấp.
        </p>
      )}
    </>
  );
}
