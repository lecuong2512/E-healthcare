# Vận hành backend lễ tân

## QR check-in

- Cấu hình `QR_CHECKIN_SECRET` là chuỗi ngẫu nhiên riêng, dài ít nhất 32 byte và khác các JWT secret đăng nhập. Mọi backend instance phải dùng cùng secret.
- Bệnh nhân đã đăng nhập lấy token qua `GET /api/v1/appointments/:appointmentId/check-in-qr`. Response `qrToken` là nội dung đưa vào mã QR, hết hạn sau 15 phút. Chỉ bệnh nhân sở hữu lịch hẹn `CONFIRMED` được cấp token.
- Lễ tân dùng `POST /api/v1/reception/qr/lookup` với body `{ "qrToken": "..." }` để tra cứu, hoặc `POST /api/v1/reception/qr/check-in` để check-in. Token được kiểm tra chữ ký HS256, mục đích sử dụng và hạn dùng; backend lấy dữ liệu lịch hẹn thật từ DB.
- QR hết hạn hoặc bị sửa bị từ chối. Sau khi check-in thành công, dùng lại token không thể cấp thêm số hàng đợi vì transaction chỉ cho phép lịch `CONFIRMED` chuyển sang `CHECKED_IN`. Tra cứu thủ công bằng mã lịch hẹn/số điện thoại và API check-in có quyền lễ tân vẫn dùng được khi bệnh nhân không có QR.
- Check-in lịch hẹn chỉ mở từ 60 phút trước giờ bắt đầu đến hết 15 phút sau giờ kết thúc slot, tính theo `Asia/Ho_Chi_Minh` và chỉ trong đúng ngày khám. Cả `canCheckIn` khi tra cứu và transaction check-in dùng cùng quy tắc này; quét QR không bỏ qua giới hạn giờ.

## Hàng đợi realtime

- Lễ tân và bác sĩ kết nối namespace `/queue` bằng `auth: { token: accessToken }`. Gateway xác thực token bằng cùng `SessionService` với REST, kiểm tra vai trò và chỉ cho bác sĩ vào room của hồ sơ bác sĩ gắn với tài khoản.
- Lễ tân có thể cấp token TV bằng `POST /api/v1/reception/queue/board-token`. TV kết nối `/queue` bằng `auth: { boardToken: token }`; token này chỉ có quyền đọc, hết hạn sau 8 giờ và chỉ vào room `queue:public`. Cấu hình `QUEUE_BOARD_SECRET` riêng, dài ít nhất 32 byte, giống nhau trên mọi backend instance. Không đưa cả `token` và `boardToken` trong một handshake.
- TV nhận `queue.snapshot` có `scope: PUBLIC` và `queue.public_status_changed`. Payload công cộng chỉ chứa số thứ tự, ngày, tên bệnh nhân đã che, tên bác sĩ, phòng, trạng thái và `doctorId` để ghép số thứ tự; không có mã lịch hẹn, ID bệnh nhân, SĐT hay CCCD. Token TV không truy cập được REST API nội bộ.
- Socket.IO gửi `appointment.status.changed` sau khi giao dịch DB commit. Nếu gửi tới một room lỗi, room còn lại vẫn được thử gửi.
- Mỗi socket đã xác thực nhận `queue.snapshot` khi kết nối và sau mỗi 30 giây. Snapshot lấy từ DB, giúp tự khôi phục trạng thái hàng đợi khi mất event hoặc Redis tạm gián đoạn. `queue.sync` vẫn cho phép yêu cầu snapshot thủ công, tối đa một lần mỗi giây trên mỗi socket.
- Gateway giới hạn 5 socket cho mỗi tài khoản trên **mỗi backend instance**. Cần giới hạn kết nối ở proxy nếu muốn giới hạn chung trên toàn cụm hoặc chặn lưu lượng trước bước xác thực. Giới hạn theo IP nên đặt ở proxy vì nhiều người dùng có thể cùng đi qua một IP proxy nội bộ.
- Khi chạy nhiều backend instance, đặt `QUEUE_REDIS_ADAPTER_ENABLED=true` trên tất cả instance và dùng cùng Redis (`REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`). Startup sẽ thất bại nếu adapter được bật mà Redis không kết nối được. Nếu dùng Socket.IO HTTP long polling, load balancer cần sticky session; có thể cấu hình client dùng `transports: ['websocket']` để không cần sticky session cho polling.
- Redis Pub/Sub chuyển tiếp cả payload sự kiện có tên bệnh nhân, nên Redis cần nằm trong mạng nội bộ tin cậy và có xác thực phù hợp.
- Redis adapter phân phối event giữa các instance nhưng không lưu event để phát lại. Snapshot định kỳ khôi phục **trạng thái hiện tại** của hàng đợi; nếu cần lịch sử đầy đủ của mọi lần đổi trạng thái thì phải bổ sung transactional outbox.

## Walk-in và thu tiền

- Mỗi yêu cầu tạo walk-in cần header `Idempotency-Key` là UUID v4. Lặp lại cùng khóa, cùng tài khoản lễ tân và cùng nội dung yêu cầu sẽ trả kết quả đã commit; dùng lại khóa với nội dung khác trả 409. Khi timeout, client nên retry với **cùng khóa**.
- Redis giữ slot tối đa 15 giây để giảm tranh chấp. Redis lock không quyết định tính đúng đắn: transaction khóa dòng schedule và DB có unique index cho lịch hẹn còn hiệu lực trên slot. Kiểm thử PostgreSQL cho hai yêu cầu cùng lấy được Redis lock xác nhận chỉ một lịch hẹn và một giao dịch thu tiền được tạo. Nếu transaction vượt 15 giây, yêu cầu thứ hai có thể đi tới DB và sẽ chờ/từ chối ở đó.
- Chỉ check-in lịch hẹn CONFIRMED, đã thanh toán và có schedule `BOOKED` trong ngày. Nếu schedule chuyển sang `OFF` hoặc trạng thái khác, lễ tân cần xử lý lại lịch hẹn thay vì cấp số hàng đợi.
- Chỉ giao dịch thu tiền `SUCCESS` được dùng để lấy hoặc in lại biên lai.
