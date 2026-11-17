# Historical Characters — React JavaScript + Python

Frontend dùng **React với JavaScript/JSX và Vite**. Backend dùng **Python/FastAPI**,
SQLite và HTTPX. Không có backend Node.js, Next.js, Vinext hoặc mã TypeScript.
Node.js chỉ dùng để phát triển, build và kiểm thử giao diện.

Dự án nằm tại `C:\Users\ADMIN\Downloads\nhan vat lich su\historical-characters`.
Mã nguồn giao diện nằm trong `frontend/src`; backend Python nằm trong `backend/app`.

## Chạy trên máy

Mở `start-web.cmd`, giữ cửa sổ đó chạy và vào:

- Website: http://127.0.0.1:8767/login
- API tương tác: http://127.0.0.1:8767/docs
- Kiểm tra server: http://127.0.0.1:8767/api/health

Python phục vụ cả API và bản React đã build trên cùng cổng 8767. Bản bàn giao đã
cài môi trường Python và build sẵn frontend. Máy mới cần Python 3.10+; lần đầu
chạy có thể cần tải thư viện. Nếu chưa có `frontend/dist`, cần thêm Node.js 22.13+
để script tự build giao diện.

Database nằm ở `backend/data/app.sqlite3`; biến môi trường nằm ở `backend/.env`.
Khi có database cũ, **giữ nguyên APP_SECRET** để đọc mật khẩu và key đã mã hóa.
Không commit `.env`, database hoặc bản sao lưu lên Git. Tài khoản, phiên đăng
nhập, cấu hình và lịch sử từ bản cũ đã chuyển sang backend Python. Sau khi dọn
bản cũ, bản sao lưu gọn nằm ở `backups/database.sqlite3` và `backups/backend.env`.

## Cấu trúc để sửa code

```text
frontend/
  src/
    components/          # Rồng Three.js dùng trong React
    features/auth/       # Đăng nhập, đăng ký, đặt mật khẩu
    features/chat/       # ChatPage, hook xử lý chat, voice và view tin nhắn
    features/admin/      # Trang quản trị và các panel riêng
    features/profile/    # Hồ sơ, mật khẩu, lượt sử dụng
    layouts/             # Khung ứng dụng, sidebar, menu
    services/api.js      # HTTP client, lỗi kết nối và CSRF
    hooks/               # Hook dùng chung
    utils/               # Điều hướng và kiểm tra dữ liệu quản trị
    styles/app.css       # CSS đã định dạng, gồm giao diện mobile
  public/dragon/         # GLB có khẩu hình, bộ điều khiển và Three.js
backend/
  app/
    main.py              # Factory ứng dụng, middleware, static files
    api/                 # Router: auth, profile, conversations, admin
    schemas.py           # Pydantic kiểm tra dữ liệu đầu vào
    services/            # Nghiệp vụ auth, chat/TTS, cấu hình, hạn mức
    repositories/        # Truy vấn tài khoản và hội thoại
    core/                # Cấu hình, mã hóa, lỗi ứng dụng
    database.py          # Kết nối SQLite và transaction
    schema.sql           # Bảng và index
  tests/                 # API, phân quyền, quota, crypto, streaming
scripts/
  run.py                 # Khởi động toàn bộ web
  backup.py              # Sao lưu SQLite nhất quán
```

Ví dụ: đổi cách gọi OpenRouter ở `backend/app/services/openrouter.py`, đổi luồng
chat ở `frontend/src/features/chat/useChatController.js`, sửa form AI ở
`frontend/src/features/admin/components/AIConfigForm.jsx`.

## Phát triển

Mở terminal thứ nhất ở `backend`:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:create_app --factory --reload --host 127.0.0.1 --port 8767
```

Mở terminal thứ hai ở `frontend`:

```powershell
npm ci
npm run dev
```

Vào http://127.0.0.1:5173. Vite chuyển `/api` đến Python ở cổng 8767. Khi sửa
giao diện để chạy bằng `start-web.cmd`, chạy lại `npm run build` trong `frontend`.

## Luồng đã có

- Lần đầu khởi tạo admin qua localhost; đăng ký, đăng nhập, đăng xuất.
- Cookie HttpOnly, CSRF, kiểm tra Origin, mật khẩu PBKDF2 có pepper, key AES-GCM.
- User: chat streaming, dừng tạo câu trả lời, lịch sử phân trang, đổi tên,
  lưu trữ/khôi phục, xuất toàn bộ JSON, hồ sơ, đổi mật khẩu, xem lượt dùng.
- Voice: nhập giọng nói qua SpeechRecognition tiếng Việt, đọc bằng OpenRouter
  TTS hoặc speechSynthesis của trình duyệt; dừng/nghe lại, đồng bộ khẩu hình.
- Admin: thống kê, tìm/tạo/sửa tài khoản, vai trò, khóa, hạn mức, link đặt mật
  khẩu một lần, thu hồi phiên, cấu hình AI, tìm model miễn phí, thử kết nối và
  giọng đọc, xem hội thoại và nhật ký truy cập/thay đổi.
- Hạn mức dùng chung cho chat và TTS; lỗi nhà cung cấp được hoàn lượt. Mỗi user
  chỉ có một yêu cầu AI đang chạy. Không tự chuyển sang model trả phí.

Link đặt lại mật khẩu do admin gửi riêng; chưa tích hợp dịch vụ gửi email.
SpeechRecognition phụ thuộc trình duyệt và quyền micro. SpeechSynthesis phụ
thuộc giọng được cài trên máy. Khẩu hình theo âm lượng/thời gian là gần đúng.
Tình trạng miễn phí và khả năng đáp ứng của model do OpenRouter quyết định.

## Kiểm tra

```powershell
# Trong backend
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m ruff check app tests
.\.venv\Scripts\python.exe -m ruff format --check app tests
# Trong frontend
npm run lint
npm test
npm run build
```

Test dùng SQLite tạm, key giả và OpenRouter giả lập; không dùng key thật, không
tính phí. React được mount bằng jsdom để kiểm tra tab admin, retry, form,
streaming và lifecycle voice. Kiểm tra này không thay thế việc nghe loa, cấp
quyền micro và xem WebGL trên thiết bị thực.

## Sao lưu

```powershell
backend\.venv\Scripts\python.exe scripts\backup.py
```

Giữ riêng cả file database lẫn `backend/.env`. Khi phục hồi, dừng server rồi
đặt database vào `backend/data/app.sqlite3` và khôi phục đúng `.env` đi kèm.

## Đưa lên server

Backend này cần môi trường chạy Python. Link Sites/Cloudflare Worker của bản
trước không chạy FastAPI; bản Python chạy ở địa chỉ local hoặc host Python riêng.
Dockerfile đã có để đóng gói lên VPS hoặc nền tảng hỗ trợ container:

```powershell
docker build -t historical-characters .
docker run --rm -p 127.0.0.1:8767:8767 --env-file backend/.env -v "${PWD}/backend/data:/app/backend/data" historical-characters
```

Ví dụ trên dùng local và chưa cần HTTPS. Khi dùng domain công khai, cấu hình
`PUBLIC_ORIGIN=https://domain-cua-ban`, reverse proxy HTTPS và volume lưu SQLite.
Khởi tạo admin ở localhost trước khi công khai. Docker cần được kiểm tra trên
máy có Docker; không nằm trong kiểm thử local của lần bàn giao này.

Mô hình rồng: OSCAR CREATIVO, CC BY-NC 4.0. Giữ phần ghi công trong giao diện;
tài sản này dành cho mục đích phi thương mại.

## Nhân vật 3D

Vào Quản trị → Nhân vật 3D. Tải GLB 2.0 có texture nhúng (tối đa 100 MB), xem thử rồi bấm Áp dụng cho người dùng. File lưu trong `backend/data/models/`; cần sao lưu thư mục này cùng database và `.env`. Chỉ admin được tải/chọn/xóa mô hình. Không xóa được mô hình đang dùng hoặc rồng mặc định. Mô hình không có morph target vẫn hiển thị nhưng không tự có khẩu hình.
