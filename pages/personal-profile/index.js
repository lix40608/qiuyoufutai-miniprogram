const api = require('../../data/api');

const emptyPersonal = { avatarPath: '', nickname: '', age: '', gender: '' };
const emptyArchive = { intro: '', gameTypes: [] };
const gameTypes = ['中式八球', '中式九球', '斯诺克'];

function makeGameTypeOptions(selected) {
  return gameTypes.map((value) => ({ value, selected: selected.includes(value) }));
}

Page({
  data: {
    personal: Object.assign({}, emptyPersonal),
    archive: Object.assign({}, emptyArchive),
    genderOptions: ['男', '女'],
    gameTypeOptions: makeGameTypeOptions([]),
    pendingAvatarPath: '',
    resetAvatar: false,
    resumePublish: false
  },

  onLoad(query) {
    api.getProfile().then((profile) => {
      const personal = Object.assign({}, emptyPersonal, profile);
      const archive = Object.assign({}, emptyArchive, profile);
      archive.gameTypes = Array.isArray(archive.gameTypes) ? archive.gameTypes : [];
      this.setData({
        personal,
        archive,
        gameTypeOptions: makeGameTypeOptions(archive.gameTypes),
        resumePublish: query.resumePublish === '1'
      });
    }).catch((error) => wx.showToast({ title: error.message || '读取资料失败', icon: 'none' }));
  },

  onPersonalInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [`personal.${field}`]: event.detail.value });
  },

  onArchiveInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [`archive.${field}`]: event.detail.value });
  },

  selectGender(event) {
    this.setData({ 'personal.gender': event.currentTarget.dataset.value });
  },

  toggleGameType(event) {
    const value = event.currentTarget.dataset.value;
    const selected = this.data.archive.gameTypes || [];
    const next = selected.includes(value) ? selected.filter((item) => item !== value) : selected.concat(value);
    this.setData({ 'archive.gameTypes': next, gameTypeOptions: makeGameTypeOptions(next) });
  },

  chooseAvatar() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album'],
      success: (result) => {
        const path = result.tempFilePaths && result.tempFilePaths[0];
        if (path) this.setData({ pendingAvatarPath: path, resetAvatar: false });
      },
      fail: () => wx.showToast({ title: '未选择照片', icon: 'none' })
    });
  },

  useDefaultAvatar() {
    this.setData({ pendingAvatarPath: '', resetAvatar: true });
  },

  cancelEdit() {
    if (this.data.resumePublish) getApp().globalData.resumePublishAfterProfile = false;
    wx.navigateBack();
  },

  saveProfile() {
    const personal = this.data.personal;
    const age = Number(personal.age);
    if (!personal.nickname.trim()) return wx.showToast({ title: '请填写昵称', icon: 'none' });
    if (!Number.isInteger(age) || age < 1 || age > 120) return wx.showToast({ title: '请填写有效年龄', icon: 'none' });
    if (!personal.gender) return wx.showToast({ title: '请选择性别', icon: 'none' });
    const archive = Object.assign({}, this.data.archive, {
      intro: (this.data.archive.intro || '').trim(),
      gameTypes: this.data.archive.gameTypes || []
    });
    const persist = (avatarUrl) => {
      api.saveProfile(Object.assign({}, personal, {
        avatarUrl: avatarUrl || personal.avatarPath,
        nickname: personal.nickname.trim(),
        age: String(age),
        intro: archive.intro,
        gameTypes: archive.gameTypes
      })).then(() => {
        wx.showToast({ title: '资料已保存', icon: 'success' });
        wx.navigateBack();
      }).catch((error) => wx.showModal({ title: '资料未保存', content: error.message || '服务暂时不可用，请重试。', showCancel: false }));
    };

    if (this.data.pendingAvatarPath) {
      api.uploadAvatar(this.data.pendingAvatarPath).then(persist).catch((error) => wx.showModal({ title: '头像未保存', content: error.message || '无法上传这张照片，请重试。', showCancel: false }));
      return;
    }
    persist(this.data.resetAvatar ? '' : (personal.avatarPath || ''));
  }
});
