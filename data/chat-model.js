function conversationState(conversation, userId) {
  const isHost = Number(conversation.hostUserId) === Number(userId);
  const mineConfirmed = Boolean(isHost ? conversation.hostConfirmed : conversation.guestConfirmed);
  const peerConfirmed = Boolean(isHost ? conversation.guestConfirmed : conversation.hostConfirmed);
  const count = Number(Boolean(conversation.hostConfirmed)) + Number(Boolean(conversation.guestConfirmed));
  const cancelled = conversation.status === 'cancelled';
  const lost = conversation.status === 'matched' && !conversation.won;
  return {
    count, mineConfirmed,
    closed: cancelled || lost,
    canConfirm: conversation.status === 'recruiting' && !mineConfirmed,
    hint: cancelled ? '约局已取消，聊天记录仍保留' : lost ? '发起人已与其他球友组局，记录仍可查看'
      : conversation.won ? '双方已确认，可查看约局详情' : mineConfirmed ? '你已确认，等待对方'
        : peerConfirmed ? '对方已确认，聊清楚后再确认' : '先聊清楚，再确认组局',
    statusLabel: cancelled ? '已取消' : lost ? '本次未组局' : conversation.won ? '已组局' : '沟通中'
  };
}

// Sending a message must not advance the fetch cursor: unseen peer messages can precede its ID.
function mergeMessages(current, incoming) {
  const items = new Map();
  current.concat(incoming).forEach(item => items.set(item.id ? `server-${item.id}` : item.clientId, item));
  return Array.from(items.values()).sort((a, b) => a.id && b.id ? Number(a.id) - Number(b.id)
    : new Date(a.createdAt) - new Date(b.createdAt));
}
module.exports = { conversationState, mergeMessages };
