// ============================================================
// admin.html — логика админ-панели
// ============================================================

const ADMIN_SESSION_KEY = 'mrb_admin_session';
let bookingsDate = todayISO();
let confirmCallback = null;

init();

function init() {
  bindLogin();
  bindRoomModal();
  bindUserModal();
  bindConfirmModal();
  bindVisibilityModal();

  document.getElementById('bookings-date-filter').value = bookingsDate;
  document.getElementById('bookings-date-filter').addEventListener('change', (e) => {
    bookingsDate = e.target.value;
    loadBookings();
  });

  document.getElementById('admin-logout').addEventListener('click', () => {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    location.reload();
  });

  if (sessionStorage.getItem(ADMIN_SESSION_KEY) === '1') {
    showAdminApp();
  } else {
    document.getElementById('admin-auth').hidden = false;
  }
}

function bindLogin() {
  document.getElementById('admin-login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const pass = document.getElementById('admin-pass').value;
    const errEl = document.getElementById('admin-login-error');
    if (pass === ADMIN_PASSWORD) {
      sessionStorage.setItem(ADMIN_SESSION_KEY, '1');
      showAdminApp();
    } else {
      errEl.textContent = 'Неверный пароль.';
    }
  });
}

function showAdminApp() {
  document.getElementById('admin-auth').hidden = true;
  document.getElementById('admin-app').hidden = false;
  loadRooms();
  loadUsers();
  loadBookings();
  loadEventsModeration();
}

// ---------------- EVENTS BOARD MODERATION ----------------

async function loadEventsModeration() {
  const { data, error } = await supabaseClient
    .from('events')
    .select('*, app_users(name)')
    .order('created_at', { ascending: false });

  const tbody = document.getElementById('events-tbody');
  const empty = document.getElementById('events-empty');
  tbody.innerHTML = '';

  if (error) {
    showToast('Не удалось загрузить доску событий.', true);
    return;
  }
  empty.hidden = data.length > 0;

  data.forEach((post) => {
    const tr = document.createElement('tr');
    const visibilityLabel = (post.visible_departments && post.visible_departments.length)
      ? escapeHtml(post.visible_departments.join(', '))
      : 'всем';

    tr.innerHTML = `
      <td>${escapeHtml(post.app_users?.name || '—')}</td>
      <td style="max-width:260px; white-space:pre-wrap;">${escapeHtml(post.text || '—')}</td>
      <td>${post.photo_url ? '<span class="badge">есть фото</span>' : '—'}</td>
      <td><button class="link-btn" data-set-vis="${post.id}">${visibilityLabel}</button></td>
      <td>${new Date(post.created_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
      <td style="text-align:right;">
        <button class="link-btn" style="color:var(--danger);" data-del-post="${post.id}">Удалить</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('[data-del-post]').forEach((btn) =>
    btn.addEventListener('click', () => {
      openConfirm('Удалить пост?', 'Пост будет удалён с доски событий безвозвратно.', async () => {
        const { error: delErr } = await supabaseClient.from('events').delete().eq('id', btn.dataset.delPost);
        if (delErr) showToast('Не удалось удалить пост.', true);
        else showToast('Пост удалён.');
        loadEventsModeration();
      });
    })
  );

  tbody.querySelectorAll('[data-set-vis]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const post = data.find((p) => p.id === btn.dataset.setVis);
      openVisibilityModal(post);
    })
  );
}

// ---------------- ВИДИМОСТЬ ПОСТА ПО ОТДЕЛАМ ----------------

let visibilityPostId = null;
let visibilitySelected = new Set();

function bindVisibilityModal() {
  document.getElementById('visibility-cancel').addEventListener('click', closeVisibilityModal);
  document.getElementById('visibility-save').addEventListener('click', saveVisibility);
  document.getElementById('visibility-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeVisibilityModal();
  });
}

async function openVisibilityModal(post) {
  visibilityPostId = post.id;
  visibilitySelected = new Set(post.visible_departments || []);

  const { data: users, error } = await supabaseClient.from('app_users').select('department');
  const list = document.getElementById('visibility-dept-list');

  if (error || !users) {
    list.textContent = 'Не удалось загрузить список отделов.';
  } else {
    const departments = [...new Set(users.map((u) => u.department).filter(Boolean))].sort();
    if (!departments.length) {
      list.textContent = 'Отделов пока нет.';
    } else {
      list.innerHTML = departments.map((dept) => `
        <label class="dept-pill ${visibilitySelected.has(dept) ? 'checked' : ''}" data-dept="${escapeHtml(dept)}">
          <input type="checkbox" value="${escapeHtml(dept)}" ${visibilitySelected.has(dept) ? 'checked' : ''}>
          ${escapeHtml(dept)}
        </label>
      `).join('');

      list.querySelectorAll('.dept-pill').forEach((pill) => {
        const checkbox = pill.querySelector('input');
        pill.addEventListener('click', (e) => {
          if (e.target.tagName !== 'INPUT') checkbox.checked = !checkbox.checked;
          const dept = pill.dataset.dept;
          if (checkbox.checked) visibilitySelected.add(dept);
          else visibilitySelected.delete(dept);
          pill.classList.toggle('checked', checkbox.checked);
        });
      });
    }
  }

  document.getElementById('visibility-overlay').hidden = false;
}

function closeVisibilityModal() {
  document.getElementById('visibility-overlay').hidden = true;
  visibilityPostId = null;
  visibilitySelected = new Set();
}

async function saveVisibility() {
  if (!visibilityPostId) return;
  const value = visibilitySelected.size ? [...visibilitySelected] : null;

  const { error } = await supabaseClient
    .from('events')
    .update({ visible_departments: value })
    .eq('id', visibilityPostId);

  if (error) {
    showToast('Не удалось сохранить видимость.', true);
    return;
  }

  showToast('Видимость поста обновлена.');
  closeVisibilityModal();
  loadEventsModeration();
}

// ---------------- ROOMS ----------------

async function loadRooms() {
  const { data, error } = await supabaseClient.from('rooms').select('*').order('name');
  const tbody = document.getElementById('rooms-tbody');
  const empty = document.getElementById('rooms-empty');
  tbody.innerHTML = '';

  if (error) {
    showToast('Не удалось загрузить комнаты.', true);
    return;
  }
  empty.hidden = data.length > 0;

  data.forEach((room) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(room.name)}</td>
      <td>${room.capacity ?? '—'}</td>
      <td>${escapeHtml(room.equipment || '—')}</td>
      <td>${room.is_active ? '<span class="badge" style="color:var(--accent-2); border-color:var(--accent-2);">активна</span>' : '<span class="badge">скрыта</span>'}</td>
      <td style="text-align:right; white-space:nowrap;">
        <button class="link-btn" data-edit="${room.id}">Изменить</button>
        &nbsp;·&nbsp;
        <button class="link-btn" style="color:var(--danger);" data-delete="${room.id}">Удалить</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('[data-edit]').forEach((btn) =>
    btn.addEventListener('click', () => openRoomModal(data.find((r) => r.id === btn.dataset.edit)))
  );
  tbody.querySelectorAll('[data-delete]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const room = data.find((r) => r.id === btn.dataset.delete);
      openConfirm(
        'Удалить переговорку?',
        `«${room.name}» будет удалена вместе со всеми связанными бронями. Это необратимо.`,
        async () => {
          const { error: delErr } = await supabaseClient.from('rooms').delete().eq('id', room.id);
          if (delErr) showToast('Не удалось удалить комнату.', true);
          else showToast('Комната удалена.');
          loadRooms();
          loadBookings();
        }
      );
    })
  );
}

function bindRoomModal() {
  document.getElementById('add-room-btn').addEventListener('click', () => openRoomModal(null));
  document.getElementById('room-cancel').addEventListener('click', closeRoomModal);
  document.getElementById('room-form').addEventListener('submit', saveRoom);
  document.getElementById('room-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeRoomModal();
  });
}

function openRoomModal(room) {
  document.getElementById('room-modal-title').textContent = room ? 'Изменить переговорку' : 'Новая переговорка';
  document.getElementById('room-id').value = room?.id || '';
  document.getElementById('room-name').value = room?.name || '';
  document.getElementById('room-capacity').value = room?.capacity || '';
  document.getElementById('room-equipment').value = room?.equipment || '';
  document.getElementById('room-active').checked = room ? room.is_active : true;
  document.getElementById('room-error').textContent = '';
  document.getElementById('room-overlay').hidden = false;
}

function closeRoomModal() {
  document.getElementById('room-overlay').hidden = true;
}

async function saveRoom(e) {
  e.preventDefault();
  const id = document.getElementById('room-id').value;
  const payload = {
    name: document.getElementById('room-name').value.trim(),
    capacity: document.getElementById('room-capacity').value ? Number(document.getElementById('room-capacity').value) : null,
    equipment: document.getElementById('room-equipment').value.trim(),
    is_active: document.getElementById('room-active').checked,
  };

  const errEl = document.getElementById('room-error');
  if (!payload.name) {
    errEl.textContent = 'Укажите название комнаты.';
    return;
  }

  const query = id
    ? supabaseClient.from('rooms').update(payload).eq('id', id)
    : supabaseClient.from('rooms').insert([payload]);

  const { error } = await query;
  if (error) {
    errEl.textContent = 'Не удалось сохранить. Попробуйте ещё раз.';
    return;
  }

  closeRoomModal();
  showToast('Комната сохранена.');
  loadRooms();
}

// ---------------- USERS ----------------

async function loadUsers() {
  const { data, error } = await supabaseClient
    .from('app_users')
    .select('id, name, department, created_at')
    .order('created_at', { ascending: false });

  const tbody = document.getElementById('users-tbody');
  const empty = document.getElementById('users-empty');
  tbody.innerHTML = '';

  if (error) {
    showToast('Не удалось загрузить пользователей.', true);
    return;
  }
  empty.hidden = data.length > 0;

  data.forEach((u) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(u.name)}</td>
      <td>${escapeHtml(u.department)}</td>
      <td>${new Date(u.created_at).toLocaleDateString('ru-RU')}</td>
      <td style="text-align:right;">
        <button class="link-btn" data-edit-user="${u.id}">Изменить</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('[data-edit-user]').forEach((btn) =>
    btn.addEventListener('click', () => openUserModal(data.find((u) => u.id === btn.dataset.editUser)))
  );
}

function bindUserModal() {
  document.getElementById('user-cancel').addEventListener('click', closeUserModal);
  document.getElementById('user-form').addEventListener('submit', saveUser);
  document.getElementById('user-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeUserModal();
  });
}

function openUserModal(user) {
  document.getElementById('user-id').value = user.id;
  document.getElementById('user-name').value = user.name;
  document.getElementById('user-dept').value = user.department;
  document.getElementById('user-error').textContent = '';
  document.getElementById('user-overlay').hidden = false;
}

function closeUserModal() {
  document.getElementById('user-overlay').hidden = true;
}

async function saveUser(e) {
  e.preventDefault();
  const id = document.getElementById('user-id').value;
  const name = document.getElementById('user-name').value.trim();
  const department = document.getElementById('user-dept').value.trim();
  const errEl = document.getElementById('user-error');

  if (!name || !department) {
    errEl.textContent = 'Заполните оба поля.';
    return;
  }

  const { error } = await supabaseClient.from('app_users').update({ name, department }).eq('id', id);
  if (error) {
    errEl.textContent = error.code === '23505' ? 'Такое имя уже занято.' : 'Не удалось сохранить.';
    return;
  }

  closeUserModal();
  showToast('Пользователь обновлён.');
  loadUsers();
}

// ---------------- BOOKINGS ----------------

async function loadBookings() {
  const { data, error } = await supabaseClient
    .from('bookings')
    .select('*, rooms(name), app_users(name)')
    .eq('booking_date', bookingsDate)
    .order('start_time');

  const tbody = document.getElementById('bookings-tbody');
  const empty = document.getElementById('bookings-empty');
  tbody.innerHTML = '';

  if (error) {
    showToast('Не удалось загрузить брони.', true);
    return;
  }
  empty.hidden = data.length > 0;

  data.forEach((b) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(b.rooms?.name || '—')}</td>
      <td class="badge" style="border:none; padding-left:0;">${b.start_time.slice(0,5)}–${b.end_time.slice(0,5)}</td>
      <td>${escapeHtml(b.app_users?.name || '—')}</td>
      <td>${escapeHtml(b.department)}</td>
      <td>${escapeHtml(b.purpose || '—')}</td>
      <td style="text-align:right;">
        <button class="link-btn" style="color:var(--danger);" data-cancel="${b.id}">Отменить</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('[data-cancel]').forEach((btn) => {
    const booking = data.find((b) => b.id === btn.dataset.cancel);
    btn.addEventListener('click', () => {
      openConfirm('Отменить бронь?', 'Слот снова станет свободным для бронирования.', async () => {
        const { error: delErr } = await supabaseClient.from('bookings').delete().eq('id', btn.dataset.cancel);
        if (delErr) {
          showToast('Не удалось отменить бронь.', true);
        } else {
          showToast('Бронь отменена.');
          sendTelegramNotification([
            `❌ <b>Бронь отменена (админ-панель)</b>`,
            `Комната: ${booking?.rooms?.name || '—'}`,
            `Была на: ${booking?.app_users?.name || '—'} (${booking?.department || ''})`,
            `Дата: ${booking?.booking_date || bookingsDate}, время: ${booking?.start_time?.slice(0,5)}–${booking?.end_time?.slice(0,5)}`,
          ].join('\n'));
        }
        loadBookings();
      });
      confirmCallback && (document.getElementById('confirm-yes').textContent = 'Отменить бронь');
    });
  });
}

// ---------------- CONFIRM MODAL ----------------

function bindConfirmModal() {
  document.getElementById('confirm-no').addEventListener('click', closeConfirm);
  document.getElementById('confirm-yes').addEventListener('click', async () => {
    if (confirmCallback) await confirmCallback();
    closeConfirm();
  });
  document.getElementById('confirm-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeConfirm();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeRoomModal();
      closeUserModal();
      closeConfirm();
      closeVisibilityModal();
    }
  });
}

function openConfirm(title, sub, callback) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-sub').textContent = sub;
  document.getElementById('confirm-yes').textContent = 'Удалить';
  confirmCallback = callback;
  document.getElementById('confirm-overlay').hidden = false;
}

function closeConfirm() {
  document.getElementById('confirm-overlay').hidden = true;
  confirmCallback = null;
}

// ---------------- helpers ----------------

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
