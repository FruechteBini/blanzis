import { api } from '/api.js';
import { esc } from '/utils/html.js';
import { noteLinkMatches } from '/utils/blanzis-note-links.js';

const german = () => (document.documentElement.lang || navigator.language).startsWith('de');
export const words = (de, en) => german() ? de : en;
const limit = 6;
const previewKey = 'blanzis:notes:link-previews';
let previewsEnabled = true;
try { previewsEnabled = localStorage.getItem(previewKey) !== 'false'; } catch {}

export function wireNotePreviewToggle(button, redraw) {
  button.setAttribute('aria-pressed', String(previewsEnabled));
  button.addEventListener('click', () => {
    previewsEnabled = !previewsEnabled;
    try { localStorage.setItem(previewKey, String(previewsEnabled)); } catch {}
    button.setAttribute('aria-pressed', String(previewsEnabled));
    redraw();
  });
}

function externalLink(url, className) {
  const link = document.createElement('a');
  link.className = className;
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer nofollow';
  return link;
}

function prepareNoteLinks(body) {
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
    acceptNode: node => node.parentElement.closest('a, code, pre, button')
      ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const text = node.textContent;
    let offset = 0;
    const parts = [];
    for (const match of noteLinkMatches(text)) {
      const link = externalLink(match.url, 'note-md-link blanzis-raw-link');
      link.textContent = match.text;
      parts.push(text.slice(offset, match.index), link);
      offset = match.index + match.text.length;
    }
    if (parts.length) node.replaceWith(...parts, text.slice(offset));
  }
  return [...new Set([...body.querySelectorAll('a[href]')]
    .map(link => link.href).filter(url => /^https?:\/\//.test(url)))];
}

function renderLinkCards(body, cards, noteId, { overview = false, resolve = true } = {}) {
  const urls = prepareNoteLinks(body);
  if (!previewsEnabled || !urls.length) return;

  const visible = urls.slice(0, overview ? 1 : limit);
  for (const url of visible) {
    const card = externalLink(url, 'blanzis-note-link');
    const title = document.createElement('span');
    title.className = 'blanzis-note-link__title';
    title.textContent = new URL(url).hostname;
    const description = document.createElement('span');
    description.className = 'blanzis-note-link__description';
    const domain = document.createElement('small');
    domain.textContent = new URL(url).hostname;
    card.append(title, description, domain);
    cards.append(card);
  }
  for (const paragraph of body.querySelectorAll('.note-md-p')) {
    const [link] = paragraph.children;
    if (paragraph.children.length === 1 && link.matches('.blanzis-raw-link') && visible.includes(link.href)
        && paragraph.textContent.trim() === link.textContent.trim()) paragraph.remove();
  }
  if (!noteId || !resolve) return;

  const load = () => api.get(`/notes/${noteId}/link-previews${overview ? '?first=1' : ''}`).then(({ data }) => {
    if (!cards.isConnected) return;
    const metadata = new Map(data.map(item => [item.url, item]));
    for (const card of cards.children) {
      const preview = metadata.get(card.href);
      if (preview?.title) card.querySelector('.blanzis-note-link__title').textContent = preview.title;
      if (preview?.description) card.querySelector('.blanzis-note-link__description').textContent = preview.description;
      if (/^data:image\/(?:jpeg|png|webp);base64,/.test(preview?.thumbnail || '')) {
        const thumbnail = document.createElement('img');
        thumbnail.src = preview.thumbnail;
        thumbnail.alt = '';
        card.append(thumbnail);
      }
    }
  }).catch(() => {});
  if (!overview) {
    load();
    return;
  }
  return load;
}

const gridObservers = new WeakMap();

export function disconnectNoteGridLinks(grid) {
  gridObservers.get(grid)?.disconnect();
  gridObservers.delete(grid);
}

export function renderNoteGridLinks(grid) {
  const loads = new WeakMap();
  const queue = [];
  let pending = 0;
  function loadVisibleCards() {
    while (pending < 3 && queue.length) {
      const target = queue.shift();
      if (!target.isConnected) continue;
      pending++;
      loads.get(target)().finally(() => {
        pending--;
        loadVisibleCards();
      });
    }
  }
  const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    for (const { target, isIntersecting } of entries) {
      if (!isIntersecting) continue;
      observer.unobserve(target);
      queue.push(target);
    }
    loadVisibleCards();
  }) : null;
  if (observer) gridObservers.set(grid, observer);
  for (const note of grid.querySelectorAll('.note-card')) {
    const body = note.querySelector('.note-card__content');
    const cards = document.createElement('div');
    cards.className = 'blanzis-note-links';
    body.after(cards);
    const load = renderLinkCards(body, cards, note.dataset.id, { overview: true });
    if (!load) continue;
    loads.set(cards, load);
    if (observer) observer.observe(cards);
    else queue.push(cards);
  }
  if (!observer) loadVisibleCards();
}

function imageHref(noteId, imageId) {
  return `/api/v1/notes/${Number(noteId)}/images/${Number(imageId)}`;
}

export function noteMediaMarkup() {
  return '<div class="blanzis-note-media" data-blanzis-note-media></div>';
}

export function renderNoteMedia(container, note, content = note?.content) {
  const root = container.querySelector('[data-blanzis-note-media]');
  if (!root) return;
  const images = document.createElement('div');
  images.className = 'blanzis-note-images';
  const cards = document.createElement('div');
  cards.className = 'blanzis-note-links';
  root.replaceChildren(images, cards);
  renderLinkCards(container.querySelector('.note-read__body'), cards, note?.id, { resolve: note?.content === content });
  if (!note?.id) return;
  api.get(`/notes/${note.id}/images`).then(({ data }) => {
    if (!images.isConnected) return;
    images.innerHTML = data.map(({ id, filename }) => {
      const href = imageHref(note.id, id);
      return `<a href="${href}" target="_blank" rel="noopener noreferrer"><img src="${href}" alt="${esc(filename)}" loading="lazy"></a>`;
    }).join('');
  }).catch(() => {});
}

export function noteImageEditorMarkup() {
  return `<div class="form-group blanzis-note-image-editor">
    <label class="form-label" for="blanzis-note-images">${words('Bilder anhängen', 'Attach images')}</label>
    <input id="blanzis-note-images" type="file" accept="image/jpeg,image/png,image/webp" multiple>
    <input type="hidden" name="blanzis-image-draft" value="">
    <div class="blanzis-note-images" data-note-image-list></div>
    <p class="form-hint" data-note-image-status role="status"></p>
  </div>`;
}

async function compressImage(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024) {
    throw new Error(words('Bitte JPG, PNG oder WebP bis 20 MB auswählen.', 'Choose JPG, PNG or WebP files up to 20 MB.'));
  }
  const source = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  const image = new Image();
  image.src = source;
  await image.decode();
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.86, 0.70, 0.52]) {
    const data = canvas.toDataURL('image/jpeg', quality);
    if (data.length <= 699000) return { name: (file.name.replace(/\.[^.]+$/, '').slice(0, 170) || 'Bild') + '.jpg', data };
  }
  throw new Error(words('Dieses Bild konnte nicht ausreichend verkleinert werden.', 'This image could not be made small enough.'));
}

export function wireNoteImageEditor(panel, note) {
  const input = panel.querySelector('#blanzis-note-images');
  const list = panel.querySelector('[data-note-image-list]');
  const status = panel.querySelector('[data-note-image-status]');
  const dirtyField = panel.querySelector('[name="blanzis-image-draft"]');
  let saved = [];
  let pending = false;
  let saving = false;
  const added = [];
  const removed = new Set();

  function draw() {
    dirtyField.value = added.length || removed.size ? JSON.stringify([added.map(item => item.name), [...removed]]) : '';
    list.replaceChildren();
    const items = [...saved.filter(item => !removed.has(item.id)).map(item => ({ ...item, href: imageHref(note.id, item.id) })),
      ...added.map((item, index) => ({ filename: item.name, href: item.data, index }))];
    for (const item of items) {
      const tile = document.createElement('div');
      tile.innerHTML = `<img src="${esc(item.href)}" alt="${esc(item.filename)}"><button class="btn btn--secondary btn--sm" type="button">${words('Entfernen', 'Remove')}</button>`;
      const button = tile.querySelector('button');
      button.setAttribute('aria-label', `${words('Entfernen', 'Remove')} ${item.filename}`);
      button.addEventListener('click', () => {
        if (pending || saving) return;
        if (item.id) removed.add(item.id);
        else added.splice(item.index, 1);
        draw();
      });
      list.append(tile);
    }
  }

  if (note?.id) {
    pending = input.disabled = true;
    api.get(`/notes/${note.id}/images`).then(({ data }) => { saved = data; draw(); }).catch(() => {
      status.textContent = words('Vorhandene Bilder konnten nicht geladen werden.', 'Existing images could not be loaded.');
    }).finally(() => { pending = input.disabled = false; });
  }

  input.addEventListener('change', async () => {
    if (pending || saving || !input.files.length) return;
    const files = [...input.files];
    input.value = '';
    status.textContent = '';
    if (files.length + saved.length - removed.size + added.length > limit) {
      status.textContent = words('Bis zu sechs Bilder pro Notiz.', 'Up to six images per note.');
      return;
    }
    pending = input.disabled = true;
    try {
      const processed = [];
      for (const file of files) processed.push(await compressImage(file));
      added.push(...processed);
      draw();
    } catch (error) {
      status.textContent = error.message || words('Bild konnte nicht gelesen werden.', 'Image could not be read.');
    } finally {
      pending = input.disabled = false;
    }
  });
  return {
    get busy() { return pending; },
    get hasImages() { return saved.length - removed.size + added.length > 0; },
    setSaving(value) { saving = value; input.disabled = pending || saving; },
    payload: () => ({ ...(added.length ? { add_images: [...added] } : {}), ...(removed.size ? { remove_image_ids: [...removed] } : {}) }),
  };
}

export function renderNoteProjects(root, projects, { active, writable, shared, select, create }) {
  root.innerHTML = `<div class="blanzis-projects__header">
    <h2>${words('Projekte', 'Projects')}</h2>
    ${writable ? `<button type="button" data-create-project class="btn btn--secondary btn--sm" aria-expanded="false">${words('Neues Projekt', 'New project')}</button>` : ''}
  </div>
  <div class="blanzis-projects__list">
    <button type="button" class="filter-chip${active == null ? ' filter-chip--active' : ''}" data-project="" aria-pressed="${active == null}">${words('Alle Notizen', 'All notes')}</button>
    ${projects.map(project => `<button type="button" class="filter-chip${active === project.id ? ' filter-chip--active' : ''}" data-project="${Number(project.id)}" aria-pressed="${active === project.id}">${esc(project.name)}</button>`).join('')}
  </div>
  ${writable ? `<form class="blanzis-projects__form" hidden>
    <label><span>${words('Projektname', 'Project name')}</span><input name="project" class="form-input" autocomplete="off" required></label>
    ${shared ? `<label><span>${words('Sichtbarkeit', 'Visibility')}</span><select name="scope" class="form-input"><option value="household">${words('Haushalt', 'Household')}</option><option value="personal">${words('Persönlich', 'Personal')}</option></select></label>` : ''}
    <button type="submit" class="btn btn--primary btn--sm">${words('Projekt anlegen', 'Create project')}</button>
    <p class="form-hint" role="status"></p>
  </form>` : ''}`;
  for (const button of root.querySelectorAll('[data-project]')) {
    button.addEventListener('click', () => select(button.dataset.project ? Number(button.dataset.project) : null));
  }
  const form = root.querySelector('form');
  const toggle = root.querySelector('[data-create-project]');
  if (!form) return;
  toggle.addEventListener('click', () => {
    form.hidden = !form.hidden;
    toggle.setAttribute('aria-expanded', String(!form.hidden));
    if (!form.hidden) form.elements.project.focus();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('[type="submit"]');
    if (button.disabled) return;
    const name = form.elements.project.value.trim();
    if (!name) return;
    button.disabled = true;
    try {
      await create(name, form.elements.scope?.value || 'personal');
      root.querySelector('button[aria-pressed="true"]')?.focus();
    } catch (error) {
      form.querySelector('[role="status"]').textContent = error?.status === 409
        ? words('Diesen Namen gibt es bereits.', 'This name already exists.')
        : words('Projekt konnte nicht angelegt werden.', 'Could not create project.');
    } finally {
      button.disabled = false;
    }
  });
}
