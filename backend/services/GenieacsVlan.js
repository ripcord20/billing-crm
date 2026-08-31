'use strict';
/**
 * GenieACS WAN VLAN helpers.
 * Bind VLAN layanan (default 100) ke koneksi WAN ONT via TR-069.
 * Path berbeda per vendor (ZTE, Huawei, FiberHome, CT-COM).
 */

const SKIP_KEY_RE = /Enable|Priority|Mode|Name|List|Mux|Tag|Type|Index|Count|Number/i;
const VLAN_KEY_RE = /VLANIDMark|VLANID|VlanId|VLANId|X_HW_VLAN|X_ZTE-COM_VLANID|X_CT-COM_VLANID|X_FH_VLAN|X_VLAN\b/i;

const FALLBACK_BY_VENDOR = {
  zte: [
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.X_ZTE-COM_VLANID',
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.X_ZTE-COM_VLANID',
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.X_ZTE-COM_VLANID',
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.X_ZTE-COM_WANGponLinkConfig.VLANIDMark',
  ],
  huawei: [
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.X_HW_VLAN',
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.X_HW_VLAN',
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.X_HW_VLAN',
  ],
  fiberhome: [
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.X_FH_VLAN',
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.X_FH_VLAN',
  ],
  ct: [
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.X_CT-COM_WANGponLinkConfig.VLANIDMark',
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.X_CT-COM_VLANID',
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.X_CT-COM_VLANID',
  ],
  generic: [
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.X_ZTE-COM_VLANID',
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.X_CT-COM_WANGponLinkConfig.VLANIDMark',
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.X_HW_VLAN',
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.VLANID',
  ],
};

function isVlanIdKey(key) {
  if (!key || SKIP_KEY_RE.test(key)) return false;
  return VLAN_KEY_RE.test(key);
}

function walkForVlanParams(obj, prefix, out) {
  if (!obj || typeof obj !== 'object') return;
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith('_')) continue;
    const path = prefix ? `${prefix}.${k}` : k;
    if (!v || typeof v !== 'object') continue;
    if (Object.prototype.hasOwnProperty.call(v, '_value') && isVlanIdKey(k)) {
      const num = parseInt(v._value, 10);
      out.push({
        path,
        value: Number.isNaN(num) ? v._value : num,
        type: v._type || 'xsd:unsignedInt',
      });
    } else {
      walkForVlanParams(v, path, out);
    }
  }
}

function detectVendor(deviceData) {
  const info = deviceData?.InternetGatewayDevice?.DeviceInfo || {};
  const blob = [
    info.Manufacturer?._value,
    info.ModelName?._value,
    info.ProductClass?._value,
    deviceData?._deviceId?.Manufacturer,
    deviceData?._deviceId?.ProductClass,
    deviceData?._id,
  ].filter(Boolean).join(' ').toLowerCase();
  if (/zte|zxhn|f670|f660|f601/.test(blob)) return 'zte';
  if (/huawei|hg8|eg8|echo/.test(blob)) return 'huawei';
  if (/fiberhome|an5506|hg6/.test(blob)) return 'fiberhome';
  if (/ct-com|centurylink|xpong/.test(blob)) return 'ct';
  return 'generic';
}

function extractVlan(deviceData) {
  const found = [];
  walkForVlanParams(deviceData, '', found);
  const ids = found
    .map((f) => parseInt(f.value, 10))
    .filter((n) => !Number.isNaN(n) && n > 0 && n < 4095);
  return {
    vendor: detectVendor(deviceData),
    current: ids.length ? ids[0] : null,
    params: found,
  };
}

function buildBindParameters(deviceData, vlanId) {
  const vlan = parseInt(vlanId, 10);
  if (!vlan || vlan < 1 || vlan > 4094) {
    return { ok: false, error: 'VLAN ID harus 1–4094', parameters: [], discovered: [] };
  }

  const found = [];
  walkForVlanParams(deviceData, '', found);
  const parameters = [];
  const seen = new Set();

  for (const f of found) {
    if (seen.has(f.path)) continue;
    seen.add(f.path);
    parameters.push([f.path, vlan, 'xsd:unsignedInt']);
  }

  if (!parameters.length) {
    const vendor = detectVendor(deviceData);
    const picks = FALLBACK_BY_VENDOR[vendor] || FALLBACK_BY_VENDOR.generic;
    for (const p of picks) {
      if (seen.has(p)) continue;
      seen.add(p);
      parameters.push([p, vlan, 'xsd:unsignedInt']);
    }
  }

  return {
    ok: true,
    vlan,
    vendor: detectVendor(deviceData),
    parameters,
    discovered: found,
    usedFallback: found.length === 0,
  };
}

module.exports = {
  FALLBACK_BY_VENDOR,
  isVlanIdKey,
  walkForVlanParams,
  detectVendor,
  extractVlan,
  buildBindParameters,
};
