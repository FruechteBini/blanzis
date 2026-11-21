import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';

function patch(path, changes) {
  let content = readFileSync(path, 'utf8');
  for (const [before, after] of changes) {
    const position = content.indexOf(before);
    if (position < 0 || content.indexOf(before, position + before.length) >= 0) {
      throw new Error(`Unexpected upstream source in ${path}: ${before.slice(0, 100)}`);
    }
    content = content.slice(0, position) + after + content.slice(position + before.length);
  }
  writeFileSync(path, content);
}

for (const [name, target] of Object.entries({
  'note-links.js': 'public/utils/blanzis-note-links.js',
  'notes-extras.js': 'public/utils/blanzis-notes-extras.js',
  'notes-media.js': 'server/services/blanzis-notes-media.js',
})) copyFileSync(new URL(`./features/${name}`, import.meta.url), target);

const cssPath = 'public/styles/notes.css';
writeFileSync(cssPath, `${readFileSync(cssPath, 'utf8')}\n${readFileSync(new URL('./features/notes-extras.css', import.meta.url), 'utf8')}`);

patch('server/services/subscription-logo.js', [
  ['  const { parsed, addresses } = await assertPublicHttps(url);', '  options.validateUrl?.(url);\n  const { parsed, addresses } = await assertPublicHttps(url);'],
  ['  if (response.status >= 300 && response.status < 400) {', '  if (response.status >= 300 && response.status < 400) {\n    await response.body.getReader().cancel();'],
  ['export { findLogo,', 'export { fetchPublic, readHtmlHead, readLimited, findLogo,'],
]);

patch('server/openapi/schemas.js', [
  ['const noteInputProperties = {', `const noteInputProperties = {
  add_images: { type: 'array', maxItems: 6, items: {
    type: 'object', required: ['name', 'data'], properties: {
      name: { type: 'string', minLength: 1, maxLength: 180 },
      data: { type: 'string', maxLength: 699100 },
    },
  } },`],
  ['const noteUpdateProperties = {\n  ...noteInputProperties,', `const noteUpdateProperties = {
  ...noteInputProperties,
  remove_image_ids: { type: 'array', maxItems: 6, items: { type: 'integer', minimum: 1 } },`],
  ["            scope: { type: 'string', enum: ['personal', 'household'], default: 'personal' },", "            scope: { type: 'string', enum: ['personal', 'household'], default: 'personal' },\n            project: { type: 'boolean' },"],
]);

const noteMediaRoutes = `router.get('/:id/images', (req, res) => {
  const note = findVisibleNote(req, Number(req.params.id));
  if (!note) return res.status(404).json(NOTE_NOT_FOUND);
  const database = db.get();
  ensureNoteExtras(database);
  res.set('Cache-Control', 'private, no-store');
  res.json({ data: database.prepare('SELECT id, filename FROM blanzis_note_images WHERE note_id = ? ORDER BY id').all(note.id) });
});

router.get('/:id/images/:imageId', (req, res) => {
  const note = findVisibleNote(req, Number(req.params.id));
  if (!note) return res.status(404).json(NOTE_NOT_FOUND);
  const database = db.get();
  ensureNoteExtras(database);
  const image = database.prepare('SELECT mime, bytes FROM blanzis_note_images WHERE id = ? AND note_id = ?').get(Number(req.params.imageId), note.id);
  if (!image) return res.status(404).json(NOTE_NOT_FOUND);
  res.set('Cache-Control', 'private, no-store');
  res.set('Content-Security-Policy', "default-src 'none'");
  res.type(image.mime).send(Buffer.from(image.bytes));
});

router.get('/:id/link-previews', async (req, res) => {
  const note = findVisibleNote(req, Number(req.params.id));
  if (!note) return res.status(404).json(NOTE_NOT_FOUND);
  const data = await noteLinkPreviews(note.content);
  const current = findVisibleNote(req, note.id);
  if (!current) return res.status(404).json(NOTE_NOT_FOUND);
  res.set('Cache-Control', 'private, no-store');
  res.json({ data: current.content === note.content ? data : [] });
});

`;

patch('server/routes/notes.js', [
  ["import express from 'express';", `import express from 'express';
import { applyNoteImages, ensureNoteExtras, NoteImageError, noteLinkPreviews, readNoteImages } from '../services/blanzis-notes-media.js';`],
  ['function categoryPayload(category) {\n  return {', `function categoryPayload(category) {
  const database = db.get();
  ensureNoteExtras(database);
  const project = database.prepare('SELECT 1 FROM blanzis_note_projects WHERE category_id = ?').get(category.id);
  return {
    ...(project ? { project: true } : {}),`],
  ['    const result = db.get().prepare(`\n      INSERT INTO note_categories', `    const database = db.get();
    ensureNoteExtras(database);
    const result = database.transaction(() => {
      const inserted = database.prepare(\`
      INSERT INTO note_categories`],
  ['    `).run(name, categoryNameKey(name), scope, ownerId, actorId(req), max + 1);', `    \`).run(name, categoryNameKey(name), scope, ownerId, actorId(req), max + 1);
      if (req.body.project === true) database.prepare('INSERT INTO blanzis_note_projects (category_id) VALUES (?)').run(inserted.lastInsertRowid);
      return inserted;
    })();`],
  ["router.get('/', validateRequest(),", `${noteMediaRoutes}router.get('/', validateRequest(),`],
  ["    const vContent = str(req.body.content, 'content', { max: MAX_TEXT });", `    const images = readNoteImages(req.body.add_images);
    const vContent = str(req.body.content, 'content', { max: MAX_TEXT, required: images.length === 0 });`],
  ['    const create = database.transaction(() => {\n      const result = database.prepare(`\n        INSERT INTO notes', `    if (images.length) ensureNoteExtras(database);
    const create = database.transaction(() => {
      const result = database.prepare(\`
        INSERT INTO notes`],
  ['`).run(vContent.value, vTitle.value, req.body.color', "`).run(vContent.value ?? '', vTitle.value, req.body.color"],
  ['      return result;\n    });\n    const result = create();', '      if (images.length) applyNoteImages(database, result.lastInsertRowid, images);\n      return result;\n    });\n    const result = create();'],
  ['    const update = database.transaction(() => {\n      database.prepare(`\n      UPDATE notes', `    const images = readNoteImages(req.body.add_images);
    const removals = req.body.remove_image_ids ?? [];
    if (images.length || removals.length) ensureNoteExtras(database);
    const update = database.transaction(() => {
      if (images.length || removals.length) applyNoteImages(database, id, images, removals);
      database.prepare(\`
      UPDATE notes`],
]);

const notesRoute = 'server/routes/notes.js';
const notesSource = readFileSync(notesRoute, 'utf8');
const categoryConflict = '    if (req.body?.category_ids !== undefined && categoryDatabaseConflict(err)) {';
if (notesSource.split(categoryConflict).length !== 3) throw new Error('Unexpected update error handlers');
writeFileSync(notesRoute, notesSource.replaceAll(categoryConflict,
  "    if (err instanceof NoteImageError) return res.status(400).json({ error: err.message, code: 400 });\n" + categoryConflict));

patch('public/pages/notes.js', [
  ["import { esc, renderMarkdownLight } from '/utils/html.js';", `import { esc, renderMarkdownLight } from '/utils/html.js';
import { noteMediaMarkup, renderNoteMedia, noteImageEditorMarkup, wireNoteImageEditor, renderNoteProjects } from '/utils/blanzis-notes-extras.js';`],
  ['  filterCategoryIds: [],', '  filterCategoryIds: [],\n  activeProjectId: null,'],
  ['        <div class="notes-filters page-chip-row"', '        <section class="blanzis-projects" id="blanzis-projects"></section>\n        <div class="notes-filters page-chip-row"'],
  ["  const addHandler = () => { if (!readOnly()) openNoteModal({ mode: 'create' }); };", "  const addHandler = () => { if (!readOnly()) openNoteModal({ mode: 'create', projectCategoryId: state.activeProjectId }); };"],
  ['function renderNotesAndFilters({ motion = false } = {}) {', `function renderProjects() {
  const root = _container?.querySelector('#blanzis-projects');
  if (!root) return;
  const projects = state.categories.filter(category => category.project);
  if (!projects.some(project => project.id === state.activeProjectId)) state.activeProjectId = null;
  const select = (id) => {
    state.activeProjectId = id;
    state.filterCategoryIds = [];
    renderNotesAndFilters();
    root.querySelector('button[aria-pressed="true"]')?.focus();
  };
  renderNoteProjects(root, projects, {
    active: state.activeProjectId, writable: !readOnly(), shared: state.canManageHousehold, select,
    async create(name, scope) {
      const { data } = await api.post('/notes/categories', { name, scope, project: true });
      if (!root.isConnected) return;
      state.categories.push(data);
      select(data.id);
    },
  });
}

function renderNotesAndFilters({ motion = false } = {}) {
  renderProjects();`],
  ['    if (!noteMatchesCategories(n, state.filterCategoryIds)) return false;', `    if (state.activeProjectId != null && !noteMatchesCategories(n, [state.activeProjectId])) return false;
    if (!noteMatchesCategories(n, state.filterCategoryIds)) return false;`],
  ['</div>` : \'\'}<div class="note-read__body">${body}</div>`;', '</div>` : \'\'}<div class="note-read__body">${body}</div>${noteMediaMarkup()}`;'],
  ['    onSave(panel) {\n      window.lucide?.createIcons({ el: panel });\n    },', '    onSave(panel) {\n      renderNoteMedia(panel, note);\n      window.lucide?.createIcons({ el: panel });\n    },'],
  ['function openNoteModal({ mode, note = null }) {', 'function openNoteModal({ mode, note = null, projectCategoryId = null }) {'],
  ['function renderAccessFields(note) {', "function renderAccessFields(note, initialVisibility = 'all') {"],
  ["  const visibility = note?.visibility === 'private' ? 'private' : 'all';", "  const visibility = note?.visibility ?? initialVisibility;"],
  ['      ${renderAccessFields(isEdit ? note : null)}`', "      ${renderAccessFields(isEdit ? note : null, state.categories.find(category => category.id === projectCategoryId)?.scope === 'personal' ? 'private' : 'all')}`"],
  ['    ${renderCategoryEditor(isEdit ? (note.categories || []).map((category) => category.id) : [])}', `    \${noteImageEditorMarkup()}
    \${renderCategoryEditor(isEdit ? (note.categories || []).map((category) => category.id) : projectCategoryId == null ? [] : [projectCategoryId])}`],
  ["      const viewContent = panel.querySelector('#note-content');", "      const viewContent = panel.querySelector('#note-content');\n      const imageEditor = wireNoteImageEditor(panel, note);\n      if (isEdit) renderNoteMedia(readPane, note);"],
  ['          window.lucide?.createIcons({ el: readPane });', '          renderNoteMedia(readPane, note, viewContent.value);\n          window.lucide?.createIcons({ el: readPane });'],
  ['        if (!editorIsCurrent() || noteSavePending || pendingCategoryCreate) return;', '        if (!editorIsCurrent() || noteSavePending || pendingCategoryCreate || imageEditor.busy) return;'],
  ['        if (!cnt) {', '        if (!cnt && !imageEditor.hasImages) {'],
  ['        noteSavePending = true;', '        noteSavePending = true;\n        imageEditor.setSaving(true);'],
  ['          btnError(saveBtn);\n          noteSavePending = false;', '          btnError(saveBtn);\n          imageEditor.setSaving(false);\n          noteSavePending = false;'],
  ["            const res = await api.post('/notes', { title, content: cnt, color, pinned, category_ids, ...readAccessFields(panel) });", "            const res = await api.post('/notes', { title, content: cnt, color, pinned, category_ids, ...readAccessFields(panel), ...imageEditor.payload() });"],
  ['            const res = await api.put(`/notes/${note.id}`, { title, content: cnt, color, pinned, category_ids, ...readAccessFields(panel) });', '            const res = await api.put(`/notes/${note.id}`, { title, content: cnt, color, pinned, category_ids, ...readAccessFields(panel), ...imageEditor.payload() });'],
]);
