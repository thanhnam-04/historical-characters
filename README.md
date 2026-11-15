# Long Vân — rồng 3D trò chuyện

Trang tĩnh Three.js, chat streaming và TTS qua OpenRouter, nhập tiếng Việt bằng micro nếu trình duyệt hỗ trợ Web Speech Recognition. Mặc định model chat `openrouter/free`, TTS `fish-audio/s2.1-pro-free:free`. Danh sách TTS miễn phí được cập nhật từ API model; có bản danh sách cục bộ dự phòng.

## Dùng thử

Mở trang, chọn **Kết nối AI**, nhập OpenRouter API key trong ô mật khẩu rồi **Lưu trong tab**. Key chỉ giữ trong bộ nhớ của tab, không được ghi localStorage/sessionStorage, không nằm trong mã nguồn và chỉ gửi trực tiếp đến `https://openrouter.ai`. Tải lại/đóng trang sẽ xóa key. Không dán key vào cuộc trò chuyện ChatGPT.

Chat có thể dùng ngay sau khi kết nối. Micro điền nội dung vào ô nhập để xem lại và gửi. Bật **Đọc câu trả lời** để rồng nói; bấm **Dừng đọc** để ngắt. **Thử giọng rồng** phát một câu tiếng Việt. TTS miễn phí có hạn mức và phụ thuộc nhà cung cấp; trang không tự chuyển sang model trả phí. Khả năng/chất lượng tiếng Việt của các giọng OpenRouter cần nghe thử. Giọng trình duyệt chỉ dùng khi có voice tiếng Việt thực sự; trang không chọn giọng tiếng Anh để giả đọc tiếng Việt.

Mô hình 17.88 MiB, texture 512 px, giữ body clip và morph targets. Render tối đa 30 fps khi nói/di chuyển; lúc nghỉ chỉ render khi đổi camera/kích thước. Mặc định tắt body animation để nhẹ máy. Khẩu hình audio OpenRouter theo âm lượng; Web Speech synthesis dùng mô phỏng theo thời gian. Không phải bộ đồng bộ âm vị chính xác.

## Chạy tại máy

Từ thư mục này: `python -m http.server 8767 --bind 127.0.0.1 --directory dist`, rồi mở `http://127.0.0.1:8767`. HTTPS hoặc localhost cần thiết cho micro. Có thể dùng `start-web.cmd`.

## Giấy phép tài sản

Dragon Character 3D by OSCAR CREATIVO: https://sketchfab.com/3d-models/dragon-character-3d-by-oscar-creativo-7bad9ad76293430f8e5bb24cd499c53b . CC BY-NC 4.0 (phi thương mại): https://creativecommons.org/licenses/by-nc/4.0/ . Bản trang có sửa texture và thêm khẩu hình. Mô hình gốc không bị ghi đè.

Three.js 0.180.0 MIT, giấy phép tại `dist/vendor/LICENSE.three.txt`.
