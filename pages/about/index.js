Page({
  openLegal(event) {
    const type = event.currentTarget.dataset.type;
    wx.navigateTo({ url: `/pages/legal/index?type=${type}` });
  }
});
