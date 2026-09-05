/**
 * Peta Fiberix — vektor OpenFreeMap (tanpa API key) + cadangan Esri.
 * CARTO Voyager/Dark sekarang watermark "API KEY REQUIRED".
 */
(function (global) {
  var SAT_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
  var STREET_RASTER = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';
  var DARK_RASTER = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}';
  var LIBERTY = 'https://tiles.openfreemap.org/styles/liberty';
  var DARK_STYLE = 'https://tiles.openfreemap.org/styles/dark';
  var ATTR_VEC = '&copy; OpenMapTiles &copy; OpenStreetMap';
  var ATTR_ESRI = 'Tiles &copy; Esri';

  function raster(url, attr, extra) {
    return L.tileLayer(url, Object.assign({
      maxZoom: 19,
      attribution: attr,
      updateWhenIdle: false,
      keepBuffer: 6,
      detectRetina: false
    }, extra || {}));
  }

  function vector(styleUrl, attr) {
    if (typeof L === 'undefined' || typeof L.maplibreGL !== 'function') return null;
    try {
      return L.maplibreGL({
        style: styleUrl,
        attribution: attr,
        interactive: false
      });
    } catch (_) {
      return null;
    }
  }

  var PRESETS = {
    streets: { vectorStyle: LIBERTY, url: STREET_RASTER, attr: ATTR_VEC, rasterAttr: ATTR_ESRI },
    dark: { vectorStyle: DARK_STYLE, url: DARK_RASTER, attr: ATTR_VEC, rasterAttr: ATTR_ESRI },
    satellite: { url: SAT_URL, attr: ATTR_ESRI }
  };

  function create(type) {
    var cfg = PRESETS[type] || PRESETS.streets;
    if (cfg.vectorStyle) {
      var vec = vector(cfg.vectorStyle, cfg.attr);
      if (vec) return vec;
    }
    return raster(cfg.url, cfg.rasterAttr || cfg.attr);
  }

  global.FiberixMapTiles = {
    SAT_URL: SAT_URL,
    STREET_URL: STREET_RASTER,
    DARK_URL: DARK_RASTER,
    PRESETS: PRESETS,
    create: create,
    raster: raster,
    street: function (extra) { return raster(STREET_RASTER, ATTR_ESRI, extra); },
    satellite: function (extra) { return raster(SAT_URL, ATTR_ESRI, extra); },
    dark: function (extra) { return raster(DARK_RASTER, ATTR_ESRI, extra); }
  };
})(typeof window !== 'undefined' ? window : this);
