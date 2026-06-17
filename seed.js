// Seed 10 khách hàng mẫu. Chạy: node seed.js  (thêm --reset để xóa dữ liệu cũ)
const db = require('./db');

// Chuẩn hóa tên công ty để gom nhóm (giống logic trong server.js)
function companyKey(name) {
  if (!name) return '';
  let s = name.toString().toLowerCase().trim();
  s = s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
  s = s.replace(/\b(cong ty|cty|cong ty co phan|cong ty tnhh|tnhh|co phan|cp|jsc|co\.?,? ?ltd|ltd|inc|corp|corporation|company|group|tap doan)\b/g, '');
  s = s.replace(/[^a-z0-9]+/g, ' ').trim();
  return s;
}

// Ảnh đại diện: SVG tròn chữ cái đầu, mã hóa base64 (nhẹ, không cần file)
function avatarDataURL(name, color) {
  const initials = name.split(' ').filter(Boolean).slice(-2).map((w) => w[0]).join('').toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="${color}"/><text x="50%" y="50%" dy=".35em" text-anchor="middle" font-family="Arial" font-size="48" fill="#fff">${initials}</text></svg>`;
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}

// Ảnh sản phẩm: SVG hình hộp màu + nhãn
function productImageURL(label, color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="${color}"/><rect x="40" y="55" width="120" height="90" rx="8" fill="#ffffff" opacity="0.85"/><text x="50%" y="50%" dy=".35em" text-anchor="middle" font-family="Arial" font-size="22" fill="${color}">${label}</text></svg>`;
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}

const C = ['#3b6ef5', '#e0433a', '#2bb673', '#9b59b6', '#f39c12', '#16a085', '#e84393', '#0984e3', '#6c5ce7', '#d35400'];

const customers = [
  { full_name: 'Nguyễn Văn An', phone: '0901111001', email: 'an.nv@fpt.com.vn', company: 'Công ty TNHH FPT Software', department: 'Phát triển phần mềm', position: 'Trưởng nhóm', industry: 'Công nghệ thông tin', note: 'Khách quen, hợp tác từ 2022',
    products: [ { name: 'Gói triển khai ERP', price: '150.000.000 đ', note: 'Bao gồm tư vấn + đào tạo' } ] },
  { full_name: 'Trần Thị Bình', phone: '0901111002', email: 'binh.tt@fpt.com.vn', company: 'FPT Software', department: 'Kinh doanh', position: 'Account Manager', industry: 'Công nghệ thông tin', note: '' },
  { full_name: 'Lê Hoàng Cường', phone: '0901111003', email: 'cuong.lh@fpt.com', company: 'Cty FPT Software', department: 'Tư vấn giải pháp', position: 'Solution Architect', industry: 'Công nghệ thông tin', note: 'Phụ trách dự án ngân hàng',
    products: [ { name: 'Tư vấn Cloud', price: '80.000.000 đ', note: 'Migration lên AWS' } ] },

  { full_name: 'Phạm Minh Dũng', phone: '0902222001', email: 'dung.pm@vcb.com.vn', company: 'Vietcombank', department: 'Khối Bán lẻ', position: 'Giám đốc chi nhánh', industry: 'Tài chính - Ngân hàng', note: 'Quan tâm sản phẩm thẻ',
    products: [ { name: 'Thẻ tín dụng Platinum', price: 'Miễn phí năm đầu', note: 'Hạn mức cao' }, { name: 'Vay tín chấp', price: 'LS 10.5%/năm', note: '' } ] },
  { full_name: 'Vũ Thị Hà', phone: '0902222002', email: 'ha.vt@vietcombank.com.vn', company: 'Vietcombank', department: 'Khách hàng doanh nghiệp', position: 'Chuyên viên', industry: 'Tài chính - Ngân hàng', note: '' },

  { full_name: 'Đặng Quốc Huy', phone: '0903333001', email: 'huy.dq@vingroup.net', company: 'Tập đoàn Vingroup', department: 'Bất động sản', position: 'Phó phòng', industry: 'Bất động sản - Xây dựng', note: 'Dự án Ocean Park',
    products: [ { name: 'Căn hộ The Origami', price: '3.200.000.000 đ', note: '2PN, view hồ' } ] },
  { full_name: 'Bùi Thanh Lan', phone: '0903333002', email: 'lan.bt@vinmec.com', company: 'Vingroup', department: 'Y tế (Vinmec)', position: 'Quản lý', industry: 'Y tế - Dược phẩm', note: 'Liên hệ qua email' },

  { full_name: 'Hoàng Văn Nam', phone: '0904444001', email: 'nam.hv@thaco.com.vn', company: 'Công ty CP Ô tô Trường Hải (THACO)', department: 'Sản xuất', position: 'Quản đốc', industry: 'Sản xuất - Chế tạo', note: 'Nhà máy Chu Lai',
    products: [ { name: 'Xe tải THACO Auman', price: '1.450.000.000 đ', note: 'Tải trọng 18 tấn' } ] },
  { full_name: 'Ngô Thị Oanh', phone: '0905555001', email: 'oanh.nt@vinamilk.com.vn', company: 'Vinamilk', department: 'Marketing', position: 'Trưởng phòng', industry: 'Nông nghiệp - Thực phẩm', note: 'Quan tâm dòng sữa organic',
    products: [ { name: 'Sữa tươi Organic', price: '38.000 đ/hộp', note: 'Đặt số lượng lớn' } ] },
  { full_name: 'Đỗ Gia Phúc', phone: '0906666001', email: 'phuc.dg@gmail.com', company: '', department: '', position: 'Chủ cửa hàng', industry: 'Bán lẻ - Thương mại', note: 'Khách lẻ, chưa có công ty' },
];

if (process.argv.includes('--reset')) {
  db.exec('DELETE FROM products; DELETE FROM customers;');
  console.log('🗑️  Đã xóa dữ liệu cũ.');
}

const insertCustomer = db.prepare(`
  INSERT INTO customers (full_name, phone, email, avatar, company, company_key, department, position, industry, note)
  VALUES (@full_name, @phone, @email, @avatar, @company, @company_key, @department, @position, @industry, @note)
`);
const insertProduct = db.prepare(`
  INSERT INTO products (customer_id, name, price, note, image1, image2, image3, sort_order)
  VALUES (@customer_id, @name, @price, @note, @image1, @image2, @image3, @sort_order)
`);

let count = 0;
customers.forEach((c, i) => {
  const info = insertCustomer.run({
    full_name: c.full_name,
    phone: c.phone || null,
    email: c.email || null,
    avatar: avatarDataURL(c.full_name, C[i % C.length]),
    company: c.company || null,
    company_key: companyKey(c.company),
    department: c.department || null,
    position: c.position || null,
    industry: c.industry || null,
    note: c.note || null,
  });
  (c.products || []).forEach((p, j) => {
    insertProduct.run({
      customer_id: info.lastInsertRowid,
      name: p.name,
      price: p.price || null,
      note: p.note || null,
      image1: productImageURL(p.name.slice(0, 10), C[(i + 1) % C.length]),
      image2: productImageURL('Chi tiết', C[(i + 3) % C.length]),
      image3: null,
      sort_order: j,
    });
  });
  count++;
});

const total = db.prepare('SELECT COUNT(*) AS c FROM customers').get().c;
console.log(`✅ Đã seed ${count} khách hàng. Tổng trong DB: ${total}.`);
