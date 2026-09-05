/**
 * Peta Fiberix — CARTO Voyager (API key) + satelit Esri.
 */
(function (global) {
  var CARTO_KEY = 'cb1_2xnl_1_41d4c832b8de74c4bc33fb07';
  var SAT_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
  var STREET_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=' + CARTO_KEY;
  var DARK_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png?key=' + CARTO_KEY;
  var ATTR_CARTO = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attributions">CARTO</a>';
  var ATTR_ESRI = 'Tiles &copy; Esri';

  function raster(url, attr, extra) {
    return L.tileLayer(url, Object.assign({
      maxZoom: 20,
      attribution: attr,
      updateWhenIdle: false,
      keepBuffer: 6,
      detectRetina: false
    }, extra || {}));
  }

  function carto(url) {
    return raster(url, ATTR_CARTO, { subdomains: 'abcd', maxZoom: 20 });
  }

  var PRESETS = {
    streets: { carto: true, url: STREET_URL, attr: ATTR_CARTO },
    dark: { carto: true, url: DARK_URL, attr: ATTR_CARTO },
    satellite: { url: SAT_URL, attr: ATTR_ESRI }
  };

  function create(type) {
    var cfg = PRESETS[type] || PRESETS.streets;
    if (cfg.carto) return carto(cfg.url);
    return raster(cfg.url, cfg.attr);
  }

  global.FiberixMapTiles = {
    SAT_URL: SAT_URL,
    STREET_URL: STREET_URL,
    DARK_URL: DARK_URL,
    PRESETS: PRESETS,
    create: create,
    raster: raster,
    street: function (extra) { return carto(STREET_URL); },
    satellite: function (extra) { return raster(SAT_URL, ATTR_ESRI, extra); },
    dark: function (extra) { return carto(DARK_URL); }
  };
})(typeof window !== 'undefined' ? window : this);
