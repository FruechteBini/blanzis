export function* noteLinkMatches(content) {
  for (const match of String(content ?? '').matchAll(/https?:\/\/[^\s<>"'`]+/gi)) {
    let candidate = match[0].replace(/[.,;!?]+$/, '');
    while (candidate.endsWith(')') && (candidate.match(/\)/g)?.length ?? 0) > (candidate.match(/\(/g)?.length ?? 0)) {
      candidate = candidate.slice(0, -1);
    }
    if (candidate.length > 2048) continue;
    try {
      const url = new URL(candidate);
      if (!url.username && !url.password) yield { url: url.href, text: candidate, index: match.index };
    } catch {
      continue;
    }
  }
}

export function noteLinks(content) {
  const links = new Set();
  for (const { url } of noteLinkMatches(String(content ?? '').replace(/`[^`\n]+`/g, ' '))) {
    links.add(url);
    if (links.size === 6) break;
  }
  return [...links];
}
