/**
 * Tile peta Fiberix — tanpa Google Maps API key.
 * Satelit resmi Google (mt*.google.com/vt) butuh key dan sering
 * tampil "For development purposes only" / gagal load.
 * Satelit: Esri World Imagery (sudah diizinkan CSP).
 */
(function (global) {
  var SAT_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
  var SAT_ATTR = 'Tiles &copy; Esri';
  var STREET_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
  var STREET_ATTR = '&copy; OpenStreetMap &copy; CARTO';
  var LABEL_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png';

  function street(extra) {
    return L.tileLayer(STREET_URL, Object.assign({
      maxZoom: 20,
      attribution: STREET_ATTR,
      subdomains: 'abcd'
    }, extra || {}));
  }
  function satellite(extra) {
    return L.tileLayer(SAT_URL, Object.assign({
      maxZoom: 19,
      attribution: SAT_ATTR
    }, extra || {}));
  }
  function labels(extra) {
    return L.tileLayer(LABEL_URL, Object.assign({
      maxZoom: 20,
      pane: 'overlayPane',
      attribution: ''
    }, extra || {}));
  }

  global.FiberixMapTiles = {
    SAT_URL: SAT_URL,
    SAT_ATTR: SAT_ATTR,
    STREET_URL: STREET_URL,
    STREET_ATTR: STREET_ATTR,
    LABEL_URL: LABEL_URL,
    street: street,
    satellite: satellite,
    labels: labels
  };
})(typeof window !== 'undefined' ? window : this);
