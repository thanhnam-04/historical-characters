export const date = (t) =>
  new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(t);
export async function api(path, options = {}, csrf = "") {
  const headers = new Headers(options.headers);
  if (options.body) headers.set("Content-Type", "application/json");
  if (csrf) headers.set("X-CSRF-Token", csrf);
  const controller = new AbortController();
  const forwardAbort = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) forwardAbort();
  else options.signal?.addEventListener("abort", forwardAbort, { once: true });
  const timer = setTimeout(
    () => controller.abort(new Error("Kết nối quá lâu. Hãy thử lại.")),
    25000,
  );
  try {
    const res = await fetch("/api/" + path, {
      ...options,
      headers,
      credentials: "same-origin",
      signal: controller.signal,
    });
    let data;
    try {
      data = await res.json();
    } catch {
      throw new Error("Máy chủ trả về dữ liệu chưa hợp lệ. Hãy thử tải lại.");
    }
    if (!res.ok) {
      if (
        typeof window !== "undefined" &&
        typeof window.dispatchEvent === "function" &&
        !path.startsWith("auth/") &&
        path !== "me"
      ) {
        if (res.status === 401)
          window.dispatchEvent(new Event("longvan:session-expired"));
        if (res.status === 403)
          window.dispatchEvent(new Event("longvan:access-denied"));
      }
      throw Object.assign(
        new Error(
          typeof data?.error === "string"
            ? data.error
            : "Yêu cầu không thành công.",
        ),
        { status: res.status },
      );
    }
    return data;
  } catch (error) {
    if (options.signal?.aborted) throw error;
    if (controller.signal.aborted)
      throw new Error("Kết nối quá lâu. Hãy thử lại.");
    if (error instanceof TypeError)
      throw new Error("Chưa kết nối được máy chủ. Kiểm tra mạng rồi thử lại.");
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", forwardAbort);
  }
}
export const write = (path, data, csrf, method = "POST") =>
  api(path, { method, body: JSON.stringify(data) }, csrf);
