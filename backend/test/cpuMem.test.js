'use strict';
const assert = require('assert');
const { parseProcStat, parseMeminfo, cpuUsageSync } = require('../utils/cpuMem');

const sample = parseProcStat('cpu  100 20 30 400 50 5 10 2 0 0\ncpu0 10 2 3 40 5 0 1 0 0 0\n');
assert.ok(sample);
assert.strictEqual(sample.user, 100);
assert.strictEqual(sample.nice, 20);
assert.strictEqual(sample.system, 30);
assert.strictEqual(sample.idle, 400);
assert.strictEqual(sample.iowait, 50);
assert.strictEqual(sample.busy, 100 + 20 + 30 + 5 + 10 + 2);
assert.strictEqual(sample.total, sample.busy + 400 + 50);

const mem = parseMeminfo('MemTotal: 8000000 kB\nMemFree: 1000000 kB\nMemAvailable: 4000000 kB\nBuffers: 100000 kB\n');
assert.strictEqual(mem.MemTotal, 8000000 * 1024);
assert.strictEqual(mem.MemAvailable, 4000000 * 1024);

const usage = cpuUsageSync(20);
assert.ok(usage.cpuPercent >= 0 && usage.cpuPercent <= 100);
assert.ok(usage.ioWaitPercent >= 0 && usage.ioWaitPercent <= 100);
assert.ok(Array.isArray(usage.loadAvg) && usage.loadAvg.length === 3);
assert.ok(usage.cpuCount >= 1);

console.log('cpuMem.test.js OK', usage);
