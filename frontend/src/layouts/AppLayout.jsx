import { adminNav } from "./navigationItems.js";
import Sidebar from "./Sidebar.jsx";
import { useCallback, useEffect, useRef, useState } from "react";
import { Menu, X, ChevronRight, LoaderCircle } from "lucide-react";
import { api, write } from "../services/api.js";
import Chat from "../features/chat/ChatPage.jsx";
import Admin from "../features/admin/AdminPage.jsx";
import Profile from "../features/profile/ProfilePage.jsx";
import { readRoute, routeUrl } from "../utils/navigation.js";

export default function ConsoleApp({ initialPage }) {
  const [me, setMe] = useState(null);
  const [error, setError] = useState("");
  const [page, setPage] = useState(initialPage);
  const [adminTab, setAdminTab] = useState("overview");
  const [items, setItems] = useState([]);
  const [active, setActive] = useState(null);
  const [archived, setArchived] = useState(false);
  const [side, setSide] = useState(false);
  const [toast, setToast] = useState("");
  const [resetToken, setResetToken] = useState(0);
  const [listMore, setListMore] = useState(false);
  const [listBusy, setListBusy] = useState(false);
  const meRef = useRef(null);
  const activeRef = useRef(null);
  const archiveRef = useRef(false);
  const listEpoch = useRef(0);
  const routeEpoch = useRef(0);
  const notify = useCallback((text) => setToast(text), []);
  const chooseActive = useCallback((conversation) => {
    activeRef.current = conversation;
    setActive(conversation);
  }, []);
  const refreshMe = useCallback(async () => {
    const data = await api("me");
    if (
      !data?.user?.id ||
      !data?.config ||
      typeof data.config.chatModel !== "string"
    )
      throw new Error("Dữ liệu tài khoản chưa hợp lệ. Hãy tải lại trang.");
    meRef.current = data;
    setError("");
    setMe(data);
    if (data.user.role !== "admin")
      setPage((current) => (current === "admin" ? "chat" : current));
    return data;
  }, []);
  const refreshConversations = useCallback(async () => {
    const scope = archiveRef.current;
    const request = ++listEpoch.current;
    setListBusy(true);
    try {
      const data = await api("conversations?archived=" + scope);
      if (request !== listEpoch.current || scope !== archiveRef.current) return;
      setItems(data.items);
      setListMore(!!data.hasMore);
      const selected = activeRef.current;
      const updated = selected && data.items.find((c) => c.id === selected.id);
      if (updated) chooseActive(updated);
    } catch (e) {
      if (request === listEpoch.current) notify(e.message);
    } finally {
      if (request === listEpoch.current) setListBusy(false);
    }
  }, [chooseActive, notify]);
  const refreshAll = useCallback(() => {
    refreshConversations();
    refreshMe().catch((e) => notify(e.message));
  }, [refreshConversations, refreshMe, notify]);
  const updateUrl = useCallback((route, replace = false) => {
    history[replace ? "replaceState" : "pushState"](null, "", routeUrl(route));
  }, []);
  const applyRoute = useCallback(async () => {
    const token = ++routeEpoch.current;
    const route = readRoute(new URL(location.href));
    if (route.page === "admin" && meRef.current?.user.role !== "admin")
      route.page = "chat";
    setPage(route.page);
    setAdminTab(route.adminTab);
    setSide(false);
    if (archiveRef.current !== route.archived) {
      archiveRef.current = route.archived;
      setArchived(route.archived);
      setItems([]);
      setListMore(false);
    }
    if (route.page === "chat") {
      if (route.conversationId) {
        try {
          const data = await api(
            "conversations/" + encodeURIComponent(route.conversationId),
          );
          if (token === routeEpoch.current) {
            const scope = !!data.conversation.deleted_at;
            archiveRef.current = scope;
            setArchived(scope);
            chooseActive(data.conversation);
          }
        } catch (e) {
          if (token === routeEpoch.current) {
            chooseActive(null);
            notify(e.message);
          }
        }
      } else {
        chooseActive(null);
        setResetToken((n) => n + 1);
      }
    }
    if (token === routeEpoch.current) refreshConversations();
  }, [chooseActive, notify, refreshConversations]);
  useEffect(() => {
    let gone = false;
    refreshMe()
      .then(() => {
        if (!gone) applyRoute();
      })
      .catch((e) => {
        if (!gone) {
          if (e.status === 401) location.replace("/login");
          else setError(e.message);
        }
      });
    const pop = () => {
      applyRoute();
    };
    const expired = () => {
      if (meRef.current) location.replace("/login");
    };
    const denied = () => {
      if (meRef.current) refreshMe().catch((e) => setError(e.message));
    };
    window.addEventListener("popstate", pop);
    window.addEventListener("longvan:session-expired", expired);
    window.addEventListener("longvan:access-denied", denied);
    return () => {
      gone = true;
      routeEpoch.current++;
      listEpoch.current++;
      window.removeEventListener("popstate", pop);
      window.removeEventListener("longvan:session-expired", expired);
      window.removeEventListener("longvan:access-denied", denied);
    };
  }, [refreshMe, applyRoute]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 6500);
    return () => clearTimeout(timer);
  }, [toast]);
  const go = (next) => {
    routeEpoch.current++;
    setPage(next);
    setSide(false);
    updateUrl({
      page: next,
      adminTab,
      archived: archiveRef.current,
      conversationId: activeRef.current?.id || null,
    });
  };
  const navigateAdmin = (tab) => {
    setAdminTab(tab);
    setSide(false);
    updateUrl({
      page: "admin",
      adminTab: tab,
      archived: false,
      conversationId: null,
    });
  };
  const openHistory = (scope) => {
    if (scope !== archiveRef.current) {
      archiveRef.current = scope;
      setArchived(scope);
      chooseActive(null);
      setItems([]);
      setListMore(false);
      setResetToken((n) => n + 1);
    }
    setPage("chat");
    setSide(false);
    routeEpoch.current++;
    updateUrl({
      page: "chat",
      adminTab,
      archived: scope,
      conversationId: activeRef.current?.id || null,
    });
    refreshConversations();
  };
  const openConversation = (conversation) => {
    routeEpoch.current++;
    chooseActive(conversation);
    setPage("chat");
    setSide(false);
    updateUrl({
      page: "chat",
      adminTab,
      archived: !!conversation.deleted_at,
      conversationId: conversation.id,
    });
  };
  const newConversation = () => {
    routeEpoch.current++;
    archiveRef.current = false;
    setArchived(false);
    chooseActive(null);
    setResetToken((n) => n + 1);
    setPage("chat");
    setSide(false);
    updateUrl({
      page: "chat",
      adminTab,
      archived: false,
      conversationId: null,
    });
    refreshConversations();
  };
  const createdConversation = (conversation) => {
    chooseActive(conversation);
    setItems((list) => [
      conversation,
      ...list.filter((c) => c.id !== conversation.id),
    ]);
    updateUrl(
      {
        page: "chat",
        adminTab,
        archived: false,
        conversationId: conversation.id,
      },
      true,
    );
  };
  const afterArchive = () => {
    chooseActive(null);
    setResetToken((n) => n + 1);
    updateUrl(
      {
        page: "chat",
        adminTab,
        archived: archiveRef.current,
        conversationId: null,
      },
      true,
    );
    refreshConversations();
  };
  async function loadMore() {
    if (listBusy || !listMore) return;
    const scope = archiveRef.current;
    const token = listEpoch.current;
    setListBusy(true);
    try {
      const data = await api(
        "conversations?archived=" + scope + "&offset=" + items.length,
      );
      if (token !== listEpoch.current || scope !== archiveRef.current) return;
      setItems((list) => [
        ...list,
        ...data.items.filter((c) => !list.some((v) => v.id === c.id)),
      ]);
      setListMore(!!data.hasMore);
    } catch (e) {
      notify(e.message);
    } finally {
      if (token === listEpoch.current) setListBusy(false);
    }
  }
  async function logout() {
    try {
      const data = await write("auth/logout", {}, meRef.current?.csrf || "");
      location.assign(data.redirect);
    } catch (e) {
      notify(e.message);
    }
  }
  if (error)
    return (
      <div className="fatal">
        <span className="brand-mark">龍</span>
        <h1>Chưa vào được không gian của bạn</h1>
        <p>{error}</p>
        <button className="btn primary" onClick={logout}>
          Đăng xuất
        </button>
        <button className="btn" onClick={() => location.reload()}>
          Thử lại
        </button>
      </div>
    );
  if (!me)
    return (
      <div className="fatal">
        <LoaderCircle className="spin" />
        <p>Đang mở không gian Long Vân…</p>
      </div>
    );
  return (
    <div className="app-shell">
      <Sidebar
        side={side}
        setSide={setSide}
        me={me}
        page={page}
        go={go}
        adminTab={adminTab}
        navigateAdmin={navigateAdmin}
        archived={archived}
        newConversation={newConversation}
        openHistory={openHistory}
        items={items}
        active={active}
        openConversation={openConversation}
        listMore={listMore}
        listBusy={listBusy}
        loadMore={loadMore}
        logout={logout}
      />
      {side && (
        <button
          className="sidebar-backdrop"
          aria-label="Đóng menu"
          onClick={() => setSide(false)}
        />
      )}
      <div className="app-content">
        <header className="app-topbar">
          <div className="breadcrumb">
            <button
              className="icon-btn mobile-menu"
              aria-label="Mở menu"
              onClick={() => setSide(true)}
            >
              <Menu size={20} />
            </button>
            <span>
              {page === "admin" ? "Không gian quản trị" : "Không gian của bạn"}
            </span>
            <ChevronRight size={13} />
            <strong>
              {page === "admin"
                ? adminNav.find((n) => n.id === adminTab)?.label
                : page === "profile"
                  ? "Hồ sơ"
                  : archived
                    ? "Đã lưu trữ"
                    : "Trò chuyện"}
            </strong>
          </div>
          <div className="topbar-right">
            <span
              className={"connection-pill " + (me.config.ready ? "ready" : "")}
            >
              <i />
              {me.config.ready ? "AI đã kết nối" : "Chưa kết nối AI"}
            </span>
            <button
              className="initials small"
              title="Hồ sơ"
              onClick={() => go("profile")}
            >
              {me.user.name.slice(0, 1).toUpperCase()}
            </button>
          </div>
        </header>
        {page === "chat" ? (
          <Chat
            resetToken={resetToken}
            me={me}
            conversation={active}
            archived={archived}
            notify={notify}
            onCreate={createdConversation}
            onRefresh={refreshAll}
            onArchived={afterArchive}
          />
        ) : page === "admin" ? (
          <Admin
            key={adminTab}
            tab={adminTab}
            me={me}
            notify={notify}
            onNavigate={navigateAdmin}
            refreshMe={refreshMe}
          />
        ) : (
          <Profile me={me} notify={notify} refreshMe={refreshMe} />
        )}
      </div>
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button onClick={() => setToast("")} aria-label="Đóng thông báo">
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
