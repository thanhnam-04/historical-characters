import LoginPage from "./features/auth/LoginPage.jsx";
import AppLayout from "./layouts/AppLayout.jsx";

export default function App() {
  const path = window.location.pathname;
  if (path === "/login") return <LoginPage />;
  return <AppLayout initialPage={path === "/admin" ? "admin" : "chat"} />;
}
