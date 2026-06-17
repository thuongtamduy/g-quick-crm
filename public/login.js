'use strict';
const $ = (s) => document.querySelector(s);
const msg = $('#msg');
let oldPassword = ''; // giữ MK vừa nhập để dùng khi bắt buộc đổi

function show(text, kind) { msg.textContent = text; msg.className = 'msg ' + kind; }
function clearMsg() { msg.className = 'msg'; }

// Đích quay về sau khi đăng nhập (?next=/v2/)
const next = new URLSearchParams(location.search).get('next') || '/';

async function api(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Lỗi');
  return data;
}

$('#loginForm').onsubmit = async (e) => {
  e.preventDefault();
  clearMsg();
  const username = $('#username').value.trim();
  const password = $('#password').value;
  const btn = $('#loginBtn'); btn.disabled = true; btn.textContent = 'Đang đăng nhập…';
  try {
    const { user } = await api('/api/auth/login', { username, password });
    oldPassword = password;
    if (user.mustChangePassword) {
      // chuyển sang bước đổi mật khẩu bắt buộc
      $('#loginForm').style.display = 'none';
      $('#changeForm').style.display = 'block';
      $('#newPass').focus();
      show('Đăng nhập thành công. Vui lòng đổi mật khẩu lần đầu.', 'ok');
    } else {
      location.href = next;
    }
  } catch (err) {
    show(err.message, 'err');
  } finally {
    btn.disabled = false; btn.textContent = 'Đăng nhập →';
  }
};

$('#changeForm').onsubmit = async (e) => {
  e.preventDefault();
  clearMsg();
  const p1 = $('#newPass').value, p2 = $('#newPass2').value;
  if (p1.length < 4) return show('Mật khẩu mới tối thiểu 4 ký tự', 'err');
  if (p1 !== p2) return show('Hai mật khẩu không khớp', 'err');
  const btn = $('#changeBtn'); btn.disabled = true; btn.textContent = 'Đang lưu…';
  try {
    await api('/api/auth/password', { oldPassword, newPassword: p1 });
    location.href = next;
  } catch (err) {
    show(err.message, 'err');
    btn.disabled = false; btn.textContent = 'Lưu & tiếp tục →';
  }
};
