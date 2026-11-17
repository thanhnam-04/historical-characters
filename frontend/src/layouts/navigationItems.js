import {
  LayoutDashboard,
  Users,
  MessageCircle,
  Settings,
  ScrollText,
  Box,
} from "lucide-react";
export const adminNav = [
  { id: "overview", label: "Tổng quan", icon: LayoutDashboard },
  { id: "users", label: "Người dùng", icon: Users },
  { id: "conversations", label: "Hội thoại", icon: MessageCircle },
  { id: "config", label: "Cấu hình AI", icon: Settings },
  { id: "characters", label: "Nhân vật 3D", icon: Box },
  { id: "audit", label: "Nhật ký quản trị", icon: ScrollText },
];
