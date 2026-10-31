const TOKEN_KEY = 'qiuyou-futai.session-token.v1';
const LEGAL_ACCEPTANCE_KEY = 'qiuyou-futai.legal-acceptance.v1';
const USER_AGREEMENT_VERSION = '2026-10-31-v3';
const PRIVACY_POLICY_VERSION = '2026-10-31-v3';
// 微信云托管测试服务；正式发布前替换为生产环境地址。
const API_BASE_URL = 'https://springboot-r9wn-336416-13-1518350960.sh.run.tcloudbase.com';

let loginPromise = null;

function request(path, options = {}) {
  const token = wx.getStorageSync(TOKEN_KEY);
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}${path}`,
      method: options.method || 'GET',
      timeout: 15000,
      data: options.data,
      header: Object.assign({ 'content-type': 'application/json' }, token && !options.anonymous ? { Authorization: `Bearer ${token}` } : {}, options.header || {}),
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300) return resolve(response.data.data);
        if (response.statusCode === 401 && wx.getStorageSync(TOKEN_KEY) === token) wx.removeStorageSync(TOKEN_KEY);
        const error = new Error(response.data && response.data.error ? response.data.error.message : '服务暂时不可用');
        error.code = response.data && response.data.error && response.data.error.code;
        error.statusCode = response.statusCode;
        reject(error);
      },
      fail() { reject(new Error('网络连接失败，请检查网络后重试')); }
    });
  });
}

function ensureLogin() {
  if (!hasCurrentLegalAcceptance()) {
    redirectToLegalConsent();
    return Promise.reject(legalConsentRequiredError());
  }
  if (wx.getStorageSync(TOKEN_KEY)) return Promise.resolve();
  if (loginPromise) return loginPromise;
  loginPromise = new Promise((resolve, reject) => {
    wx.login({
      success(result) {
        if (!result.code) return reject(new Error('微信登录失败，请重试'));
        request('/v1/auth/login', { method: 'POST', data: loginPayload(result.code) }).then((session) => {
          if (!session || !session.token) throw new Error('登录会话无效，请重试');
          wx.setStorageSync(TOKEN_KEY, session.token);
          resolve();
        }).catch(reject);
      },
      fail: () => reject(new Error('微信登录失败，请重试'))
    });
  }).finally(() => { loginPromise = null; });
  return loginPromise;
}

function redirectToLegalConsent() {
  const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
  const current = pages.length ? pages[pages.length - 1].route : '';
  if (current !== 'pages/legal-consent/index') wx.redirectTo({ url: '/pages/legal-consent/index' });
}

function withLogin(path, options) {
  return ensureLogin().then(() => request(path, options)).catch((error) => {
    if (error.statusCode !== 401) throw error;
    // A 401 is rejected before the handler; renew once, never retry network failures.
    return ensureLogin().then(() => request(path, options));
  });
}

function normalizeMatch(match) {
  const startAt = match.startsAt ? new Date(match.startsAt) : null;
  const today = new Date();
  const target = startAt ? new Date(startAt.getFullYear(), startAt.getMonth(), startAt.getDate()) : null;
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dayOffset = target ? Math.round((target - todayStart) / 86400000) : null;
  const dayLabel = !startAt ? '' : dayOffset === 0 ? '今天' : dayOffset === 1 ? '明天' : `${startAt.getMonth() + 1}月${startAt.getDate()}日`;
  const startLabel = startAt ? `${dayLabel} ${String(startAt.getHours()).padStart(2, '0')}:${String(startAt.getMinutes()).padStart(2, '0')}` : '时间待选择';
  return Object.assign({}, match, {
    startAt,
    startLabel,
    title: match.note ? match.note.split('\n')[0].slice(0, 22) : `找球友一起打${match.gameType}`,
    venue: match.venueName,
    area: match.venueArea,
    hostUserId: match.host && match.host.id,
    displayEnded: match.status === 'cancelled' || (match.status === 'matched'
      ? Boolean(match.matchedAt) && Date.now() >= new Date(match.matchedAt).getTime() + 86400000
      : match.status === 'recruiting' && startAt && Date.now() >= startAt.getTime() + 1800000),
    hostName: match.host && match.host.nickname,
    hostAvatar: match.host && absoluteAvatarUrl(match.host.avatarUrl),
    hostAge: match.host && match.host.age,
    hostGender: match.host && genderLabel(match.host.gender),
    hostIntro: match.host && match.host.intro,
    hostGameTypes: parseGames(match.host && match.host.gameTypes),
    localOnly: false
  });
}

module.exports = {
  isLoggedIn: () => Boolean(wx.getStorageSync(TOKEN_KEY) && hasCurrentLegalAcceptance()),
  ensureLogin,
  legalVersions: () => ({ userAgreementVersion: USER_AGREEMENT_VERSION, privacyPolicyVersion: PRIVACY_POLICY_VERSION }),
  hasCurrentLegalAcceptance,
  acceptLegalTerms() {
    const consent = loginPayload();
    const token = wx.getStorageSync(TOKEN_KEY);
    const saveAcceptance = token
      ? request('/v1/me/legal-acceptance', { method: 'POST', data: consent }).catch((error) => {
        if (error.statusCode !== 401) throw error;
        return loginWithConsent();
      })
      : loginWithConsent();
    return saveAcceptance.then((session) => {
      if (session && session.token) wx.setStorageSync(TOKEN_KEY, session.token);
      wx.setStorageSync(LEGAL_ACCEPTANCE_KEY, {
        userAgreementVersion: USER_AGREEMENT_VERSION,
        privacyPolicyVersion: PRIVACY_POLICY_VERSION
      });
    });
  },
  getProfile: () => withLogin('/v1/me/profile').then(normalizeProfile),
  logout: () => request('/v1/me/logout', { method: 'POST' }).catch((error) => {
    if (error.statusCode === 401) return { loggedOut: true };
    throw error;
  }),
  deleteAccount: () => request('/v1/me/account', { method: 'DELETE' }),
  saveProfile: (profile) => withLogin('/v1/me/profile', { method: 'PUT', data: Object.assign({}, profile, { gender: genderValue(profile.gender), age: profile.age === '' ? null : Number(profile.age), avatarUrl: stripBaseUrl(Object.prototype.hasOwnProperty.call(profile, 'avatarUrl') ? profile.avatarUrl : (profile.avatarPath || '')) }) }).then(normalizeProfile),
  getMyWechatContact: () => withLogin('/v1/me/wechat-contact'),
  saveMyWechatContact: (wechatId) => withLogin('/v1/me/wechat-contact', { method: 'PUT', data: { wechatId: (wechatId || '').trim() } }),
  getMatchContactSharing: (matchId) => withLogin(`/v1/matches/${encodeURIComponent(matchId)}/contact-sharing`),
  uploadAvatar(path) {
    const upload = () => new Promise((resolve, reject) => {
      const token = wx.getStorageSync(TOKEN_KEY);
      wx.uploadFile({
        url: `${API_BASE_URL}/v1/me/avatar`, filePath: path, name: 'avatar', timeout: 20000,
        header: { Authorization: `Bearer ${token}` },
        success(response) {
          let body;
          try { body = JSON.parse(response.data); } catch (_) { return reject(new Error('头像上传失败')); }
          if (response.statusCode >= 200 && response.statusCode < 300 && body.data && body.data.avatarUrl) return resolve(absoluteAvatarUrl(body.data.avatarUrl));
          if (response.statusCode === 401 && wx.getStorageSync(TOKEN_KEY) === token) wx.removeStorageSync(TOKEN_KEY);
          const error = new Error(body.error ? body.error.message : '头像上传失败');
          error.statusCode = response.statusCode;
          reject(error);
        },
        fail() { reject(new Error('头像上传失败，请检查网络后重试')); }
      });
    });
    return ensureLogin().then(upload).catch(error => {
      if (error.statusCode !== 401) throw error;
      return ensureLogin().then(upload);
    });
  },
  openConversation: (id) => withLogin(`/v1/matches/${encodeURIComponent(id)}/conversations`, { method: 'POST' }).then(normalizeConversation),
  getConversations(page, pageSize, guestOnly = false) {
    const params = [];
    if (Number.isFinite(page) && Number.isFinite(pageSize)) params.push(`page=${page}&pageSize=${Math.min(pageSize, 10)}`);
    if (guestOnly) params.push('guestOnly=true');
    const query = params.length ? `?${params.join('&')}` : '';
    return withLogin(`/v1/me/conversations${query}`).then(rows => rows.map(normalizeConversation));
  },
  getLatestMatchConversation: (matchId) => withLogin(`/v1/matches/${encodeURIComponent(matchId)}/conversations/latest`).then(conversation => conversation ? normalizeConversation(conversation) : null),
  getMatchConversations(matchId, page = 1, pageSize = 10) {
    return withLogin(`/v1/matches/${encodeURIComponent(matchId)}/conversations?page=${Math.max(1, Number(page) || 1)}&pageSize=${Math.min(10, Math.max(1, Number(pageSize) || 10))}`).then(rows => rows.map(normalizeConversation));
  },
  getConversation: (id, markRead = false) => withLogin(`/v1/conversations/${encodeURIComponent(id)}${markRead ? '?markRead=true' : ''}`).then(normalizeConversation),
  markConversationRead: (id) => withLogin(`/v1/conversations/${encodeURIComponent(id)}/read`, { method: 'POST' }),
  getNotifications: () => withLogin('/v1/me/notifications'),
  getUnreadNotificationCount: () => withLogin('/v1/me/notifications/unread-count').then(result => Number(result.count) || 0),
  markNotificationRead: (id) => withLogin(`/v1/me/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' }),
  getMessages: (id, afterId = 0) => withLogin(`/v1/conversations/${encodeURIComponent(id)}/messages?afterId=${Number(afterId) || 0}`),
  sendMessage: (id, content, clientId) => withLogin(`/v1/conversations/${encodeURIComponent(id)}/messages`, { method: 'POST', data: { content, clientId } }),
  confirmConversation: (id) => withLogin(`/v1/conversations/${encodeURIComponent(id)}/confirm`, { method: 'POST' }),
  getPublicMatches: (query = '') => request(`/v1/matches${query}`, { anonymous: true }).then((rows) => rows.map(normalizeMatch)),
  async getChattedMatches(page, pageSize) {
    const conversations = await this.getConversations(page, pageSize);
    const records = [];
    // Bound concurrent detail reads rather than sending hundreds of requests at once.
    for (let offset = 0; offset < conversations.length; offset += 4) {
      const batch = await Promise.all(conversations.slice(offset, offset + 4).map(async item =>
        Object.assign(await this.getMatch(item.matchId), { conversationId: item.id, peerName: item.peerName, peerAvatar: item.peerAvatar, lastMessageAt: item.lastMessageAt, lastMessage: item.lastMessage, hostConfirmed: item.hostConfirmed, guestConfirmed: item.guestConfirmed, hostConfirmedAt: item.hostConfirmedAt, guestConfirmedAt: item.guestConfirmedAt, unreadCount: item.unreadCount })));
      records.push(...batch);
    }
    return records;
  },
  getMyMatches(page, pageSize, filter) {
    const query = Number.isFinite(page) && Number.isFinite(pageSize)
      ? `?page=${page}&pageSize=${Math.min(pageSize, 10)}${filter && filter !== 'all' ? `&filter=${encodeURIComponent(filter)}` : ''}`
      : '';
    return withLogin(`/v1/me/matches${query}`).then((rows) => rows.map(normalizeMatch));
  },
  getMatch: (id) => request(`/v1/matches/${encodeURIComponent(id)}`, { anonymous: true }).then(normalizeMatch),
  saveDraft: (form) => withLogin(form.id ? `/v1/me/matches/${encodeURIComponent(form.id)}` : '/v1/matches', { method: form.id ? 'PUT' : 'POST', data: toMatchPayload(form, 'draft'), header: form.id ? {} : { 'X-Idempotency-Key': form.requestKey || createRequestKey() } }).then(normalizeMatch),
  publishMatch: (form) => withLogin(form.id ? `/v1/me/matches/${encodeURIComponent(form.id)}/publish` : '/v1/matches', { method: 'POST', data: toMatchPayload(form, 'recruiting'), header: { 'X-Idempotency-Key': form.publishRequestKey || createRequestKey() } }).then(normalizeMatch),
  cancelMatch: (id) => withLogin(`/v1/me/matches/${encodeURIComponent(id)}/cancel`, { method: 'POST' }).then(normalizeMatch),
  getUserProfile: (id) => withLogin(`/v1/users/${encodeURIComponent(id)}/profile`).then(normalizeProfile),
  searchMatches(options = {}) {
    const params = [];
    if (options.gameType) params.push(`gameType=${encodeURIComponent(options.gameType)}`);
    if (options.gender) params.push(`gender=${encodeURIComponent(genderValue(options.gender))}`);
    if (options.searchText) params.push(`q=${encodeURIComponent(options.searchText)}`);
    if (Number.isFinite(options.ageMin)) params.push(`ageMin=${options.ageMin}`);
    if (Number.isFinite(options.ageMax)) params.push(`ageMax=${options.ageMax}`);
    if (Number.isFinite(options.page)) params.push(`page=${options.page}`);
    if (Number.isFinite(options.pageSize)) params.push(`pageSize=${Math.min(options.pageSize, 10)}`);
    return request(`/v1/matches${params.length ? `?${params.join('&')}` : ''}`, { anonymous: true }).then((rows) => {
      const locationStore = require('./location-store');
      return rows.map(normalizeMatch).map((match) => {
        const distance = options.userLocation ? locationStore.distanceKm(options.userLocation, { latitude: match.venueLatitude, longitude: match.venueLongitude }) : null;
        return Object.assign({}, match, {
          distanceValue: distance,
          distanceLabel: Number.isFinite(distance) ? `距你 ${locationStore.formatDistance(distance)}` : ''
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

function hasCurrentLegalAcceptance() {
  const acceptance = wx.getStorageSync(LEGAL_ACCEPTANCE_KEY);
  return Boolean(acceptance
    && acceptance.userAgreementVersion === USER_AGREEMENT_VERSION
    && acceptance.privacyPolicyVersion === PRIVACY_POLICY_VERSION);
}

function loginPayload(code) {
  const consent = {
    userAgreementVersion: USER_AGREEMENT_VERSION,
    privacyPolicyVersion: PRIVACY_POLICY_VERSION
  };
  if (code) consent.code = code;
  return consent;
}

function loginWithConsent() {
  if (loginPromise) return loginPromise;
  loginPromise = new Promise((resolve, reject) => {
    wx.login({
      success(result) {
        if (!result.code) return reject(new Error('微信登录失败，请重试'));
        request('/v1/auth/login', { method: 'POST', data: loginPayload(result.code) }).then((session) => {
          if (!session || !session.token) throw new Error('登录会话无效，请重试');
          wx.setStorageSync(TOKEN_KEY, session.token);
          resolve(session);
        }).catch(reject);
      },
      fail: () => reject(new Error('微信登录失败，请重试'))
    });
  }).finally(() => { loginPromise = null; });
  return loginPromise;
}

function legalConsentRequiredError() {
  const error = new Error('请先阅读并同意用户协议和隐私政策，并确认已满18周岁');
  error.code = 'LEGAL_CONSENT_REQUIRED';
  return error;
}

function absoluteAvatarUrl(url) {
  return url && url[0] === '/' ? `${API_BASE_URL}${url}` : url;
}

function stripBaseUrl(url) {
  url = url || '';
  return url.indexOf(API_BASE_URL) === 0 ? url.slice(API_BASE_URL.length) : url;
}

function normalizeProfile(profile) {
  return Object.assign({}, profile, { gender: genderLabel(profile.gender), gameTypes: parseGames(profile.gameTypes), avatarUrl: absoluteAvatarUrl(profile.avatarUrl), avatarPath: absoluteAvatarUrl(profile.avatarUrl) });
}

function normalizeConversation(conversation) {
  return Object.assign({}, conversation, { peerAvatar: absoluteAvatarUrl(conversation.peerAvatar) });
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
    venueLatitude: form.venueLatitude == null || form.venueLatitude === '' ? null : Number(form.venueLatitude),
    venueLongitude: form.venueLongitude == null || form.venueLongitude === '' ? null : Number(form.venueLongitude),
    startsAt,
    level: form.level,
    feeLabel: form.feeLabel,
    note: form.note
  };
}

function createRequestKey() {
  return `wx-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function genderLabel(value) { return ({ male: '男', female: '女', undisclosed: '' })[value] === undefined ? (value || '') : ({ male: '男', female: '女', undisclosed: '' })[value]; }
function genderValue(value) { return ({ '男': 'male', '女': 'female' })[value] || value || ''; }
function parseGames(value) {
  if (Array.isArray(value)) return value;
  try { const parsed = JSON.parse(value || '[]'); return Array.isArray(parsed) ? parsed : []; } catch (_) { return []; }
}
