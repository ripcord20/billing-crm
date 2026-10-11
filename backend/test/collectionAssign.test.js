const fs = require('fs');
const path = require('path');
const assert = require('assert');

const svc = fs.readFileSync(path.join(__dirname, '../services/CollectionService.js'), 'utf8');
assert.ok(svc.includes("attributes: ['id']"), 'generateTasks harus SELECT id saja supaya tidak pecah jika kolom pay_lat belum ada');

const srv = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
assert.ok(srv.includes("collection_assignments.pay_lat"), 'startup harus menambah kolom pay_lat kolektor');

console.log('collectionAssign.test.js OK');
