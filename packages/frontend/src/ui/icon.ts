// Inline SVG icon helper — keeps icons as SVG markup (no extra HTTP requests) and
// themed via currentColor so they inherit the surrounding text color.
// All icons are simple pixel-style glyphs matching the Stardew warm-wood theme.

const ICONS: Record<string, string> = {
  // Padlock (code locked / auth required).
  lock: '<rect x="4" y="9" width="8" height="7" rx="1"/><path d="M5.5 9V7a2.5 2.5 0 0 1 5 0v2"/>',
  // Coin (money).
  coin: '<circle cx="8" cy="8" r="5"/><path d="M8 5v6M6.2 6.5h2.4a1.3 1.3 0 0 1 0 2.6H7.6a1.3 1.3 0 0 0 0 2.6h2.4"/>',
  // Water drop.
  drop: '<path d="M8 2.5C8 2.5 3 8 3 11a5 5 0 0 0 10 0c0-3-5-8.5-5-8.5z"/>',
  // Lightning bolt (energy).
  bolt: '<path d="M9 1 3 9h4l-1 6 6-8H8l1-6z"/>',
  // Book (API manual).
  book: '<path d="M2.5 3.5h4a2 2 0 0 1 2 2v9a1.5 1.5 0 0 0-1.5-1.5h-4.5z"/><path d="M13.5 3.5h-4a2 2 0 0 0-2 2v9a1.5 1.5 0 0 1 1.5-1.5h4.5z"/>',
  // Close X.
  close: '<path d="M4 4l8 8M12 4l-8 8"/>',
  // Copy.
  copy: '<rect x="5" y="5" width="8" height="8" rx="1"/><path d="M3.5 10.5V3.5h7"/>',
  // Upload.
  upload: '<path d="M8 2v8M5 5l3-3 3 3M3 13h10"/>',
  // Trophy (leaderboard / medals).
  trophy: '<path d="M5 2h6v3a3 3 0 0 1-6 0z"/><path d="M5 2.5H3v1.5a2 2 0 0 0 2 2M11 2.5h2v1.5a2 2 0 0 1-2 2M6.5 8.5h3M5.5 13h5M8 11v2"/>',
  // History clock.
  clock: '<circle cx="8" cy="8" r="5.5"/><path d="M8 5v3l2 1.5"/>',
  // Check.
  check: '<path d="M3.5 8l3 3 4-6"/>',
  // X mark (error / fail).
  x: '<path d="M4 4l8 8M12 4l-8 8"/>',
};

/** Build a themed inline-SVG icon element. */
export function icon(name: keyof typeof ICONS | string, size = 16): HTMLElement {
  const path = ICONS[name] ?? '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="icon-svg">${path}</svg>`;
  const span = document.createElement('span');
  span.className = 'icon';
  span.style.display = 'inline-flex';
  span.style.alignItems = 'center';
  span.innerHTML = svg;
  return span;
}

/** Inline-SVG markup string for cases that need raw HTML (e.g. innerHTML). */
export function iconHtml(name: keyof typeof ICONS | string, size = 16): string {
  const el = icon(name, size);
  return el.innerHTML;
}
