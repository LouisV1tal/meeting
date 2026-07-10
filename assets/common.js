// ============================================================
// Общие утилиты, используются и на index.html, и на admin.html
// ============================================================

const WORK_START = 10; // 10:00
const WORK_END = 19;   // 19:00
const SESSION_KEY = 'mrb_session';

/** Цветовые теги для карточек доски событий */
const EVENT_TAGS = {
  news:      { label: 'Новость',  color: '#4A7FB5' },
  important: { label: 'Важное',   color: '#C1483D' },
  holiday:   { label: 'Праздник', color: '#C1802E' },
  social:    { label: 'Движ',     color: '#6E9A78' },
};

/** SHA-256 хэш строки, возвращает hex */
async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setSession(user) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

/** "14:00" -> 14.0 ; "14:30" -> 14.5 */
function timeToFloat(t) {
  const [h, m] = t.split(':').map(Number);
  return h + m / 60;
}

function floatToTime(f) {
  const h = Math.floor(f);
  const m = Math.round((f - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatDateHuman(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' });
}

function todayISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

function showToast(message, isError = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (isError ? ' error' : '');
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

/** Проверка пересечения интервалов [aStart, aEnd) и [bStart, bEnd) */
function intervalsOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

/** Генерирует список дат (ISO) от startISO до untilISO включительно с заданным шагом.
 *  rule: 'daily' | 'weekly' | 'yearly'. Ограничение — не более 366 дат. */
function generateRecurrenceDates(startISO, untilISO, rule) {
  const dates = [];
  let cursor = new Date(startISO + 'T00:00:00');
  const end = new Date(untilISO + 'T00:00:00');

  while (cursor <= end && dates.length < 366) {
    dates.push(cursor.toISOString().slice(0, 10));
    if (rule === 'daily') cursor.setDate(cursor.getDate() + 1);
    else if (rule === 'weekly') cursor.setDate(cursor.getDate() + 7);
    else if (rule === 'yearly') cursor.setFullYear(cursor.getFullYear() + 1);
    else break;
  }
  return dates;
}

/** Подписывается на realtime-изменения таблицы Supabase и вызывает callback (с debounce). */
function subscribeToTable(table, callback, filter) {
  let timer = null;
  const debounced = () => {
    clearTimeout(timer);
    timer = setTimeout(callback, 250);
  };

  const config = { event: '*', schema: 'public', table };
  if (filter) config.filter = filter;

  return supabaseClient
    .channel(`realtime:${table}:${filter || 'all'}:${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', config, debounced)
    .subscribe();
}

/** Отправляет сообщение в Telegram-чат через Bot API. Ошибки не прерывают основной сценарий,
 *  но подробно логируются в консоль — так их видно при отладке. */
async function sendTelegramNotification(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID || TELEGRAM_BOT_TOKEN.startsWith('YOUR-')) {
    console.warn('Telegram: токен или chat_id не заполнены в config.js — уведомление не отправлено.');
    return;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'HTML' }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      console.error('Telegram notification error:', res.status, body);
    } else {
      console.log('Telegram notification sent:', body);
    }
  } catch (err) {
    console.warn('Telegram notification failed (network):', err);
  }
}
