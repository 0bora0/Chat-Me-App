const socket = io();
let currentUser = null;
let privateChatUserId = null;

function initializeCurrentUser() {
  const userDataElement = document.getElementById('userData');
  if (userDataElement && userDataElement.dataset.user) {
    try {
      currentUser = JSON.parse(userDataElement.dataset.user);
      console.log(`Текущ потребител: ${currentUser.username}`);
    } catch (e) {
      console.error('Грешка при парсване на потребителски данни:', e);
      window.location.href = '/login';
    }
  } else {
    console.error('Липсват потребителски данни - пренасочване към вход');
    window.location.href = '/login';
  }
}

function isCurrentUser(userId) {
  return currentUser && currentUser._id && userId === currentUser._id;
}

function createMessageElement(message, isPrivate = false, isSent = false) {
  const messageElement = document.createElement('li');
  const isMyMessage = isCurrentUser(message.user?._id || message.fromId);
  
  let messageClass = isMyMessage ? 'my-message' : 'other-message';
  if (isPrivate) messageClass += ' private-message';
  
  messageElement.className = `message ${messageClass}`;
  
  const username = isPrivate 
    ? (isSent ? `(Частно до ${message.to})` : `(Частно от ${message.from})`)
    : message.user?.username;

  messageElement.innerHTML = `
    <div class="message-header">
      <div class="message-username">${username}</div>
      <div class="message-time">${message.timestamp}</div>
    </div>
    <div class="message-content">${message.text}</div>
  `;

  return messageElement;
}

function addMessageToChat(message, isPrivate = false, isSent = false) {
  const messagesList = document.getElementById('messages');
  if (!messagesList) return;

  const messageElement = createMessageElement(message, isPrivate, isSent);
  messagesList.appendChild(messageElement);
  scrollToBottom();
}

function scrollToBottom() {
  const chatBox = document.querySelector('.chat-box');
  if (chatBox) {
    chatBox.scrollTop = chatBox.scrollHeight;
  }
}

function updateUserStatus(onlineUserIds) {
  const userItems = document.querySelectorAll('.user-item');
  userItems.forEach(item => {
    const userId = item.dataset.userId;
    const statusIndicator = item.querySelector('.user-status');
    const statusText = item.querySelector('.user-status-text');
    
    if (onlineUserIds.includes(userId)) {
      statusIndicator.classList.add('online');
      statusIndicator.classList.remove('offline');
      statusText.textContent = 'онлайн';
    } else {
      statusIndicator.classList.add('offline');
      statusIndicator.classList.remove('online');
      statusText.textContent = 'офлайн';
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initializeCurrentUser();
  
  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    window.location.href = '/logout';
  });
  
  document.querySelector('.search-input')?.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const userItems = document.querySelectorAll('.user-item');
    
    userItems.forEach(item => {
      const username = item.querySelector('.user-name').textContent.toLowerCase();
      if (username.includes(searchTerm)) {
        item.style.display = 'flex';
      } else {
        item.style.display = 'none';
      }
    });
  });
  
  socket.on('onlineUsers', (users) => {
    console.log('Online users:', users);
  });
  
  socket.on('userStatusUpdate', (onlineUserIds) => {
    updateUserStatus(onlineUserIds);
  });
  
  socket.on('messageHistory', (messages) => {
    const messagesList = document.getElementById('messages');
    if (!messagesList) return;
    
    messagesList.innerHTML = '';
    
    messages.forEach(message => {
      addMessageToChat(message);
    });
  });
  
  socket.on('newMessage', (message) => {
    addMessageToChat(message);
  });
  
  socket.on('privateMessage', (message) => {
    addMessageToChat(message, true);
  });
  
  socket.on('privateMessageSent', (message) => {
    addMessageToChat(message, true, true);
  });
  
  document.getElementById('messageForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const messageInput = document.getElementById('messageInput');
    const messageText = messageInput?.value.trim();

    if (messageText) {
      socket.emit('chatMessage', {
        text: messageText,
        timestamp: new Date()
      });
      messageInput.value = '';
    }
  });
  
  document.querySelectorAll('.user-item').forEach(item => {
    item.addEventListener('click', () => {
      const userId = item.dataset.userId;
      const username = item.querySelector('.user-name').textContent;
      
      document.querySelectorAll('.user-item').forEach(i => {
        i.classList.remove('active');
      });
      item.classList.add('active');
      
      console.log(`Избран потребител: ${username} (${userId})`);
    });
  });
});