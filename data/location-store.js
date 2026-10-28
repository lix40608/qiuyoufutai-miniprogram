const LOCATION_STORAGE_KEY = 'qiuyou-futai.user-location.v1';

function getUserLocation() {
  const location = wx.getStorageSync(LOCATION_STORAGE_KEY);
  if (!location || !Number.isFinite(Number(location.latitude)) || !Number.isFinite(Number(location.longitude))) return null;
  return location;
}

function saveUserLocation(location) {
  if (!location || !Number.isFinite(Number(location.latitude)) || !Number.isFinite(Number(location.longitude))) {
    throw new Error('所选位置缺少有效坐标');
  }
  const saved = {
    latitude: Number(location.latitude),
    longitude: Number(location.longitude),
    label: location.label || location.name || location.address || '已选位置',
    address: location.address || '',
    source: location.source || 'map',
    updatedAt: Date.now()
  };
  wx.setStorageSync(LOCATION_STORAGE_KEY, saved);
  return saved;
}

function clearUserLocation() {
  wx.removeStorageSync(LOCATION_STORAGE_KEY);
}

function distanceKm(from, to) {
  if (!from || !to) return null;
  const raw = [from.latitude, from.longitude, to.latitude, to.longitude];
  if (raw.some(value => value == null || value === '')) return null;
  const values = raw.map(Number);
  if (!values.every(Number.isFinite)) return null;
  const radians = (degrees) => degrees * Math.PI / 180;
  const [lat1, lon1, lat2, lon2] = values;
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const rawA = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  const a = Math.max(0, Math.min(1, rawA));
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(km) {
  if (!Number.isFinite(km)) return '';
  return km < 1 ? `${Math.max(50, Math.round(km * 1000 / 50) * 50)} 米` : `${km.toFixed(1)} 公里`;
}

function handleLocationError(error) {
  const message = (error && error.errMsg) || '';
  if (/auth deny|authorize|permission/i.test(message)) {
    wx.showModal({
      title: '需要位置权限',
      content: '开启位置权限后，才能定位并估算你到球房的距离。也可以取消后继续浏览。',
      confirmText: '去设置',
      cancelText: '暂不设置',
      success(result) {
        if (result.confirm) wx.openSetting({});
      }
    });
    return;
  }
  wx.showToast({ title: '获取当前位置失败，请检查位置服务后重试', icon: 'none' });
}

function chooseMapLocation(initialLocation, onSuccess) {
  const options = {
    success(location) {
      onSuccess(location);
    },
    fail(error) {
      if (!/cancel/i.test((error && error.errMsg) || '')) handleLocationError(error);
    }
  };
  if (initialLocation) {
    options.latitude = Number(initialLocation.latitude);
    options.longitude = Number(initialLocation.longitude);
  }
  wx.chooseLocation(options);
}

function chooseMapLocationFromCurrent(onSuccess) {
  wx.getLocation({
    type: 'gcj02',
    success(currentLocation) {
      chooseMapLocation(currentLocation, onSuccess);
    },
    fail: handleLocationError
  });
}

function openLocationActions(onChange) {
  wx.showActionSheet({
    itemList: ['自动定位当前位置', '在地图上选择位置', '清除位置'],
    success(result) {
      if (result.tapIndex === 0) {
        wx.getLocation({
          type: 'gcj02',
          success(location) {
            onChange(saveUserLocation(Object.assign({}, location, { label: '当前位置', source: 'gps' })));
          },
          fail: handleLocationError
        });
      } else if (result.tapIndex === 1) {
        chooseMapLocationFromCurrent((location) => {
          onChange(saveUserLocation(Object.assign({}, location, {
            label: location.name || location.address || '地图所选位置',
            source: 'map'
          })));
        });
      } else {
        clearUserLocation();
        onChange(null);
      }
    },
    fail() {}
  });
}

module.exports = { getUserLocation, saveUserLocation, clearUserLocation, distanceKm, formatDistance, openLocationActions, chooseMapLocation, chooseMapLocationFromCurrent, handleLocationError };
