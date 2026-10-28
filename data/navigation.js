const api = require('./api');
function openChat(page, event) {
  if (page._openingChat) return;
  const data = event.currentTarget.dataset;
  const match = page.data.match || (page.data.matches || []).find(item => String(item.id) === String(data.id));
  if (!match) return;
  page._openingChat = true;
  api.getProfile().then(profile => {
    const url = Number(profile.userId) === Number(match.hostUserId) ? '/pages/messages/index'
      : `/pages/chat/index?matchId=${encodeURIComponent(match.id)}&focus=${data.focus === 'confirm' ? 'confirm' : 'chat'}`;
    wx.navigateTo({ url, complete: () => { page._openingChat = false; } });
  }).catch(error => { page._openingChat = false; wx.showToast({ title: error.message || '暂时无法打开聊天', icon: 'none' }); });
}
function openMessages() { wx.navigateTo({ url: '/pages/messages/index' }); }
module.exports = { openChat, openMessages };
