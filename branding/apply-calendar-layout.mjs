import { readFileSync, writeFileSync } from 'node:fs';

const pagePath = 'public/pages/calendar.js';
let page = readFileSync(pagePath, 'utf8');

function replaceOnce(before, after) {
  const index = page.indexOf(before);
  if (index === -1 || page.indexOf(before, index + before.length) !== -1) {
    throw new Error(`Unexpected upstream calendar source: ${before.slice(0, 120)}`);
  }
  page = page.slice(0, index) + after + page.slice(index + before.length);
}

// Use a Blanzis preference so existing installations start in the new layout.
replaceOnce("'yuvomi:calendar:month-titles'", "'blanzis:calendar:month-titles'");
replaceOnce('monthTitles: false,', 'monthTitles: true,');
replaceOnce(`  // Gegen 'true' geprueft, nicht gegen 'false' wie die Ebenen darueber: die
  // Ebenen sind AN, solange nichts anderes dasteht, dieser Schalter ist AUS.
  state.monthTitles = localStorage.getItem(MONTH_TITLES_KEY) === 'true';`,
  "  state.monthTitles = localStorage.getItem(MONTH_TITLES_KEY) !== 'false';");

replaceOnce(`          // Baender nur am Desktop: am Telefon sagt der Punkt je Tag „hier ist
          // etwas", und die Tagesliste darunter nennt „Tag 2 von 3".
          const band = split ? null : bandSegments(week.map((d) => d.date));`,
  '          const band = !split || state.monthTitles ? bandSegments(week.map((d) => d.date)) : null;');
replaceOnce(`    // Ein Band liegt UEBER den Zellen (\x60.month-bands\x60), nicht in einer: es
    // oeffnet seinen Termin, wie ein Chip in der Zelle.
    const bandEl = e.target.closest('.month-bands .cal-band');`,
  `    // Desktop bands open their event. Mobile bands let taps reach the day below.
    const bandEl = !split && e.target.closest('.month-bands .cal-band');`);

writeFileSync(pagePath, page);

const cssPath = 'public/styles/calendar.css';
const mobileStyles = readFileSync(new URL('./features/calendar-layout.css', import.meta.url), 'utf8');
writeFileSync(cssPath, `${readFileSync(cssPath, 'utf8')}\n${mobileStyles}`);
