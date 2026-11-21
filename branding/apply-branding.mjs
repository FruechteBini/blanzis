import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

const newName = 'Blanzis';
const displayName = /\bYuvomi\b(?!\/)/g;
const frontendExtensions = new Set(['.css', '.html', '.js', '.json']);

function rewrite(path, transform) {
  const original = readFileSync(path, 'utf8');
  const updated = transform(original);
  if (updated !== original) writeFileSync(path, updated);
}

function renameBrand(text) {
  return text.replace(displayName, newName);
}

function renameFrontend(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory() && entry.name !== 'vendor') renameFrontend(path);
    if (entry.isFile() && frontendExtensions.has(extname(path)) && !entry.name.endsWith('.min.js')) {
      rewrite(path, renameBrand);
    }
  }
}

function changeManifestName(source) {
  const manifest = JSON.parse(source);
  manifest.name = newName;
  manifest.short_name = newName;
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function changeServerManifest(source) {
  const original = 'name: `${appName} Familienplaner`,';
  if (!source.includes(original)) throw new Error('The upstream manifest format changed');
  return renameBrand(source).replace(original, 'name: appName,');
}

const mode = process.argv[2];
if (mode === 'frontend') {
  renameFrontend('public');
  rewrite(join('public', 'manifest.json'), changeManifestName);
} else if (mode === 'server') {
  const brandedServerFiles = [
    'server/auth.js',
    'server/openapi.js',
    'server/routes/notifications.js',
    'server/routes/push.js',
    'server/services/email.js',
    'server/services/notification-channels.js',
    'server/services/notification-providers/email.js',
    'server/services/notifications.js',
    'server/settings/values.ts',
    'server/utils/totp.js',
  ];
  rewrite('server/index.js', changeServerManifest);
  for (const path of brandedServerFiles) rewrite(path, renameBrand);
} else {
  throw new Error(`Expected a branding stage, received ${basename(mode ?? 'none')}`);
}
