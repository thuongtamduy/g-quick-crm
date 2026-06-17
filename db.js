const { DatabaseSync } = require('node:sqlite');
const path = require('path');

// Dùng SQLite tích hợp sẵn của Node (không cần biên dịch native)
const db = new DatabaseSync(path.join(__dirname, 'data.sqlite'));
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS customers (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name   TEXT NOT NULL,
    phone       TEXT,
    email       TEXT,
    avatar      TEXT,                     -- ảnh đại diện dạng base64 (data URL)
    company     TEXT,                     -- tên công ty (hiển thị)
    company_key TEXT,                     -- khóa chuẩn hóa để gom nhóm
    department  TEXT,                     -- bộ phận
    position    TEXT,                     -- chức vụ
    industry    TEXT,                     -- lĩnh vực
    note        TEXT,                     -- ghi chú
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS products (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    name        TEXT,
    price       TEXT,                     -- giá sản phẩm (lưu text để linh hoạt định dạng)
    note        TEXT,                     -- ghi chú sản phẩm
    image1      TEXT,                     -- 3 hình ảnh base64
    image2      TEXT,
    image3      TEXT,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_customers_company_key ON customers(company_key);
  CREATE INDEX IF NOT EXISTS idx_products_customer ON products(customer_id);

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE,
    salt          TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'user',   -- 'admin' hoặc 'user'
    must_change_password INTEGER NOT NULL DEFAULT 0, -- 1 = bắt buộc đổi MK lần đầu
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

module.exports = db;
