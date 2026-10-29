const api = require('./api');
function openChat(page, event) {
  if (page._openingChat) return;
  const data = event.currentTarget.dataset;
  const match = page.data.match || (page.data.matches || []).find(item => String(item.id) === String(data.id));
  if (!match) return;
  page._openingChat = true;
  api.getProfile().then(profile => {
    if (profile.userId != null && match.hostUserId != null && String(profile.userId) === String(match.hostUserId)) {
      page._openingChat = false;
      wx.showToast({ title: '这是你发起的约球', icon: 'none' });
      return;
    }
    if (!(profile.nickname || '').trim() || !profile.age || !profile.gender) {
      wx.showModal({ title: '完善资料后参与约球', content: '请先填写昵称、年龄和性别。', confirmText: '去完善资料', cancelText: '暂不参与',
        success: result => {
          if (!result.confirm) return;
          const openProfile = () => wx.navigateTo({ url: '/pages/personal-profile/index' });
          // 列表入口先进入详情，以便保存资料后回到原约球。
          if (page.data.match) openProfile();
          else wx.navigateTo({ url: `/pages/detail/index?id=${encodeURIComponent(match.id)}`, success: openProfile });
        },
        complete: () => { page._openingChat = false; }
      });
      return;
    }
    const url = `/pages/chat/index?matchId=${encodeURIComponent(match.id)}&focus=${data.focus === 'confirm' ? 'confirm' : 'chat'}`;
    wx.navigateTo({ url, complete: () => { page._openingChat = false; } });
  }).catch(error => { page._openingChat = false; wx.showToast({ title: error.message || '暂时无法打开聊天', icon: 'none' }); });
}
function openMessages() { wx.navigateTo({ url: '/pages/messages/index' }); }
module.exports = { openChat, openMessages };
