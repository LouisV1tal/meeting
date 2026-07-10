// ============================================================
// Впиши сюда данные своего проекта Supabase.
// Project Settings -> API -> Project URL / anon public key
// ============================================================
const SUPABASE_URL = 'https://fgchfyesqquvtkjwpqfi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnY2hmeWVzcXF1dnRrandwcWZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1OTUzNTksImV4cCI6MjA5OTE3MTM1OX0.Q3ddRm2SGKSflD3qGmTvMVrRZzkJlgbOC22ZRJAAP9U';

// Пароль от админ-панели (меняй на свой перед публикацией).
// Хранится только на фронтенде — это простая защита от случайных
// людей, а не криптографическая защита от целенаправленной атаки.
const ADMIN_PASSWORD = 'vitalik2001';

// ============================================================
// Telegram-уведомления о новых бронях переговорок (необязательно).
// 1. Создай бота через @BotFather в Telegram, получи токен.
// 2. Добавь бота в свою группу/чат и получи chat_id (например,
//    через @userinfobot или https://api.telegram.org/bot<токен>/getUpdates).
// 3. Впиши оба значения ниже. Если оставить как есть — уведомления
//    просто не будут отправляться, остальной сайт продолжит работать.
// ⚠️ Токен бота будет виден в открытом коде сайта — не используй
//    бота, который подключён к чему-то важному помимо этого чата.
// ============================================================
const TELEGRAM_BOT_TOKEN = '8276286798:AAGQkNsrsBiGn1h_BtjTC_W2bT5cQXJ7J_A';
const TELEGRAM_CHAT_ID = '-1004241023608';

const supabaseClient = window.supabase.createClient('https://fgchfyesqquvtkjwpqfi.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnY2hmeWVzcXF1dnRrandwcWZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1OTUzNTksImV4cCI6MjA5OTE3MTM1OX0.Q3ddRm2SGKSflD3qGmTvMVrRZzkJlgbOC22ZRJAAP9U');
