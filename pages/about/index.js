Page({
  data: { versionLabel: '开发版' },
  onLoad() {
    let versionLabel = '开发版';
    try {
      const miniProgram = wx.getAccountInfoSync().miniProgram || {};
      const environment = { develop: '开发版', trial: '体验版', release: '线上版' }[miniProgram.envVersion] || '开发版';
      versionLabel = miniProgram.version ? `${environment} · v${miniProgram.version}` : environment;
    } catch (_) {}
    this.setData({ versionLabel });
  },
  openLegal(event) {
    const type = event.currentTarget.dataset.type;
    wx.navigateTo({ url: `/pages/legal/index?type=${type}` });
  }
});
