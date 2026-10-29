Page({
  data: {
    avatarPath: '',
    changed: false
  },

  onLoad() {
    // 只传递当前预览，返回时才把用户确认的选择交还资料页。
    this.getOpenerEventChannel().on('avatarInitial', (data) => {
      this.setData({ avatarPath: data.avatarPath || '' });
    });
  },

  chooseAvatar() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album'],
      success: (result) => {
        const path = result.tempFilePaths && result.tempFilePaths[0];
        if (path) this.setData({ avatarPath: path, changed: true });
      },
      fail: (error) => {
        if (!/cancel/i.test((error && error.errMsg) || '')) wx.showToast({ title: '无法打开相册，请重试', icon: 'none' });
      }
    });
  },

  confirmAvatar() {
    if (this.data.changed) {
      this.getOpenerEventChannel().emit('avatarSelected', { path: this.data.avatarPath });
    }
    wx.navigateBack();
  }
});
