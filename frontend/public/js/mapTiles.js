/**
 * Peta Fiberix — Google Maps Roadmap / Hybrid / Dark (tile mt*.google.com).
 */
(function (global) {
  var ATTR = '&copy; Google Maps';
  var SUBS = ['mt0', 'mt1', 'mt2', 'mt3'];
  var ROAD_URL = 'https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}';
  var SAT_URL  = 'https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}';

  function google(url, extra) {
    return L.tileLayer(url, Object.assign({
      maxZoom: 21,
      subdomains: SUBS,
      attribution: ATTR,
      updateWhenIdle: false,
      keepBuffer: 6,
      detectRetina: false
    }, extra || {}));
  }

  function create(type) {
    if (type === 'satellite') return google(SAT_URL);
    if (type === 'dark') return google(ROAD_URL, { className: 'google-dark-tiles' });
    return google(ROAD_URL);
  }

  global.FiberixMapTiles = {
    SAT_URL: SAT_URL,
    STREET_URL: ROAD_URL,
    create: create,
    street: function () { return google(ROAD_URL); },
    satellite: function () { return google(SAT_URL); },
    dark: function () { return google(ROAD_URL, { className: 'google-dark-tiles' }); },
    googleRoadmap: function () { return google(ROAD_URL); },
    googleHybrid: function () { return google(SAT_URL); }
  };
})(typeof window !== 'undefined' ? window : this);
