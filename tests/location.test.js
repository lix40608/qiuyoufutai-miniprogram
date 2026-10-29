const { test } = require('node:test');
const assert = require('node:assert/strict');
const location = require('../data/location-store');
test('missing venue coordinates do not become the equator at zero longitude', () => {
  assert.equal(location.distanceKm({ latitude: 32, longitude: 118 }, { latitude: null, longitude: null }), null);
  assert.equal(location.distanceKm({ latitude: 32, longitude: 118 }, { latitude: '', longitude: '' }), null);
});

test('位置权限失败后仍尝试打开地图，确认选点才保存位置', () => {
  let options;
  let saved;
  global.wx = {
    getLocation: ({ fail }) => fail({ errMsg: 'getLocation:fail auth deny' }),
    chooseLocation: (value) => { options = value; },
    setStorageSync: (key, value) => { saved = value; }
  };
  let selected;
  location.chooseUserLocation((value) => { selected = value; });
  assert.ok(options);
  assert.equal(options.latitude, undefined);
  assert.equal(saved, undefined);
  options.success({ latitude: 30, longitude: 120, name: '球房' });
  assert.equal(selected.label, '球房');
  assert.equal(saved.latitude, 30);
  delete global.wx;
});

test('定位成功时地图以当前位置为中心', () => {
  let options;
  global.wx = {
    getLocation: ({ success }) => success({ latitude: 30, longitude: 120 }),
    chooseLocation: (value) => { options = value; }
  };
  location.chooseUserLocation(() => {});
  assert.equal(options.latitude, 30);
  assert.equal(options.longitude, 120);
  delete global.wx;
});
