const TOKEN_KEY = 'qiuyou-futai.session-token.v1';
const API_BASE_URL = 'http://127.0.0.1:8787'; // Set to the HTTPS domain of the deployed API before device testing.

function request(path, options = {}) {
  const token = wx.getStorageSync(TOKEN_KEY);
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}${path}`,
      method: options.method || 'GET',
      data: options.data,
      header: Object.assign({ 'content-type': 'application/json' }, token ? { Authorization: `Bearer ${token}` } : {}, options.header || {}),
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300) return resolve(response.data.data);
        if (response.statusCode === 401) wx.removeStorageSync(TOKEN_KEY);
        const error = new Error(response.data && response.data.error ? response.data.error.message : '服务暂时不可用');
        error.code = response.data && response.data.error && response.data.error.code;
        error.statusCode = response.statusCode;
        reject(error);
      },
      fail(error) { reject(error); }
    });
  });
}

function ensureLogin() {
  if (wx.getStorageSync(TOKEN_KEY)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    wx.login({
      success(result) {
        if (!result.code) return reject(new Error('微信登录失败，请重试'));
        request('/v1/auth/login', { method: 'POST', data: { code: result.code } }).then((session) => {
          wx.setStorageSync(TOKEN_KEY, session.token);
          resolve();
        }, reject);
      },
      fail: reject
    });
  });
}

function withLogin(path, options) {
  return ensureLogin().then(() => request(path, options));
}

function normalizeMatch(match) {
  const startAt = new Date(match.startsAt);
  const today = new Date();
  const target = new Date(startAt.getFullYear(), startAt.getMonth(), startAt.getDate());
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dayOffset = Math.round((target - todayStart) / 86400000);
  const dayLabel = dayOffset === 0 ? '今天' : dayOffset === 1 ? '明天' : `${startAt.getMonth() + 1}月${startAt.getDate()}日`;
  const startLabel = `${dayLabel} ${String(startAt.getHours()).padStart(2, '0')}:${String(startAt.getMinutes()).padStart(2, '0')}`;
  return Object.assign({}, match, {
    startAt,
    startLabel,
    title: match.note ? match.note.split('\n')[0].slice(0, 22) : `找球友一起打${match.gameType}`,
    venue: match.venueName,
    area: match.venueArea,
    hostName: match.host && match.host.nickname,
    hostAvatar: match.host && absoluteAvatarUrl(match.host.avatarUrl),
    hostAge: match.host && match.host.age,
    hostGender: match.host && match.host.gender,
    hostIntro: match.host && match.host.intro,
    hostGameTypes: match.host && match.host.gameTypes,
    localOnly: false
  });
}

module.exports = {
  ensureLogin,
  getProfile: () => withLogin('/v1/me/profile').then(normalizeProfile),
  saveProfile: (profile) => withLogin('/v1/me/profile', { method: 'PUT', data: Object.assign({}, profile, { avatarUrl: stripBaseUrl(Object.prototype.hasOwnProperty.call(profile, 'avatarUrl') ? profile.avatarUrl : (profile.avatarPath || '')) }) }).then(normalizeProfile),
  uploadAvatar(path) {
    return ensureLogin().then(() => new Promise((resolve, reject) => {
      wx.uploadFile({
        url: `${API_BASE_URL}/v1/me/avatar`,
        filePath: path,
        name: 'avatar',
        header: { Authorization: `Bearer ${wx.getStorageSync(TOKEN_KEY)}` },
        success(response) {
          let body;
          try { body = JSON.parse(response.data); } catch (_) { return reject(new Error('头像上传失败')); }
          if (response.statusCode >= 200 && response.statusCode < 300) return resolve(absoluteAvatarUrl(body.data.avatarUrl));
          reject(new Error(body.error ? body.error.message : '头像上传失败'));
        },
        fail: reject
      });
    }));
  },
  getPublicMatches: (query = '') => withLogin(`/v1/matches${query}`).then((rows) => rows.map(normalizeMatch)),
  getMyMatches: () => withLogin('/v1/me/matches').then((rows) => rows.map(normalizeMatch)),
  getMatch: (id) => withLogin(`/v1/matches/${encodeURIComponent(id)}`).then(normalizeMatch),
  saveDraft: (form) => withLogin(form.id ? `/v1/me/matches/${encodeURIComponent(form.id)}` : '/v1/matches', { method: form.id ? 'PUT' : 'POST', data: toMatchPayload(form, 'draft'), header: form.id ? {} : { 'X-Idempotency-Key': form.requestKey || createRequestKey() } }).then(normalizeMatch),
  publishMatch: (form) => withLogin(form.id ? `/v1/me/matches/${encodeURIComponent(form.id)}/publish` : '/v1/matches', { method: 'POST', data: toMatchPayload(form, 'recruiting'), header: { 'X-Idempotency-Key': form.publishRequestKey || createRequestKey() } }).then(normalizeMatch),
  cancelMatch: (id) => withLogin(`/v1/me/matches/${encodeURIComponent(id)}/cancel`, { method: 'POST' }).then(normalizeMatch),
  getUserProfile: (id) => withLogin(`/v1/users/${encodeURIComponent(id)}/profile`).then((profile) => Object.assign({}, profile, { avatarUrl: absoluteAvatarUrl(profile.avatarUrl) })),
  searchMatches(options = {}) {
    const params = [];
    if (options.gameType) params.push(`gameType=${encodeURIComponent(options.gameType)}`);
    if (options.gender) params.push(`gender=${encodeURIComponent(options.gender)}`);
    if (options.searchText) params.push(`q=${encodeURIComponent(options.searchText)}`);
    if (Number.isFinite(options.ageMin)) params.push(`ageMin=${options.ageMin}`);
    if (Number.isFinite(options.ageMax)) params.push(`ageMax=${options.ageMax}`);
    return withLogin(`/v1/matches${params.length ? `?${params.join('&')}` : ''}`).then((rows) => {
      const locationStore = require('./location-store');
      return rows.map(normalizeMatch).map((match) => {
        const distance = options.userLocation ? locationStore.distanceKm(options.userLocation, { latitude: match.venueLatitude, longitude: match.venueLongitude }) : null;
        return Object.assign({}, match, {
          distanceValue: distance,
          distanceLabel: Number.isFinite(distance) ? `直线约 ${locationStore.formatDistance(distance)}` : (options.userLocation ? '球房位置待完善，暂无法计算距离' : '')
        });
      }).sort((a, b) => {
        if (options.userLocation) {
          const da = Number.isFinite(a.distanceValue) ? a.distanceValue : Number.POSITIVE_INFINITY;
          const db = Number.isFinite(b.distanceValue) ? b.distanceValue : Number.POSITIVE_INFINITY;
          if (da !== db) return da - db;
        }
        return a.startAt - b.startAt;
      });
    });
  }
};

function absoluteAvatarUrl(url) {
  return url && url[0] === '/' ? `${API_BASE_URL}${url}` : url;
}

function stripBaseUrl(url) {
  return url.indexOf(API_BASE_URL) === 0 ? url.slice(API_BASE_URL.length) : url;
}

function normalizeProfile(profile) {
  return Object.assign({}, profile, { avatarPath: absoluteAvatarUrl(profile.avatarUrl) });
}

function toMatchPayload(form, status) {
  const date = (form.date || '').split('-').map(Number);
  const time = (form.time || '').split(':').map(Number);
  const startsAt = date.length === 3 && time.length === 2 ? new Date(date[0], date[1] - 1, date[2], time[0], time[1]).toISOString() : '';
  return {
    status,
    gameType: form.gameType,
    venueName: form.venueName,
    venueArea: form.venueArea,
    venueAddress: form.venueAddress,
    venueLatitude: form.venueLatitude === '' ? null : Number(form.venueLatitude),
    venueLongitude: form.venueLongitude === '' ? null : Number(form.venueLongitude),
    startsAt,
    level: form.level,
    feeLabel: form.feeLabel,
    note: form.note
  };
}

function createRequestKey() {
  return `wx-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
