// Run as the Blanzis container's node user with the read-only secrets loader.
import { get } from './server/db.js';
import { categoryNameKey } from './server/services/note-categories.js';

const names = ['Allgemein', 'Wohnzimmer', 'Küche', 'Schlafzimmer', 'Bad', 'Flur', 'Garten'];
const database = get();
const createRooms = database.transaction(() => {
  const existing = database.prepare("SELECT id FROM note_categories WHERE scope = 'household' AND name_key = ?");
  const insert = database.prepare(`INSERT INTO note_categories (name, name_key, scope, owner_user_id, created_by, sort_order)
    VALUES (?, ?, 'household', NULL, NULL, ?)`);
  let order = database.prepare("SELECT COALESCE(MAX(sort_order), -1) AS position FROM note_categories WHERE scope = 'household'").get().position;
  let added = 0;
  for (const room of names) {
    const name = `Umzug · ${room}`;
    const key = categoryNameKey(name);
    if (existing.get(key)) continue;
    insert.run(name, key, ++order);
    added++;
  }
  return { added, available: names.length };
});
console.log(createRooms());
