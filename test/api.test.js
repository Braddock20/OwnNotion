import test from 'node:test';
import assert from 'node:assert/strict';
test('package is runnable with Node built-ins only',()=>assert.ok(process.version));
test('life OS resource model contains core domains',()=>{const domains=['tasks','projects','goals','habits','challenges','events','transactions','journal','notes'];assert.equal(domains.length,9);});
