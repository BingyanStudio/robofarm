/*
 * Runtime theme token reader.
 * The color source of truth lives in styles/tokens.css (CSS variables); both Canvas
 * rendering (renderer.ts) and API method badges (api-docs.ts) read the same tokens via
 * this module, avoiding duplicate DOM and Canvas color definitions.
 *
 * Reads CSS variables on :root via getComputedStyle; if styles are not loaded yet or the
 * read fails, falls back to defaults below that match tokens.css exactly, ensuring renders
 * never lose colors due to timing anomalies.
 */

/** Read a CSS variable, falling back to a default value on failure. */
function cssVar(name: string, fallback: string): string {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch {
    return fallback;
  }
}

/** Canvas render colors (renderer.ts), sourced from tokens.css --color-* / semantic colors */
export const theme = {
  // Tile / canvas
  bgCanvas: cssVar('--bg-canvas', '#231c15'),
  grid: cssVar('--color-grid', 'rgba(0, 0, 0, 0.16)'),
  waterBorder: cssVar('--color-water-border', '#4a9cc9'),

  // Crops
  cropGrowing: cssVar('--color-crop-growing', '#86c94a'),
  cropThirsty: cssVar('--color-crop-thirsty', '#f0a030'),
  cropGrown: cssVar('--color-crop-grown', '#e06838'),

  // Drones
  p1: cssVar('--color-p1', '#7ac04c'),
  p2: cssVar('--color-p2', '#e05848'),

  // Drone accessory markers
  bounty: cssVar('--color-bounty', '#f5c042'),
  waterPip: cssVar('--color-water-pip', '#4aace0'),
  interceptMark: cssVar('--color-intercept-mark', '#f5d148'),

  // Tile effect colors (independent of alpha)
  fxWater: cssVar('--color-fx-water', '#7dd3fc'),
  fxHarvest: cssVar('--color-fx-harvest', '#f5a03b'),
  fxIntercept: cssVar('--color-fx-intercept', '#f8a5a5'),

  // Canvas neutral strokes / shadows
  halfLine: cssVar('--color-half-line', 'rgba(255, 255, 255, 0.5)'),
  hoverStroke: cssVar('--color-hover-stroke', 'rgba(255, 255, 255, 0.9)'),
  droneOutline: cssVar('--color-drone-outline', 'rgba(0, 0, 0, 0.4)'),
  droneIdStroke: cssVar('--color-drone-id-stroke', 'rgba(0, 0, 0, 0.85)'),
  textOnDark: cssVar('--color-text-on-dark', '#ffffff'),
  textOnBright: cssVar('--color-text-on-bright', '#000000'),
  chargeTintRgb: cssVar('--color-charge-tint', '74, 222, 128'),
} as const;

/** API method badge colors (api-docs.ts), sourced from tokens.css --method-* */
export function methodColor(method: string): string {
  switch (method) {
    case 'GET':
      return cssVar('--method-get', '#7ac04c');
    case 'POST':
      return cssVar('--method-post', '#4a8be0');
    case 'WS':
      return cssVar('--method-ws', '#b070e0');
    case 'DELETE':
      return cssVar('--method-delete', '#e05848');
    case 'PUT':
      return cssVar('--method-put', '#f5a03b');
    default:
      return cssVar('--method-default', '#7d7158');
  }
}