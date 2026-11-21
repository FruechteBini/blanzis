import { createHash } from 'node:crypto';
import { contentMatchesMime } from '../utils/file-signature.js';
import { decodeHtmlEntities } from '../utils/html-entities.js';
import { fetchPublic, readHtmlHead, readLimited } from './subscription-logo.js';
import { noteLinks } from '../../public/utils/blanzis-note-links.js';

const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const maxImages = 6;
const maxImageBytes = 512 * 1024;
const schemaReady = new WeakSet();

export function ensureNoteExtras(database) {
  if (schemaReady.has(database)) return;
  database.exec(`
    CREATE TABLE IF NOT EXISTS blanzis_note_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      mime TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      bytes BLOB NOT NULL,
      UNIQUE(note_id, sha256)
    );
    CREATE TABLE IF NOT EXISTS blanzis_note_projects (
      category_id INTEGER PRIMARY KEY REFERENCES note_categories(id) ON DELETE CASCADE
    );
  `);
  schemaReady.add(database);
}

export class NoteImageError extends Error {}

export function readNoteImages(images = []) {
  return images.map(({ name, data }) => {
    const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);
    if (!match || match[2].length % 4 !== 0) throw new NoteImageError('Invalid note image.');
    const [, mime, base64] = match;
    const bytes = Buffer.from(base64, 'base64');
    if (bytes.length > maxImageBytes || !contentMatchesMime(bytes, mime)) {
      throw new NoteImageError('Invalid note image or image larger than 512 KiB.');
    }
    return { name: name.trim(), mime, bytes, hash: createHash('sha256').update(bytes).digest('hex') };
  });
}

export function applyNoteImages(database, noteId, images, removals = []) {
  const remove = database.prepare('DELETE FROM blanzis_note_images WHERE note_id = ? AND id = ?');
  for (const id of removals) remove.run(noteId, id);
  const insert = database.prepare(`
    INSERT INTO blanzis_note_images (note_id, filename, mime, sha256, bytes)
    VALUES (?, ?, ?, ?, ?) ON CONFLICT(note_id, sha256) DO NOTHING
  `);
  for (const { name, mime, hash, bytes } of images) insert.run(noteId, name, mime, hash, bytes);
  const { count } = database.prepare('SELECT COUNT(*) AS count FROM blanzis_note_images WHERE note_id = ?').get(noteId);
  if (count > maxImages) throw new NoteImageError('A note can contain up to six images.');
}

export function withNoteImagePreviews(database, notes) {
  if (!notes.length) return notes;
  ensureNoteExtras(database);
  const rows = database.prepare(`
    SELECT note_id, id, filename FROM blanzis_note_images
    WHERE note_id IN (SELECT value FROM json_each(?)) ORDER BY id
  `).all(JSON.stringify(notes.map(note => note.id)));
  const byNote = new Map();
  for (const { note_id, id, filename } of rows) {
    if (!byNote.has(note_id)) byNote.set(note_id, []);
    byNote.get(note_id).push({ id, filename });
  }
  return notes.map(note => ({ ...note, preview_images: byNote.get(note.id) ?? [] }));
}

const previewCache = new Map();
let activePreviews = 0;
const maxThumbnailBytes = 512 * 1024;

function previewUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.href.length > 2048) {
    throw new Error('Unsupported preview URL');
  }
  return url;
}

function attribute(tag, name) {
  const result = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(["'])(.*?)\\1`, 'is').exec(tag);
  return result ? decodeHtmlEntities(result[2]).trim() : '';
}

async function fetchPreview(url) {
  const options = { signal: AbortSignal.timeout(5000), validateUrl: previewUrl };
  const { response, finalUrl } = await fetchPublic(url, options);
  if (!response.ok || !/^(text\/html|application\/xhtml\+xml)\b/i.test(response.headers.get('content-type') || '')) {
    await response.body.getReader().cancel();
    return {};
  }
  const html = await readHtmlHead(response);
  const metadata = new Map();
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const field = (attribute(tag, 'property') || attribute(tag, 'name')).toLowerCase();
    if (!metadata.has(field)) metadata.set(field, attribute(tag, 'content'));
  }
  const label = metadata.get('og:title') || metadata.get('twitter:title') || decodeHtmlEntities(html.match(/<title\b[^>]*>([^<]*)<\/title>/i)?.[1] || '');
  const description = metadata.get('og:description') || metadata.get('twitter:description') || metadata.get('description');
  const picture = metadata.get('og:image:secure_url') || metadata.get('og:image') || metadata.get('twitter:image');
  const result = { title: label.trim().slice(0, 160) };
  if (description) result.description = description.replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!picture) return result;
  try {
    const { response: image } = await fetchPublic(new URL(picture, finalUrl).href, options);
    const mime = image.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    try {
      if (!image.ok || !imageTypes.has(mime)) return result;
      const bytes = await readLimited(image, maxThumbnailBytes);
      if (contentMatchesMime(bytes, mime)) result.thumbnail = `data:${mime};base64,${bytes.toString('base64')}`;
    } finally {
      await image.body.getReader().cancel();
    }
  } catch {
    // Metadata is useful even when the site's image cannot be fetched.
  }
  return result;
}

function cachedPreview(url) {
  const cached = previewCache.get(url);
  if (cached && cached.until > Date.now()) return cached.promise;
  if (activePreviews >= 4) return Promise.resolve({});
  activePreviews++;
  const promise = fetchPreview(url).catch(() => ({})).finally(() => { activePreviews--; });
  previewCache.set(url, { promise, until: Date.now() + 10 * 60_000 });
  if (previewCache.size > 24) previewCache.delete(previewCache.keys().next().value);
  return promise;
}

export async function noteLinkPreviews(content, firstOnly = false) {
  const result = [];
  const urls = noteLinks(content);
  for (const url of firstOnly ? urls.slice(0, 1) : urls) result.push({ url, ...await cachedPreview(url) });
  return result;
}
