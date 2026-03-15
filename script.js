const width = 1800;
const height = 1000;
const earthSurfaceKm2 = 510_072_000;
const maxRenderableLatitude = 80;

const svg = d3
  .select('#map')
  .attr('viewBox', `0 0 ${width} ${height}`)
  .attr('preserveAspectRatio', 'xMidYMid slice');

const projection = d3.geoMercator().fitExtent(
  [
    [0, 0],
    [width, height],
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

function wrapLongitude(lon) {
  const wrapped = ((lon + 180) % 360 + 360) % 360 - 180;
  return wrapped === -180 ? 180 : wrapped;
}

function clampLatitude(latitude) {
  return Math.max(-maxRenderableLatitude, Math.min(maxRenderableLatitude, latitude));
}

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

// On Mercator, pixel_width = R·Δλ (latitude-independent), so a country at sourceLat
// spanning Δλ degrees represents cos(sourceLat)·Δλ km east-west. After translating
// coordinates to targetLat, D3 still renders width as R·Δλ, which now looks like a
// country spanning Δλ km at the equator — too wide by 1/cos(sourceLat). To show the
// true east-west extent at targetLat's Mercator scale, scale x by cos(sourceLat)/cos(targetLat).
//
// Height (latitude arc) is independent of longitude, and after translating to targetLat
// D3 renders Δφ/cos(targetLat) — exactly the same distortion as any native country at
// targetLat — so no y correction is needed (yScale = 1).
function mercatorScales(sourceLat, targetLat) {
  const sourceCos = Math.max(Math.cos(toRadians(sourceLat)), 0.08);
  const targetCos = Math.max(Math.cos(toRadians(targetLat)), 0.08);
  return {
    xScale: Math.max(0.1, Math.min(8, sourceCos / targetCos)),
    yScale: 1,
  };
}

function translateCoordinates(coords, dLon, dLat) {
  if (typeof coords[0] === 'number') {
    return [wrapLongitude(coords[0] + dLon), clampLatitude(coords[1] + dLat)];
  }
  return coords.map((point) => translateCoordinates(point, dLon, dLat));
}

function translatedFeature(originalFeature, targetLon, targetLat) {
  const [sourceLon, sourceLat] = d3.geoCentroid(originalFeature);
  const dLon = targetLon - sourceLon;
  const dLat = targetLat - sourceLat;

  return {
    type: 'Feature',
    id: originalFeature.id,
    properties: { ...originalFeature.properties },
    geometry: {
      ...originalFeature.geometry,
      coordinates: translateCoordinates(originalFeature.geometry.coordinates, dLon, dLat),
    },
  };
}

function updateDetails(feature, currentLat = null) {
  if (!feature) {
    details.textContent = 'Select a country to view details.';
    return;
  }

  const km2 = steradianToKm2(d3.geoArea(feature));
  const centroid = d3.geoCentroid(feature);
  const lat = currentLat ?? centroid[1];

  details.textContent = `${countryName(feature)} · True area: ${formatKm2(km2)} km² · Overlay latitude: ${lat.toFixed(1)}°`;
}

function createDraggableOverlay(feature) {
  baseLayer.selectAll('.country').classed('selected', (d) => d === feature);

  const sourceCentroid = d3.geoCentroid(feature);
  const sourceLat = sourceCentroid[1];
  let [targetLon, targetLat] = sourceCentroid;

  const overlayData = {
    originalFeature: feature,
    transformedFeature: feature,
    xScale: 1,
    yScale: 1,
  };

  const overlayGroup = overlayLayer.append('g').datum(overlayData).attr('class', 'overlay-group');
  const overlayPath = overlayGroup.append('path').attr('class', 'overlay-country').attr('d', path(feature));

  function applyScale() {
    const centroid = path.centroid(overlayData.transformedFeature);
    if (!isFinite(centroid[0]) || !isFinite(centroid[1])) return;
    overlayGroup.attr(
      'transform',
      `translate(${centroid[0]},${centroid[1]}) scale(${overlayData.xScale},${overlayData.yScale}) translate(${-centroid[0]},${-centroid[1]})`,
    );
  }

  overlayPath.call(
    d3.drag().on('drag', (event) => {
      const zoomFactor = 1 / currentZoom.transform.k;
      const [cx, cy] = projection([targetLon, targetLat]);
      const nextScreen = [cx + event.dx * zoomFactor, cy + event.dy * zoomFactor];
      const nextLonLat = projection.invert(nextScreen);

      if (!nextLonLat) return;

      targetLon = wrapLongitude(nextLonLat[0]);
      targetLat = clampLatitude(nextLonLat[1]);

      overlayData.transformedFeature = translatedFeature(feature, targetLon, targetLat);
      ({ xScale: overlayData.xScale, yScale: overlayData.yScale } = mercatorScales(sourceLat, targetLat));
      overlayPath.attr('d', path(overlayData.transformedFeature));
      applyScale();
      updateDetails(feature, targetLat);
    }),
  );

  applyScale();
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
  if (!selectedId) return;

  const feature = countries.find((d) => String(d.id) === selectedId);
  if (feature) setActiveCountry(feature);
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
  // Background graticule grid
  const graticule = d3.geoGraticule().step([20, 10]);
  guidesLayer.append('path').datum(graticule()).attr('class', 'graticule').attr('d', path);

  // Major named latitude lines
  const special = [
    { lat: 0, className: 'latitude-special latitude-equator', label: 'Equator (0°)' },
    { lat: 23.5, className: 'latitude-special latitude-tropic', label: 'Tropic of Cancer (23.5°N)' },
    { lat: -23.5, className: 'latitude-special latitude-tropic', label: 'Tropic of Capricorn (23.5°S)' },
    { lat: 66.5, className: 'latitude-special latitude-arctic', label: 'Arctic Circle (66.5°N)' },
    { lat: -66.5, className: 'latitude-special latitude-arctic', label: 'Antarctic Circle (66.5°S)' },
  ];

  special.forEach((line) => {
    guidesLayer.append('path').datum(latitudeLine(line.lat)).attr('class', line.className).attr('d', path);

    const labelPoint = projection([-175, line.lat]);
    if (labelPoint) {
      guidesLayer
        .append('text')
        .attr('class', 'latitude-label')
        .attr('x', labelPoint[0] + 6)
        .attr('y', labelPoint[1] - 4)
        .text(line.label);
    }
  });

  // Horizontal latitude lines every 10 degrees with labels on both sides
  const latMarkers = d3.range(-70, 71, 10).filter((l) => l !== 0 && l !== 23.5 && l !== -23.5);
  latMarkers.forEach((lat) => {
    // Draw the line
    guidesLayer
      .append('path')
      .datum(latitudeLine(lat))
      .attr('class', 'latitude-line')
      .attr('d', path);

    // Label on left side
    const leftPoint = projection([-175, lat]);
    if (leftPoint) {
      guidesLayer
        .append('text')
        .attr('class', 'latitude-label')
        .attr('x', leftPoint[0] + 4)
        .attr('y', leftPoint[1] - 3)
        .text(lat > 0 ? `${lat}°N` : `${Math.abs(lat)}°S`);
    }

    // Label on right side
    const rightPoint = projection([172, lat]);
    if (rightPoint) {
      guidesLayer
        .append('text')
        .attr('class', 'latitude-label')
        .attr('x', rightPoint[0] - 4)
        .attr('y', rightPoint[1] - 3)
        .attr('text-anchor', 'end')
        .text(lat > 0 ? `${lat}°N` : `${Math.abs(lat)}°S`);
    }
  });
}

function setupZoom() {
  const zoom = d3
    .zoom()
    .scaleExtent([1, 10])
    .translateExtent([
      [-width * 0.5, -height * 0.5],
      [width * 1.5, height * 1.5],
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
    .on('click', (_, feature) => setActiveCountry(feature))
    .append('title')
    .text((d) => countryName(d));

  setupZoom();
  updateDetails(null);
}

init().catch((error) => {
  console.error('Unable to load world map data', error);
  details.textContent = 'Could not load map data. Please check your network connection and refresh.';
});
