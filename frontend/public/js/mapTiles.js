/**
 * Peta Fiberix — Google Maps Roadmap / Satellite (tile mt*.google.com).
 */
(function (global) {
  var ATTR = '&copy; Google Maps';
  var SUBS = ['mt0', 'mt1', 'mt2', 'mt3'];
  var ROAD_URL = 'https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}';
  var SAT_URL = 'https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}';
  var DARK_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}';
  var ATTR_ESRI = 'Tiles &copy; Esri';

  function google(url) {
    return L.tileLayer(url, {
      maxZoom: 20,
      subdomains: SUBS,
      attribution: ATTR,
      updateWhenIdle: false,
      keepBuffer: 6,
      detectRetina: false
    });
  }

  function raster(url, attr, extra) {
    return L.tileLayer(url, Object.assign({
      maxZoom: 20,
      attribution: attr,
      updateWhenIdle: false,
      keepBuffer: 6,
      detectRetina: false
    }, extra || {}));
  }

  function create(type) {
    if (type === 'satellite') return google(SAT_URL);
    if (type === 'dark') return raster(DARK_URL, ATTR_ESRI);
    return google(ROAD_URL);
  }

  global.FiberixMapTiles = {
    SAT_URL: SAT_URL,
    STREET_URL: ROAD_URL,
    DARK_URL: DARK_URL,
    create: create,
    raster: raster,
    street: function () { return google(ROAD_URL); },
    satellite: function () { return google(SAT_URL); },
    dark: function () { return raster(DARK_URL, ATTR_ESRI); },
    googleRoadmap: function () { return google(ROAD_URL); }
  };
})(typeof window !== 'undefined' ? window : this);
