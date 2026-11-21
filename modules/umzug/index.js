import { api } from '/api.js';
import { esc } from '/utils/html.js';

const roomPrefix = 'Umzug · ';
const roomTag = (id) => `umzugraum-${id}`;
const idOf = (value) => Number(value);
const dateFormat = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });

function webUrl(value) {
  try {
    const url = new URL(value.trim());
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url : null;
  } catch {
    return null;
  }
}

function noteHref(note) {
  const content = note.content?.trim() || '';
  return /[\s<>]/.test(content) ? null : webUrl(content);
}

function sectionHtml(title, kind, writable, formFields) {
  return `<section class="move-panel" aria-labelledby="move-${kind}-heading">
    <div class="move-panel__head">
      <h2 id="move-${kind}-heading">${title}</h2>
      <span class="move-panel__count" data-count="${kind}"></span>
    </div>
    <ul class="move-items" data-items="${kind}"></ul>
    ${writable ? `<details class="move-compose">
      <summary>${{ tasks: 'Aufgabe hinzufügen', links: 'Link hinzufügen', ideas: 'Idee hinzufügen' }[kind]}</summary>
      <form data-form="${kind}">${formFields}
        <button type="submit" class="btn btn--primary btn--sm">Hinzufügen</button>
      </form>
    </details>` : ''}
  </section>`;
}

function taskHtml(task, writable) {
  const done = task.status === 'done';
  const date = task.due_date ? new Date(`${task.due_date.slice(0, 10)}T12:00:00`) : null;
  return `<li class="move-item move-item--task${done ? ' is-done' : ''}">
    ${writable ? `<input type="checkbox" data-task="${idOf(task.id)}" aria-label="${esc(task.title)}"${done ? ' checked' : ''}>` : ''}
    <div>
      <a href="/tasks?open=${idOf(task.id)}" data-open="/tasks?open=${idOf(task.id)}">${esc(task.title)}</a>
      ${date && !Number.isNaN(date.getTime()) ? `<small>Fällig am ${esc(dateFormat.format(date))}</small>` : ''}
    </div>
  </li>`;
}

function linkHtml(note, url) {
  const path = `/notes?open=${idOf(note.id)}`;
  return `<li class="move-item move-item--link">
    <a class="move-link" href="${esc(url.href)}" target="_blank" rel="noopener noreferrer" data-preview="${idOf(note.id)}">
      <span><strong>${esc(note.title || url.hostname)}</strong><small>${esc(url.hostname)}</small></span>
    </a>
    <a class="move-item__edit" href="${path}" data-open="${path}" aria-label="Notiz zu ${esc(note.title || url.hostname)} öffnen">Notiz</a>
  </li>`;
}

function ideaHtml(note) {
  const path = `/notes?open=${idOf(note.id)}`;
  return `<li class="move-item">
    <a class="move-idea" href="${path}" data-open="${path}">
      <strong>${esc(note.title || 'Idee')}</strong>
      <span>${esc(note.content)}</span>
      ${(note.preview_images || []).length ? `<span class="move-idea__images">${note.preview_images.map(image =>
        `<img src="/api/v1/notes/${idOf(note.id)}/images/${idOf(image.id)}" alt="${esc(image.filename)}" loading="lazy">`).join('')}</span>` : ''}
    </a>
  </li>`;
}

function fill(list, items, empty) {
  list.replaceChildren();
  list.insertAdjacentHTML('beforeend', items.length ? items.join('') : `<li class="move-empty">${empty}</li>`);
}

export async function render(container, { signal } = {}) {
  const readonly = document.documentElement.hasAttribute('data-module-readonly');
  const [categories, notesResponse] = await Promise.all([api.get('/notes/categories'), api.get('/notes')]);
  if (signal?.aborted) return;
  const rooms = categories.data.filter(category => category.scope === 'household' && category.name.startsWith(roomPrefix));
  let notes = notesResponse.data;
  let tasks = [];
  const selectionKey = 'blanzis:umzug:room';
  let previousRoom;
  try { previousRoom = Number(sessionStorage.getItem(selectionKey)); } catch {}
  let room = rooms.find(item => item.id === previousRoom) ?? rooms[0] ?? null;
  let generation = 0;
  let saving = false;
  let previewObserver;
  const manageRooms = !readonly && categories.meta?.can_manage_household;
  const events = { signal };

  container.replaceChildren();
  container.insertAdjacentHTML('beforeend', `<div class="page-toolbar">
    <h1 class="page-toolbar__title">Umzug</h1>
  </div>
  <div class="move-page page-scrollport" data-scroll-port="umzug">
    <div class="move-rooms">
      <nav class="move-room-tabs" aria-label="Räume"></nav>
      ${manageRooms ? '<button type="button" class="btn btn--secondary btn--sm" data-room-add aria-expanded="false">+ Raum</button>' : ''}
    </div>
    ${manageRooms ? `<form class="move-add-room" data-form="room" hidden>
      <label>Raumname<input class="form-input" name="title" placeholder="z. B. Arbeitszimmer" maxlength="40" required></label>
      <button type="submit" class="btn btn--primary btn--sm">Raum anlegen</button>
    </form>` : ''}
    <p class="move-status" role="status"></p>
    <div class="move-board"></div>
  </div>`);

  const tabs = container.querySelector('.move-room-tabs');
  const board = container.querySelector('.move-board');
  const status = container.querySelector('.move-status');
  const addRoom = container.querySelector('[data-room-add]');
  const roomForm = container.querySelector('[data-form="room"]');
  signal?.addEventListener('abort', () => previewObserver?.disconnect(), { once: true });
  const updateTabs = () => {
    tabs.replaceChildren();
    tabs.insertAdjacentHTML('beforeend', rooms.map(item => `<button type="button" class="filter-chip${item.id === room?.id ? ' filter-chip--active' : ''}" data-room="${idOf(item.id)}" aria-pressed="${item.id === room?.id}">${esc(item.name.slice(roomPrefix.length))}</button>`).join(''));
  };

  function drawTasks() {
    fill(board.querySelector('[data-items="tasks"]'), tasks.map(task => taskHtml(task, !readonly)), 'Noch keine Aufgaben.');
    board.querySelector('[data-count="tasks"]').textContent = `${tasks.filter(task => task.status === 'done').length}/${tasks.length} erledigt`;
  }

  function drawNotes() {
    const assigned = notes.filter(note => note.categories?.some(category => category.id === room.id));
    const links = [];
    const ideas = [];
    for (const note of assigned) {
      const url = noteHref(note);
      if (url) links.push(linkHtml(note, url));
      else ideas.push(ideaHtml(note));
    }
    fill(board.querySelector('[data-items="links"]'), links, 'Noch keine Links.');
    fill(board.querySelector('[data-items="ideas"]'), ideas, 'Noch keine Ideen.');
    board.querySelector('[data-count="links"]').textContent = String(links.length);
    board.querySelector('[data-count="ideas"]').textContent = String(ideas.length);
    previewObserver?.disconnect();
    if (!('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(entries => {
      for (const { isIntersecting, target } of entries) {
        if (!isIntersecting) continue;
        observer.unobserve(target);
        api.get(`/notes/${idOf(target.dataset.preview)}/link-previews?first=1`).then(({ data }) => {
          if (signal?.aborted || !target.isConnected) return;
          const preview = data?.find(entry => entry.url === target.href);
          if (/^data:image\/(jpeg|png|webp);base64,/.test(preview?.thumbnail || '')) {
            const picture = document.createElement('img');
            picture.src = preview.thumbnail;
            picture.alt = '';
            target.prepend(picture);
          }
        }).catch(() => {});
      }
    });
    previewObserver = observer;
    for (const link of board.querySelectorAll('[data-preview]')) observer.observe(link);
  }

  async function selectRoom(selected, focus = false) {
    room = selected;
    tasks = [];
    const current = ++generation;
    updateTabs();
    if (focus && room) tabs.querySelector(`[data-room="${idOf(room.id)}"]`).focus();
    board.replaceChildren();
    if (!room) {
      board.insertAdjacentHTML('beforeend', '<p class="move-empty">Lege einen Raum an, um mit der Planung zu starten.</p>');
      return;
    }
    try { sessionStorage.setItem(selectionKey, String(room.id)); } catch {}
    board.insertAdjacentHTML('beforeend', `
      ${sectionHtml('Aufgaben', 'tasks', !readonly, '<label>Aufgabe<input class="form-input" name="title" maxlength="200" required></label><label>Fällig am (optional)<input class="form-input" name="due" type="date"></label>')}
      ${sectionHtml('Linksammlung', 'links', !readonly, '<label>Link<input class="form-input" name="url" type="url" placeholder="https://…" required maxlength="2000"></label><label>Titel (optional)<input class="form-input" name="title" maxlength="100"></label>')}
      ${sectionHtml('Ideen', 'ideas', !readonly, '<label>Titel<input class="form-input" name="title" maxlength="100" required></label><label>Beschreibung<textarea class="form-input" name="body" rows="3" maxlength="10000" required></textarea></label>')}`);
    drawNotes();
    const taskList = board.querySelector('[data-items="tasks"]');
    const submitTask = board.querySelector('[data-form="tasks"] button');
    if (submitTask) submitTask.disabled = true;
    fill(taskList, [], 'Aufgaben werden geladen …');
    try {
      const res = await api.get(`/tasks?tag=${encodeURIComponent(roomTag(selected.id))}&include_future=1`);
      if (signal?.aborted || current !== generation) return;
      tasks = res.data;
      drawTasks();
      if (submitTask) submitTask.disabled = false;
    } catch {
      if (!signal?.aborted && current === generation) fill(taskList, [], 'Aufgaben konnten nicht geladen werden.');
    }
  }

  tabs.addEventListener('click', (event) => {
    const target = event.target.closest('[data-room]');
    if (!target || saving || idOf(target.dataset.room) === room?.id) return;
    status.textContent = '';
    selectRoom(rooms.find(item => item.id === idOf(target.dataset.room)), true);
  }, events);

  addRoom?.addEventListener('click', () => {
    roomForm.hidden = !roomForm.hidden;
    addRoom.setAttribute('aria-expanded', String(!roomForm.hidden));
    if (!roomForm.hidden) roomForm.elements.title.focus();
  }, events);

  container.addEventListener('submit', async (event) => {
    const form = event.target.closest('[data-form]');
    if (!form) return;
    event.preventDefault();
    if (readonly || saving) return;
    const kind = form.dataset.form;
    const values = new FormData(form);
    const title = String(values.get('title') || '').trim();
    const button = form.querySelector('[type="submit"]');
    if (button.disabled || (!title && kind !== 'links')) return;
    status.textContent = '';
    saving = button.disabled = true;
    try {
      if (kind === 'room') {
        if (!manageRooms) return;
        const { data: created } = await api.post('/notes/categories', { name: roomPrefix + title, scope: 'household' });
        if (signal?.aborted) return;
        rooms.push(created);
        roomForm.hidden = true;
        addRoom.setAttribute('aria-expanded', 'false');
        await selectRoom(created, true);
      } else if (kind === 'tasks') {
        const { data: created } = await api.post('/tasks', { title, tags: [roomTag(room.id)], due_date: values.get('due') || null });
        if (signal?.aborted) return;
        tasks = [created, ...tasks];
        drawTasks();
      } else {
        const url = kind === 'links' ? webUrl(String(values.get('url') || '')) : null;
        if (kind === 'links' && !url) {
          status.textContent = 'Bitte gib eine gültige HTTP- oder HTTPS-Adresse ein.';
          return;
        }
        const content = url?.href ?? String(values.get('body') || '').trim();
        if (!content) return;
        const { data: created } = await api.post('/notes', { title: title || url.hostname, content, category_ids: [room.id], visibility: 'all' });
        if (signal?.aborted) return;
        notes = [created, ...notes];
        drawNotes();
      }
      form.reset();
      form.closest('details')?.removeAttribute('open');
      status.textContent = 'Gespeichert.';
    } catch (error) {
      if (!signal?.aborted) status.textContent = error.status === 409 ? 'Diesen Raum gibt es bereits.' : 'Speichern fehlgeschlagen. Bitte erneut versuchen.';
    } finally {
      saving = button.disabled = false;
    }
  }, events);

  board.addEventListener('change', async (event) => {
    const checkbox = event.target.closest('[data-task]');
    if (!checkbox || readonly) return;
    const task = tasks.find(item => item.id === idOf(checkbox.dataset.task));
    if (!task) return;
    const selected = room;
    checkbox.disabled = true;
    try {
      await api.patch(`/tasks/${task.id}/status`, { status: checkbox.checked ? 'done' : 'open' });
      if (signal?.aborted || room !== selected) return;
      task.status = checkbox.checked ? 'done' : 'open';
      drawTasks();
      board.querySelector(`[data-task="${task.id}"]`)?.focus({ preventScroll: true });
    } catch {
      if (signal?.aborted || room !== selected) return;
      checkbox.checked = !checkbox.checked;
      status.textContent = 'Der Aufgabenstatus konnte nicht gespeichert werden.';
    } finally {
      checkbox.disabled = false;
    }
  }, events);

  board.addEventListener('click', (event) => {
    const link = event.target.closest('[data-open]');
    if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    window.yuvomi.navigate(link.dataset.open);
  }, events);

  await selectRoom(room);
}
