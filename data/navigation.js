const api = require('./api');
function openChat(page, event) {
  if (page._openingChat) return;
  const data = event.currentTarget.dataset;
  const match = page.data.match || (page.data.matches || []).find(item => String(item.id) === String(data.id));
  if (!match) {
    wx.showToast({ title: '约局信息已刷新，请重试', icon: 'none' });
    return;
  }
  page._openingChat = true;
  wx.showLoading({ title: '正在打开聊天', mask: true });
  api.getProfile().then(profile => {
    if (profile.userId != null && match.hostUserId != null && String(profile.userId) === String(match.hostUserId)) {
      page._openingChat = false;
      wx.hideLoading();
      wx.showToast({ title: '这是你发起的约球', icon: 'none' });
      return;
    }
    if (!(profile.nickname || '').trim() || !profile.age || !profile.gender) {
      wx.hideLoading();
      wx.showModal({ title: '完善资料后参与约球', content: '请先填写昵称、年龄和性别。', confirmText: '去完善', cancelText: '暂不参与',
        success: result => {
          if (!result.confirm) return;
          // 直接打开资料编辑，保存后返回用户原来的页面。
          wx.navigateTo({ url: '/pages/personal-profile/index' });
        },
        complete: () => { page._openingChat = false; }
      });
      return;
    }
    const url = `/pages/chat/index?matchId=${encodeURIComponent(match.id)}&focus=${data.focus === 'confirm' ? 'confirm' : 'chat'}`;
    wx.navigateTo({ url, fail: error => wx.showToast({ title: error.errMsg || '暂时无法打开聊天', icon: 'none' }), complete: () => { wx.hideLoading(); page._openingChat = false; } });
  }).catch(error => { wx.hideLoading(); page._openingChat = false; wx.showToast({ title: error.message || '暂时无法打开聊天', icon: 'none' }); });
}
function openMessages() { wx.navigateTo({ url: '/pages/messages/index' }); }
module.exports = { openChat, openMessages };
