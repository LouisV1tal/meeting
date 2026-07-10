// ============================================================
// index.html — логика приложения бронирования
// ============================================================

let currentUser = null;
let selectedDate = todayISO();
let roomsCache = [];
let pendingSlot = null; // { roomId, roomName, start, end }
let pendingCancelId = null;
let pendingDetailsBooking = null;

const authSection = document.getElementById('auth-section');
const appSection = document.getElementById('app-section');

init();

async function init() {
  currentUser = getSession();
  await populateLoginNames();

  if (currentUser) {
    showApp();
  } else {
    showAuth();
  }

  bindAuthEvents();
  bindAppEvents();
  bindModalEvents();
}

function showAuth() {
  authSection.hidden = false;
  appSection.hidden = true;
}

async function showApp() {
  authSection.hidden = true;
  appSection.hidden = false;
  document.getElementById('session-name').textContent = currentUser.name;
  document.getElementById('session-dept').textContent = currentUser.department;

  const dp = document.getElementById('date-picker');
  dp.value = selectedDate;
  document.getElementById('date-human').textContent = formatDateHuman(selectedDate);

  await loadRoomsAndBookings();
  setupRealtime();
}

function setupRealtime() {
  // Календарь обновляется сам, если кто-то другой создал/отменил бронь
  subscribeToTable('bookings', () => loadRoomsAndBookings());

  // Если открыта карточка с комментариями — обновляем её живьём
  subscribeToTable('booking_comments', () => {
    if (pendingDetailsBooking) loadComments(pendingDetailsBooking.id);
  });
}

// ---------------- AUTH ----------------

async function populateLoginNames() {
  const { data, error } = await supabaseClient
    .from('app_users')
    .select('id, name')
    .order('name', { ascending: true });

  const select = document.getElementById('login-name');
  if (error) {
    console.error(error);
    return;
  }
  data.forEach((u) => {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = u.name;
    select.appendChild(opt);
  });
}

function bindAuthEvents() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const isLogin = tab.dataset.tab === 'login';
      document.getElementById('login-form').hidden = !isLogin;
      document.getElementById('register-form').hidden = isLogin;
    });
  });

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('login-error');
    errEl.textContent = '';
    const userId = document.getElementById('login-name').value;
    const pin = document.getElementById('login-pin').value.trim();

    if (!userId || !pin) return;

    const { data: user, error } = await supabaseClient
      .from('app_users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !user) {
      errEl.textContent = 'Пользователь не найден.';
      return;
    }

    const hash = await sha256(pin);
    if (hash !== user.pin_hash) {
      errEl.textContent = 'Неверный PIN-код.';
      return;
    }

    currentUser = { id: user.id, name: user.name, department: user.department };
    setSession(currentUser);
    showApp();
  });

  document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('register-error');
    errEl.textContent = '';

    const name = document.getElementById('reg-name').value.trim();
    const department = document.getElementById('reg-dept').value.trim();
    const pin = document.getElementById('reg-pin').value.trim();

    if (!/^\d{4,6}$/.test(pin)) {
      errEl.textContent = 'PIN должен состоять из 4–6 цифр.';
      return;
    }

    const pin_hash = await sha256(pin);

    const { data, error } = await supabaseClient
      .from('app_users')
      .insert([{ name, department, pin_hash }])
      .select()
      .single();

    if (error) {
      errEl.textContent = error.code === '23505'
        ? 'Пользователь с таким именем уже зарегистрирован.'
        : 'Не удалось зарегистрироваться. Попробуйте ещё раз.';
      return;
    }

    currentUser = { id: data.id, name: data.name, department: data.department };
    setSession(currentUser);
    showApp();
  });
}

// ---------------- APP ----------------

function bindAppEvents() {
  document.getElementById('logout-btn').addEventListener('click', () => {
    clearSession();
    currentUser = null;
    location.reload();
  });

  document.getElementById('date-picker').addEventListener('change', async (e) => {
    selectedDate = e.target.value;
    document.getElementById('date-human').textContent = formatDateHuman(selectedDate);
    await loadRoomsAndBookings();
  });

  document.getElementById('today-btn').addEventListener('click', async () => {
    selectedDate = todayISO();
    document.getElementById('date-picker').value = selectedDate;
    document.getElementById('date-human').textContent = formatDateHuman(selectedDate);
    await loadRoomsAndBookings();
  });
}

async function loadRoomsAndBookings() {
  const container = document.getElementById('rooms-container');
  container.innerHTML = '<div class="empty">Загрузка…</div>';

  const { data: rooms, error: roomsErr } = await supabaseClient
    .from('rooms')
    .select('*')
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (roomsErr) {
    container.innerHTML = '<div class="empty">Не удалось загрузить комнаты. Проверьте настройки Supabase в assets/config.js.</div>';
    console.error(roomsErr);
    return;
  }

  if (!rooms.length) {
    container.innerHTML = '<div class="empty">Комнаты ещё не добавлены. Зайдите в админ-панель, чтобы создать первую.</div>';
    return;
  }

  roomsCache = rooms;

  const { data: bookings, error: bookErr } = await supabaseClient
    .from('bookings')
    .select('*, app_users(name)')
    .eq('booking_date', selectedDate);

  if (bookErr) {
    console.error(bookErr);
  }

  renderRooms(rooms, bookings || []);
}

function renderRooms(rooms, bookings) {
  const container = document.getElementById('rooms-container');
  container.innerHTML = '';

  rooms.forEach((room) => {
    const roomBookings = bookings
      .filter((b) => b.room_id === room.id)
      .sort((a, b) => a.start_time.localeCompare(b.start_time));

    const block = document.createElement('div');
    block.className = 'room-block panel';

    const meta = [room.capacity ? `${room.capacity} чел.` : null, room.equipment || null]
      .filter(Boolean)
      .join(' · ');

    block.innerHTML = `
      <div class="room-head">
        <span class="room-name">${escapeHtml(room.name)}</span>
        <span class="room-meta">${escapeHtml(meta)}</span>
      </div>
      <div class="ruler">
        <div class="ruler-ticks" id="ruler-${room.id}"></div>
      </div>
      <div class="legend">
        <span><span class="dot busy"></span>Занято</span>
        <span><span class="dot free"></span>Свободно — нажмите, чтобы забронировать</span>
      </div>
    `;
    container.appendChild(block);

    renderRuler(room, roomBookings);
  });
}

function renderRuler(room, roomBookings) {
  const ruler = document.getElementById(`ruler-${room.id}`);
  const totalSpan = WORK_END - WORK_START;

  // Часовые засечки
  for (let h = WORK_START; h <= WORK_END; h++) {
    const pct = ((h - WORK_START) / totalSpan) * 100;
    const tick = document.createElement('div');
    tick.className = 'tick';
    tick.style.left = `${pct}%`;
    tick.innerHTML = `<span class="tick-label">${String(h).padStart(2, '0')}:00</span>`;
    ruler.appendChild(tick);
  }

  // Строим список свободных промежутков между бронями
  const busyIntervals = roomBookings.map((b) => ({
    start: timeToFloat(b.start_time),
    end: timeToFloat(b.end_time),
    booking: b,
  }));

  let cursor = WORK_START;
  const freeIntervals = [];
  busyIntervals.forEach((bi) => {
    if (bi.start > cursor) freeIntervals.push({ start: cursor, end: bi.start });
    cursor = Math.max(cursor, bi.end);
  });
  if (cursor < WORK_END) freeIntervals.push({ start: cursor, end: WORK_END });

  const placeBlock = (startF, endF, el) => {
    const left = ((startF - WORK_START) / totalSpan) * 100;
    const width = ((endF - startF) / totalSpan) * 100;
    el.style.left = `${left}%`;
    el.style.width = `${width}%`;
  };

  busyIntervals.forEach((bi) => {
    const el = document.createElement('div');
    el.className = 'slot busy';
    placeBlock(bi.start, bi.end, el);
    el.innerHTML = `
      <span class="slot-name">${escapeHtml(bi.booking.app_users?.name || 'Занято')}</span>
      <span>${bi.booking.start_time.slice(0,5)}–${bi.booking.end_time.slice(0,5)}${bi.booking.purpose ? ' · ' + escapeHtml(bi.booking.purpose) : ''}</span>
    `;
    el.title = 'Нажмите, чтобы посмотреть детали и комментарии';
    el.addEventListener('click', () => openDetailsModal(room, bi.booking));
    ruler.appendChild(el);
  });

  freeIntervals.forEach((fi) => {
    if (fi.end - fi.start < 0.0167) return; // меньше минуты — пропускаем
    const el = document.createElement('div');
    el.className = 'slot free';
    placeBlock(fi.start, fi.end, el);
    el.innerHTML = `<span>Свободно</span><span>${floatToTime(fi.start)}–${floatToTime(fi.end)}</span>`;
    el.addEventListener('click', () => openBookingModal(room, fi));
    ruler.appendChild(el);
  });
}

// ---------------- BOOKING MODAL ----------------

function bindModalEvents() {
  document.getElementById('booking-cancel').addEventListener('click', closeBookingModal);
  document.getElementById('booking-form').addEventListener('submit', submitBooking);

  document.getElementById('cancel-no').addEventListener('click', closeCancelModal);
  document.getElementById('cancel-yes').addEventListener('click', confirmCancel);

  document.getElementById('details-close').addEventListener('click', closeDetailsModal);
  document.getElementById('details-cancel-booking').addEventListener('click', () => {
    const booking = pendingDetailsBooking;
    closeDetailsModal();
    openCancelModal(booking);
  });
  document.getElementById('comment-form').addEventListener('submit', submitComment);

  document.getElementById('booking-repeat').addEventListener('change', (e) => {
    const untilField = document.getElementById('repeat-until-field');
    untilField.hidden = !e.target.value;
    if (e.target.value) {
      document.getElementById('booking-repeat-until').min = selectedDate;
    }
  });

  // Клик по затемнённому фону закрывает модалку
  document.getElementById('booking-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'booking-overlay') closeBookingModal();
  });
  document.getElementById('cancel-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'cancel-overlay') closeCancelModal();
  });
  document.getElementById('details-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'details-overlay') closeDetailsModal();
  });
}

function openBookingModal(room, freeInterval) {
  closeCancelModal();
  closeDetailsModal();
  pendingSlot = { room };
  document.getElementById('booking-room-label').textContent = `${room.name} · ${formatDateHuman(selectedDate)}`;

  const suggestedEnd = Math.min(freeInterval.start + 1, freeInterval.end);
  document.getElementById('booking-start').value = floatToTime(freeInterval.start);
  document.getElementById('booking-end').value = floatToTime(suggestedEnd);
  document.getElementById('booking-purpose').value = '';
  document.getElementById('booking-dept').value = currentUser.department;
  document.getElementById('booking-repeat').value = '';
  document.getElementById('repeat-until-field').hidden = true;
  document.getElementById('booking-repeat-until').value = '';
  document.getElementById('booking-error').textContent = '';

  document.getElementById('booking-overlay').hidden = false;
}

function closeBookingModal() {
  document.getElementById('booking-overlay').hidden = true;
  pendingSlot = null;
}

async function submitBooking(e) {
  e.preventDefault();
  const errEl = document.getElementById('booking-error');
  errEl.textContent = '';

  const start = document.getElementById('booking-start').value;
  const end = document.getElementById('booking-end').value;
  const purpose = document.getElementById('booking-purpose').value.trim();
  const repeatRule = document.getElementById('booking-repeat').value; // '' | daily | weekly | yearly
  const repeatUntil = document.getElementById('booking-repeat-until').value;
  const room = pendingSlot.room; // сохраняем до закрытия модалки — closeBookingModal() обнулит pendingSlot

  if (!start || !end) return;
  if (timeToFloat(end) <= timeToFloat(start)) {
    errEl.textContent = 'Время окончания должно быть позже времени начала.';
    return;
  }
  if (timeToFloat(start) < WORK_START || timeToFloat(end) > WORK_END) {
    errEl.textContent = `Бронирование доступно с ${WORK_START}:00 до ${WORK_END}:00.`;
    return;
  }
  if (repeatRule && !repeatUntil) {
    errEl.textContent = 'Укажите дату, до которой повторять бронь.';
    return;
  }

  const dates = repeatRule
    ? generateRecurrenceDates(selectedDate, repeatUntil, repeatRule)
    : [selectedDate];

  if (repeatRule && dates.length > 1) {
    const confirmMsg = `Будет создано до ${dates.length} броней (${selectedDate} → ${repeatUntil}). Даты, где слот уже занят, будут пропущены. Продолжить?`;
    if (!confirm(confirmMsg)) return;
  }

  // Проверяем занятость по всем датам разом
  const { data: fresh, error: freshErr } = await supabaseClient
    .from('bookings')
    .select('booking_date, start_time, end_time')
    .eq('room_id', room.id)
    .in('booking_date', dates);

  if (freshErr) {
    errEl.textContent = 'Ошибка проверки доступности. Попробуйте снова.';
    return;
  }

  const busyByDate = {};
  fresh.forEach((b) => {
    (busyByDate[b.booking_date] = busyByDate[b.booking_date] || []).push(b);
  });

  const recurrenceId = dates.length > 1 ? crypto.randomUUID() : null;
  const rowsToInsert = [];
  const skippedDates = [];

  dates.forEach((d) => {
    const dayBookings = busyByDate[d] || [];
    const conflict = dayBookings.some((b) =>
      intervalsOverlap(timeToFloat(start), timeToFloat(end), timeToFloat(b.start_time), timeToFloat(b.end_time))
    );
    if (conflict) {
      skippedDates.push(d);
    } else {
      rowsToInsert.push({
        room_id: room.id,
        user_id: currentUser.id,
        booking_date: d,
        start_time: start,
        end_time: end,
        purpose,
        department: currentUser.department,
        recurrence_id: recurrenceId,
        recurrence_rule: recurrenceId ? repeatRule : null,
      });
    }
  });

  if (!rowsToInsert.length) {
    errEl.textContent = 'Все выбранные даты уже заняты — обновите страницу и выберите другое время.';
    await loadRoomsAndBookings();
    return;
  }

  const { error: insertErr } = await supabaseClient.from('bookings').insert(rowsToInsert);

  if (insertErr) {
    errEl.textContent = 'Не удалось создать бронь. Попробуйте ещё раз.';
    console.error(insertErr);
    return;
  }

  closeBookingModal();

  if (rowsToInsert.length > 1) {
    showToast(`Создано ${rowsToInsert.length} броней${skippedDates.length ? `, пропущено ${skippedDates.length} (занято)` : ''}.`);
  } else {
    showToast('Переговорка забронирована.');
  }

  const repeatLabel = { daily: 'каждый день', weekly: 'каждую неделю', yearly: 'каждый год' }[repeatRule] || '';
  const notifyLines = [
    `📅 <b>Новая бронь переговорки</b>`,
    `Комната: ${room.name}`,
    `Кто: ${currentUser.name} (${currentUser.department})`,
    rowsToInsert.length > 1
      ? `Даты: ${rowsToInsert[0].booking_date} → ${rowsToInsert[rowsToInsert.length - 1].booking_date} (${repeatLabel}, ${rowsToInsert.length} шт.)`
      : `Дата: ${rowsToInsert[0].booking_date}`,
    `Время: ${start}–${end}`,
    purpose ? `Цель: ${purpose}` : null,
  ].filter(Boolean);
  sendTelegramNotification(notifyLines.join('\n'));

  await loadRoomsAndBookings();
}

// ---------------- DETAILS + COMMENTS MODAL ----------------

async function openDetailsModal(room, booking) {
  closeBookingModal();
  closeCancelModal();
  pendingDetailsBooking = booking;

  document.getElementById('details-room-label').textContent = `${room.name} · ${formatDateHuman(selectedDate)}`;
  document.getElementById('details-time').textContent = `${booking.start_time.slice(0,5)}–${booking.end_time.slice(0,5)}`
    + (booking.recurrence_rule ? ` · 🔁 ${({daily:'ежедневно', weekly:'еженедельно', yearly:'ежегодно'})[booking.recurrence_rule] || ''}` : '');
  document.getElementById('details-who').textContent = booking.app_users?.name || '—';
  document.getElementById('details-dept').textContent = booking.department;
  document.getElementById('details-purpose').textContent = booking.purpose || '—';

  const isMine = currentUser && booking.user_id === currentUser.id;
  document.getElementById('details-cancel-booking').hidden = !isMine;

  document.getElementById('comment-input').value = '';
  document.getElementById('details-overlay').hidden = false;

  await loadComments(booking.id);
}

function closeDetailsModal() {
  document.getElementById('details-overlay').hidden = true;
  pendingDetailsBooking = null;
}

async function loadComments(bookingId) {
  const list = document.getElementById('comments-list');
  list.innerHTML = '<div class="comments-empty">Загрузка…</div>';

  const { data, error } = await supabaseClient
    .from('booking_comments')
    .select('*, app_users(name)')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: true });

  if (error) {
    list.innerHTML = '<div class="comments-empty">Не удалось загрузить комментарии.</div>';
    return;
  }

  if (!data.length) {
    list.innerHTML = '<div class="comments-empty">Комментариев пока нет.</div>';
    return;
  }

  list.innerHTML = data.map((c) => `
    <div class="comment-item">
      <div class="comment-meta">
        <span>${escapeHtml(c.app_users?.name || '—')}</span>
        <span>${new Date(c.created_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      <div class="comment-text">${escapeHtml(c.text)}</div>
    </div>
  `).join('');
  list.scrollTop = list.scrollHeight;
}

async function submitComment(e) {
  e.preventDefault();
  if (!pendingDetailsBooking) return;
  const input = document.getElementById('comment-input');
  const text = input.value.trim();
  if (!text) return;

  const { error } = await supabaseClient.from('booking_comments').insert([{
    booking_id: pendingDetailsBooking.id,
    user_id: currentUser.id,
    text,
  }]);

  if (error) {
    showToast('Не удалось отправить комментарий.', true);
    return;
  }

  input.value = '';
  await loadComments(pendingDetailsBooking.id);
}

// ---------------- CANCEL MODAL ----------------

let pendingCancelRecurrenceId = null;

function openCancelModal(booking) {
  closeBookingModal();
  closeDetailsModal();
  pendingCancelId = booking.id;
  pendingCancelRecurrenceId = booking.recurrence_id || null;
  document.getElementById('cancel-details').textContent =
    `${booking.start_time.slice(0,5)}–${booking.end_time.slice(0,5)}, ${formatDateHuman(selectedDate)}`;
  document.getElementById('cancel-all-field').hidden = !pendingCancelRecurrenceId;
  document.getElementById('cancel-all-recurring').checked = false;
  document.getElementById('cancel-overlay').hidden = false;
}

function closeCancelModal() {
  document.getElementById('cancel-overlay').hidden = true;
  pendingCancelId = null;
  pendingCancelRecurrenceId = null;
}

async function confirmCancel() {
  if (!pendingCancelId) return;
  const cancelAll = pendingCancelRecurrenceId && document.getElementById('cancel-all-recurring').checked;

  const query = cancelAll
    ? supabaseClient.from('bookings').delete().eq('recurrence_id', pendingCancelRecurrenceId)
    : supabaseClient.from('bookings').delete().eq('id', pendingCancelId);

  const { error } = await query;
  if (error) {
    showToast('Не удалось отменить бронь.', true);
  } else {
    showToast('Бронь отменена.');
  }
  closeCancelModal();
  await loadRoomsAndBookings();
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
