const { test } = require('node:test');
const assert = require('node:assert/strict');
const location = require('../data/location-store');
test('missing venue coordinates do not become the equator at zero longitude', () => {
  assert.equal(location.distanceKm({ latitude: 32, longitude: 118 }, { latitude: null, longitude: null }), null);
  assert.equal(location.distanceKm({ latitude: 32, longitude: 118 }, { latitude: '', longitude: '' }), null);
});
