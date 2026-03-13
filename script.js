const width = 1100;
const height = 620;
const earthSurfaceKm2 = 510_072_000;

const svg = d3
  .select('#map')
  .attr('viewBox', `0 0 ${width} ${height}`)
  .attr('preserveAspectRatio', 'xMidYMid meet');

const projection = d3.geoEqualEarth().fitSize([width, height], { type: 'Sphere' });
const path = d3.geoPath(projection);

const baseLayer = svg.append('g');
const overlayLayer = svg.append('g');

const select = document.getElementById('country-select');
const details = document.getElementById('details');
const clearButton = document.getElementById('clear-overlays');

let countries = [];
let activeFeature = null;

function steradianToKm2(steradianArea) {
  return (steradianArea / (4 * Math.PI)) * earthSurfaceKm2;
}

function formatKm2(value) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

function countryName(feature) {
  return feature.properties.name || feature.properties.admin || `Country ${feature.id}`;
}

function updateDetails(feature) {
  if (!feature) {
    details.textContent = 'Select a country to view details.';
    return;
  }

  const km2 = steradianToKm2(d3.geoArea(feature));
  const centroid = d3.geoCentroid(feature);
  const [lon, lat] = centroid;
  details.textContent = `${countryName(feature)} · Approx area: ${formatKm2(
    km2,
  )} km² · Centroid: ${lat.toFixed(1)}°, ${lon.toFixed(1)}°`;
}

function createDraggableOverlay(feature) {
  const countryPath = baseLayer.selectAll('.country');
  countryPath.classed('selected', (d) => d === feature);

  const overlay = overlayLayer
    .append('path')
    .datum(feature)
    .attr('class', 'overlay-country')
    .attr('d', path)
    .attr('transform', null)
    .raise();

  let dx = 0;
  let dy = 0;

  overlay.call(
    d3
      .drag()
      .on('drag', (event) => {
        dx += event.dx;
        dy += event.dy;
        overlay.attr('transform', `translate(${dx}, ${dy})`);
      })
      .on('end', () => {
        overlay.raise();
      }),
  );
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
  activeFeature = feature;
  select.value = String(feature.id);
  updateDetails(feature);
  createDraggableOverlay(feature);
}

clearButton.addEventListener('click', () => {
  overlayLayer.selectAll('*').remove();
  baseLayer.selectAll('.country').classed('selected', false);
  activeFeature = null;
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

async function init() {
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

  updateDetails(activeFeature);
}

init().catch((error) => {
  console.error('Unable to load world map data', error);
  details.textContent = 'Could not load map data. Please check your network connection and refresh.';
});
