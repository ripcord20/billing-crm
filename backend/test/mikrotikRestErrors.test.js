'use strict';
const assert = require('assert');
const {
  looksLikeHtml,
  explainRestFailure,
  explainApiConnectRefused
} = require('../utils/mikrotikRestErrors');

const HTML_404 = '<html> <head><title>Error 404: Not Found</title></head> ' +
  '<body> <h1>Error 404: Not Found</h1> </body> </html>';

assert.strictEqual(looksLikeHtml(HTML_404), true);
assert.strictEqual(looksLikeHtml('{"detail":"no such command"}'), false);

const v6 = explainRestFailure(404, HTML_404, { host: '192.168.62.2', port: 80 });
assert.ok(/RouterOS v6/i.test(v6), '404 HTML harus sebut v6');
assert.ok(/API Binary/i.test(v6), '404 HTML harus arahkan ke API Binary');
assert.ok(/8728/.test(v6), '404 HTML harus sebut port 8728');
assert.ok(!/<\/?html/i.test(v6), 'pesan tidak boleh dump HTML mentah');
assert.ok(v6.includes('192.168.62.2:80'));

const obj404 = explainRestFailure(404, { detail: 'Error 404: Not Found' });
assert.ok(/RouterOS v6|API Binary/i.test(obj404));

const auth = explainRestFailure(401, { message: 'unauthorized' });
assert.ok(/401/.test(auth));
assert.ok(/username|password/i.test(auth));

const jsonErr = explainRestFailure(400, { detail: 'no such command or directory (foo)' });
assert.ok(jsonErr.includes('no such command'));

const refusedApi = explainApiConnectRefused('192.168.62.2', 8728);
assert.ok(/enable api/i.test(refusedApi));
assert.ok(refusedApi.includes('192.168.62.2:8728'));

const refusedRest = explainApiConnectRefused('192.168.62.2', 80);
assert.ok(/v6|API Binary|www/i.test(refusedRest));

console.log('mikrotikRestErrors.test.js OK');
