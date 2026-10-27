const api = require('../../data/api');

Page({
  data: { profile: null },

  onLoad(query) {
    api.getUserProfile(query.id).then((profile) => {
      profile.avatarPath = profile.avatarUrl;
      this.setData({ profile });
    }).catch((error) => wx.showToast({ title: error.message || '球友资料暂不可用', icon: 'none' }));
  }
});
