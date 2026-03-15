const width = 1800;
const height = 1000;
const earthSurfaceKm2 = 510_072_000;
const maxRenderableLatitude = 80;

const svg = d3
  .select('#map')
  .attr('viewBox', `0 0 ${width} ${height}`)
  .attr('preserveAspectRatio', 'xMidYMid slice');

const projection = d3.geoMercator().fitExtent([[0, 0], [width, height]], { type: 'Sphere' });
const path = d3.geoPath(projection);
const currentZoom = { transform: d3.zoomIdentity };

const viewportLayer = svg.append('g').attr('class', 'viewport-layer');
const sphereLayer   = viewportLayer.append('g');
const guidesLayer   = viewportLayer.append('g');
const baseLayer     = viewportLayer.append('g');
const overlayLayer  = viewportLayer.append('g');

let countries = [];
let activeOverlay = null; // track the single active overlay

// ── Util ─────────────────────────────────────────────────────────────────────

function steradianToKm2(a) { return (a / (4 * Math.PI)) * earthSurfaceKm2; }
function formatKm2(v) { return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(v) + ' km²'; }
function countryName(f) { return f.properties.name || f.properties.admin || `Country ${f.id}`; }
function wrapLon(lon) { const w = ((lon + 180) % 360 + 360) % 360 - 180; return w === -180 ? 180 : w; }
function clampLat(lat) { return Math.max(-maxRenderableLatitude, Math.min(maxRenderableLatitude, lat)); }
function toRad(d) { return d * Math.PI / 180; }

// Mercator x-scale correction: a country at sourceLat has true east-west extent
// proportional to cos(sourceLat). When placed at targetLat, scale x by cos(sourceLat)/cos(targetLat)
// so the rendered width matches the true relative size at targetLat's Mercator scale.
function mercatorXScale(sourceLat, targetLat) {
  const sc = Math.max(Math.cos(toRad(sourceLat)), 0.08);
  const tc = Math.max(Math.cos(toRad(targetLat)), 0.08);
  return Math.max(0.1, Math.min(8, sc / tc));
}

function translateCoords(coords, dLon, dLat) {
  if (typeof coords[0] === 'number')
    return [wrapLon(coords[0] + dLon), Math.max(-89.9, Math.min(89.9, coords[1] + dLat))];
  return coords.map(c => translateCoords(c, dLon, dLat));
}

function translatedFeature(orig, tLon, tLat) {
  const [sLon, sLat] = d3.geoCentroid(orig);
  return {
    type: 'Feature', id: orig.id,
    properties: { ...orig.properties },
    geometry: {
      ...orig.geometry,
      coordinates: translateCoords(orig.geometry.coordinates, tLon - sLon, tLat - sLat),
    },
  };
}

// ── UI update ─────────────────────────────────────────────────────────────────

function updateCard(feature, currentLat) {
  const card = document.getElementById('country-card');
  if (!feature) { card.hidden = true; return; }

  card.hidden = false;
  document.getElementById('card-name').textContent = countryName(feature);
  document.getElementById('card-area').textContent = formatKm2(steradianToKm2(d3.geoArea(feature)));

  const lat = currentLat ?? d3.geoCentroid(feature)[1];
  document.getElementById('card-lat').textContent = `${lat.toFixed(1)}°${lat >= 0 ? 'N' : 'S'}`;

  // Mercator area distortion at the overlay's current latitude.
  // Both x and y are scaled by 1/cos(lat), so apparent area = true area / cos²(lat).
  const cosLat = Math.max(Math.cos(toRad(lat)), 0.08);
  const distortion = 1 / (cosLat * cosLat);
  document.getElementById('card-scale').textContent =
    distortion < 1.05 ? '1×'
                      : `${distortion.toFixed(1)}× larger`;

  // Rotate educational tip based on country
  const tips = [
    `Greenland looks huge on Mercator, but is actually smaller than Australia.`,
    `Russia appears almost twice as large as Africa on Mercator, but Africa is actually larger.`,
    `The Mercator projection preserves shape (conformal) but distorts area.`,
    `At 60°N, a country appears twice as wide as it truly is compared to the equator.`,
    `Gerardus Mercator created his projection in 1569 — primarily for sea navigation.`,
  ];
  const tip = tips[Math.abs(feature.id ?? 0) % tips.length];
  document.getElementById('edu-text').textContent = tip;
}

// ── Overlay ───────────────────────────────────────────────────────────────────

function removeActiveOverlay() {
  if (activeOverlay) { activeOverlay.remove(); activeOverlay = null; }
  baseLayer.selectAll('.country').classed('selected', false);
}

function createDraggableOverlay(feature) {
  removeActiveOverlay();
  baseLayer.selectAll('.country').classed('selected', d => d === feature);

  const [sourceLon, sourceLat] = d3.geoCentroid(feature);
  let targetLon = sourceLon;
  let targetLat = sourceLat;

  const g = overlayLayer.append('g');
  activeOverlay = g.node();

  const overlayPath = g.append('path').attr('class', 'overlay-country').attr('d', path(feature));

  // Pivot in SVG-viewBox coordinates (the stable unzoomed space).
  let [pivotX, pivotY] = projection([sourceLon, sourceLat]);
  let xScale = 1;

  // Drag anchor: recorded once on pointerdown in the same stable SVG-viewBox space.
  // We use absolute positions (not accumulated deltas) so that changes to the
  // overlay group's xScale transform between frames don't corrupt g.getScreenCTM()
  // and cause the "sliding past" phenomenon for high-latitude targets.
  let anchorSVG = null;
  let anchorPivot = null;

  function applyTransform() {
    g.attr('transform',
      `translate(${pivotX},${pivotY}) scale(${xScale},1) translate(${-pivotX},${-pivotY})`);
  }

  overlayPath.call(
    d3.drag()
      .on('start', event => {
        event.sourceEvent.stopPropagation();
        document.getElementById('map-hint').classList.add('hidden');
        // Capture mouse position in the fixed SVG-root coordinate space.
        anchorSVG = d3.pointer(event.sourceEvent, svg.node());
        anchorPivot = [pivotX, pivotY];
      })
      .on('drag', event => {
        // Current mouse in SVG-root coordinates — unaffected by xScale changes.
        const [mx, my] = d3.pointer(event.sourceEvent, svg.node());
        const { k } = currentZoom.transform;

        // Convert SVG-root delta → viewportLayer/pre-zoom space (divide by k).
        pivotX = anchorPivot[0] + (mx - anchorSVG[0]) / k;
        pivotY = anchorPivot[1] + (my - anchorSVG[1]) / k;

        const ll = projection.invert([pivotX, pivotY]);
        if (!ll) return;

        targetLon = wrapLon(ll[0]);
        targetLat = clampLat(ll[1]);

        const moved = translatedFeature(feature, targetLon, targetLat);
        xScale = mercatorXScale(sourceLat, targetLat);

        overlayPath.attr('d', path(moved));
        applyTransform();
        updateCard(feature, targetLat);
      }),
  );

  applyTransform();
  updateCard(feature, targetLat);
}

// ── Selector ──────────────────────────────────────────────────────────────────

function populateSelector(features) {
  const sel = document.getElementById('country-select');
  [...features]
    .sort((a, b) => countryName(a).localeCompare(countryName(b), undefined, { sensitivity: 'base' }))
    .forEach(f => {
      const o = document.createElement('option');
      o.value = f.id;
      o.textContent = countryName(f);
      sel.appendChild(o);
    });
}

function setActiveCountry(feature) {
  document.getElementById('country-select').value = String(feature.id);
  createDraggableOverlay(feature);
}

// ── Events ────────────────────────────────────────────────────────────────────

document.getElementById('clear-overlays').addEventListener('click', () => {
  removeActiveOverlay();
  document.getElementById('country-select').value = '';
  updateCard(null);
  document.getElementById('map-hint').classList.remove('hidden');
});

document.getElementById('country-select').addEventListener('change', e => {
  const f = countries.find(d => String(d.id) === e.target.value);
  if (f) setActiveCountry(f);
});

// ── Latitude guides ───────────────────────────────────────────────────────────

function latLine(lat) {
  return {
    type: 'Feature', properties: {},
    geometry: { type: 'LineString', coordinates: d3.range(-180, 181, 1).map(lon => [lon, lat]) },
  };
}

function renderGuides() {
  guidesLayer.append('path')
    .datum(d3.geoGraticule().step([20, 10])())
    .attr('class', 'graticule').attr('d', path);

  const specials = [
    { lat: 0,     cls: 'latitude-special latitude-equator', label: 'Equator' },
    { lat: 23.5,  cls: 'latitude-special latitude-tropic',  label: 'Tropic of Cancer' },
    { lat: -23.5, cls: 'latitude-special latitude-tropic',  label: 'Tropic of Capricorn' },
    { lat: 66.5,  cls: 'latitude-special latitude-arctic',  label: 'Arctic Circle' },
    { lat: -66.5, cls: 'latitude-special latitude-arctic',  label: 'Antarctic Circle' },
  ];

  specials.forEach(({ lat, cls, label }) => {
    guidesLayer.append('path').datum(latLine(lat)).attr('class', cls).attr('d', path);
    const pt = projection([-175, lat]);
    if (pt) {
      guidesLayer.append('text').attr('class', 'latitude-label')
        .attr('x', pt[0] + 6).attr('y', pt[1] - 5).text(label);
    }
  });

  const markers = d3.range(-70, 71, 10).filter(l => ![0, 23.5, -23.5].includes(l));
  markers.forEach(lat => {
    guidesLayer.append('path').datum(latLine(lat)).attr('class', 'latitude-line').attr('d', path);
    const label = lat > 0 ? `${lat}°N` : `${Math.abs(lat)}°S`;
    const lp = projection([-175, lat]);
    const rp = projection([172, lat]);
    if (lp) guidesLayer.append('text').attr('class', 'latitude-label')
      .attr('x', lp[0] + 4).attr('y', lp[1] - 3).text(label);
    if (rp) guidesLayer.append('text').attr('class', 'latitude-label')
      .attr('x', rp[0] - 4).attr('y', rp[1] - 3).attr('text-anchor', 'end').text(label);
  });
}

// ── Zoom ──────────────────────────────────────────────────────────────────────

function setupZoom() {
  const zoom = d3.zoom()
    .scaleExtent([1, 10])
    .translateExtent([[-width * 0.5, -height * 0.5], [width * 1.5, height * 1.5]])
    .on('zoom', event => {
      currentZoom.transform = event.transform;
      viewportLayer.attr('transform', event.transform);
    });

  svg.call(zoom).call(zoom.transform, d3.zoomIdentity);
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  sphereLayer.append('path').datum({ type: 'Sphere' }).attr('class', 'sphere').attr('d', path);
  renderGuides();

  const topology = await d3.json('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json');
  countries = topojson.feature(topology, topology.objects.countries).features
    .filter(f => countryName(f) !== 'Antarctica');

  populateSelector(countries);

  baseLayer.selectAll('.country').data(countries).join('path')
    .attr('class', 'country').attr('d', path)
    .on('click', (_, f) => setActiveCountry(f))
    .append('title').text(d => countryName(d));

  setupZoom();
  updateCard(null);
}

init().catch(err => {
  console.error('Failed to load map data', err);
  document.getElementById('country-card').hidden = true;
  document.getElementById('edu-text').textContent =
    'Could not load map data. Please check your network connection and refresh.';
});
