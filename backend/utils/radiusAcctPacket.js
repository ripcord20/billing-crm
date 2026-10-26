'use strict';

const crypto = require('crypto');

const CODE_ACCOUNTING_REQUEST = 4;
const CODE_ACCOUNTING_RESPONSE = 5;

const ATTR = {
  UserName: 1,
  NASIPAddress: 4,
  NASPort: 5,
  FramedIPAddress: 8,
  CallingStationId: 31,
  NASIdentifier: 32,
  AcctStatusType: 40,
  AcctDelayTime: 41,
  AcctInputOctets: 42,
  AcctOutputOctets: 43,
  AcctSessionId: 44,
  AcctAuthentic: 45,
  AcctSessionTime: 46,
  AcctTerminateCause: 49,
  AcctInputGigawords: 52,
  AcctOutputGigawords: 53,
  EventTimestamp: 55,
  NASPortType: 61,
  FramedProtocol: 7
};

const STATUS = { Start: 1, Stop: 2, Interim: 3 };
const TERM = {
  1: 'User-Request', 2: 'Lost-Carrier', 3: 'Lost-Service', 4: 'Idle-Timeout',
  5: 'Session-Timeout', 6: 'Admin-Reset', 7: 'Admin-Reboot', 8: 'Port-Error',
  9: 'NAS-Error', 10: 'NAS-Request', 11: 'NAS-Reboot', 12: 'Port-Unneeded',
  13: 'Port-Preempted', 14: 'Port-Suspended', 15: 'Service-Unavailable',
  16: 'Callback', 17: 'User-Error', 18: 'Host-Request'
};

function md5(buf) {
  return crypto.createHash('md5').update(buf).digest();
}

function requestAuthenticatorValid(packet, secret) {
  if (!Buffer.isBuffer(packet) || packet.length < 20) return false;
  const zeros = Buffer.alloc(16);
  const copy = Buffer.concat([
    packet.subarray(0, 4),
    zeros,
    packet.subarray(20),
    Buffer.from(String(secret), 'utf8')
  ]);
  return md5(copy).equals(packet.subarray(4, 20));
}

function decodeIpv4(buf) {
  if (!buf || buf.length !== 4) return '';
  return Array.from(buf).join('.');
}

function decodeInt(buf) {
  if (!buf || !buf.length) return 0;
  if (buf.length === 4) return buf.readUInt32BE(0);
  let n = 0;
  for (const b of buf) n = (n * 256) + b;
  return n;
}

function parseAttributes(buf) {
  const out = {};
  let i = 0;
  while (i + 2 <= buf.length) {
    const type = buf[i];
    const len = buf[i + 1];
    if (len < 2 || i + len > buf.length) break;
    const val = buf.subarray(i + 2, i + len);
    if (type === ATTR.UserName || type === ATTR.CallingStationId ||
        type === ATTR.NASIdentifier || type === ATTR.AcctSessionId ||
        type === ATTR.AcctAuthentic || type === ATTR.NASPortType ||
        type === ATTR.FramedProtocol) {
      out[type] = val.toString('utf8').replace(/\0/g, '').trim();
    } else if (type === ATTR.NASIPAddress || type === ATTR.FramedIPAddress) {
      out[type] = decodeIpv4(val);
    } else {
      out[type] = decodeInt(val);
    }
    i += len;
  }
  return out;
}

function parseAccountingRequest(packet) {
  if (!Buffer.isBuffer(packet) || packet.length < 20) return null;
  const code = packet[0];
  const id = packet[1];
  const length = packet.readUInt16BE(2);
  if (code !== CODE_ACCOUNTING_REQUEST) return null;
  if (length < 20 || length > packet.length) return null;
  const attrs = parseAttributes(packet.subarray(20, length));
  const input = Number(attrs[ATTR.AcctInputOctets] || 0) + (Number(attrs[ATTR.AcctInputGigawords] || 0) * 4294967296);
  const output = Number(attrs[ATTR.AcctOutputOctets] || 0) + (Number(attrs[ATTR.AcctOutputGigawords] || 0) * 4294967296);
  const status = Number(attrs[ATTR.AcctStatusType] || 0);
  const termCode = Number(attrs[ATTR.AcctTerminateCause] || 0);
  return {
    id,
    authenticator: packet.subarray(4, 20),
    username: String(attrs[ATTR.UserName] || ''),
    nasIp: String(attrs[ATTR.NASIPAddress] || ''),
    framedIp: String(attrs[ATTR.FramedIPAddress] || ''),
    mac: String(attrs[ATTR.CallingStationId] || ''),
    sessionId: String(attrs[ATTR.AcctSessionId] || ''),
    status,
    statusName: status === 1 ? 'Start' : status === 2 ? 'Stop' : status === 3 ? 'Interim-Update' : String(status),
    sessionTime: Number(attrs[ATTR.AcctSessionTime] || 0),
    inputOctets: input,
    outputOctets: output,
    terminateCause: TERM[termCode] || (termCode ? String(termCode) : ''),
    authentic: String(attrs[ATTR.AcctAuthentic] || ''),
    nasPortType: String(attrs[ATTR.NASPortType] || ''),
    framedProtocol: String(attrs[ATTR.FramedProtocol] || '')
  };
}

function uniqueId(parsed) {
  return crypto.createHash('md5')
    .update([parsed.nasIp, parsed.sessionId, parsed.username].join('|'))
    .digest('hex');
}

function buildAccountingResponse(requestPacket, secret) {
  const id = requestPacket[1];
  const auth = requestPacket.subarray(4, 20);
  const header = Buffer.alloc(20);
  header[0] = CODE_ACCOUNTING_RESPONSE;
  header[1] = id;
  header.writeUInt16BE(20, 2);
  const digest = md5(Buffer.concat([
    header.subarray(0, 4),
    auth,
    Buffer.from(String(secret), 'utf8')
  ]));
  digest.copy(header, 4);
  return header;
}

function findMatchingSecret(packet, secrets) {
  for (const secret of secrets) {
    if (secret && requestAuthenticatorValid(packet, secret)) return secret;
  }
  return null;
}

function attrString(type, str) {
  const val = Buffer.from(String(str), 'utf8');
  return Buffer.concat([Buffer.from([type, val.length + 2]), val]);
}
function attrInt(type, n) {
  const val = Buffer.alloc(4);
  val.writeUInt32BE(Number(n) >>> 0, 0);
  return Buffer.concat([Buffer.from([type, 6]), val]);
}
function attrIpv4(type, ip) {
  const parts = String(ip).split('.').map((x) => parseInt(x, 10) || 0);
  return Buffer.concat([Buffer.from([type, 6]), Buffer.from(parts)]);
}

function buildAccountingRequest(fields, secret, identifier = 1) {
  const attrs = Buffer.concat([
    attrString(ATTR.UserName, fields.username || ''),
    attrIpv4(ATTR.NASIPAddress, fields.nasIp || '127.0.0.1'),
    fields.framedIp ? attrIpv4(ATTR.FramedIPAddress, fields.framedIp) : Buffer.alloc(0),
    fields.mac ? attrString(ATTR.CallingStationId, fields.mac) : Buffer.alloc(0),
    attrString(ATTR.AcctSessionId, fields.sessionId || 's1'),
    attrInt(ATTR.AcctStatusType, fields.status || STATUS.Start),
    attrInt(ATTR.AcctSessionTime, fields.sessionTime || 0),
    attrInt(ATTR.AcctInputOctets, fields.inputOctets || 0),
    attrInt(ATTR.AcctOutputOctets, fields.outputOctets || 0),
    fields.terminateCauseCode ? attrInt(ATTR.AcctTerminateCause, fields.terminateCauseCode) : Buffer.alloc(0)
  ]);
  const header = Buffer.alloc(20);
  header[0] = CODE_ACCOUNTING_REQUEST;
  header[1] = identifier;
  header.writeUInt16BE(20 + attrs.length, 2);
  const packetNoAuth = Buffer.concat([header, attrs]);
  const digest = md5(Buffer.concat([
    packetNoAuth.subarray(0, 4),
    Buffer.alloc(16),
    attrs,
    Buffer.from(String(secret), 'utf8')
  ]));
  digest.copy(packetNoAuth, 4);
  return packetNoAuth;
}

module.exports = {
  CODE_ACCOUNTING_REQUEST,
  CODE_ACCOUNTING_RESPONSE,
  ATTR,
  STATUS,
  requestAuthenticatorValid,
  parseAccountingRequest,
  uniqueId,
  buildAccountingResponse,
  buildAccountingRequest,
  findMatchingSecret
};
