/**
 * Tile peta Fiberix — OSM + Esri, tanpa API key.
 * CARTO basemaps.cartocdn.com sekarang watermark "API KEY REQUIRED".
 */
(function (global) {
  var SAT_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
  var SAT_ATTR = 'Tiles &copy; Esri';
  var STREET_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';
  var STREET_ATTR = 'Tiles &copy; Esri';
  var DARK_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}';

  function street(extra) {
    return L.tileLayer(STREET_URL, Object.assign({
      maxZoom: 19,
      attribution: STREET_ATTR
    }, extra || {}));
  }
  function satellite(extra) {
    return L.tileLayer(SAT_URL, Object.assign({
      maxZoom: 19,
      attribution: SAT_ATTR
    }, extra || {}));
  }
  function dark(extra) {
    return L.tileLayer(DARK_URL, Object.assign({
      maxZoom: 16,
      attribution: SAT_ATTR
    }, extra || {}));
  }

  global.FiberixMapTiles = {
    SAT_URL: SAT_URL,
    SAT_ATTR: SAT_ATTR,
    STREET_URL: STREET_URL,
    STREET_ATTR: STREET_ATTR,
    DARK_URL: DARK_URL,
    street: street,
    satellite: satellite,
    dark: dark
  };
})(typeof window !== 'undefined' ? window : this);
