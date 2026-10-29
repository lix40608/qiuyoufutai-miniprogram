const api = require('../../data/api');
const locationStore = require('../../data/location-store');

function datePart(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function defaultForm() {
  const start = new Date();
  // 默认选择当前时间之后的下一个半小时，跨午夜时自然进入次日。
  start.setMinutes(Math.floor(start.getMinutes() / 30) * 30 + 30, 0, 0);
  return {
    id: '', gameType: '中式八球', venueName: '', venueArea: '', venueAddress: '', venueLatitude: '', venueLongitude: '',
    date: datePart(start), time: `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`, level: '', feeLabel: 'AA', note: ''
  };
}

function startTimestamp(form) {
  const dateParts = form.date.split('-').map(Number);
  const timeParts = form.time.split(':').map(Number);
  return new Date(dateParts[0], dateParts[1] - 1, dateParts[2], timeParts[0], timeParts[1], 0, 0).getTime();
}

Page({
  data: {
    gameTypes: ['中式八球', '中式九球', '斯诺克'],
    feeTypes: ['AA', '免付台费', '抢台费'],
    minDate: datePart(new Date()),
    form: defaultForm(),
    formErrors: { venue: '', time: '' },
    savingDraft: false,
    submitting: false
  },

  onLoad(query) {
    if (query.draftId) this.loadDraft(query.draftId);
  },

  onShow() {
    this.setData({ minDate: datePart(new Date()) });
    const app = getApp();
    let resumingDraft = false;
    if (app.globalData.editDraftId) {
      this.loadDraft(app.globalData.editDraftId);
      app.globalData.editDraftId = '';
      resumingDraft = true;
    }
    if (app.globalData.resumePublishAfterProfile) {
      app.globalData.resumePublishAfterProfile = false;
      api.getProfile().then((profile) => {
        if (profile.nickname && profile.age && profile.gender) return wx.showToast({ title: '资料已保存，请继续发布', icon: 'none' });
        this.promptForProfileIfNeeded(true);
      }).catch((error) => wx.showToast({ title: error.message || '读取资料失败', icon: 'none' }));
      return;
    }
    if (!resumingDraft) this.promptForProfileIfNeeded();
  },

  onHide() {
    this.profilePrompted = false;
  },

  promptForProfileIfNeeded(force) {
    if (this.profilePrompted && !force) return;
    api.getProfile().then((profile) => {
      if (profile.nickname && profile.age && profile.gender) return;
      this.profilePrompted = true;
      wx.showModal({
        title: '完善资料再发布',
        content: '发布约球需要填写昵称、年龄和性别。先完善个人资料。',
        confirmText: '去完善资料',
        cancelText: '暂不发布',
        success: (result) => {
          if (!result.confirm) return;
          getApp().globalData.resumePublishAfterProfile = true;
          wx.navigateTo({ url: '/pages/personal-profile/index?resumePublish=1' });
        }
      });
    }).catch((error) => wx.showToast({ title: error.message || '读取资料失败', icon: 'none' }));
  },

  loadDraft(id) {
    api.getMyMatches().then((records) => {
        const draft = records.find((record) => String(record.id) === String(id) && record.status === 'draft');
        if (!draft) return wx.showToast({ title: '草稿不存在或已发布', icon: 'none' });
        const startsAt = draft.startAt;
        this.setData({ form: Object.assign(defaultForm(), draft, { date: `${startsAt.getFullYear()}-${String(startsAt.getMonth() + 1).padStart(2, '0')}-${String(startsAt.getDate()).padStart(2, '0')}`, time: `${String(startsAt.getHours()).padStart(2, '0')}:${String(startsAt.getMinutes()).padStart(2, '0')}` }) });
        wx.pageScrollTo({ scrollTop: 0, duration: 0 });
    }).catch((error) => wx.showToast({ title: error.message || '读取草稿失败', icon: 'none' }));
  },

  selectGameType(event) {
    this.setData({ 'form.gameType': event.currentTarget.dataset.value });
  },

  selectFeeType(event) {
    this.setData({ 'form.feeLabel': event.currentTarget.dataset.value });
  },

  chooseVenueOnMap() {
    locationStore.chooseMapLocationFromCurrent((location) => {
      const address = location.address || '';
      this.setData({
        'form.venueName': location.name || address || '地图所选球房',
        'form.venueArea': address || location.name || '地图所选位置',
        'form.venueAddress': address,
        'form.venueLatitude': location.latitude,
        'form.venueLongitude': location.longitude,
        'formErrors.venue': ''
      });
    });
  },

  selectDate(event) {
    this.setData({ 'form.date': event.detail.value, 'formErrors.time': '' });
  },

  selectTime(event) {
    this.setData({ 'form.time': event.detail.value, 'formErrors.time': '' });
  },

  onTextInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: event.detail.value });
  },

  saveDraft() {
    if (this.data.submitting || this._savingDraft) return;
    this._savingDraft = true;
    this.setData({ savingDraft: true });
    const form = Object.assign({}, this.data.form, { requestKey: this.data.form.requestKey || `draft-${Date.now()}-${Math.random().toString(36).slice(2)}` });
    const submittedSnapshot = JSON.stringify(form);
    this.setData({ form });
    api.saveDraft(form).then((draft) => {
      // 保存期间的新编辑不能被服务端返回的旧快照覆盖。
      if (JSON.stringify(this.data.form) !== submittedSnapshot) {
        this.setData({ 'form.id': draft.id });
        wx.showToast({ title: '草稿已保存，请保存新修改', icon: 'none' });
        return;
      }
      const startsAt = draft.startAt;
      this.setData({ form: Object.assign({}, this.data.form, draft, { date: `${startsAt.getFullYear()}-${String(startsAt.getMonth() + 1).padStart(2, '0')}-${String(startsAt.getDate()).padStart(2, '0')}`, time: `${String(startsAt.getHours()).padStart(2, '0')}:${String(startsAt.getMinutes()).padStart(2, '0')}` }) });
      // 跳转成功后清空表单，跳转失败时保留已保存的草稿供继续操作。
      wx.redirectTo({
        url: '/pages/my-matches/index?filter=draft',
        success: () => {
          this.setData({ form: defaultForm(), formErrors: { venue: '', time: '' } });
          wx.showToast({ title: '草稿已保存', icon: 'success' });
        },
        fail: () => wx.showModal({ title: '草稿已保存', content: '暂时无法打开我的约局，可稍后在「编辑中」继续编辑。', showCancel: false })
      });
    }).catch((error) => wx.showModal({ title: '草稿未保存', content: error.message || '服务暂时不可用，内容仍保留在页面中。', showCancel: false })).finally(() => { this._savingDraft = false; this.setData({ savingDraft: false }); });
  },

  publishMatch() {
    if (this.data.submitting || this._savingDraft) return;
    if (!this.data.form.venueName) {
      this.setData({ 'formErrors.venue': '请选择球房后再发布' });
      wx.pageScrollTo({ selector: '#venue-field', duration: 300 });
      return;
    }
    const startsAt = this.data.form.date && this.data.form.time ? startTimestamp(this.data.form) : NaN;
    if (!Number.isFinite(startsAt) || startsAt <= Date.now()) {
      this.setData({ 'formErrors.time': '请选择晚于当前时间的开球时间' });
      wx.pageScrollTo({ selector: '#time-field', duration: 300 });
      return;
    }
    this.setData({ formErrors: { venue: '', time: '' } });
    this.setData({ submitting: true });
    api.getProfile().then((profile) => {
      if (!profile.nickname || !profile.age || !profile.gender) {
        this.setData({ submitting: false });
        this.promptForProfileIfNeeded(true);
        return null;
      }
      const form = Object.assign({}, this.data.form, { publishRequestKey: this.data.form.publishRequestKey || `publish-${Date.now()}-${Math.random().toString(36).slice(2)}` });
      this.setData({ form });
      return api.publishMatch(form);
    }).then((published) => {
      if (!published) return;
      this.setData({ form: defaultForm(), formErrors: { venue: '', time: '' }, submitting: false });
      wx.redirectTo({
        url: '/pages/my-matches/index?filter=active',
        success: () => wx.showToast({ title: '发布成功', icon: 'success' }),
        fail: () => wx.showModal({ title: '发布成功', content: '暂时无法打开我的约局，可稍后在「组局中」查看。', showCancel: false })
      });
    }).catch((error) => {
      this.setData({ submitting: false });
      wx.showModal({ title: '发布失败', content: error.message || '服务暂时不可用，表单内容已保留，请重试。', showCancel: false });
    });
  }
});
