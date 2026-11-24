(function (root) {
  // OSM.org volunteer tiles 403 the app (tile usage policy).
  // Carto basemaps now watermark without an API key.
  // Esri World Street Map is already allowed by CSP (server.arcgisonline.com).
  var STREET_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';
  var STREET_ATTR = 'Tiles &copy; Esri';
  root.MapTiles = {
    STREET_URL: STREET_URL,
    STREET_ATTR: STREET_ATTR,
    street: function (opts) {
      opts = opts || {};
      return L.tileLayer(STREET_URL, Object.assign({
        attribution: STREET_ATTR,
        maxZoom: 19
      }, opts));
    }
  };
})(typeof window !== 'undefined' ? window : global);
