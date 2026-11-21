import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';

function patch(path, changes) {
  let content = readFileSync(path, 'utf8');
  for (const [before, after] of changes) {
    const index = content.indexOf(before);
    if (index < 0 || content.indexOf(before, index + before.length) >= 0) {
      throw new Error(`Unexpected upstream source in ${path}: ${before.slice(0, 120)}`);
    }
    content = content.slice(0, index) + after + content.slice(index + before.length);
  }
  writeFileSync(path, content);
}

for (const [file, target] of Object.entries({
  'calendar-task-ui.js': 'public/utils/blanzis-calendar-task-ui.js',
  'calendar-task-store.js': 'server/services/blanzis-calendar-task-store.js',
})) copyFileSync(new URL(`./features/${file}`, import.meta.url), target);

patch('public/pages/calendar.js', [
  ["import { t, getLocale,", "import { calendarTaskRow } from '/utils/blanzis-calendar-task-ui.js';\nimport { t, getLocale,"],
  ["  if (view === 'month') return getMonthRange(cursor);", "  if (view === 'month') return fourWeekSpan(cursor);"],
  ['function getMonthRange(dateStr, weekStart = state.weekStart) {', `function fourWeekSpan(cursor, today = state.today, weekStart = state.weekStart) {
  const weekday = new Date(today + 'T00:00:00').getDay();
  const startOfCurrentWeek = addDays(today, -(weekday - weekStart + 7) % 7);
  const daysFromStart = (Date.parse(cursor) - Date.parse(startOfCurrentWeek)) / 86400000;
  const from = addDays(startOfCurrentWeek, 28 * Math.floor(daysFromStart / 28));
  return { from, to: addDays(from, 27), weeks: 4 };
}

function getMonthRange(dateStr, weekStart = state.weekStart) {`],
  ["if (view === 'month')  return monthCollapsed && mobile ? { unit: 'week', days: 7 } : { unit: 'month', days: 0 };", "if (view === 'month')  return monthCollapsed && mobile ? { unit: 'week', days: 7 } : { unit: 'days', days: 28 };"],
  ["  if (String(date).slice(0, 7) !== String(cursor).slice(0, 7)) return 'change-month';", "  const { from, to } = fourWeekSpan(cursor);\n  if (date < from || date > to) return 'change-month';"],
  ["  if (state.view === 'month')  setPeriodTitle(lbl, formatMonthYear(year, d.getMonth() + 1));", `  if (state.view === 'month') {
    const { from, to } = fourWeekSpan(state.cursor);
    setPeriodTitle(lbl, t('calendar.dayRangeLabel', { from: formatDayMonth(from), to: formatDayMonth(to) }));
  }`],
  ["  const { from, weeks } = monthGridSpan(state.cursor);\n  const month = new Date(state.cursor + 'T00:00:00').getMonth();", "  const { from, weeks } = fourWeekSpan(state.cursor);"],
  ["    case 'PageUp':     return addMonthsClamped(date, -1);\n    case 'PageDown':   return addMonthsClamped(date, 1);", "    case 'PageUp':     return addDays(date, -28);\n    case 'PageDown':   return addDays(date, 28);"],
  ["    return { date, inMonth: new Date(date + 'T00:00:00').getMonth() === month };", "    return { date, inMonth: true };"],
  ['    selectMonthDay(date);\n    return;', `    selectMonthDay(date);
    const view = _container?.querySelector('#cal-body > .month-view--split');
    const list = _container?.querySelector('#cal-body > #month-list');
    if (view && list) {
      _monthCollapsed = true;
      list.querySelector('#month-list-rows').scrollTop = 0;
      syncMonthCollapse(view, list);
    }
    return;`],
  ["    { icon: 'paperclip', label: t('calendar.attachmentLabel'), node: attachmentNode(ev) },", "    { icon: 'paperclip', label: t('calendar.attachmentLabel'), node: attachmentNode(ev) },\n    calendarTaskRow(ev, localDate(ev.start_datetime)),"],
]);

patch('public/router.js', [
  ['function currentKitchenDestination() {', "const KOCHWELT_URL = 'https://kochen-mit.korbsta.com/';\n\nfunction currentKitchenDestination() {"],
  ["    moreSheet.setAttribute('aria-modal', 'true');", "    moreSheet.setAttribute('aria-modal', 'false');"],
  ["  const moreSheetTrap = createFocusTrap(sheet);\n", ''],
  ["    sheet.addEventListener('keydown', moreSheetTrap);\n", ''],
  ["    sheet.removeEventListener('keydown', moreSheetTrap);\n", ''],
  ["    releaseSheetBackground = inertOutside(sheet, { keep: [backdrop, currentMoreBtn()] });", "    releaseSheetBackground = inertOutside(sheet, { keep: [backdrop, container.querySelector('.nav-bottom'), container.querySelector('#fab-layer')] });"],
  ["  backdrop.addEventListener('click', () => closeSheet());", `  backdrop.addEventListener('click', () => closeSheet());
  container.addEventListener('click', async (e) => {
    if (sheet.getAttribute('aria-hidden') === 'true') return;
    const link = e.target.closest('.nav-bottom a, #more-sheet a');
    if (!link && !e.target.closest('#fab-layer button')) return;
    const target = link?.dataset.navHref ?? link?.dataset.route;
    if (target) {
      e.preventDefault();
      e.stopPropagation();
    }
    closeSheet({ restoreFocus: false });
    if (!target) return;
    await whenHistorySettled();
    if (!container.isConnected) return;
    if (isCurrentAddress(target, location)) scrollPageToTop();
    else navigate(target);
  }, { capture: true });`],
  ["  const kitchenBtn = document.createElement('button');\n  kitchenBtn.className", "  const kitchenBtn = document.createElement('a');\n  kitchenBtn.href = KOCHWELT_URL;\n  kitchenBtn.className"],
  ["  kitchenBtn.type = 'button';\n", ''],
  ["  kitchenBtn.addEventListener('click', () => {\n    const destination = currentKitchenDestination();\n    if (destination) navigate(destination.path);\n  });\n", ''],
  ["  a.id = 'sidebar-kitchen-nav';", "  a.id = 'sidebar-kitchen-nav';\n  delete a.dataset.route;\n  delete a.dataset.navHref;\n  a.href = KOCHWELT_URL;"],
  ["  sheet.addEventListener('click', (e) => {\n    if (e.target.closest('[data-route]')) closeSheet({ restoreFocus: false });\n  });\n\n", ''],
  ["  a.className = 'more-item';\n  if (accent)", "  a.className = 'more-item';\n  if (navId === 'kitchen') {\n    delete a.dataset.route;\n    delete a.dataset.navHref;\n    a.href = KOCHWELT_URL;\n  }\n  if (accent)"],
]);

patch('server/routes/calendar/crud.js', [
  ['const router = express.Router();', `import { calendarTaskLinks } from '../../services/blanzis-calendar-task-store.js';

const router = express.Router();
calendarTaskLinks(router, db.get);`],
]);

patch('server/routes/tasks.js', [
  ["import { createLogger } from '../logger.js';", `import { createLogger } from '../logger.js';
import { addTaskLink, linkedTaskEvents, prepareTaskLink } from '../services/blanzis-calendar-task-store.js';`],
  ["    task.documents = loadTaskDocuments(task.id, viewer);", "    task.documents = loadTaskDocuments(task.id, viewer);\n    task.blanzis_calendar_events = linkedTaskEvents(db.get(), req, task.id);"],
  ["router.post('/', (req, res) => {\n  try {\n    normalizeBlankTaskFields(req.body);", `router.post('/', (req, res) => {
  try {
    const eventId = req.body.blanzis_calendar_event_id;
    if (eventId !== undefined) {
      const problem = prepareTaskLink(db.get(), req, eventId);
      if (problem) return res.status(problem.status).json({ error: problem.error, code: problem.status });
    }
    normalizeBlankTaskFields(req.body);`],
  ["      if (req.body.tags !== undefined) setTags(db.get(), result.lastInsertRowid, req.body.tags);", `      if (req.body.tags !== undefined) setTags(db.get(), result.lastInsertRowid, req.body.tags);
      if (eventId !== undefined) addTaskLink(db.get(), eventId, result.lastInsertRowid);`],
]);

patch('public/components/task-detail.js', [
  ["import { openDetailView, closeDetailView, visibilityRow } from '/components/detail-view.js';", `import { openDetailView, closeDetailView, visibilityRow } from '/components/detail-view.js';
import { taskCalendarRow } from '/utils/blanzis-calendar-task-ui.js';`],
  ["    { icon: 'paperclip', label: t('tasks.documentsLabel'), node: documentListNode(task.documents) },", `    { icon: 'paperclip', label: t('tasks.documentsLabel'), node: documentListNode(task.documents) },
    ...(task.blanzis_calendar_events?.length ? [taskCalendarRow(task.blanzis_calendar_events)] : []),`],
]);

patch('public/pages/notes.js', [
  ["  grid.addEventListener('click', async (e) => {", "  grid.addEventListener('click', async (e) => {\n    if (e.target.closest('a[href]')) return;"],
]);

patch('public/pages/tasks.js', [
  ['      <div class="tasks-body">', `      <div class="tasks-body">
        \${readOnly() ? '' : '<button type="button" class="btn btn--secondary btn--sm" id="blanzis-task-categories" disabled>' + esc(t('tasks.manageCategories')) + '</button>'}`],
  ['  // Die Zahl am "..." steht von Anfang an, und eine Drehung ueber die Schwelle', `  const categoriesButton = container.querySelector('#blanzis-task-categories');
  if (categoriesButton) {
    categoriesButton.addEventListener('click', () => openTaskCategoryManager(container));
    categoriesButton.disabled = false;
  }
  // Die Zahl am "..." steht von Anfang an, und eine Drehung ueber die Schwelle`],
]);

patch('server/openapi/schemas.js', [
  ["            parent_task_id: { type: ['integer', 'null'], minimum: 1, description: 'Creates a subtask. Its parent must be a top-level task the caller can see.' },", `            parent_task_id: { type: ['integer', 'null'], minimum: 1, description: 'Creates a subtask. Its parent must be a top-level task the caller can see.' },
            blanzis_calendar_event_id: { type: 'integer', minimum: 1, description: 'Link this task to a writable calendar event.' },`],
]);

patch('public/settings/pages/admin-api.js', [
  [`              label: t('settings.apiTokenScopeLimit'),
              description: t('settings.apiTokenScopeHint'),
              descriptionId: 'api-token-scope-hint',
              checked: true,
              attrs: { id: 'api-token-scope-limit' },`, `              label: t('settings.blanzisApiTokenFullAccess'),
              description: t('settings.blanzisApiTokenFullAccessHint'),
              descriptionId: 'api-token-scope-hint',
              attrs: { id: 'api-token-full-access', 'aria-controls': 'api-token-scope-grid' },`],
  [`  const scopeLimit = container.querySelector('#api-token-scope-limit');
  const scopeGrid = container.querySelector('#api-token-scope-grid');
  if (scopeLimit && scopeGrid) {
    scopeLimit.addEventListener('change', () => {
      scopeGrid.hidden = !scopeLimit.checked;
    });
  }`, `  const fullAccess = container.querySelector('#api-token-full-access');
  const scopeGrid = container.querySelector('#api-token-scope-grid');
  const syncScopes = () => { scopeGrid.hidden = fullAccess.checked; };
  fullAccess.addEventListener('change', syncScopes);`],
  ['    // scopes: nur senden, wenn „auf Module beschränken" aktiv ist. Sonst voller Zugriff.', '    // An omitted scope list uses the existing unscoped API token mode.'],
  ['    if (scopeLimit && scopeLimit.checked) {', '    if (!fullAccess.checked) {'],
  ['      if (scopeGrid) scopeGrid.hidden = !scopeLimit.checked;', '      syncScopes();'],
]);

for (const [locale, label, hint, oldRequired, required] of [
  ['de', 'Vollzugriff', 'Der Token übernimmt alle Berechtigungen der gewählten Person, auch für MCP.',
    'Wähle mindestens ein Modul oder schalte die Beschränkung aus.', 'Wähle mindestens ein Modul oder aktiviere Vollzugriff.'],
  ['en', 'Full access', 'The token inherits all permissions of the selected account, including for MCP.',
    'Pick at least one module, or turn the limit off.', 'Choose at least one module or enable full access.'],
]) {
  const path = `public/locales/${locale}.json`;
  patch(path, [[
    '        "apiTokenScopeFull":',
    `        "blanzisApiTokenFullAccess": ${JSON.stringify(label)},\n        "blanzisApiTokenFullAccessHint": ${JSON.stringify(hint)},\n        "apiTokenScopeFull":`,
  ], [JSON.stringify(oldRequired), JSON.stringify(required)]]);
}

const detailCss = readFileSync(new URL('./features/calendar-task-ui.css', import.meta.url), 'utf8');
for (const path of ['public/styles/calendar.css', 'public/styles/tasks.css']) {
  writeFileSync(path, `${readFileSync(path, 'utf8')}\n${detailCss}`);
}
