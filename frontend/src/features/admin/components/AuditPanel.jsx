import { date } from "../../../services/api.js";
import { actionLabel, auditDetail } from "../auditLabels.js";

export default function AuditPanel({ data }) {
  return (
    <section className="panel">
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Thời gian</th>
              <th>Người thực hiện</th>
              <th>Hoạt động</th>
              <th>Chi tiết</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((a) => (
              <tr key={a.id}>
                <td>{date(a.created_at)}</td>
                <td>
                  {a.actor_name || "Hệ thống"}
                  <small className="muted block">{a.actor_email || ""}</small>
                </td>
                <td>{actionLabel(a.action)}</td>
                <td className="audit-detail">{auditDetail(a.detail)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.items.length === 0 && (
          <div className="empty">Chưa có hoạt động.</div>
        )}
      </div>
    </section>
  );
}
