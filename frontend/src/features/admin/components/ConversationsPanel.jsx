import { MessageCircle, ArrowUpRight, Search } from "lucide-react";
import { date } from "../../../services/api.js";

export default function ConversationsPanel({
  data,
  search,
  setSearch,
  setQuery,
  setOffset,
  busy,
  inspect,
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Tất cả hội thoại</h2>
        <form
          className="search-box"
          onSubmit={(e) => {
            e.preventDefault();
            setOffset(0);
            setQuery(search);
          }}
        >
          <Search size={15} />
          <input
            aria-label="Tìm hội thoại"
            placeholder="Tên hội thoại hoặc email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button>Tìm</button>
        </form>
      </div>
      {!data.items.length ? (
        <div className="empty">
          <MessageCircle size={25} />
          Chưa có cuộc trò chuyện phù hợp.
        </div>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Hội thoại</th>
                <th>Người dùng</th>
                <th>Tin nhắn</th>
                <th>Cập nhật</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.items.map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong className="truncate">{c.title}</strong>
                    {c.deleted_at && (
                      <small className="muted">Đã lưu trữ</small>
                    )}
                  </td>
                  <td>
                    {c.name}
                    <small className="muted block">{c.email}</small>
                  </td>
                  <td>{c.message_count}</td>
                  <td>{date(c.updated_at)}</td>
                  <td>
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => inspect(c.id)}
                    >
                      Xem nội dung <ArrowUpRight size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
