// ============================================================
// events.html — логика доски событий
// ============================================================

let boardUser = null;
let selectedPhotoFile = null;

init();

function init() {
  boardUser = getSession();
  if (!boardUser) {
    document.getElementById('guard').hidden = false;
    return;
  }

  document.getElementById('board-section').hidden = false;
  document.getElementById('session-name').textContent = boardUser.name;

  bindComposer();
  loadPosts();
}

function bindComposer() {
  const dropZone = document.getElementById('file-drop');
  const fileInput = document.getElementById('post-photo');
  const preview = document.getElementById('photo-preview');
  const clearBtn = document.getElementById('clear-photo-btn');

  dropZone.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      document.getElementById('post-error').textContent = 'Файл слишком большой (максимум 5 МБ).';
      fileInput.value = '';
      return;
    }
    document.getElementById('post-error').textContent = '';
    selectedPhotoFile = file;

    const reader = new FileReader();
    reader.onload = (ev) => {
      preview.src = ev.target.result;
      preview.style.display = 'block';
    };
    reader.readAsDataURL(file);
    dropZone.textContent = `📎 ${file.name}`;
    clearBtn.hidden = false;
  });

  clearBtn.addEventListener('click', () => {
    selectedPhotoFile = null;
    fileInput.value = '';
    preview.style.display = 'none';
    dropZone.textContent = '📎 Прикрепить фото (необязательно) — нажмите, чтобы выбрать файл';
    clearBtn.hidden = true;
  });

  document.getElementById('post-submit').addEventListener('click', submitPost);
}

async function submitPost() {
  const errEl = document.getElementById('post-error');
  errEl.textContent = '';
  const textEl = document.getElementById('post-text');
  const text = textEl.value.trim();
  const submitBtn = document.getElementById('post-submit');

  if (!text && !selectedPhotoFile) {
    errEl.textContent = 'Напишите текст или прикрепите фото.';
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Публикуем…';

  let photo_url = null;

  try {
    if (selectedPhotoFile) {
      const ext = selectedPhotoFile.name.split('.').pop();
      const path = `${boardUser.id}-${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabaseClient.storage
        .from('event-photos')
        .upload(path, selectedPhotoFile);

      if (uploadErr) {
        errEl.textContent = 'Не удалось загрузить фото. Проверьте, что в Supabase создан bucket "event-photos".';
        console.error(uploadErr);
        return;
      }

      const { data: publicUrlData } = supabaseClient.storage.from('event-photos').getPublicUrl(path);
      photo_url = publicUrlData.publicUrl;
    }

    const { error: insertErr } = await supabaseClient.from('events').insert([{
      user_id: boardUser.id,
      text,
      photo_url,
    }]);

    if (insertErr) {
      errEl.textContent = 'Не удалось опубликовать пост. Попробуйте ещё раз.';
      console.error(insertErr);
      return;
    }

    textEl.value = '';
    document.getElementById('clear-photo-btn').click();
    showToast('Опубликовано на доске событий.');
    await loadPosts();
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Опубликовать';
  }
}

async function loadPosts() {
  const grid = document.getElementById('pin-grid');
  grid.innerHTML = '<div class="empty">Загрузка постов…</div>';

  const { data, error } = await supabaseClient
    .from('events')
    .select('*, app_users(name, department)')
    .order('created_at', { ascending: false });

  if (error) {
    grid.innerHTML = '<div class="empty">Не удалось загрузить доску событий. Проверьте, что в Supabase выполнена миграция (таблица events).</div>';
    console.error(error);
    return;
  }

  if (!data.length) {
    grid.innerHTML = '<div class="empty">Пока пусто — стань первым, кто что-то приколет на доску 📌</div>';
    return;
  }

  grid.innerHTML = '';
  data.forEach((post, i) => {
    const tilt = (i % 5 - 2) * 0.8; // лёгкий разброс наклона карточек
    const card = document.createElement('div');
    card.className = 'pin-card';
    card.style.setProperty('--tilt', `${tilt}deg`);

    const isMine = boardUser && post.user_id === boardUser.id;

    card.innerHTML = `
      ${post.photo_url ? `<img src="${escapeHtml(post.photo_url)}" alt="Фото к посту" loading="lazy">` : ''}
      ${post.text ? `<div class="pin-text">${escapeHtml(post.text)}</div>` : ''}
      <div class="pin-meta">
        <span><span class="pin-author">${escapeHtml(post.app_users?.name || '—')}</span> · ${escapeHtml(post.app_users?.department || '')}</span>
        <span>${new Date(post.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</span>
      </div>
      ${isMine ? `<div style="margin-top:8px; text-align:right;"><button class="pin-delete" data-del="${post.id}">Удалить</button></div>` : ''}
    `;
    grid.appendChild(card);
  });

  grid.querySelectorAll('[data-del]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      if (!confirm('Удалить этот пост?')) return;
      const { error: delErr } = await supabaseClient.from('events').delete().eq('id', btn.dataset.del);
      if (delErr) showToast('Не удалось удалить пост.', true);
      else showToast('Пост удалён.');
      await loadPosts();
    })
  );
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
