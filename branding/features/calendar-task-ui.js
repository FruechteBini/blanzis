import { api } from '/api.js';
import { closeDetailView } from '/components/detail-view.js';

const text = (de, en) => document.documentElement.lang.startsWith('de') ? de : en;

async function openLinkedItem(path) {
  if (await closeDetailView({ fokus: false }) !== false) await window.yuvomi.navigate(path);
}

function button(label, handler, className = 'btn btn--secondary btn--sm') {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = className;
  el.textContent = label;
  el.addEventListener('click', handler);
  return el;
}

export function taskCalendarRow(events) {
  const node = document.createElement('div');
  node.className = 'blanzis-event-tasks';
  for (const event of events) {
    node.append(button(event.title, () => openLinkedItem(`/calendar?open=${Number(event.id)}`)));
  }
  return { icon: 'calendar', label: text('Verknüpfte Termine', 'Linked events'), node };
}

export function calendarTaskRow(event, date) {
  const id = Number(event.series_id || event.id);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const path = `/calendar/${id}/tasks`;
  const root = document.createElement('div');
  root.className = 'blanzis-event-tasks';
  const content = document.createElement('div');
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  root.append(content, status);

  const report = () => { status.textContent = text('Aufgaben konnten nicht aktualisiert werden.', 'Could not update tasks.'); };

  async function save(control, action) {
    control.disabled = true;
    status.textContent = '';
    try {
      await action();
      await draw();
    } catch {
      report();
    } finally {
      control.disabled = false;
    }
  }

  async function draw() {
    const { data: tasks, editable, canCreate } = await api.get(path);
    if (!root.isConnected) return;
    content.replaceChildren();
    for (const task of tasks) {
      const row = document.createElement('div');
      row.className = 'blanzis-event-tasks__row';
      row.append(button(task.status === 'done' ? `✓ ${task.title}` : task.title,
        () => openLinkedItem(`/tasks?open=${Number(task.id)}`)));
      if (editable) {
        const unlink = button(text('Lösen', 'Unlink'), () => save(unlink, () => api.delete(`${path}/${task.id}`)));
        unlink.setAttribute('aria-label', `${text('Verknüpfung lösen', 'Unlink')} ${task.title}`);
        row.append(unlink);
      }
      content.append(row);
    }
    if (!editable) {
      root.hidden = tasks.length === 0;
      return;
    }

    const selection = document.createElement('select');
    selection.className = 'form-input';
    selection.setAttribute('aria-label', text('Bestehende Aufgabe', 'Existing task'));
    selection.append(new Option(text('Bestehende Aufgabe wählen', 'Choose an existing task'), ''));
    const link = button(text('Verknüpfen', 'Link'), () => save(link, () => api.put(`${path}/${selection.value}`, {})));
    link.disabled = true;
    selection.addEventListener('change', () => { link.disabled = !selection.value; });
    selection.addEventListener('focus', async () => {
      try {
        const { data: available } = await api.get('/tasks');
        if (!selection.isConnected) return;
        const connectedIds = new Set(tasks.map(task => task.id));
        const previous = selection.value;
        selection.replaceChildren(selection.options[0], ...available
          .filter(task => !connectedIds.has(task.id)).map(task => new Option(task.title, String(task.id))));
        selection.value = previous;
      } catch { report(); }
    });
    const selectRow = document.createElement('div');
    selectRow.className = 'blanzis-event-tasks__row';
    selectRow.append(selection, link);
    content.append(selectRow);

    if (canCreate) {
      const form = document.createElement('form');
      form.className = 'blanzis-event-tasks__row';
      const title = document.createElement('input');
      title.className = 'form-input';
      title.required = true;
      title.maxLength = 200;
      title.placeholder = text('Titel der neuen Aufgabe', 'New task title');
      title.setAttribute('aria-label', title.placeholder);
      const create = button(text('Anlegen', 'Create'), () => form.requestSubmit(), 'btn btn--primary btn--sm');
      form.append(title, create);
      form.addEventListener('submit', e => {
        e.preventDefault();
        if (create.disabled || !title.value.trim()) return;
        save(create, () => api.post('/tasks', {
          title: title.value.trim(), due_date: date, blanzis_calendar_event_id: id,
          ...(event.visibility === 'private' ? { visibility: 'private' } : {}),
        }));
      });
      content.append(form);
    }
  }

  draw().catch(() => { root.hidden = true; });
  return { icon: 'list-checks', label: text('Aufgaben', 'Tasks'), node: root };
}
