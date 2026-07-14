// ============================================================
// events.html — логика доски событий
// ============================================================

let boardUser = null;
let selectedPhotoFile = null;
let pendingPostId = null;

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
  bindPostModal();
  loadPosts();
  setupRealtime();
}

function setupRealtime() {
  subscribeToTable('events', () => loadPosts());
  subscribeToTable('event_comments', () => {
    if (pendingPostId) loadPostComments(pendingPostId);
  });
}

// ---------------- COMPOSER ----------------

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
  const tag = document.getElementById('post-tag').value || null;
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

    // Видимость по отделам по умолчанию — видно всем. Настраивается позже из админ-панели.
    const { error: insertErr } = await supabaseClient.from('events').insert([{
      user_id: boardUser.id,
      text,
      photo_url,
      tag,
      media_type: selectedPhotoFile ? 'image' : null,
    }]);

    if (insertErr) {
      errEl.textContent = 'Не удалось опубликовать пост. Попробуйте ещё раз.';
      console.error(insertErr);
      return;
    }

    textEl.value = '';
    document.getElementById('post-tag').value = '';
    document.getElementById('clear-photo-btn').click();
    showToast('Опубликовано на доске событий.');
    await loadPosts();
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Опубликовать';
  }
}

// ---------------- FEED ----------------

/** Пост скрыт, если у него заданы видимые отделы (это настраивается в админке)
 *  и текущий пользователь не из этого списка — кроме самого автора, он видит свой пост всегда. */
function canSeePost(post) {
  if (!post.visible_departments || !post.visible_departments.length) return true;
  if (post.user_id === boardUser.id) return true;
  return post.visible_departments.includes(boardUser.department);
}

async function loadPosts() {
  const grid = document.getElementById('pin-grid');

  const { data, error } = await supabaseClient
    .from('events')
    .select('*, app_users(name, department)')
    .order('created_at', { ascending: false });

  if (error) {
    grid.innerHTML = '<div class="empty">Не удалось загрузить доску событий. Проверьте, что в Supabase выполнены миграции.</div>';
    console.error(error);
    return;
  }

  const visiblePosts = data.filter(canSeePost);

  if (!visiblePosts.length) {
    grid.innerHTML = '<div class="empty">Пока пусто — стань первым, кто что-то приколет на доску 📌</div>';
    return;
  }

  grid.innerHTML = '';
  visiblePosts.forEach((post, i) => {
    const tilt = (i % 5 - 2) * 0.8;
    const card = document.createElement('div');
    card.className = 'pin-card';
    card.style.setProperty('--tilt', `${tilt}deg`);

    const tagInfo = post.tag ? EVENT_TAGS[post.tag] : null;
    if (tagInfo) card.style.borderLeftColor = tagInfo.color;

    const isMine = boardUser && post.user_id === boardUser.id;
    const isRestricted = post.visible_departments && post.visible_departments.length;

    card.innerHTML = `
      ${tagInfo ? `<span class="pin-tag" style="background:${tagInfo.color};">${escapeHtml(tagInfo.label)}</span>` : ''}
      ${isRestricted ? `<span class="pin-visibility">👁 ${post.visible_departments.map(escapeHtml).join(', ')}</span>` : ''}
      ${post.photo_url ? `<img src="${escapeHtml(post.photo_url)}" alt="Фото к посту" loading="lazy">` : ''}
      ${post.text ? `<div class="pin-text">${escapeHtml(post.text)}</div>` : ''}
      <div class="pin-meta">
        <span><span class="pin-author">${escapeHtml(post.app_users?.name || '—')}</span> · ${escapeHtml(post.app_users?.department || '')}</span>
        <span>${new Date(post.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</span>
      </div>
      ${isMine ? `<div style="margin-top:8px; text-align:right;"><button class="pin-delete" data-del="${post.id}">Удалить</button></div>` : ''}
    `;

    card.addEventListener('click', () => openPostModal(post));
    grid.appendChild(card);
  });

  grid.querySelectorAll('[data-del]').forEach((btn) =>
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('Удалить этот пост?')) return;
      const { error: delErr } = await supabaseClient.from('events').delete().eq('id', btn.dataset.del);
      if (delErr) showToast('Не удалось удалить пост.', true);
      else showToast('Пост удалён.');
      await loadPosts();
    })
  );
}

// ---------------- POST DETAILS + COMMENTS MODAL ----------------

function bindPostModal() {
  document.getElementById('post-modal-close').addEventListener('click', closePostModal);
  document.getElementById('post-comment-form').addEventListener('submit', submitPostComment);
  document.getElementById('post-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closePostModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePostModal();
  });
}

async function openPostModal(post) {
  pendingPostId = post.id;

  document.getElementById('post-modal-author').textContent = post.app_users?.name || '—';
  document.getElementById('post-modal-date').textContent =
    `${post.app_users?.department || ''} · ${new Date(post.created_at).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}`;

  const photo = document.getElementById('post-modal-photo');
  if (post.photo_url) {
    photo.src = post.photo_url;
    photo.style.display = 'block';
  } else {
    photo.style.display = 'none';
  }

  document.getElementById('post-modal-text').textContent = post.text || '';
  document.getElementById('post-comment-input').value = '';
  document.getElementById('post-overlay').hidden = false;

  await loadPostComments(post.id);
}

function closePostModal() {
  document.getElementById('post-overlay').hidden = true;
  pendingPostId = null;
}

async function loadPostComments(postId) {
  const list = document.getElementById('post-comments-list');
  list.innerHTML = '<div class="comments-empty">Загрузка…</div>';

  const { data, error } = await supabaseClient
    .from('event_comments')
    .select('*, app_users(name)')
    .eq('event_id', postId)
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

async function submitPostComment(e) {
  e.preventDefault();
  if (!pendingPostId) return;
  const input = document.getElementById('post-comment-input');
  const text = input.value.trim();
  if (!text) return;

  const { error } = await supabaseClient.from('event_comments').insert([{
    event_id: pendingPostId,
    user_id: boardUser.id,
    text,
  }]);

  if (error) {
    showToast('Не удалось отправить комментарий.', true);
    return;
  }

  input.value = '';
  await loadPostComments(pendingPostId);
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
