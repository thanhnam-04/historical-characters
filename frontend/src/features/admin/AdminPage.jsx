import CharactersPanel from "./components/CharactersPanel.jsx";
import AdminDialogs from "./components/AdminDialogs.jsx";
import OverviewPanel from "./components/OverviewPanel.jsx";
import UsersPanel from "./components/UsersPanel.jsx";
import ConversationsPanel from "./components/ConversationsPanel.jsx";
import AuditPanel from "./components/AuditPanel.jsx";
import AIConfigForm from "./components/AIConfigForm.jsx";
import { useEffect, useRef, useState } from "react";
import { Plus, Settings, LoaderCircle, AlertCircle } from "lucide-react";
import { api, write } from "../../services/api.js";
import {
  adminResourceKey,
  loadedAdminResource,
  selectAdminResource,
} from "../../utils/adminResource.js";
import { useModalFocus } from "../../hooks/useModalFocus.js";

export default function Admin({ tab, me, notify, onNavigate, refreshMe }) {
  const [resource, setResource] = useState(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [editUser, setEditUser] = useState(null);
  const [invite, setInvite] = useState(false);
  const [resetLink, setResetLink] = useState("");
  const [view, setView] = useState(null);
  const [busy, setBusy] = useState(false);
  const reload = () => setRefresh((x) => x + 1);
  const inspectEpoch = useRef(0);
  const closeModal = () => {
    inspectEpoch.current++;
    setInvite(false);
    setEditUser(null);
    setResetLink("");
    setView(null);
  };
  const modalRef = useModalFocus(
    !!(invite || editUser || resetLink || view),
    closeModal,
  );
  const requestKey = adminResourceKey(tab, query, offset, refresh);
  const { data, loading, error } = selectAdminResource(resource, requestKey);
  useEffect(() => {
    setSearch("");
    setQuery("");
    setOffset(0);
    closeModal();
    return () => {
      inspectEpoch.current++;
    };
  }, [tab]);
  useEffect(() => {
    const controller = new AbortController();
    setResource({
      key: requestKey,
      status: "loading",
      data: null,
      error: null,
    });
    const suffix =
      "?offset=" +
      offset +
      (tab === "users" || tab === "conversations"
        ? "&q=" + encodeURIComponent(query)
        : "");
    api("admin/" + tab + suffix, { signal: controller.signal })
      .then((payload) => {
        if (!controller.signal.aborted)
          setResource(loadedAdminResource(requestKey, tab, payload));
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setResource({
            key: requestKey,
            status: "error",
            data: null,
            error: cause.message,
          });
          notify(cause.message);
        }
      });
    return () => controller.abort();
  }, [requestKey, tab, query, offset]);
  async function perform(action) {
    setBusy(true);
    try {
      await action();
      reload();
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function createUser(e) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await perform(async () => {
      const r = await write(
        "admin/users",
        { name: f.get("name"), email: f.get("email"), role: f.get("role") },
        me.csrf,
      );
      setInvite(false);
      if (r.resetPath) setResetLink(location.origin + r.resetPath);
      notify("Đã tạo người dùng. Gửi link đặt mật khẩu cho người nhận.");
    });
  }
  async function saveUser(e) {
    e.preventDefault();
    if (!editUser) return;
    const f = new FormData(e.currentTarget);
    await perform(async () => {
      await write(
        "admin/users/" + editUser.id,
        {
          role: f.get("role"),
          status: f.get("status"),
          quota: Number(f.get("quota")),
        },
        me.csrf,
        "PATCH",
      );
      setEditUser(null);
      notify("Đã cập nhật tài khoản.");
      await refreshMe();
    });
  }
  async function resetUser(id) {
    await perform(async () => {
      const r = await write("admin/users/" + id + "/reset", {}, me.csrf);
      setResetLink(location.origin + r.resetPath);
    });
  }
  async function inspect(id) {
    const token = ++inspectEpoch.current;
    await perform(async () => {
      const result = await api("admin/conversations/" + id);
      if (token === inspectEpoch.current) setView(result);
    });
  }
  async function loadReviewOlder() {
    if (!view?.hasMore || !view.before) return;
    const token = inspectEpoch.current;
    const current = view;
    await perform(async () => {
      const result = await api(
        "admin/conversations/" +
          current.conversation.id +
          "?before=" +
          encodeURIComponent(current.before),
      );
      if (token === inspectEpoch.current)
        setView({
          ...result,
          messages: [...result.messages, ...current.messages],
        });
    });
  }
  const heading =
    {
      overview: [
        "TOÀN CẢNH KHÔNG GIAN",
        "Chào ngày mới, " + me.user.name.split(" ").slice(-1)[0] + ".",
        "Một góc nhìn rõ ràng về Long Vân và những người bạn.",
      ],
      users: [
        "NHỮNG NGƯỜI BẠN",
        "Quản lý người dùng.",
        "Tài khoản, vai trò và hạn mức sử dụng trong cùng một nơi.",
      ],
      conversations: [
        "NHỮNG CÂU CHUYỆN",
        "Hội thoại của hệ thống.",
        "Tra cứu để hỗ trợ người dùng. Mỗi lần xem nội dung được ghi nhật ký.",
      ],
      config: [
        "BỘ NÃO & GIỌNG NÓI",
        "Cấu hình Long Vân.",
        "Chọn cách rồng trò chuyện, giọng đọc và hạn mức sử dụng.",
      ],
      characters: [
        "THƯ VIỆN MÔ HÌNH",
        "Nhân vật 3D.",
        "Tải lên, xem thử và chọn nhân vật cho không gian trò chuyện.",
      ],
      audit: [
        "DẤU VẾT THAY ĐỔI",
        "Nhật ký quản trị.",
        "Ai đã làm gì, vào lúc nào.",
      ],
    }[tab] || [];
  return (
    <main className="dashboard">
      <div className="page-heading">
        <div>
          <span className="eyebrow">{heading[0]}</span>
          <h1>{heading[1]}</h1>
          <p>{heading[2]}</p>
        </div>
        {tab === "users" ? (
          <button className="btn primary" onClick={() => setInvite(true)}>
            <Plus size={16} />
            Thêm người dùng
          </button>
        ) : tab === "overview" ? (
          <button className="btn" onClick={() => onNavigate("config")}>
            <Settings size={15} />
            Cấu hình AI
          </button>
        ) : null}
      </div>
      {loading ? (
        <div className="panel empty">
          <LoaderCircle className="spin" />
          Đang tải dữ liệu…
        </div>
      ) : !data ? (
        <div className="panel empty">
          <AlertCircle />
          <p role="alert">{error || "Chưa tải được dữ liệu."}</p>
          <button className="btn" onClick={reload}>
            Thử lại
          </button>
        </div>
      ) : tab === "overview" ? (
        <OverviewPanel data={data} onNavigate={onNavigate} />
      ) : tab === "config" ? (
        <AIConfigForm
          data={data}
          me={me}
          notify={notify}
          refreshMe={refreshMe}
          onSaved={reload}
        />
      ) : tab === "characters" ? (
        <CharactersPanel data={data} me={me} notify={notify} onSaved={reload} />
      ) : tab === "users" ? (
        <UsersPanel
          data={data}
          search={search}
          setSearch={setSearch}
          setQuery={setQuery}
          offset={offset}
          setOffset={setOffset}
          setEditUser={setEditUser}
        />
      ) : tab === "conversations" ? (
        <ConversationsPanel
          data={data}
          search={search}
          setSearch={setSearch}
          setQuery={setQuery}
          setOffset={setOffset}
          busy={busy}
          inspect={inspect}
        />
      ) : (
        <AuditPanel data={data} />
      )}
      {!loading && data && ["conversations", "audit"].includes(tab) && (
        <div className="table-footer">
          <span>Trang {Math.floor(offset / 50) + 1}</span>
          <div>
            <button
              className="btn small"
              disabled={!offset}
              onClick={() => setOffset(Math.max(0, offset - 50))}
            >
              Trang trước
            </button>
            <button
              className="btn small"
              disabled={!data.hasMore}
              onClick={() => setOffset(offset + 50)}
            >
              Trang sau
            </button>
          </div>
        </div>
      )}
      {(invite || editUser || resetLink || view) && (
        <AdminDialogs
          modalRef={modalRef}
          view={view}
          invite={invite}
          editUser={editUser}
          resetLink={resetLink}
          me={me}
          data={data}
          busy={busy}
          closeModal={closeModal}
          createUser={createUser}
          saveUser={saveUser}
          resetUser={resetUser}
          perform={perform}
          loadReviewOlder={loadReviewOlder}
          notify={notify}
        />
      )}
    </main>
  );
}
