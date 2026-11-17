const tabs = [
  "overview",
  "users",
  "conversations",
  "config",
  "characters",
  "audit",
];
export function readRoute(url) {
  const section = url.searchParams.get("section") || "overview";
  const view = url.searchParams.get("view");
  return {
    page:
      url.pathname === "/admin"
        ? "admin"
        : view === "profile"
          ? "profile"
          : "chat",
    adminTab: tabs.includes(section) ? section : "overview",
    archived: view === "archived",
    conversationId: url.searchParams.get("conversation") || null,
  };
}
export function routeUrl(route) {
  const params = new URLSearchParams();
  const path = route.page === "admin" ? "/admin" : "/app";
  if (route.page === "admin" && route.adminTab !== "overview")
    params.set("section", route.adminTab);
  if (route.page === "profile") params.set("view", "profile");
  if (route.page === "chat") {
    if (route.archived) params.set("view", "archived");
    if (route.conversationId) params.set("conversation", route.conversationId);
  }
  return path + (params.size ? "?" + params : "");
}
