const api = require('../../data/api');
const locationStore = require('../../data/location-store');

function datePart(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function defaultForm() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return {
    id: '', gameType: '中式八球', venueName: '', venueArea: '', venueAddress: '', venueLatitude: '', venueLongitude: '',
    date: datePart(tomorrow), time: '19:30', level: '', feeLabel: 'AA', note: ''
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
    submitting: false
  },

  onShow() {
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
        const draft = records.find((record) => record.id === id && record.status === 'draft');
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
        'form.venueLongitude': location.longitude
      });
    });
  },

  selectDate(event) {
    this.setData({ 'form.date': event.detail.value });
  },

  selectTime(event) {
    this.setData({ 'form.time': event.detail.value });
  },

  onTextInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: event.detail.value });
  },

  saveDraft() {
    api.saveDraft(this.data.form).then((draft) => {
      const startsAt = draft.startAt;
      this.setData({ form: Object.assign({}, this.data.form, draft, { date: `${startsAt.getFullYear()}-${String(startsAt.getMonth() + 1).padStart(2, '0')}-${String(startsAt.getDate()).padStart(2, '0')}`, time: `${String(startsAt.getHours()).padStart(2, '0')}:${String(startsAt.getMinutes()).padStart(2, '0')}` }) });
      wx.showToast({ title: '草稿已保存', icon: 'success' });
    }).catch((error) => wx.showModal({ title: '草稿未保存', content: error.message || '服务暂时不可用，内容仍保留在页面中。', showCancel: false }));
  },

  publishMatch() {
    if (this.data.submitting) return;
    if (!this.data.form.venueName) {
      wx.showToast({ title: '请选择球房', icon: 'none' });
      return;
    }
    if (!this.data.form.date || !this.data.form.time || startTimestamp(this.data.form) <= Date.now()) {
      wx.showToast({ title: '开球时间须晚于当前时间', icon: 'none' });
      return;
    }
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
      this.setData({ form: defaultForm(), submitting: false });
      wx.showModal({
        title: '发布成功',
        content: '这场约局已发布，附近球友可以查看。',
        confirmText: '查看详情',
        cancelText: '留在发布页',
        success: (result) => {
          if (result.confirm) wx.navigateTo({ url: `/pages/detail/index?id=${published.id}` });
        }
      });
    }).catch((error) => {
      this.setData({ submitting: false });
      wx.showModal({ title: '发布失败', content: error.message || '服务暂时不可用，表单内容已保留，请重试。', showCancel: false });
    });
  }
});
