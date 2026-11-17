import { Search, ChevronLeft, ChevronRight } from "lucide-react";

export default function UsersPanel({
  data,
  search,
  setSearch,
  setQuery,
  offset,
  setOffset,
  setEditUser,
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Tất cả tài khoản</h2>
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
            aria-label="Tìm người dùng"
            placeholder="Tìm theo tên hoặc email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button>Tìm</button>
        </form>
      </div>
      {!data.items.length ? (
        <div className="empty">Không tìm thấy tài khoản phù hợp.</div>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Người dùng</th>
                <th>Vai trò</th>
                <th>Trạng thái</th>
                <th>Hạn mức/ngày</th>
                <th>Hội thoại</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {data.items.slice(0, 50).map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="table-person">
                      <span className="initials small">
                        {u.name.slice(0, 1).toUpperCase()}
                      </span>
                      <span>
                        <strong>{u.name}</strong>
                        <small>{u.email}</small>
                      </span>
                    </div>
                  </td>
                  <td>
                    <span
                      className={"badge " + (u.role === "admin" ? "green" : "")}
                    >
                      {u.id === data.ownerId
                        ? "Admin gốc"
                        : u.role === "admin"
                          ? "Admin"
                          : "User"}
                    </span>
                  </td>
                  <td>
                    <span
                      className={
                        "badge " + (u.status === "active" ? "green" : "red")
                      }
                    >
                      {u.status === "active" ? "Hoạt động" : "Đã khóa"}
                    </span>
                  </td>
                  <td>{u.quota}</td>
                  <td>{u.conversations || 0}</td>
                  <td>
                    <button
                      className="text-button"
                      onClick={() => setEditUser(u)}
                    >
                      Quản lý <ChevronRight size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="table-footer">
        <span>Trang {Math.floor(offset / 50) + 1}</span>
        <div>
          <button
            className="icon-btn"
            disabled={!offset}
            aria-label="Trang trước"
            onClick={() => setOffset(Math.max(0, offset - 50))}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            className="icon-btn"
            disabled={data.items.length <= 50}
            aria-label="Trang sau"
            onClick={() => setOffset(offset + 50)}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </section>
  );
}
