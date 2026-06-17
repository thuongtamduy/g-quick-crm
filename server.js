const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const db = require('./db');

const app = express();
app.set('trust proxy', true); // để req.protocol đúng https khi chạy sau reverse proxy
const PORT = process.env.PORT || 4444;

// ---- Mật khẩu (scrypt, built-in) ----
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}
function verifyPassword(password, salt, expectedHash) {
  const { hash } = hashPassword(password, salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(expectedHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Seed admin/admin nếu chưa có user nào (bắt buộc đổi mật khẩu lần đầu)
function seedDefaultAdmin() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (count === 0) {
    const { salt, hash } = hashPassword('admin');
    db.prepare(`INSERT INTO users (username, salt, password_hash, role, must_change_password)
                VALUES (?, ?, ?, 'admin', 1)`).run('admin', salt, hash);
    console.log('👤 Đã tạo tài khoản mặc định: admin / admin (bắt buộc đổi mật khẩu lần đầu)');
  }
}
seedDefaultAdmin();

// Seed danh mục Bộ phận / Chức vụ mặc định (chỉ khi bảng trống)
function seedCatalog(table, values) {
  if (db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c === 0) {
    const ins = db.prepare(`INSERT OR IGNORE INTO ${table} (name) VALUES (?)`);
    values.forEach((v) => ins.run(v));
  }
}
seedCatalog('departments', [
  'Ban giám đốc', 'Kinh doanh', 'Marketing', 'Kỹ thuật', 'Sản xuất',
  'Nhân sự', 'Kế toán - Tài chính', 'Chăm sóc khách hàng', 'Mua hàng', 'Pháp lý',
]);
seedCatalog('positions', [
  'Nhân viên', 'Chuyên viên', 'Trưởng nhóm', 'Phó phòng', 'Trưởng phòng',
  'Phó giám đốc', 'Giám đốc', 'Tổng giám đốc', 'Chủ tịch', 'Trợ lý',
]);

// ---- Cookie / session ----
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((c) => {
    const i = c.indexOf('=');
    if (i > -1) out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim());
  });
  return out;
}
function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, userId);
  return token;
}
function userFromRequest(req) {
  const token = parseCookies(req).sid;
  if (!token) return null;
  return db.prepare(`
    SELECT u.id, u.username, u.role, u.must_change_password, s.token
    FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?
  `).get(token) || null;
}
function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; Path=/; Max-Age=${30 * 86400}; SameSite=Lax`);
}
function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
}

// 10 ngành công nghiệp lớn nhất + Khác
const INDUSTRIES = [
  'Công nghệ thông tin',
  'Tài chính - Ngân hàng',
  'Sản xuất - Chế tạo',
  'Bán lẻ - Thương mại',
  'Y tế - Dược phẩm',
  'Bất động sản - Xây dựng',
  'Năng lượng',
  'Giáo dục - Đào tạo',
  'Logistics - Vận tải',
  'Nông nghiệp - Thực phẩm',
  'Khác',
];

app.use(express.json({ limit: '50mb' })); // đủ lớn cho nhiều ảnh base64

// Các đường không cần đăng nhập
const PUBLIC_PATHS = new Set([
  '/login.html', '/login.js', '/api/auth/login',
  '/favicon.ico', '/favicon.svg', '/og-image.svg', // để crawler lấy được ảnh preview khi share link
]);

// ---- Bảo vệ bằng session ----
app.use((req, res, next) => {
  req.user = userFromRequest(req);
  if (PUBLIC_PATHS.has(req.path)) return next();
  if (!req.user) {
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Chưa đăng nhập' });
    return res.redirect('/login.html');
  }
  // Bắt buộc đổi mật khẩu lần đầu: chặn mọi API trừ xem thông tin / đổi MK / đăng xuất
  if (req.user.must_change_password && req.path.startsWith('/api/')) {
    const allowed = ['/api/auth/me', '/api/auth/password', '/api/auth/logout'];
    if (!allowed.includes(req.path)) {
      return res.status(403).json({ error: 'Cần đổi mật khẩu trước', mustChangePassword: true });
    }
  }
  next();
});

// ---- Auth routes ----
function publicUser(u) {
  return { id: u.id, username: u.username, role: u.role, mustChangePassword: !!u.must_change_password };
}

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE username = ?').get((username || '').trim());
  if (!u || !verifyPassword(password || '', u.salt, u.password_hash)) {
    return res.status(401).json({ error: 'Sai tài khoản hoặc mật khẩu' });
  }
  setSessionCookie(res, createSession(u.id));
  res.json({ user: publicUser(u) });
});

app.post('/api/auth/logout', (req, res) => {
  if (req.user) db.prepare('DELETE FROM sessions WHERE token = ?').run(req.user.token);
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  res.json({ user: req.user ? publicUser(req.user) : null });
});

// Đổi mật khẩu của chính mình
app.post('/api/auth/password', (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 4) {
    return res.status(400).json({ error: 'Mật khẩu mới tối thiểu 4 ký tự' });
  }
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!verifyPassword(oldPassword || '', u.salt, u.password_hash)) {
    return res.status(400).json({ error: 'Mật khẩu hiện tại không đúng' });
  }
  const { salt, hash } = hashPassword(newPassword);
  db.prepare('UPDATE users SET salt = ?, password_hash = ?, must_change_password = 0 WHERE id = ?')
    .run(salt, hash, u.id);
  res.json({ ok: true });
});

// ---- Quản lý user (chỉ admin) ----
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Chỉ admin được phép' });
  next();
}

app.get('/api/users', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT id, username, role, must_change_password, created_at FROM users ORDER BY id').all());
});

app.post('/api/users', requireAdmin, (req, res) => {
  const { username, password, role } = req.body || {};
  const name = (username || '').trim();
  if (!name) return res.status(400).json({ error: 'Tên đăng nhập là bắt buộc' });
  if (!password || password.length < 4) return res.status(400).json({ error: 'Mật khẩu tối thiểu 4 ký tự' });
  if (db.prepare('SELECT id FROM users WHERE username = ?').get(name)) {
    return res.status(409).json({ error: 'Tên đăng nhập đã tồn tại' });
  }
  const { salt, hash } = hashPassword(password);
  const info = db.prepare(`INSERT INTO users (username, salt, password_hash, role, must_change_password)
                           VALUES (?, ?, ?, ?, 1)`).run(name, salt, hash, role === 'admin' ? 'admin' : 'user');
  res.json({ id: info.lastInsertRowid, username: name, role: role === 'admin' ? 'admin' : 'user' });
});

// Admin đặt lại mật khẩu cho user khác (ép đổi lại lần sau)
app.post('/api/users/:id/password', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { password } = req.body || {};
  if (!password || password.length < 4) return res.status(400).json({ error: 'Mật khẩu tối thiểu 4 ký tự' });
  if (!db.prepare('SELECT id FROM users WHERE id = ?').get(id)) return res.status(404).json({ error: 'Không tìm thấy user' });
  const { salt, hash } = hashPassword(password);
  db.prepare('UPDATE users SET salt = ?, password_hash = ?, must_change_password = 1 WHERE id = ?').run(salt, hash, id);
  res.json({ ok: true });
});

app.delete('/api/users/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: 'Không thể tự xóa tài khoản đang dùng' });
  const admins = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'").get().c;
  const target = db.prepare('SELECT role FROM users WHERE id = ?').get(id);
  if (!target) return res.status(404).json({ error: 'Không tìm thấy user' });
  if (target.role === 'admin' && admins <= 1) return res.status(400).json({ error: 'Phải còn ít nhất 1 admin' });
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ ok: true });
});

// ---- Danh mục Bộ phận / Chức vụ ----
const CATALOGS = { departments: 'departments', positions: 'positions' };

// Thêm giá trị vào danh mục nếu chưa có (dùng khi lưu khách hàng có giá trị custom)
function ensureCatalogValue(table, name) {
  const v = (name || '').trim();
  if (!v) return;
  db.prepare(`INSERT OR IGNORE INTO ${table} (name) VALUES (?)`).run(v);
}

for (const [key, table] of Object.entries(CATALOGS)) {
  app.get(`/api/${key}`, (req, res) => {
    res.json(db.prepare(`SELECT id, name FROM ${table} ORDER BY name COLLATE NOCASE`).all());
  });
  app.post(`/api/${key}`, (req, res) => {
    const name = (req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Tên không được trống' });
    db.prepare(`INSERT OR IGNORE INTO ${table} (name) VALUES (?)`).run(name);
    const row = db.prepare(`SELECT id, name FROM ${table} WHERE name = ? COLLATE NOCASE`).get(name);
    res.json(row);
  });
  app.delete(`/api/${key}/:id`, (req, res) => {
    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(Number(req.params.id));
    res.json({ ok: true });
  });
}

// Phục vụ HTML có chèn URL tuyệt đối ({{ORIGIN}}) cho thẻ og:image / og:url
function serveHtmlWithOrigin(file) {
  return (req, res) => {
    const origin = `${req.protocol}://${req.get('host')}`;
    const html = fs.readFileSync(path.join(__dirname, 'public', file), 'utf8').replaceAll('{{ORIGIN}}', origin);
    res.type('html').send(html);
  };
}
app.get('/login.html', serveHtmlWithOrigin('login.html'));
app.get(['/', '/index.html'], serveHtmlWithOrigin('index.html'));

app.use(express.static(path.join(__dirname, 'public')));

// Chuẩn hóa tên công ty để gom nhóm (bỏ dấu, hậu tố pháp lý, khoảng trắng thừa)
function companyKey(name) {
  if (!name) return '';
  let s = name.toString().toLowerCase().trim();
  s = s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
  s = s.replace(/\b(cong ty|cty|cong ty co phan|cong ty tnhh|tnhh|co phan|cp|jsc|co\.?,? ?ltd|ltd|inc|corp|corporation|company|group|tap doan)\b/g, '');
  s = s.replace(/[^a-z0-9]+/g, ' ').trim();
  return s;
}

const productCols = ['name', 'price', 'note', 'image1', 'image2', 'image3'];

function getCustomerFull(id) {
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
  if (!customer) return null;
  customer.products = db
    .prepare('SELECT * FROM products WHERE customer_id = ? ORDER BY sort_order, id')
    .all(id);
  return customer;
}

function saveProducts(customerId, products) {
  db.prepare('DELETE FROM products WHERE customer_id = ?').run(customerId);
  const insert = db.prepare(`
    INSERT INTO products (customer_id, name, price, note, image1, image2, image3, sort_order)
    VALUES (@customer_id, @name, @price, @note, @image1, @image2, @image3, @sort_order)
  `);
  (products || []).forEach((p, i) => {
    insert.run({
      customer_id: customerId,
      name: p.name || null,
      price: p.price || null,
      note: p.note || null,
      image1: p.image1 || null,
      image2: p.image2 || null,
      image3: p.image3 || null,
      sort_order: i,
    });
  });
}

// ---- API ----

app.get('/api/meta', (req, res) => {
  res.json({
    industries: INDUSTRIES,
    departments: db.prepare('SELECT name FROM departments ORDER BY name COLLATE NOCASE').all().map((r) => r.name),
    positions: db.prepare('SELECT name FROM positions ORDER BY name COLLATE NOCASE').all().map((r) => r.name),
    user: req.user.username,
    role: req.user.role,
  });
});

// Danh sách khách hàng, gom theo công ty
app.get('/api/customers', (req, res) => {
  const q = (req.query.q || '').toString().trim().toLowerCase();
  let rows = db
    .prepare('SELECT * FROM customers ORDER BY company_key, full_name')
    .all();

  if (q) {
    rows = rows.filter((r) =>
      [r.full_name, r.phone, r.email, r.company, r.department, r.position, r.industry]
        .filter(Boolean)
        .some((v) => v.toString().toLowerCase().includes(q))
    );
  }

  // gom nhóm theo company_key
  const groupsMap = new Map();
  for (const r of rows) {
    const key = r.company_key || `__none_${r.id}`;
    if (!groupsMap.has(key)) {
      groupsMap.set(key, { company: r.company || '(Chưa có công ty)', key, members: [] });
    }
    const productCount = db
      .prepare('SELECT COUNT(*) AS c FROM products WHERE customer_id = ?')
      .get(r.id).c;
    groupsMap.get(key).members.push({
      id: r.id,
      full_name: r.full_name,
      phone: r.phone,
      email: r.email,
      avatar: r.avatar,
      company: r.company,
      department: r.department,
      position: r.position,
      industry: r.industry,
      product_count: productCount,
    });
  }

  const groups = [...groupsMap.values()].sort((a, b) =>
    a.company.localeCompare(b.company, 'vi')
  );
  res.json({ total: rows.length, groups });
});

app.get('/api/customers/:id', (req, res) => {
  const c = getCustomerFull(Number(req.params.id));
  if (!c) return res.status(404).json({ error: 'Không tìm thấy' });
  res.json(c);
});

app.post('/api/customers', (req, res) => {
  const b = req.body || {};
  if (!b.full_name || !b.full_name.trim()) {
    return res.status(400).json({ error: 'Họ tên là bắt buộc' });
  }
  const info = db
    .prepare(`
      INSERT INTO customers
        (full_name, phone, email, avatar, company, company_key, department, position, industry, note)
      VALUES (@full_name, @phone, @email, @avatar, @company, @company_key, @department, @position, @industry, @note)
    `)
    .run({
      full_name: b.full_name.trim(),
      phone: b.phone || null,
      email: b.email || null,
      avatar: b.avatar || null,
      company: b.company || null,
      company_key: companyKey(b.company),
      department: b.department || null,
      position: b.position || null,
      industry: b.industry || null,
      note: b.note || null,
    });
  ensureCatalogValue('departments', b.department);
  ensureCatalogValue('positions', b.position);
  saveProducts(info.lastInsertRowid, b.products);
  res.json(getCustomerFull(info.lastInsertRowid));
});

app.put('/api/customers/:id', (req, res) => {
  const id = Number(req.params.id);
  const exists = db.prepare('SELECT id FROM customers WHERE id = ?').get(id);
  if (!exists) return res.status(404).json({ error: 'Không tìm thấy' });
  const b = req.body || {};
  if (!b.full_name || !b.full_name.trim()) {
    return res.status(400).json({ error: 'Họ tên là bắt buộc' });
  }
  db.prepare(`
    UPDATE customers SET
      full_name = @full_name, phone = @phone, email = @email, avatar = @avatar,
      company = @company, company_key = @company_key, department = @department,
      position = @position, industry = @industry, note = @note,
      updated_at = datetime('now')
    WHERE id = @id
  `).run({
    id,
    full_name: b.full_name.trim(),
    phone: b.phone || null,
    email: b.email || null,
    avatar: b.avatar || null,
    company: b.company || null,
    company_key: companyKey(b.company),
    department: b.department || null,
    position: b.position || null,
    industry: b.industry || null,
    note: b.note || null,
  });
  ensureCatalogValue('departments', b.department);
  ensureCatalogValue('positions', b.position);
  saveProducts(id, b.products);
  res.json(getCustomerFull(id));
});

app.delete('/api/customers/:id', (req, res) => {
  db.prepare('DELETE FROM customers WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ---- Xuất CSV (mở được bằng Excel, có BOM UTF-8 cho tiếng Việt) ----
app.get('/api/export.csv', (req, res) => {
  const q = (req.query.q || '').toString().trim().toLowerCase();
  let rows = db.prepare('SELECT * FROM customers ORDER BY company_key, full_name').all();
  if (q) {
    rows = rows.filter((r) =>
      [r.full_name, r.phone, r.email, r.company, r.department, r.position, r.industry]
        .filter(Boolean).some((v) => v.toString().toLowerCase().includes(q)));
  }
  const esc = (v) => {
    const s = (v ?? '').toString();
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ['Họ tên', 'Số điện thoại', 'Email', 'Công ty', 'Bộ phận', 'Chức vụ', 'Lĩnh vực', 'Ghi chú', 'Sản phẩm', 'Ngày tạo'];
  const lines = [header.map(esc).join(',')];
  for (const r of rows) {
    const products = db.prepare('SELECT name, price FROM products WHERE customer_id = ? ORDER BY sort_order, id').all(r.id)
      .map((p) => [p.name, p.price].filter(Boolean).join(' - ')).filter(Boolean).join(' | ');
    lines.push([r.full_name, r.phone, r.email, r.company, r.department, r.position, r.industry, r.note, products, r.created_at]
      .map(esc).join(','));
  }
  const csv = String.fromCharCode(0xfeff) + lines.join('\r\n'); // BOM để Excel đọc đúng UTF-8
  const date = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="khach-hang-${date}.csv"`);
  res.send(csv);
});

app.listen(PORT, () => {
  console.log(`✅ Customer CRM chạy tại http://localhost:${PORT}`);
  console.log(`   Trang đăng nhập: http://localhost:${PORT}/login.html`);
});
