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
    errors: {},
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
    this.setData({ [`personal.${field}`]: event.detail.value, [`errors.${field}`]: '' });
  },

  onArchiveInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [`archive.${field}`]: event.detail.value });
  },

  selectGender(event) {
    this.setData({ 'personal.gender': event.currentTarget.dataset.value, 'errors.gender': '' });
  },

  toggleGameType(event) {
    const value = event.currentTarget.dataset.value;
    const selected = this.data.archive.gameTypes || [];
    const next = selected.includes(value) ? selected.filter((item) => item !== value) : selected.concat(value);
    this.setData({ 'archive.gameTypes': next, gameTypeOptions: makeGameTypeOptions(next) });
  },

  openAvatarEditor() {
    const avatarPath = this.data.pendingAvatarPath || this.data.personal.avatarPath || '';
    wx.navigateTo({
      url: '/pages/avatar-editor/index',
      events: {
        avatarSelected: (selection) => {
          this.setData({ pendingAvatarPath: selection.path || '' });
        }
      },
      success: (result) => result.eventChannel.emit('avatarInitial', { avatarPath })
    });
  },

  cancelEdit() {
    if (this.data.resumePublish) getApp().globalData.resumePublishAfterProfile = false;
    wx.navigateBack();
  },

  saveProfile() {
    if (this._saving) return;
    const personal = this.data.personal;
    const age = Number(personal.age);
    const errors = {
      nickname: !(personal.nickname || '').trim() ? '请填写昵称' : '',
      age: !Number.isInteger(age) || age < 1 || age > 120 ? '请填写 1 至 120 岁的年龄' : '',
      gender: !personal.gender ? '请选择性别' : ''
    };
    this.setData({ errors });
    if (errors.nickname || errors.age || errors.gender) {
      wx.showToast({ title: '请完善必填资料', icon: 'none' });
      return;
    }
    const archive = Object.assign({}, this.data.archive, {
      intro: (this.data.archive.intro || '').trim(),
      gameTypes: this.data.archive.gameTypes || []
    });
    this._saving = true;
    const persist = (avatarUrl) => {
      api.saveProfile(Object.assign({}, personal, {
        avatarUrl,
        nickname: personal.nickname.trim(),
        age,
        intro: archive.intro,
        gameTypes: archive.gameTypes
      })).then(() => {
        wx.showToast({ title: '资料已保存', icon: 'success' });
        wx.navigateBack();
      }).catch((error) => wx.showModal({ title: '资料未保存', content: error.message || '服务暂时不可用，请重试。', showCancel: false })).finally(() => { this._saving = false; });
    };

    if (this.data.pendingAvatarPath) {
      api.uploadAvatar(this.data.pendingAvatarPath).then(persist).catch((error) => { this._saving = false; wx.showModal({ title: '头像未保存', content: error.message || '无法上传这张照片，请重试。', showCancel: false }); });
      return;
    }
    persist(personal.avatarPath || '');
  }
});
