import {
  Users,
  MessageCircle,
  Activity,
  ArrowUpRight,
  ShieldCheck,
  Check,
  AlertCircle,
} from "lucide-react";
import { date } from "../../../services/api.js";
import { actionLabel } from "../auditLabels.js";

export default function OverviewPanel({ data, onNavigate }) {
  return (
    <>
      <div className="stats-grid">
        {[
          {
            label: "Người dùng",
            value: data.stats.users,
            sub: data.stats.activeUsers + " đang hoạt động",
            icon: Users,
          },
          {
            label: "Hội thoại",
            value: data.stats.conversations,
            sub: data.stats.messages + " tin nhắn đã lưu",
            icon: MessageCircle,
          },
          {
            label: "Yêu cầu AI",
            value: data.stats.requestsToday,
            sub: "Trong 24 giờ qua",
            icon: Activity,
          },
          {
            label: "Lỗi dịch vụ",
            value: data.stats.errorsToday,
            sub: "Trong 24 giờ qua",
            icon: AlertCircle,
          },
        ].map(({ label, value, sub, icon: Icon }) => (
          <section className="stat-card" key={label}>
            <div>
              <span>{label}</span>
              <Icon size={17} />
            </div>
            <strong>{value.toLocaleString("vi-VN")}</strong>
            <small>{sub}</small>
          </section>
        ))}
      </div>
      <div className="overview-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>Nhịp trò chuyện</h2>
            <span className="muted">7 ngày gần nhất</span>
          </div>
          {data.daily.length === 0 ? (
            <div className="empty chart-empty">
              <Activity size={27} />
              <p>Biểu đồ sẽ xuất hiện khi có yêu cầu AI đầu tiên.</p>
            </div>
          ) : (
            <div className="usage-chart">
              {data.daily.map((d) => (
                <div className="chart-column" key={d.day}>
                  <span>{d.total}</span>
                  <div
                    style={{
                      height: Math.max(
                        6,
                        (d.total /
                          Math.max(...data.daily.map((v) => v.total))) *
                          155,
                      ),
                    }}
                    title={d.total + " yêu cầu, " + d.errors + " lỗi"}
                  />
                  <small>{d.day.slice(5)}</small>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="panel connection-panel">
          <span className={"service-icon " + (data.ready ? "configured" : "")}>
            <ShieldCheck size={25} />
          </span>
          <h2>
            {data.ready
              ? "Long Vân đã sẵn sàng."
              : "Kết nối để rồng lên tiếng."}
          </h2>
          <p>
            {data.ready
              ? "Backend đã có API key. Người dùng có thể chat và nghe giọng đọc theo cấu hình của bạn."
              : "Thêm API key OpenRouter và chọn model để mở tính năng chat, giọng nói cho người dùng."}
          </p>
          <button className="btn primary" onClick={() => onNavigate("config")}>
            {data.ready ? "Quản lý cấu hình" : "Kết nối OpenRouter"}
            <ArrowUpRight size={16} />
          </button>
        </section>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <h2>Thay đổi gần đây</h2>
          <button className="text-button" onClick={() => onNavigate("audit")}>
            Xem tất cả <ArrowUpRight size={14} />
          </button>
        </div>
        {data.recent.length === 0 ? (
          <div className="empty">Chưa có hoạt động quản trị.</div>
        ) : (
          <div className="activity-list">
            {data.recent.map((a) => (
              <div key={a.id}>
                <span className="activity-icon">
                  <Check size={13} />
                </span>
                <div>
                  <strong>{actionLabel(a.action)}</strong>
                  <small>{a.actor_name || "Hệ thống"}</small>
                </div>
                <time>{date(a.created_at)}</time>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
