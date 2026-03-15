const width = 1800;
const height = 1000;
const earthSurfaceKm2 = 510_072_000;
const maxRenderableLatitude = 75;
const minCorrectionScale = 0.45;
const maxCorrectionScale = 3.2;

const svg = d3
  .select('#map')
  .attr('viewBox', `0 0 ${width} ${height}`)
  .attr('preserveAspectRatio', 'xMidYMid meet');

const projection = d3.geoMercator().fitExtent(
  [
    [20, 20],
    [width - 20, height - 20],
  ],
  { type: 'Sphere' },
);

const path = d3.geoPath(projection);
const currentZoom = { transform: d3.zoomIdentity };

const viewportLayer = svg.append('g').attr('class', 'viewport-layer');
const sphereLayer = viewportLayer.append('g');
const guidesLayer = viewportLayer.append('g');
const baseLayer = viewportLayer.append('g');
const overlayLayer = viewportLayer.append('g');

const select = document.getElementById('country-select');
const details = document.getElementById('details');
const clearButton = document.getElementById('clear-overlays');

let countries = [];

function steradianToKm2(steradianArea) {
  return (steradianArea / (4 * Math.PI)) * earthSurfaceKm2;
}

function formatKm2(value) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

function countryName(feature) {
  return feature.properties.name || feature.properties.admin || `Country ${feature.id}`;
}

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function mercatorCorrectionScale(sourceLat, currentLat) {
  const sourceCos = Math.max(Math.cos(toRadians(sourceLat)), 0.08);
  const currentCos = Math.max(Math.cos(toRadians(currentLat)), 0.08);
  const rawScale = sourceCos / currentCos;
  return Math.max(minCorrectionScale, Math.min(maxCorrectionScale, rawScale));
}

function clampLatitude(latitude) {
  return Math.max(-maxRenderableLatitude, Math.min(maxRenderableLatitude, latitude));
}

function updateDetails(feature, dynamicLat = null) {
  if (!feature) {
    details.textContent = 'Select a country to view details.';
    return;
  }

  const km2 = steradianToKm2(d3.geoArea(feature));
  const [, sourceLat] = d3.geoCentroid(feature);
  const currentLat = dynamicLat ?? sourceLat;
  const correction = mercatorCorrectionScale(sourceLat, currentLat);

  details.textContent = `${countryName(feature)} · True area: ${formatKm2(
    km2,
  )} km² · Overlay latitude: ${currentLat.toFixed(1)}° · Correction: ${correction.toFixed(2)}×`;
}

function applyOverlayTransform(group, state) {
  group.attr(
    'transform',
    `translate(${state.tx},${state.ty}) translate(${state.cx},${state.cy}) scale(${state.scale}) translate(${-state.cx},${-state.cy})`,
  );
}

function getOverlayLat(state) {
  const mapX = state.cx + state.tx;
  const mapY = state.cy + state.ty;
  const lonLat = projection.invert([mapX, mapY]);
  return lonLat ? clampLatitude(lonLat[1]) : state.sourceLat;
}

function createDraggableOverlay(feature) {
  baseLayer.selectAll('.country').classed('selected', (d) => d === feature);

  const [cx, cy] = path.centroid(feature);
  const [, sourceLat] = d3.geoCentroid(feature);

  const state = { tx: 0, ty: 0, cx, cy, sourceLat, scale: 1 };

  const group = overlayLayer.append('g').datum(feature).attr('class', 'overlay-group');

  group.append('path').attr('class', 'overlay-country').attr('d', path);

  group.call(
    d3.drag().on('drag', (event) => {
      const factor = 1 / currentZoom.transform.k;
      state.tx += event.dx * factor;
      state.ty += event.dy * factor;

      const currentLat = getOverlayLat(state);
      state.scale = mercatorCorrectionScale(state.sourceLat, currentLat);
      updateDetails(feature, currentLat);

      applyOverlayTransform(group, state);
    }),
  );

  applyOverlayTransform(group, state);
}

function populateSelector(features) {
  const sorted = [...features].sort((a, b) =>
    countryName(a).localeCompare(countryName(b), undefined, { sensitivity: 'base' }),
  );

  for (const feature of sorted) {
    const option = document.createElement('option');
    option.value = feature.id;
    option.textContent = countryName(feature);
    select.appendChild(option);
  }
}

function setActiveCountry(feature) {
  select.value = String(feature.id);
  updateDetails(feature);
  createDraggableOverlay(feature);
}

clearButton.addEventListener('click', () => {
  overlayLayer.selectAll('*').remove();
  baseLayer.selectAll('.country').classed('selected', false);
  select.value = '';
  updateDetails(null);
});

select.addEventListener('change', (event) => {
  const selectedId = event.target.value;
  if (!selectedId) {
    return;
  }

  const feature = countries.find((d) => String(d.id) === selectedId);
  if (feature) {
    setActiveCountry(feature);
  }
});

function latitudeLine(lat) {
  return {
    type: 'Feature',
    properties: { latitude: lat },
    geometry: {
      type: 'LineString',
      coordinates: d3.range(-180, 181, 1).map((lon) => [lon, lat]),
    },
  };
}

function renderLatitudeGuides() {
  const graticule = d3.geoGraticule().step([20, 10]);
  guidesLayer.append('path').datum(graticule()).attr('class', 'graticule').attr('d', path);

  const special = [
    { lat: 0, className: 'latitude-special latitude-equator', label: 'Equator (0°)' },
    { lat: 23.5, className: 'latitude-special latitude-tropic', label: 'Tropic of Cancer (23.5°N)' },
    { lat: -23.5, className: 'latitude-special latitude-tropic', label: 'Tropic of Capricorn (23.5°S)' },
  ];

  special.forEach((line) => {
    guidesLayer.append('path').datum(latitudeLine(line.lat)).attr('class', line.className).attr('d', path);

    const labelPoint = projection([-168, line.lat]);
    if (labelPoint) {
      guidesLayer
        .append('text')
        .attr('class', 'latitude-label')
        .attr('x', labelPoint[0] + 6)
        .attr('y', labelPoint[1] - 4)
        .text(line.label);
    }
  });

  const latitudeMarkers = [-60, -40, -20, 20, 40, 60];
  latitudeMarkers.forEach((lat) => {
    const labelPoint = projection([170, lat]);
    if (labelPoint) {
      guidesLayer
        .append('text')
        .attr('class', 'latitude-label')
        .attr('x', labelPoint[0] - 42)
        .attr('y', labelPoint[1] - 2)
        .text(`${lat > 0 ? `${lat}°N` : `${Math.abs(lat)}°S`}`);
    }
  });
}

function setupZoom() {
  const zoom = d3
    .zoom()
    .scaleExtent([1, 10])
    .translateExtent([
      [-width * 1.2, -height * 1.2],
      [width * 2.2, height * 2.2],
    ])
    .on('zoom', (event) => {
      currentZoom.transform = event.transform;
      viewportLayer.attr('transform', event.transform);
    });

  svg.call(zoom).call(zoom.transform, d3.zoomIdentity);
}

async function init() {
  sphereLayer.append('path').datum({ type: 'Sphere' }).attr('class', 'sphere').attr('d', path);

  renderLatitudeGuides();

  const topology = await d3.json('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json');

  countries = topojson
    .feature(topology, topology.objects.countries)
    .features.filter((feature) => countryName(feature) !== 'Antarctica');

  populateSelector(countries);

  baseLayer
    .selectAll('.country')
    .data(countries)
    .join('path')
    .attr('class', 'country')
    .attr('d', path)
    .on('click', (_, feature) => {
      setActiveCountry(feature);
    })
    .append('title')
    .text((d) => countryName(d));

  setupZoom();
  updateDetails(null);
}

init().catch((error) => {
  console.error('Unable to load world map data', error);
  details.textContent = 'Could not load map data. Please check your network connection and refresh.';
});
