'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

let META = { industries: [], user: '', role: 'user' };
let ME = { id: 0, username: '', role: 'user' };
let CURRENT = null;       // khách đang xem
let DATA = { total: 0, groups: [] };
let SHOWN_GROUPS = [];    // các nhóm đang hiển thị (để xóa cả công ty)
let FLAT = [];            // tất cả thành viên (cho palette/filter)
let activeIndustry = null;
let avatarData = null;

const COLORS = ['#7c5cff', '#19d3f3', '#2ee6a8', '#ffce5a', '#ff5a6e', '#a66bff', '#ff9f43', '#54a0ff'];
const colorFor = (s) => COLORS[[...(s || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
const initials = (n) => (n || '?').split(' ').filter(Boolean).slice(-2).map((w) => w[0]).join('').toUpperCase();

// ---------- helpers ----------
async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || `Lỗi ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}
function esc(s) {
  return (s ?? '').toString().replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function toast(msg, kind = 'ok') {
  const t = document.createElement('div');
  t.className = `toast ${kind}`;
  t.innerHTML = `<span>${kind === 'ok' ? '✅' : '⚠️'}</span><span>${esc(msg)}</span>`;
  $('#toasts').appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, 2600);
}
function fileToCompressedDataURL(file, maxSize = 900, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          const s = Math.min(maxSize / width, maxSize / height);
          width = Math.round(width * s); height = Math.round(height * s);
        }
        const cv = document.createElement('canvas');
        cv.width = width; cv.height = height;
        cv.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(cv.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject; img.src = reader.result;
    };
    reader.onerror = reject; reader.readAsDataURL(file);
  });
}
function pickImage(cb, maxSize, quality) {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/*'; input.style.display = 'none';
  document.body.appendChild(input);
  input.onchange = async () => {
    try { if (input.files[0]) cb(await fileToCompressedDataURL(input.files[0], maxSize, quality)); }
    catch (e) { toast('Không xử lý được ảnh', 'err'); }
    finally { input.remove(); }
  };
  input.click();
}

// ---------- load + render ----------
async function loadList() {
  const q = $('#search').value.trim();
  DATA = await api('GET', `/api/customers?q=${encodeURIComponent(q)}`);
  FLAT = DATA.groups.flatMap((g) => g.members.map((m) => ({ ...m, company: m.company || g.company })));
  renderSidebar();
  renderKpis();
  renderContent();
}

function industryCounts() {
  const map = new Map();
  for (const m of FLAT) {
    const k = m.industry || 'Chưa phân loại';
    map.set(k, (map.get(k) || 0) + 1);
  }
  return map;
}

function renderSidebar() {
  const counts = industryCounts();
  const nav = $('#industryNav');
  const items = [`
    <button class="nav-item ${activeIndustry === null ? 'active' : ''}" data-ind="">
      <span class="dot" style="background:var(--accent-grad)"></span>
      <span class="lab">Tất cả khách hàng</span>
      <span class="cnt">${FLAT.length}</span>
    </button>`];
  [...counts.entries()].sort((a, b) => b[1] - a[1]).forEach(([ind, c]) => {
    items.push(`
      <button class="nav-item ${activeIndustry === ind ? 'active' : ''}" data-ind="${esc(ind)}">
        <span class="dot" style="background:${colorFor(ind)}"></span>
        <span class="lab">${esc(ind)}</span>
        <span class="cnt">${c}</span>
      </button>`);
  });
  nav.innerHTML = items.join('');
  $$('.nav-item', nav).forEach((b) => b.onclick = () => {
    activeIndustry = b.dataset.ind || null;
    document.querySelector('.app').classList.remove('rail-on');
    renderSidebar(); renderContent();
  });
}

function renderKpis() {
  const companies = new Set(FLAT.map((m) => (m.company || '').trim().toLowerCase()).filter(Boolean)).size;
  const products = FLAT.reduce((a, m) => a + (m.product_count || 0), 0);
  const industries = new Set(FLAT.map((m) => m.industry).filter(Boolean)).size;
  const k = [
    { ico: '👥', val: FLAT.length, lab: 'Khách hàng' },
    { ico: '🏢', val: companies, lab: 'Công ty' },
    { ico: '📦', val: products, lab: 'Sản phẩm' },
    { ico: '🏷️', val: industries, lab: 'Lĩnh vực' },
  ];
  $('#kpis').innerHTML = k.map((x) => `
    <div class="kpi"><div class="k-ico">${x.ico}</div><div class="k-val">${x.val}</div><div class="k-lab">${x.lab}</div></div>
  `).join('');
}

function memberCard(m) {
  const av = m.avatar
    ? `<img class="card-avatar" src="${m.avatar}" alt="">`
    : `<div class="card-avatar ph">${esc(initials(m.full_name))}</div>`;
  const role = [m.position, m.department].filter(Boolean).join(' · ');
  return `
    <div class="card" data-id="${m.id}">
      <button class="card-del" data-del-id="${m.id}" data-name="${esc(m.full_name)}" title="Xóa khách hàng">🗑</button>
      <div class="card-top">
        ${av}
        <div class="card-id">
          <div class="card-name">${esc(m.full_name)}</div>
          <div class="card-role">${esc(role || '—')}</div>
        </div>
      </div>
      <div class="card-tags">
        ${m.industry ? `<span class="pill accent">${esc(m.industry)}</span>` : ''}
        ${m.product_count ? `<span class="pill">📦 ${m.product_count}</span>` : ''}
      </div>
      <div class="card-meta">
        ${m.phone ? `<span>📞 ${esc(m.phone)}</span>` : ''}
        ${m.email ? `<span>✉️ ${esc(m.email)}</span>` : ''}
      </div>
    </div>`;
}

function renderContent() {
  let groups = DATA.groups;
  if (activeIndustry) {
    groups = groups
      .map((g) => ({ ...g, members: g.members.filter((m) => (m.industry || 'Chưa phân loại') === activeIndustry) }))
      .filter((g) => g.members.length);
  }
  const shown = groups.reduce((a, g) => a + g.members.length, 0);
  $('#subtitle').textContent = activeIndustry
    ? `${shown} khách · lĩnh vực “${activeIndustry}”`
    : `${DATA.total} khách hàng · ${DATA.groups.length} công ty/nhóm`;

  $('#empty').classList.toggle('hidden', shown > 0);
  const companies = [...new Set(FLAT.map((m) => m.company).filter((c) => c && c !== '(Chưa có công ty)'))];
  $('#companyList').innerHTML = companies.map((c) => `<option value="${esc(c)}">`).join('');

  SHOWN_GROUPS = groups;
  $('#content').innerHTML = groups.map((g) => `
    <div class="group">
      <div class="group-head">
        <div class="group-logo" style="background:${colorFor(g.company)}">${esc(initials(g.company))}</div>
        <div>
          <div class="group-name">${esc(g.company)}</div>
          <div class="group-meta">${g.members.length} người</div>
        </div>
        <div class="group-line"></div>
        <button class="group-del" data-key="${esc(g.key)}" title="Xóa công ty & toàn bộ khách trong nhóm">🗑</button>
      </div>
      <div class="cards">${g.members.map(memberCard).join('')}</div>
    </div>`).join('');

  // mở chi tiết khi bấm thẻ
  $$('#content .card').forEach((c) => c.onclick = () => openDetail(Number(c.dataset.id)));
  // xóa nhanh 1 khách (chặn mở chi tiết)
  $$('#content .card-del').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    quickDeleteCustomer(Number(b.dataset.delId), b.dataset.name);
  });
  // xóa cả công ty
  $$('#content .group-del').forEach((b) => b.onclick = () => {
    const g = SHOWN_GROUPS.find((x) => x.key === b.dataset.key);
    if (g) deleteCompany(g);
  });
}

async function quickDeleteCustomer(id, name) {
  if (!confirm(`Xóa khách hàng “${name}”?`)) return;
  try { await api('DELETE', `/api/customers/${id}`); await loadList(); toast('Đã xóa khách hàng'); }
  catch (e) { toast(e.message, 'err'); }
}
async function deleteCompany(g) {
  const n = g.members.length;
  if (!confirm(`Xóa công ty “${g.company}” và toàn bộ ${n} khách hàng trong nhóm?\nHành động này không hoàn tác được.`)) return;
  try {
    await Promise.all(g.members.map((m) => api('DELETE', `/api/customers/${m.id}`)));
    await loadList(); toast(`Đã xóa ${n} khách của “${g.company}”`);
  } catch (e) { toast(e.message, 'err'); }
}

// ---------- Avatar / products (form) ----------
function setAvatar(d) {
  avatarData = d || null;
  const img = $('#avatarPreview'), ph = $('#avatarPlaceholder');
  if (avatarData) { img.src = avatarData; img.classList.remove('hidden'); ph.classList.add('hidden'); }
  else { img.removeAttribute('src'); img.classList.add('hidden'); ph.classList.remove('hidden'); }
}
function addProductCard(p = {}) {
  const tpl = $('#productTpl').content.cloneNode(true);
  const card = $('.product-card', tpl);
  $('.p-name', card).value = p.name || '';
  $('.p-price', card).value = p.price || '';
  $('.p-note', card).value = p.note || '';
  const imgs = [p.image1, p.image2, p.image3];
  $$('.p-img-slot', card).forEach((slot, i) => {
    slot._data = imgs[i] || null; renderSlot(slot);
    slot.addEventListener('click', (e) => { if (!e.target.classList.contains('del-img')) pickImage((d) => { slot._data = d; renderSlot(slot); }); });
  });
  $('.remove-product', card).onclick = () => card.remove();
  $('#products').appendChild(card);
}
function renderSlot(slot) {
  if (slot._data) {
    slot.innerHTML = `<img src="${slot._data}" alt=""><button type="button" class="del-img">✕</button>`;
    $('.del-img', slot).onclick = (e) => { e.stopPropagation(); slot._data = null; renderSlot(slot); };
  } else slot.innerHTML = '＋ Ảnh';
}
function collectProducts() {
  return $$('#products .product-card').map((card) => {
    const s = $$('.p-img-slot', card);
    return {
      name: $('.p-name', card).value.trim(), price: $('.p-price', card).value.trim(), note: $('.p-note', card).value.trim(),
      image1: s[0]._data || null, image2: s[1]._data || null, image3: s[2]._data || null,
    };
  }).filter((p) => p.name || p.price || p.note || p.image1 || p.image2 || p.image3);
}

// ---------- Form drawer ----------
function openForm(c) {
  $('#form').reset(); $('#products').innerHTML = '';
  $('#customerId').value = c?.id || '';
  $('#formTitle').textContent = c ? 'Chỉnh sửa khách hàng' : 'Thêm khách hàng';
  $('#full_name').value = c?.full_name || '';
  $('#phone').value = c?.phone || '';
  $('#email').value = c?.email || '';
  $('#company').value = c?.company || '';
  $('#department').value = c?.department || '';
  $('#position').value = c?.position || '';
  $('#note').value = c?.note || '';
  $('#industry').innerHTML = '<option value="">— Chọn lĩnh vực —</option>' +
    META.industries.map((i) => `<option value="${esc(i)}">${esc(i)}</option>`).join('');
  $('#industry').value = c?.industry || '';
  populateDatalists();
  setAvatar(c?.avatar || null);
  (c?.products || []).forEach(addProductCard);
  $('#detailWrap').classList.add('hidden');
  $('#formWrap').classList.remove('hidden');
}
function closeForm() {
  $('#formWrap').classList.add('hidden');
  $('#form').reset(); $('#products').innerHTML = ''; $('#customerId').value = ''; setAvatar(null);
}
async function saveForm(e) {
  e.preventDefault();
  const id = $('#customerId').value;
  const payload = {
    full_name: $('#full_name').value.trim(), phone: $('#phone').value.trim(), email: $('#email').value.trim(),
    company: $('#company').value.trim(), department: $('#department').value.trim(), position: $('#position').value.trim(),
    industry: $('#industry').value, note: $('#note').value.trim(), avatar: avatarData, products: collectProducts(),
  };
  if (!payload.full_name) return toast('Vui lòng nhập Họ tên', 'err');
  const btn = $('#btnSave'); btn.disabled = true; btn.textContent = 'Đang lưu…';
  try {
    if (id) await api('PUT', `/api/customers/${id}`, payload);
    else await api('POST', '/api/customers', payload);
    closeForm(); await loadList(); await refreshCatalogs(); // giá trị custom có thể vừa được thêm
    toast(id ? 'Đã cập nhật' : 'Đã thêm khách hàng');
  } catch (err) { toast(err.message, 'err'); }
  finally { btn.disabled = false; btn.textContent = 'Lưu'; }
}

// ---------- Detail drawer ----------
async function openDetail(id) {
  const c = await api('GET', `/api/customers/${id}`);
  CURRENT = c;
  const ring = c.avatar
    ? `<div class="ring"><img class="zoomable" src="${c.avatar}" alt=""></div>`
    : `<div class="ring"><div class="ph">${esc(initials(c.full_name))}</div></div>`;
  const role = [c.position, c.department].filter(Boolean).join(' · ');
  const cell = (k, v, link) => v ? `<div class="info-cell"><div class="k">${k}</div><div class="v">${link ? `<a href="${link}">${esc(v)}</a>` : esc(v)}</div></div>` : '';
  const products = (c.products || []).map((p) => {
    const imgs = [p.image1, p.image2, p.image3].filter(Boolean).map((s) => `<img class="zoomable" src="${s}" alt="">`).join('');
    return `<div class="dp">
      <div class="dp-head"><strong>${esc(p.name || 'Sản phẩm')}</strong>${p.price ? `<span class="dp-price">${esc(p.price)}</span>` : ''}</div>
      ${p.note ? `<div class="dp-note">${esc(p.note)}</div>` : ''}
      ${imgs ? `<div class="dp-imgs">${imgs}</div>` : ''}
    </div>`;
  }).join('');
  $('#detailBody').innerHTML = `
    <div class="detail-hero">
      ${ring}
      <div>
        <h3>${esc(c.full_name)}</h3>
        <div class="role">${esc(role || '—')}</div>
        ${c.industry ? `<span class="pill accent" style="margin-top:8px;display:inline-block">${esc(c.industry)}</span>` : ''}
      </div>
    </div>
    <div class="info-grid">
      ${cell('Công ty', c.company)}
      ${cell('Bộ phận', c.department)}
      ${cell('Chức vụ', c.position)}
      ${cell('Lĩnh vực', c.industry)}
      ${cell('Điện thoại', c.phone, c.phone ? 'tel:' + c.phone : '')}
      ${cell('Email', c.email, c.email ? 'mailto:' + c.email : '')}
    </div>
    ${c.note ? `<div class="note-box">${esc(c.note)}</div>` : ''}
    ${products ? `<div class="sec-title">Sản phẩm (${c.products.length})</div>${products}` : ''}
  `;
  $('#formWrap').classList.add('hidden');
  $('#detailWrap').classList.remove('hidden');
}
function closeDetail() { $('#detailWrap').classList.add('hidden'); }

// ---------- Command palette ----------
let palSel = 0, palItems = [];
function openPalette() {
  $('#paletteWrap').classList.remove('hidden');
  $('#paletteInput').value = ''; renderPalette('');
  setTimeout(() => $('#paletteInput').focus(), 30);
}
function closePalette() { $('#paletteWrap').classList.add('hidden'); }
function renderPalette(q) {
  q = q.trim().toLowerCase();
  palItems = (q ? FLAT.filter((m) => [m.full_name, m.company, m.email, m.phone, m.position].filter(Boolean).some((v) => v.toLowerCase().includes(q))) : FLAT).slice(0, 8);
  palSel = 0;
  const box = $('#paletteResults');
  if (!palItems.length) { box.innerHTML = `<div class="palette-empty">Không tìm thấy “${esc(q)}”</div>`; return; }
  box.innerHTML = palItems.map((m, i) => {
    const av = m.avatar ? `<img src="${m.avatar}" alt="">` : `<div class="ph">${esc(initials(m.full_name))}</div>`;
    return `<div class="p-res ${i === 0 ? 'sel' : ''}" data-id="${m.id}">
      ${av}<div><div class="nm">${esc(m.full_name)}</div><div class="sub">${esc([m.company, m.position].filter(Boolean).join(' · ') || '—')}</div></div></div>`;
  }).join('');
  $$('.p-res', box).forEach((el) => el.onclick = () => { closePalette(); openDetail(Number(el.dataset.id)); });
}
function palMove(d) {
  palSel = (palSel + d + palItems.length) % palItems.length;
  $$('#paletteResults .p-res').forEach((el, i) => el.classList.toggle('sel', i === palSel));
}

// ---------- Lightbox ----------
function openLightbox(src) { $('#lightboxImg').src = src; $('#lightbox').classList.remove('hidden'); }
function closeLightbox() { $('#lightbox').classList.add('hidden'); $('#lightboxImg').removeAttribute('src'); }

// ---------- Danh mục: Bộ phận / Chức vụ ----------
function populateDatalists() {
  $('#departmentList').innerHTML = (META.departments || []).map((d) => `<option value="${esc(d)}">`).join('');
  $('#positionList').innerHTML = (META.positions || []).map((p) => `<option value="${esc(p)}">`).join('');
}
async function refreshCatalogs() {
  const m = await api('GET', '/api/meta');
  META.departments = m.departments || [];
  META.positions = m.positions || [];
  populateDatalists();
}
function openCatalog() {
  $('#catalogWrap').classList.remove('hidden');
  renderCatalog();
}
function closeCatalog() { $('#catalogWrap').classList.add('hidden'); }

async function renderCatalog() {
  const [depts, poss] = await Promise.all([api('GET', '/api/departments'), api('GET', '/api/positions')]);
  const row = (kind, item) => `
    <div class="cat-row">
      <span class="c-name">${esc(item.name)}</span>
      <button class="icon-btn" data-kind="${kind}" data-del="${item.id}" data-name="${esc(item.name)}" title="Xóa">🗑</button>
    </div>`;
  $('#deptList').innerHTML = depts.map((d) => row('departments', d)).join('') || '<p class="hint-small">Chưa có bộ phận nào.</p>';
  $('#posList').innerHTML = poss.map((p) => row('positions', p)).join('') || '<p class="hint-small">Chưa có chức vụ nào.</p>';
  $$('#catalogWrap [data-del]').forEach((b) => b.onclick = async () => {
    if (!confirm(`Xóa "${b.dataset.name}" khỏi danh mục?`)) return;
    try { await api('DELETE', `/api/${b.dataset.kind}/${b.dataset.del}`); await renderCatalog(); await refreshCatalogs(); toast('Đã xóa'); }
    catch (e) { toast(e.message, 'err'); }
  });
}

// ---------- Account & Users ----------
function openAccount() {
  $('#accountWrap').classList.remove('hidden');
  $('#pwForm').reset();
  $('#adminArea').classList.toggle('hidden', META.role !== 'admin');
  if (META.role === 'admin') { $('#userForm').reset(); loadUsers(); }
}
function closeAccount() { $('#accountWrap').classList.add('hidden'); }

async function loadUsers() {
  const users = await api('GET', '/api/users');
  $('#userList').innerHTML = users.map((u) => `
    <div class="user-row">
      <div class="u-av">${esc((u.username[0] || '?').toUpperCase())}</div>
      <div class="u-id">
        <div class="u-name">${esc(u.username)} ${u.id === ME.id ? '<span class="u-meta">(bạn)</span>' : ''}</div>
        <div class="u-meta">${u.must_change_password ? 'Chưa đổi MK lần đầu · ' : ''}tạo ${esc((u.created_at || '').slice(0, 10))}</div>
      </div>
      <span class="role-badge ${u.role}">${u.role === 'admin' ? 'admin' : 'user'}</span>
      <div class="u-actions">
        <button class="icon-btn" title="Đặt lại mật khẩu" data-reset="${u.id}" data-name="${esc(u.username)}">🔑</button>
        ${u.id === ME.id ? '' : `<button class="icon-btn" title="Xóa" data-del="${u.id}" data-name="${esc(u.username)}">🗑</button>`}
      </div>
    </div>`).join('');
  $$('#userList [data-reset]').forEach((b) => b.onclick = () => resetUserPassword(b.dataset.reset, b.dataset.name));
  $$('#userList [data-del]').forEach((b) => b.onclick = () => deleteUser(b.dataset.del, b.dataset.name));
}
async function resetUserPassword(id, name) {
  const np = prompt(`Đặt lại mật khẩu cho “${name}” (tối thiểu 4 ký tự):`);
  if (np === null) return;
  try { await api('POST', `/api/users/${id}/password`, { password: np }); toast(`Đã đặt lại mật khẩu cho ${name}`); loadUsers(); }
  catch (e) { toast(e.message, 'err'); }
}
async function deleteUser(id, name) {
  if (!confirm(`Xóa người dùng “${name}”?`)) return;
  try { await api('DELETE', `/api/users/${id}`); toast('Đã xóa người dùng'); loadUsers(); }
  catch (e) { toast(e.message, 'err'); }
}
async function logout() {
  if (!confirm('Đăng xuất khỏi tài khoản?')) return;
  await api('POST', '/api/auth/logout');
  location.href = '/login.html';
}

// ---------- Theme ----------
function setTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem('gqcrm-theme', t); } catch {}
}

// ---------- bind ----------
let searchTimer;
function bind() {
  const app = document.querySelector('.app');
  $('#btnNew').onclick = $('#btnEmptyNew').onclick = () => openForm(null);
  $('#form').onsubmit = saveForm;
  $('#btnAddProduct').onclick = () => addProductCard();
  $('#btnPickAvatar').onclick = () => $('#avatarInput').click();
  $('#btnClearAvatar').onclick = () => setAvatar(null);
  $('#avatarInput').onchange = (e) => { if (e.target.files[0]) fileToCompressedDataURL(e.target.files[0], 500, .85).then(setAvatar); };

  $$('[data-close-form]').forEach((b) => b.onclick = closeForm);
  $$('[data-close-detail]').forEach((b) => b.onclick = closeDetail);

  $('#btnEdit').onclick = () => openForm(CURRENT);
  $('#btnDelete').onclick = async () => {
    if (!CURRENT || !confirm(`Xóa khách hàng “${CURRENT.full_name}”?`)) return;
    await api('DELETE', `/api/customers/${CURRENT.id}`);
    closeDetail(); await loadList(); toast('Đã xóa');
  };

  // ảnh phóng to (detail)
  $('#detailBody').addEventListener('click', (e) => { const img = e.target.closest('img.zoomable'); if (img) openLightbox(img.src); });
  $('#lightbox').addEventListener('click', closeLightbox);

  $('#search').oninput = () => { clearTimeout(searchTimer); searchTimer = setTimeout(loadList, 250); };

  // xuất CSV (theo bộ lọc tìm kiếm hiện tại)
  $('#btnExport').onclick = () => {
    const q = $('#search').value.trim();
    window.location.href = '/api/export.csv' + (q ? `?q=${encodeURIComponent(q)}` : '');
    toast('Đang tải file CSV…');
  };

  // palette
  $('#openPalette').onclick = openPalette;
  $('#paletteWrap').addEventListener('click', (e) => { if (e.target.id === 'paletteWrap') closePalette(); });
  $('#paletteInput').oninput = (e) => renderPalette(e.target.value);
  $('#paletteInput').onkeydown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); palMove(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); palMove(-1); }
    else if (e.key === 'Enter' && palItems[palSel]) { closePalette(); openDetail(palItems[palSel].id); }
  };

  // account & users
  $('#openAccount').onclick = openAccount;
  $('#btnLogout').onclick = logout;
  $$('[data-close-account]').forEach((b) => b.onclick = closeAccount);
  $('#pwForm').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api('POST', '/api/auth/password', { oldPassword: $('#curPass').value, newPassword: $('#newPass').value });
      $('#pwForm').reset(); toast('Đã đổi mật khẩu');
    } catch (err) { toast(err.message, 'err'); }
  };
  $('#userForm').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api('POST', '/api/users', { username: $('#nuName').value, password: $('#nuPass').value, role: $('#nuRole').value });
      $('#userForm').reset(); toast('Đã tạo người dùng'); loadUsers();
    } catch (err) { toast(err.message, 'err'); }
  };

  // danh mục (bộ phận / chức vụ)
  $('#openCatalog').onclick = () => { app.classList.remove('rail-on'); openCatalog(); };
  $$('[data-close-catalog]').forEach((b) => b.onclick = closeCatalog);
  const addCatalog = (kind, inputId) => async (e) => {
    e.preventDefault();
    const name = $(inputId).value.trim();
    if (!name) return;
    try { await api('POST', `/api/${kind}`, { name }); $(inputId).value = ''; await renderCatalog(); await refreshCatalogs(); toast('Đã thêm'); }
    catch (err) { toast(err.message, 'err'); }
  };
  $('#deptForm').onsubmit = addCatalog('departments', '#deptInput');
  $('#posForm').onsubmit = addCatalog('positions', '#posInput');

  // theme
  $('#themeToggle').onclick = () => setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');

  // mobile rail
  $('#railOpen').onclick = () => app.classList.add('rail-on');
  $('#railClose').onclick = $('#sidebarScrim').onclick = () => app.classList.remove('rail-on');

  // global keys
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); return; }
    if (e.key === 'Escape') {
      if (!$('#lightbox').classList.contains('hidden')) return closeLightbox();
      if (!$('#paletteWrap').classList.contains('hidden')) return closePalette();
      if (!$('#catalogWrap').classList.contains('hidden')) return closeCatalog();
      if (!$('#accountWrap').classList.contains('hidden')) return closeAccount();
      if (!$('#formWrap').classList.contains('hidden')) return closeForm();
      if (!$('#detailWrap').classList.contains('hidden')) return closeDetail();
    }
  });
}

async function init() {
  try { setTheme(localStorage.getItem('gqcrm-theme') || 'light'); } catch {}
  META = await api('GET', '/api/meta');
  const me = await api('GET', '/api/auth/me');
  ME = me.user || ME;
  $('#meName').textContent = META.user;
  $('#meRole').textContent = META.role === 'admin' ? 'Quản trị viên' : 'Người dùng';
  $('#meAvatar').textContent = (META.user || 'A')[0].toUpperCase();
  bind();
  await loadList();
}
init().catch((e) => toast('Không tải được dữ liệu: ' + e.message, 'err'));
