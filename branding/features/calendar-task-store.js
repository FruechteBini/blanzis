import { mayReadModule, mayWriteModule, mayChangeRecord, taskReader, visibleWhere } from '../authorize/index.ts';
import { getUserId } from '../routes/calendar/helpers.js';

const initialized = new WeakSet();

function ensureLinks(database) {
  if (initialized.has(database)) return;
  database.exec(`
    CREATE TABLE IF NOT EXISTS blanzis_calendar_tasks (
      event_id INTEGER NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      PRIMARY KEY (event_id, task_id)
    );
    CREATE INDEX IF NOT EXISTS blanzis_calendar_tasks_by_task ON blanzis_calendar_tasks(task_id);
  `);
  initialized.add(database);
}

const eventVisibility = `${visibleWhere('ics_subscriptions', 'e', '@me')} AND ${visibleWhere('events', 'e', '@me')}`;
const taskVisibility = visibleWhere('tasks', 't', '@me');

export function visibleLinkEvent(database, req, eventId) {
  return database.prepare(`SELECT e.id, e.created_by, e.assigned_to FROM calendar_events e
    WHERE e.id = @id AND ${eventVisibility}`).get({ id: eventId, me: getUserId(req) });
}

export function mayChangeLinks(database, req, event) {
  if (!mayWriteModule(req, 'calendar') || !mayReadModule(req, 'tasks')) return false;
  const me = getUserId(req);
  const owns = me !== null && (event.created_by === me || event.assigned_to === me || !!database.prepare(
    'SELECT 1 FROM event_assignments WHERE event_id = ? AND user_id = ?',
  ).get(event.id, me));
  return mayChangeRecord(database, req, 'calendar_edit_others', owns);
}

export function addTaskLink(database, eventId, taskId) {
  database.prepare('INSERT INTO blanzis_calendar_tasks (event_id, task_id) VALUES (?, ?) ON CONFLICT DO NOTHING').run(eventId, taskId);
}

export function prepareTaskLink(database, req, eventId) {
  if (!Number.isSafeInteger(eventId) || eventId <= 0) return { status: 400, error: 'Invalid calendar event.' };
  if (!mayReadModule(req, 'calendar')) return { status: 403, error: 'Calendar access required.' };
  const event = visibleLinkEvent(database, req, eventId);
  if (!event) return { status: 404, error: 'Calendar event not found.' };
  if (!mayChangeLinks(database, req, event)) return { status: 403, error: 'Calendar write access required.' };
  ensureLinks(database);
  return null;
}

export function linkedTaskEvents(database, req, taskId) {
  if (!mayReadModule(req, 'calendar') || taskReader(req).wall) return [];
  ensureLinks(database);
  return database.prepare(`SELECT e.id, e.title, e.start_datetime
    FROM blanzis_calendar_tasks l JOIN calendar_events e ON e.id = l.event_id
    WHERE l.task_id = @id AND ${eventVisibility} ORDER BY e.start_datetime, e.id`)
    .all({ id: taskId, me: getUserId(req) });
}

export function calendarTaskLinks(router, databaseOf) {
  function withEvent(handler) {
    return (req, res) => {
      if (!mayReadModule(req, 'tasks') || taskReader(req).wall) return res.status(403).json({ error: 'Task access required.' });
      const database = databaseOf();
      const event = visibleLinkEvent(database, req, Number(req.params.id));
      if (!event) return res.status(404).json({ error: 'Calendar event not found.' });
      ensureLinks(database);
      return handler(database, req, res, event);
    };
  }

  router.get('/:id/tasks', withEvent((database, req, res, event) => {
    const tasks = database.prepare(`SELECT t.id, t.title, t.status, t.due_date
      FROM blanzis_calendar_tasks l JOIN tasks t ON t.id = l.task_id
      WHERE l.event_id = @id AND ${taskVisibility} ORDER BY t.status = 'done', t.due_date, t.id`)
      .all({ id: event.id, me: getUserId(req) });
    res.set('Cache-Control', 'private, no-store');
    res.json({ data: tasks, editable: mayChangeLinks(database, req, event), canCreate: mayWriteModule(req, 'tasks') });
  }));

  function change(add) {
    return withEvent((database, req, res, event) => {
      if (!mayChangeLinks(database, req, event)) return res.status(403).json({ error: 'Calendar write access required.' });
      const id = Number(req.params.taskId);
      const task = database.prepare(`SELECT t.id FROM tasks t WHERE t.id = @id AND t.parent_task_id IS NULL AND ${taskVisibility}`)
        .get({ id, me: getUserId(req) });
      if (!task) return res.status(404).json({ error: 'Task not found.' });
      if (add) addTaskLink(database, event.id, id);
      else database.prepare('DELETE FROM blanzis_calendar_tasks WHERE event_id = ? AND task_id = ?').run(event.id, id);
      res.json({ data: { id } });
    });
  }

  router.put('/:id/tasks/:taskId', change(true));
  router.delete('/:id/tasks/:taskId', change(false));
}
