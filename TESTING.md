# Kết quả kiểm tra — 16/11/2026

## Tự động

- Backend Python: **27/27** bài pytest đạt.
- Frontend React JavaScript: **19/19** bài Node/jsdom đạt.
- Ruff, ESLint và kiểm tra định dạng Python: đạt.
- Vite production build: thành công.
- 19 đường dẫn giao diện/API/tài sản trên bản sao dữ liệu cũ: HTTP 200.
- Đường dẫn API không tồn tại: HTTP 404.

Backend bao phủ khởi tạo admin, đăng nhập/đăng xuất, CSRF/Origin, phân quyền và
quyền sở hữu hội thoại, đăng ký đóng/mở, link reset một lần, đổi mật khẩu, khóa
tài khoản, thu hồi session, cấu hình key mã hóa, danh sách model miễn phí,
streaming tiếng Việt, quota/refund, TTS, lưu trữ/khôi phục, đổi tên, phân trang,
xuất toàn bộ lịch sử và ghi nhật ký xem hội thoại. Kiểm tra cancellation xác nhận
phần trả lời đã nhận được lưu với trạng thái `interrupted` và khóa được giải phóng.

Frontend bao phủ chuyển tab admin, dữ liệu sai/thiếu và retry, modal đóng bằng
Escape, xác nhận mật khẩu, render SSE tiếng Việt, dừng voice, response TTS tới
muộn và callback sau khi component/avatar đã bị tháo. Hai lỗi trước đây liên quan
`chatModel` và `textContent` được kiểm tra trong nhóm hồi quy này.

## Dữ liệu cũ

11 bảng có số bản ghi khớp trước/sau khi sao chép. SQLite `integrity_check` trả
`ok`; key cũ giải mã được bằng Python. Bản sao giữ 1 tài khoản, 1 hội thoại và
8 tin nhắn cùng cấu hình, phiên, nhật ký, hạn mức. Xem `migration-report.json`
để biết số lượng chi tiết; báo cáo không chứa mật khẩu, API key hoặc nội dung chat.

## OpenRouter thực

Dùng key đã có trên server và câu chào mẫu, không gửi lịch sử riêng tư:

- Xác thực key và lấy danh sách model: HTTP 200.
- Chat từ Python với chế độ chỉ model miễn phí: HTTP 200, có câu trả lời bằng chữ.
- TTS từ Python: `audio/mpeg`, 56.005 byte, có header MP3 hợp lệ.

Không xác nhận chất lượng nghe chỉ từ header. Chưa kiểm tra loa, quyền micro,
SpeechRecognition, giọng cài trên thiết bị và hình ảnh WebGL trong trình duyệt
thực vì môi trường điều khiển trình duyệt hiện không khả dụng. Dockerfile đã được
chuẩn bị nhưng chưa chạy Docker. Pytest có một cảnh báo deprecation từ thư viện
Starlette TestClient/httpx; các bài kiểm tra đều hoàn tất.

## Vị trí và bản đang chạy

Bản mới: `C:\Users\ADMIN\Downloads\nhan vat lich su\historical-characters`.
Server Python chạy ở http://127.0.0.1:8767/login; khởi động lại bằng `start-web.cmd`.
Hai bản dự án cũ đang được giữ để chờ xác nhận xóa. Database và cấu hình được sao lưu
gọn ở `backups/database.sqlite3` và `backups/backend.env`; dữ liệu cũ được
đối chiếu với bản đang chạy. Cache và dữ liệu test tạm đã được dọn.

## Thư viện nhân vật 3D

Kiểm tra mới: phân quyền admin và CSRF, upload/preview/activate/delete, chặn xóa
mô hình đang dùng/mặc định, giới hạn upload, file GLB hỏng, tài nguyên ngoài và
compression chưa hỗ trợ. Kiểm tra Three.js với mô hình không có morph target,
kích thước lớn và lệch gốc: tải thành công, chuẩn hóa kích thước và căn giữa.
React kiểm tra tải file và giữ mô hình vừa tải trong khung xem thử trước khi áp dụng.

Smoke test server thật ở cổng 8767: upload GLB rồng 18.749.920 byte trả HTTP 201,
tải lại khớp toàn bộ dữ liệu, kích hoạt, khôi phục nhân vật trước đó rồi xóa
mô hình test đều thành công. Không gửi dữ liệu đến dịch vụ 3D bên ngoài.
Chưa xác nhận trực quan WebGL trong trình duyệt thực tại môi trường này.
