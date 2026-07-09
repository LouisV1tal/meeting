// ============================================================
// Впиши сюда данные своего проекта Supabase.
// Project Settings -> API -> Project URL / anon public key
// ============================================================
const SUPABASE_URL = 'https://ecxnnuvgrismhggeesoe.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjeG5udXZncmlzbWhnZ2Vlc29lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1ODU2NjUsImV4cCI6MjA5OTE2MTY2NX0.ZVKNxwNZueBSHewB9auPR4QDspOH3u2MlVrKfqqz7z0';

// Пароль от админ-панели (меняй на свой перед публикацией).
// Хранится только на фронтенде — это простая защита от случайных
// людей, а не криптографическая защита от целенаправленной атаки.
const ADMIN_PASSWORD = 'vitalik2001';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
