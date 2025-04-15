const socket = io();
let currentUser = null;

function initializeCurrentUser() {
  try {
    const userDataElement = document.getElementById('userData');
    if (!userDataElement?.dataset.user) {
      window.location.href = '/login';
      return;
    }
    
    currentUser = JSON.parse(userDataElement.dataset.user);
    console.log(`Current user: ${currentUser.username}`);

    socket.emit('requestMessages');
    socket.emit('requestOnlineUsers');
  } catch (e) {
    console.error('Error parsing user data:', e);
    window.location.href = '/login';
  }
}

function createMessageElement(message) {
  const messageElement = document.createElement('li');
  const isMyMessage = message.user?._id === currentUser._id;
  
  messageElement.className = `message ${isMyMessage ? 'my-message' : 'other-message'}`;
  
  const avatarColor = stringToColor(message.user?.username || '');
  
  messageElement.innerHTML = `
    <div class="message-header">
      ${!isMyMessage ? `<div class="user-avatar" style="background: ${avatarColor}">${message.user?.username?.charAt(0).toUpperCase() || '?'}</div>` : ''}
      <div class="message-info">
        <div class="message-username">${message.user?.username || 'Unknown'}</div>
        <div class="message-time">
          ${new Date(message.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
        </div>
      </div>
    </div>
    <div class="message-content">${message.text}</div>
  `;

  return messageElement;
}

function addMessageToChat(message) {
  const messagesList = document.getElementById('messagesList') || createMessagesList();
  messagesList.appendChild(createMessageElement(message));
  scrollToBottom();
}

function createMessagesList() {
  const chatBox = document.querySelector('.chat-box');
  const messagesList = document.createElement('ul');
  messagesList.className = 'message-list';
  messagesList.id = 'messagesList';
  chatBox.appendChild(messagesList);
  return messagesList;
}

function scrollToBottom() {
  const chatBox = document.querySelector('.chat-box');
  if (chatBox) {
    chatBox.scrollTop = chatBox.scrollHeight;
  }
}

function updateOnlineStatus(onlineUsers) {
  const onlineUserIds = onlineUsers.map(u => u.id);
  
  document.querySelectorAll('.user-item').forEach(item => {
    const userId = item.dataset.userId;
    const isOnline = onlineUserIds.includes(userId);
    
    const statusIndicator = item.querySelector('.status-indicator');
    const statusText = item.querySelector('.status-text');
    
    statusIndicator.classList.toggle('online', isOnline);
    statusIndicator.classList.toggle('offline', !isOnline);
    statusText.textContent = isOnline ? 'онлайн' : 'офлайн';
  });
  
  document.getElementById('onlineCount').textContent = ` ${onlineUsers.length-1} онлайн`;
}

function stringToColor(str) {
  if (!str) return '#999';
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 70%, 60%)`;
}

document.addEventListener('DOMContentLoaded', () => {
  initializeCurrentUser();

  socket.on('messageHistory', (messages) => {
    const messagesList = document.getElementById('messagesList') || createMessagesList();
    messages.forEach(message => {
      messagesList.appendChild(createMessageElement(message));
    });
    scrollToBottom();
  });

  socket.on('newGroupMessage', (message) => {
    addMessageToChat(message);
  });

  socket.on('onlineUsersUpdate', (onlineUsers) => {
    updateOnlineStatus(onlineUsers);
  });

  document.getElementById('messageForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    if (!text) return;

    socket.emit('groupMessage', text);
    input.value = '';
    input.focus();
  });

  document.querySelector('.search-input')?.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    document.querySelectorAll('.user-item').forEach(item => {
      const username = item.querySelector('.user-name').textContent.toLowerCase();
      item.style.display = username.includes(searchTerm) ? 'flex' : 'none';
    });
  });

  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    window.location.href = '/logout';
  });
});