# Quản lý khách hàng (Customer CRM)

Web đơn giản để nhập liệu và lưu trữ thông tin khách hàng. Hình ảnh lưu base64 trong SQLite, không cần server media riêng.

## Công nghệ

- **Backend**: Node.js + Express
- **Database**: SQLite tích hợp sẵn của Node (`node:sqlite`) — không cần biên dịch native
- **Frontend**: HTML/CSS/JS thuần, không cần build
- **Auth**: Đăng nhập bằng session (cookie httpOnly), mật khẩu băm `scrypt`. Có trang login, đăng xuất, đổi mật khẩu, quản lý user (admin)
- **Ảnh**: nén + lưu base64 (data URL) trong DB

> Yêu cầu Node.js >= 22 (đã test trên Node 26).

## Chạy

```bash
npm install
npm start
```

Mở http://localhost:3000 → tự chuyển tới trang đăng nhập.

## Đăng nhập & quản lý người dùng

- Lần đầu (DB trống) hệ thống tự tạo tài khoản **admin / admin** và **bắt buộc đổi mật khẩu ngay lần đăng nhập đầu**.
- **Đăng xuất**, **đổi mật khẩu**: ở mục "Tài khoản" (V1) hoặc khu vực tài khoản dưới sidebar (V2).
- **Admin** có thể: tạo người dùng mới, đặt lại mật khẩu, xóa user. Người dùng mới luôn phải đổi mật khẩu ở lần đăng nhập đầu.
- Vai trò: `admin` (quản lý user) và `user` (chỉ dùng CRM + đổi mật khẩu của mình).

## Đổi cổng

```bash
PORT=8080 npm start
```

Reset toàn bộ tài khoản về mặc định (nếu quên mật khẩu admin): xóa bảng user rồi khởi động lại —
`node -e "require('./db').exec('DELETE FROM sessions; DELETE FROM users;')"` rồi `npm start`.

## Các trường dữ liệu

1. Họ tên *(bắt buộc)*
2. Số điện thoại
3. Email
4. Ảnh đại diện *(tải lên, lưu base64)*
5. Công ty — **cùng công ty tự gom về chung nhóm** (chuẩn hóa tên, bỏ dấu & hậu tố "TNHH/CP/Cty..." nên "Công ty TNHH ABC" = "Cty ABC")
6. Bộ phận
7. Chức vụ
8. Lĩnh vực — 10 ngành lớn + "Khác"
9. Sản phẩm — mỗi sản phẩm gồm **3 hình ảnh, ghi chú, giá**; thêm nhiều sản phẩm tùy ý
10. Ghi chú

## Cấu trúc

```
server.js        # Express + API + session auth
db.js            # Khởi tạo SQLite & schema (customers, products, users, sessions)
public/
  login.html     # Trang đăng nhập (chung cho V1 & V2)
  login.js
  index.html     # Giao diện V1
  style.css
  app.js
  v2/            # Giao diện V2 "Nexus" (dark-mode, drawer, ⌘K…)
    index.html  style.css  app.js
data.sqlite      # DB tự tạo khi chạy (đã .gitignore)
```

## API

| Method | Đường dẫn | Mô tả |
|--------|-----------|-------|
| POST | `/api/auth/login` | Đăng nhập, set cookie session |
| POST | `/api/auth/logout` | Đăng xuất |
| GET | `/api/auth/me` | Thông tin user hiện tại |
| POST | `/api/auth/password` | Đổi mật khẩu của mình |
| GET | `/api/users` | (admin) Danh sách user |
| POST | `/api/users` | (admin) Tạo user |
| POST | `/api/users/:id/password` | (admin) Đặt lại mật khẩu user |
| DELETE | `/api/users/:id` | (admin) Xóa user |
| GET | `/api/meta` | Lĩnh vực + user + role |
| GET | `/api/customers?q=` | Danh sách, đã gom theo công ty |
| GET | `/api/customers/:id` | Chi tiết 1 khách + sản phẩm |
| POST | `/api/customers` | Thêm mới |
| PUT | `/api/customers/:id` | Cập nhật |
| DELETE | `/api/customers/:id` | Xóa |
