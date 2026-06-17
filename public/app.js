'use strict';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

let META = { industries: [], user: '' };
let CURRENT = null; // khách hàng đang xem trong viewer

// ---------- Helpers ----------
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

// Đọc file ảnh -> base64 (có nén để giảm dung lượng lưu DB)
function fileToCompressedDataURL(file, maxSize = 900, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          const scale = Math.min(maxSize / width, maxSize / height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function esc(s) {
  return (s ?? '').toString().replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

// ---------- List / groups ----------
async function loadList() {
  const q = $('#search').value.trim();
  const data = await api('GET', `/api/customers?q=${encodeURIComponent(q)}`);
  const list = $('#list');
  list.innerHTML = '';
  $('#stats').textContent = `${data.total} khách hàng · ${data.groups.length} công ty/nhóm`;
  $('#empty').classList.toggle('hidden', data.total > 0);

  // datalist công ty để gợi ý
  const companies = [...new Set(data.groups.map((g) => g.company).filter((c) => c && c !== '(Chưa có công ty)'))];
  $('#companyList').innerHTML = companies.map((c) => `<option value="${esc(c)}">`).join('');

  for (const g of data.groups) {
    const el = document.createElement('div');
    el.className = 'group';
    el.innerHTML = `
      <div class="group-head">
        <span>🏢</span>
        <span class="company">${esc(g.company)}</span>
        <span class="count">${g.members.length} người</span>
      </div>
      <div class="members"></div>`;
    const membersEl = $('.members', el);
    for (const m of g.members) {
      const card = document.createElement('div');
      card.className = 'member';
      const avatar = m.avatar
        ? `<img class="avatar" src="${m.avatar}" alt="">`
        : `<div class="avatar placeholder" style="width:48px;height:48px;border-radius:50%;font-size:22px;">👤</div>`;
      const role = [m.position, m.department].filter(Boolean).join(' · ');
      card.innerHTML = `
        ${avatar}
        <div class="m-info">
          <div class="m-name">${esc(m.full_name)}</div>
          <div class="m-sub">${esc(role || m.email || m.phone || '')}</div>
          ${m.industry ? `<span class="tag">${esc(m.industry)}</span>` : ''}
          ${m.product_count ? `<span class="tag">📦 ${m.product_count} SP</span>` : ''}
        </div>`;
      card.onclick = () => openViewer(m.id);
      membersEl.appendChild(card);
    }
    list.appendChild(el);
  }
}

// ---------- Avatar trong form ----------
let avatarData = null;
function setAvatar(dataURL) {
  avatarData = dataURL || null;
  const img = $('#avatarPreview');
  const ph = $('#avatarPlaceholder');
  if (avatarData) {
    img.src = avatarData;
    img.classList.remove('hidden');
    ph.classList.add('hidden');
  } else {
    img.removeAttribute('src'); // xóa hẳn ảnh cũ, không giữ lại trong DOM
    img.classList.add('hidden');
    ph.classList.remove('hidden');
  }
}

// Dọn sạch form và ẩn modal (gọi sau khi Lưu hoặc Hủy)
function closeForm() {
  $('#modal').classList.add('hidden');
  $('#form').reset();
  $('#products').innerHTML = '';
  $('#customerId').value = '';
  setAvatar(null);
}

// ---------- Sản phẩm ----------
function addProductCard(p = {}) {
  const tpl = $('#productTpl').content.cloneNode(true);
  const card = $('.product-card', tpl);
  $('.p-name', card).value = p.name || '';
  $('.p-price', card).value = p.price || '';
  $('.p-note', card).value = p.note || '';

  const images = [p.image1, p.image2, p.image3];
  $$('.p-img-slot', card).forEach((slot, idx) => {
    slot._data = images[idx] || null;
    renderSlot(slot);
    slot.addEventListener('click', (e) => {
      if (e.target.classList.contains('del-img')) return;
      pickImageForSlot(slot);
    });
  });

  $('.remove-product', card).onclick = () => card.remove();
  $('#products').appendChild(card);
}

function renderSlot(slot) {
  if (slot._data) {
    slot.innerHTML = `<img src="${slot._data}" alt=""><button type="button" class="del-img">✕</button>`;
    $('.del-img', slot).onclick = (e) => {
      e.stopPropagation();
      slot._data = null;
      renderSlot(slot);
    };
  } else {
    slot.innerHTML = '+ Ảnh';
  }
}

function pickImageForSlot(slot) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  // Phải gắn vào DOM thì Safari/macOS mới mở được hộp thoại chọn file
  input.style.display = 'none';
  document.body.appendChild(input);
  input.onchange = async () => {
    try {
      if (input.files[0]) {
        slot._data = await fileToCompressedDataURL(input.files[0]);
        renderSlot(slot);
      }
    } catch (err) {
      alert('Không xử lý được ảnh: ' + err.message);
    } finally {
      input.remove();
    }
  };
  input.click();
}

function collectProducts() {
  return $$('#products .product-card').map((card) => {
    const slots = $$('.p-img-slot', card);
    return {
      name: $('.p-name', card).value.trim(),
      price: $('.p-price', card).value.trim(),
      note: $('.p-note', card).value.trim(),
      image1: slots[0]._data || null,
      image2: slots[1]._data || null,
      image3: slots[2]._data || null,
    };
  }).filter((p) => p.name || p.price || p.note || p.image1 || p.image2 || p.image3);
}

// ---------- Form open/save ----------
function openForm(customer) {
  $('#form').reset();
  $('#products').innerHTML = '';
  $('#customerId').value = customer?.id || '';
  $('#modalTitle').textContent = customer ? 'Sửa khách hàng' : 'Thêm khách hàng';

  $('#full_name').value = customer?.full_name || '';
  $('#phone').value = customer?.phone || '';
  $('#email').value = customer?.email || '';
  $('#company').value = customer?.company || '';
  $('#department').value = customer?.department || '';
  $('#position').value = customer?.position || '';
  $('#note').value = customer?.note || '';

  const sel = $('#industry');
  sel.innerHTML = '<option value="">— Chọn lĩnh vực —</option>' +
    META.industries.map((i) => `<option value="${esc(i)}">${esc(i)}</option>`).join('');
  sel.value = customer?.industry || '';

  setAvatar(customer?.avatar || null);
  (customer?.products || []).forEach(addProductCard);

  $('#viewer').classList.add('hidden');
  $('#modal').classList.remove('hidden');
}

async function saveForm(e) {
  e.preventDefault();
  const id = $('#customerId').value;
  const payload = {
    full_name: $('#full_name').value.trim(),
    phone: $('#phone').value.trim(),
    email: $('#email').value.trim(),
    company: $('#company').value.trim(),
    department: $('#department').value.trim(),
    position: $('#position').value.trim(),
    industry: $('#industry').value,
    note: $('#note').value.trim(),
    avatar: avatarData,
    products: collectProducts(),
  };
  if (!payload.full_name) return alert('Vui lòng nhập Họ tên');

  const btn = $('#btnSave');
  btn.disabled = true;
  btn.textContent = 'Đang lưu...';
  try {
    if (id) await api('PUT', `/api/customers/${id}`, payload);
    else await api('POST', '/api/customers', payload);
    closeForm();
    await loadList();
  } catch (err) {
    alert('Lỗi: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Lưu';
  }
}

// ---------- Lightbox xem ảnh phóng to ----------
function openLightbox(src) {
  const lb = $('#lightbox');
  $('#lightboxImg').src = src;
  lb.classList.remove('hidden');
}
function closeLightbox() {
  $('#lightbox').classList.add('hidden');
  $('#lightboxImg').removeAttribute('src');
}

// ---------- Viewer ----------
async function openViewer(id) {
  const c = await api('GET', `/api/customers/${id}`);
  CURRENT = c;
  $('#viewerTitle').textContent = c.full_name;

  const avatar = c.avatar
    ? `<div class="avatar-wrap"><img class="avatar zoomable" src="${c.avatar}"></div>`
    : `<div class="avatar-wrap"><div class="avatar placeholder">👤</div></div>`;
  const role = [c.position, c.department].filter(Boolean).join(' · ');

  const row = (k, v) => v ? `<div class="v-row"><div class="k">${k}</div><div class="val">${esc(v)}</div></div>` : '';

  const products = (c.products || []).map((p) => {
    const imgs = [p.image1, p.image2, p.image3].filter(Boolean)
      .map((src) => `<img class="zoomable" src="${src}" alt="ảnh sản phẩm">`).join('');
    return `
      <div class="v-product">
        <div class="ph">
          <strong>${esc(p.name || 'Sản phẩm')}</strong>
          ${p.price ? `<span class="price">${esc(p.price)}</span>` : ''}
        </div>
        ${p.note ? `<div class="v-row"><div class="val">${esc(p.note)}</div></div>` : ''}
        ${imgs ? `<div class="imgs">${imgs}</div>` : ''}
      </div>`;
  }).join('');

  $('#viewerBody').innerHTML = `
    <div class="v-top">
      ${avatar}
      <div>
        <div class="v-name">${esc(c.full_name)}</div>
        <div class="v-role">${esc(role)}</div>
        ${c.industry ? `<span class="tag">${esc(c.industry)}</span>` : ''}
      </div>
    </div>
    <div class="v-rows">
      ${row('Công ty', c.company)}
      ${row('Bộ phận', c.department)}
      ${row('Chức vụ', c.position)}
      ${row('Lĩnh vực', c.industry)}
      ${row('Số điện thoại', c.phone)}
      ${row('Email', c.email)}
    </div>
    ${c.note ? `<div class="v-note">${esc(c.note)}</div>` : ''}
    ${products ? `<div class="section-title">Sản phẩm (${c.products.length})</div><div class="v-products">${products}</div>` : ''}
  `;
  $('#modal').classList.add('hidden');
  $('#viewer').classList.remove('hidden');
}

// ---------- Init / events ----------
let searchTimer;
function bind() {
  $('#btnNew').onclick = () => openForm(null);
  $('#btnClose').onclick = $('#btnCancel').onclick = closeForm;
  $('#btnCloseViewer').onclick = () => $('#viewer').classList.add('hidden');
  $('#form').onsubmit = saveForm;
  $('#btnAddProduct').onclick = () => addProductCard();

  $('#btnPickAvatar').onclick = () => $('#avatarInput').click();
  $('#btnClearAvatar').onclick = () => setAvatar(null);
  $('#avatarInput').onchange = async (e) => {
    if (e.target.files[0]) setAvatar(await fileToCompressedDataURL(e.target.files[0], 500, 0.85));
  };

  // Bấm vào ảnh trong phần chi tiết -> mở lightbox phóng to
  $('#viewerBody').addEventListener('click', (e) => {
    const img = e.target.closest('img.zoomable');
    if (img) openLightbox(img.src);
  });
  $('#lightbox').addEventListener('click', closeLightbox);

  $('#btnEdit').onclick = () => openForm(CURRENT);
  $('#btnDelete').onclick = async () => {
    if (!CURRENT || !confirm(`Xóa khách hàng "${CURRENT.full_name}"?`)) return;
    await api('DELETE', `/api/customers/${CURRENT.id}`);
    $('#viewer').classList.add('hidden');
    await loadList();
  };

  $('#search').oninput = () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadList, 250);
  };

  // đóng modal khi bấm nền tối (dọn form nếu là modal nhập liệu)
  const closeModal = (m) => {
    if (m.id === 'modal') closeForm();
    else m.classList.add('hidden');
  };
  $$('.modal').forEach((m) => m.addEventListener('click', (e) => {
    if (e.target === m) closeModal(m);
  }));
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('#lightbox').classList.contains('hidden')) { closeLightbox(); return; }
    $$('.modal').forEach((m) => {
      if (!m.classList.contains('hidden')) closeModal(m);
    });
  });
}

// ---------- Tài khoản & người dùng ----------
let ME = { id: 0, role: 'user' };

async function loadUsers() {
  const users = await api('GET', '/api/users');
  $('#userList').innerHTML = users.map((u) => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--line)">
      <div style="flex:1">
        <strong>${esc(u.username)}</strong> ${u.id === ME.id ? '<small>(bạn)</small>' : ''}
        <div style="font-size:12px;color:var(--muted)">${u.role === 'admin' ? '👑 admin' : 'user'}${u.must_change_password ? ' · chưa đổi MK' : ''}</div>
      </div>
      <button class="btn small ghost" data-reset="${u.id}" data-name="${esc(u.username)}">Đặt lại MK</button>
      ${u.id === ME.id ? '' : `<button class="btn small danger ghost" data-del="${u.id}" data-name="${esc(u.username)}">Xóa</button>`}
    </div>`).join('');
  $$('#userList [data-reset]').forEach((b) => b.onclick = async () => {
    const np = prompt(`Đặt lại mật khẩu cho "${b.dataset.name}" (≥4 ký tự):`);
    if (np === null) return;
    try { await api('POST', `/api/users/${b.dataset.reset}/password`, { password: np }); alert('Đã đặt lại mật khẩu'); loadUsers(); }
    catch (e) { alert('Lỗi: ' + e.message); }
  });
  $$('#userList [data-del]').forEach((b) => b.onclick = async () => {
    if (!confirm(`Xóa người dùng "${b.dataset.name}"?`)) return;
    try { await api('DELETE', `/api/users/${b.dataset.del}`); loadUsers(); }
    catch (e) { alert('Lỗi: ' + e.message); }
  });
}

function bindAccount() {
  $('#btnAccount').onclick = () => {
    $('#pwForm').reset();
    $('#adminArea').classList.toggle('hidden', META.role !== 'admin');
    if (META.role === 'admin') { $('#userForm').reset(); loadUsers(); }
    $('#accountModal').classList.remove('hidden');
  };
  $('#btnCloseAccount').onclick = () => $('#accountModal').classList.add('hidden');
  $('#btnLogout').onclick = async () => {
    if (!confirm('Đăng xuất?')) return;
    await api('POST', '/api/auth/logout');
    location.href = '/login.html';
  };
  $('#pwForm').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api('POST', '/api/auth/password', { oldPassword: $('#curPass').value, newPassword: $('#newPass').value });
      $('#pwForm').reset(); alert('Đã đổi mật khẩu');
    } catch (err) { alert('Lỗi: ' + err.message); }
  };
  $('#userForm').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api('POST', '/api/users', { username: $('#nuName').value, password: $('#nuPass').value, role: $('#nuRole').value });
      $('#userForm').reset(); loadUsers();
    } catch (err) { alert('Lỗi: ' + err.message); }
  };
}

async function init() {
  META = await api('GET', '/api/meta');
  const me = await api('GET', '/api/auth/me');
  ME = me.user || ME;
  $('#userTag').textContent = `${META.user}${META.role === 'admin' ? ' · admin' : ''}`;
  bind();
  bindAccount();
  await loadList();
}

init().catch((e) => alert('Không tải được dữ liệu: ' + e.message));
