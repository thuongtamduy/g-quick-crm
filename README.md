# Quản lý khách hàng (Customer CRM)

Web đơn giản để nhập liệu và lưu trữ thông tin khách hàng. Hình ảnh lưu base64 trong SQLite, không cần server media riêng.

## 🚀 Cài đặt & chạy nhanh

> Yêu cầu **Node.js >= 22** (đã test trên Node 26). Không cần cài thêm database.

```bash
git clone git@github.com:thuongtamduy/g-quick-crm.git
cd g-quick-crm
npm install
npm start
```

Mở **http://localhost:4444** → đăng nhập lần đầu bằng **admin / admin** (hệ thống sẽ bắt đổi mật khẩu ngay).

- Giao diện **GQCRM** (dark-mode, sidebar lọc lĩnh vực, drawer, ⌘K, lightbox) tại `/`.
- (Tùy chọn) tạo 10 khách hàng mẫu: `node seed.js` — thêm `--reset` để xóa sạch rồi seed lại.
- Đổi cổng: `PORT=8080 npm start`

## Công nghệ

- **Backend**: Node.js + Express
- **Database**: SQLite tích hợp sẵn của Node (`node:sqlite`) — không cần biên dịch native
- **Frontend**: HTML/CSS/JS thuần, không cần build
- **Auth**: Đăng nhập bằng session (cookie httpOnly), mật khẩu băm `scrypt`. Có trang login, đăng xuất, đổi mật khẩu, quản lý user (admin)
- **Ảnh**: nén + lưu base64 (data URL) trong DB

## Đăng nhập & quản lý người dùng

- Lần đầu (DB trống) hệ thống tự tạo tài khoản **admin / admin** và **bắt buộc đổi mật khẩu ngay lần đăng nhập đầu**.
- **Đăng xuất**, **đổi mật khẩu**: ở khu vực tài khoản dưới sidebar.
- **Admin** có thể: tạo người dùng mới, đặt lại mật khẩu, xóa user. Người dùng mới luôn phải đổi mật khẩu ở lần đăng nhập đầu.
- Vai trò: `admin` (quản lý user) và `user` (chỉ dùng CRM + đổi mật khẩu của mình).

> 💡 **Quên mật khẩu admin?** Xóa bảng user rồi khởi động lại để hệ thống tạo lại `admin/admin`:
> `node -e "require('./db').exec('DELETE FROM sessions; DELETE FROM users;')"` → `npm start`.

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
  login.html     # Trang đăng nhập
  login.js
  index.html     # Giao diện GQCRM (dark-mode, sidebar, drawer, ⌘K…)
  style.css
  app.js
ecosystem.config.js  # Cấu hình PM2 (app g-q-crm)
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
