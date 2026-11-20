/**
 * Self-contained Mapbox GL JS page, shown in a WebView on phones and in an
 * iframe on web (see components/location-map*.tsx).
 *
 * In:  { type: 'state', state: MapState }   (web: postMessage, native: window.__setState)
 * Out: { type: 'ready' } and { type: 'pick', latitude, longitude } as JSON strings.
 */

export type MapPlace = { id: string; name: string; latitude: number; longitude: number; radiusM: number };
export type MapPin = { latitude: number; longitude: number };
/** `nonce` changes every time the map should fly to the place again. */
export type MapFocus = { latitude: number; longitude: number; zoom?: number; nonce: number };
export type MapState = { places: MapPlace[]; pin: MapPin | null; focus: MapFocus | null };

export function buildMapHtml(token: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<link href="https://api.mapbox.com/mapbox-gl-js/v3.9.0/mapbox-gl.css" rel="stylesheet" />
<script src="https://api.mapbox.com/mapbox-gl-js/v3.9.0/mapbox-gl.js"></script>
<style>
  html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: #EAF2FD; }
  .mapboxgl-ctrl-logo { opacity: .8; }
</style>
</head>
<body>
<div id="map"></div>
<script>
  var TOKEN = ${JSON.stringify(token)};
  mapboxgl.accessToken = TOKEN;
  var map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/light-v11',
    center: [10.75, 59.91],
    zoom: 4.5,
    attributionControl: true
  });
  map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

  function send(o) {
    var s = JSON.stringify(o);
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(s);
    else parent.postMessage(s, '*');
  }

  // Polygon approximating a circle of r metres.
  function circle(lon, lat, r) {
    var pts = [], steps = 64, dLat = r / 111320, dLon = r / (111320 * Math.cos(lat * Math.PI / 180));
    for (var i = 0; i <= steps; i++) {
      var a = (i / steps) * 2 * Math.PI;
      pts.push([lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)]);
    }
    return pts;
  }

  var loaded = false, pending = null, marker = null, lastNonce = null, fitted = false;

  function apply(state) {
    if (!loaded) { pending = state; return; }
    var places = state.places || [];
    map.getSource('radius').setData({
      type: 'FeatureCollection',
      features: places.map(function (p) {
        return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [circle(p.longitude, p.latitude, p.radiusM)] } };
      })
    });
    map.getSource('places').setData({
      type: 'FeatureCollection',
      features: places.map(function (p) {
        return { type: 'Feature', properties: { name: p.name }, geometry: { type: 'Point', coordinates: [p.longitude, p.latitude] } };
      })
    });

    if (state.pin) {
      var lngLat = [state.pin.longitude, state.pin.latitude];
      if (!marker) {
        marker = new mapboxgl.Marker({ color: '#E8941F', draggable: true }).setLngLat(lngLat).addTo(map);
        marker.on('dragend', function () {
          var p = marker.getLngLat();
          send({ type: 'pick', latitude: p.lat, longitude: p.lng });
        });
      } else {
        marker.setLngLat(lngLat);
      }
    } else if (marker) {
      marker.remove();
      marker = null;
    }

    var focus = state.focus;
    if (focus && focus.nonce !== lastNonce) {
      lastNonce = focus.nonce;
      fitted = true;
      map.flyTo({ center: [focus.longitude, focus.latitude], zoom: focus.zoom || 15, essential: true });
    } else if (!fitted && places.length) {
      fitted = true;
      var b = new mapboxgl.LngLatBounds();
      places.forEach(function (p) { b.extend([p.longitude, p.latitude]); });
      if (places.length === 1) map.jumpTo({ center: [places[0].longitude, places[0].latitude], zoom: 14 });
      else map.fitBounds(b, { padding: 60, maxZoom: 15, duration: 0 });
    }
  }

  map.on('load', function () {
    map.addSource('radius', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addSource('places', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'radius-fill', type: 'fill', source: 'radius', paint: { 'fill-color': '#17938D', 'fill-opacity': 0.16 } });
    map.addLayer({ id: 'radius-line', type: 'line', source: 'radius', paint: { 'line-color': '#17938D', 'line-width': 2 } });
    map.addLayer({
      id: 'places-dot', type: 'circle', source: 'places',
      paint: { 'circle-radius': 7, 'circle-color': '#17938D', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2.5 }
    });
    map.addLayer({
      id: 'places-label', type: 'symbol', source: 'places',
      layout: { 'text-field': ['get', 'name'], 'text-size': 12, 'text-offset': [0, 1.4], 'text-anchor': 'top', 'text-max-width': 10 },
      paint: { 'text-color': '#0F6F6A', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 }
    });
    loaded = true;
    send({ type: 'ready' });
    if (pending) { apply(pending); pending = null; }
  });

  map.on('click', function (e) {
    send({ type: 'pick', latitude: e.lngLat.lat, longitude: e.lngLat.lng });
  });

  window.__setState = apply;
  window.addEventListener('message', function (e) {
    try {
      var m = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
      if (m && m.type === 'state') apply(m.state);
    } catch (err) {}
  });
</script>
</body>
</html>`;
}
