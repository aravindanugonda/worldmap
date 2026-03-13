const width = 1600;
const height = 920;
const earthSurfaceKm2 = 510_072_000;
const maxRenderableLatitude = 84;

const svg = d3
  .select('#map')
  .attr('viewBox', `0 0 ${width} ${height}`)
  .attr('preserveAspectRatio', 'xMidYMid meet');

const projection = d3.geoMercator().fitSize([width, height], { type: 'Sphere' });
const path = d3.geoPath(projection);

const viewportLayer = svg.append('g').attr('class', 'viewport-layer');
const sphereLayer = viewportLayer.append('g');
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
  const sourceCos = Math.max(Math.cos(toRadians(sourceLat)), 0.05);
  const currentCos = Math.max(Math.cos(toRadians(currentLat)), 0.05);
  return sourceCos / currentCos;
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
  )} km² · Overlay latitude: ${currentLat.toFixed(1)}° · Mercator correction: ${correction.toFixed(
    2,
  )}×`;
}

function applyOverlayTransform(group, state) {
  group.attr(
    'transform',
    `translate(${state.tx},${state.ty}) translate(${state.cx},${state.cy}) scale(${state.scale}) translate(${-state.cx},${-state.cy})`,
  );
}

function createDraggableOverlay(feature) {
  baseLayer.selectAll('.country').classed('selected', (d) => d === feature);

  const [cx, cy] = path.centroid(feature);
  const [, sourceLat] = d3.geoCentroid(feature);

  const state = {
    tx: 0,
    ty: 0,
    cx,
    cy,
    sourceLat,
    scale: 1,
  };

  const group = overlayLayer.append('g').datum(feature).attr('class', 'overlay-group');

  group.append('path').attr('class', 'overlay-country').attr('d', path);

  group.call(
    d3.drag().on('drag', (event) => {
      state.tx += event.dx;
      state.ty += event.dy;

      const screenPoint = [state.cx + state.tx, state.cy + state.ty];
      const inverted = projection.invert(screenPoint);

      if (inverted) {
        const currentLat = clampLatitude(inverted[1]);
        state.scale = mercatorCorrectionScale(state.sourceLat, currentLat);
        updateDetails(feature, currentLat);
      }

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

function setupZoom() {
  const zoom = d3
    .zoom()
    .scaleExtent([1, 12])
    .translateExtent([
      [-width * 1.2, -height * 1.2],
      [width * 2.2, height * 2.2],
    ])
    .on('zoom', (event) => {
      viewportLayer.attr('transform', event.transform);
    });

  svg.call(zoom).call(zoom.transform, d3.zoomIdentity.scale(1.15));
}

async function init() {
  sphereLayer
    .append('path')
    .datum({ type: 'Sphere' })
    .attr('class', 'sphere')
    .attr('d', path);

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
