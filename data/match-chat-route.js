// 点击时重新读取状态，避免招募期间已被其他页面确认组局。
module.exports = async function resolveMatchChatRoute(api, matchId) {
  if (!matchId) throw new Error('约局信息已刷新，请重试');
  const match = await api.getMatch(matchId);
  if (match.status === 'matched') {
    const conversation = await api.getLatestMatchConversation(matchId);
    if (!conversation || !conversation.id || !conversation.won) throw new Error('暂时无法打开组局聊天，请刷新后重试');
    return `/pages/chat/index?id=${encodeURIComponent(conversation.id)}`;
  }
  return `/pages/match-chats/index?matchId=${encodeURIComponent(matchId)}`;
};
