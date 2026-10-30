function conversationState(conversation, userId, match = {}) {
  const isHost = Number(conversation.hostUserId) === Number(userId);
  const mineConfirmed = Boolean(isHost ? conversation.hostConfirmed : conversation.guestConfirmed);
  const peerConfirmed = Boolean(isHost ? conversation.guestConfirmed : conversation.hostConfirmed);
  const count = Number(Boolean(conversation.hostConfirmed)) + Number(Boolean(conversation.guestConfirmed));
  const cancelled = conversation.status === 'cancelled';
  const lost = conversation.status === 'matched' && !conversation.won;
  const matchedAt = conversation.matchedAt || match.matchedAt;
  const startsAt = conversation.startsAt || match.startsAt;
  const displayEnded = Boolean(conversation.displayEnded || match.displayEnded) || conversation.status === 'matched' && Boolean(matchedAt) && Date.now() >= new Date(matchedAt).getTime() + 24 * 60 * 60 * 1000
    || conversation.status === 'recruiting' && Boolean(startsAt) && Date.now() >= new Date(startsAt).getTime() + 30 * 60 * 1000;
  const ended = displayEnded || cancelled || lost;
  return {
    count, mineConfirmed,
    showInvite: !ended && peerConfirmed && !mineConfirmed && conversation.status === 'recruiting',
    closed: ended,
    canConfirm: !displayEnded && conversation.status === 'recruiting' && !mineConfirmed,
    hint: cancelled ? '本场约球已取消，聊天记录仍可查看' : lost ? '发起人已与其他球友组局，本次未能组局，聊天记录仍可查看'
      : displayEnded && conversation.status === 'matched' && conversation.won ? '本场已组局，聊天记录仍可查看'
      : displayEnded ? '本场招募已结束，未能组局，聊天记录仍可查看'
      : conversation.won ? '双方已确认，可前往约局详情联系对方' : mineConfirmed ? '你已确认，等待对方'
      : peerConfirmed ? '对方已确认，聊清楚后再确认' : '先聊清楚时间和安排；确定参加后，点击确认组局。',
    statusLabel: cancelled ? '已取消' : lost ? '本次未组局' : conversation.status === 'matched' && conversation.won ? '已组局' : displayEnded ? '招募结束' : '招募中'
  };
}

// Sending a message must not advance the fetch cursor: unseen peer messages can precede its ID.
function mergeMessages(current, incoming) {
  const items = new Map();
  current.concat(incoming).forEach(item => {
    // 服务端回传相同客户端标识时，用已送达消息替换待确认消息。
    const key = item.clientId ? `client-${item.senderId}-${item.clientId}` : `server-${item.id}`;
    const old = items.get(key);
    if (!old || item.id || !old.id) items.set(key, item);
  });
  return Array.from(items.values()).sort((a, b) => a.id && b.id ? Number(a.id) - Number(b.id)
    : new Date(a.createdAt) - new Date(b.createdAt));
}
module.exports = { conversationState, mergeMessages };
