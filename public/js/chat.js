const socket = io();
let currentUser = null;
let activeChats = {};
let currentChatId = 'group'; 

function initializeCurrentUser() {
  const userDataElement = document.getElementById('userData');
  if (userDataElement && userDataElement.dataset.user) {
    try {
      currentUser = JSON.parse(userDataElement.dataset.user);
      console.log(`Текущ потребител: ${currentUser.username}`);
      
      activeChats['group'] = {
        type: 'group',
        messages: []
      };
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

function createMessageElement(message, isPrivate = false) {
  const messageElement = document.createElement('li');
  const isMyMessage = isCurrentUser(message.user?._id || message.fromId);
  
  let messageClass = isMyMessage ? 'my-message' : 'other-message';
  if (isPrivate) messageClass += ' private-message';
  
  messageElement.className = `message ${messageClass}`;
  
  const username = isPrivate 
    ? (isMyMessage ? `(Частно до ${message.to})` : `(Частно от ${message.from})`)
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

function addMessageToChat(chatId, message, isPrivate = false) {
  if (!activeChats[chatId]) {
    activeChats[chatId] = {
      type: isPrivate ? 'private' : 'group',
      messages: []
    };
  }
  
  activeChats[chatId].messages.push(message);
  
  if (chatId === currentChatId) {
    const messagesList = document.getElementById(`${chatId}Messages`);
    if (!messagesList) return;

    const messageElement = createMessageElement(message, isPrivate);
    messagesList.appendChild(messageElement);
    scrollToBottom();
  }
}

function switchChat(chatId) {
  currentChatId = chatId;
  
  document.querySelectorAll('.message-list').forEach(list => {
    list.style.display = 'none';
  });
  
  const currentMessagesList = document.getElementById(`${chatId}Messages`);
  if (currentMessagesList) {
    currentMessagesList.style.display = 'block';
  } else {
    const chatBox = document.querySelector('.chat-box .message-container');
    const newMessagesList = document.createElement('ul');
    newMessagesList.className = 'message-list';
    newMessagesList.id = `${chatId}Messages`;
    chatBox.appendChild(newMessagesList);
    
    if (activeChats[chatId]) {
      activeChats[chatId].messages.forEach(msg => {
        const messageElement = createMessageElement(msg, activeChats[chatId].type === 'private');
        newMessagesList.appendChild(messageElement);
      });
    }
  }

  document.querySelectorAll('.chat-tab').forEach(tab => {
    tab.classList.remove('active');
    if (tab.dataset.tab === chatId) {
      tab.classList.add('active');
    }
  });

  document.getElementById('messageInput').focus();
}

function addChatTab(chatId, chatName) {
  const chatTabs = document.getElementById('chatTabs');

  if (document.querySelector(`.chat-tab[data-tab="${chatId}"]`)) {
    return;
  }
  
  const tab = document.createElement('div');
  tab.className = 'chat-tab';
  tab.dataset.tab = chatId;
  tab.innerHTML = `
    ${chatName}
    <span class="chat-tab-close">
      <i class="fas fa-times"></i>
    </span>
  `;
  
  tab.addEventListener('click', () => switchChat(chatId));

  tab.querySelector('.chat-tab-close').addEventListener('click', (e) => {
    e.stopPropagation();
    closeChatTab(chatId);
  });
  
  chatTabs.appendChild(tab);
  switchChat(chatId);
}

function closeChatTab(chatId) {
  if (chatId === 'group') return; 

  const tab = document.querySelector(`.chat-tab[data-tab="${chatId}"]`);
  if (tab) tab.remove();

  delete activeChats[chatId];

  if (chatId === currentChatId) {
    switchChat('group');
  }
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

  document.querySelectorAll('.user-item').forEach(item => {
    item.addEventListener('click', () => {
      const userId = item.dataset.userId;
      const username = item.querySelector('.user-name').textContent;

      const chatId = `private_${userId}`;
      
      addChatTab(chatId, username);

      document.querySelectorAll('.user-item').forEach(i => {
        i.classList.remove('active');
      });
      item.classList.add('active');
    });
  });
  
  document.getElementById('messageForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const messageInput = document.getElementById('messageInput');
    const messageText = messageInput?.value.trim();

    if (messageText) {
      if (currentChatId === 'group') {
        socket.emit('chatMessage', {
          text: messageText,
          timestamp: new Date()
        });
      } else {
        const targetUserId = currentChatId.split('_')[1];
        socket.emit('privateMessage', {
          targetUserId: targetUserId,
          text: messageText
        });
      }
      messageInput.value = '';
    }
  });
  
  socket.on('onlineUsers', (users) => {
    console.log('Online users:', users);
  });
  
  socket.on('userStatusUpdate', (onlineUserIds) => {
    updateUserStatus(onlineUserIds);
  });
  
  socket.on('messageHistory', (messages) => {
    messages.forEach(message => {
      addMessageToChat('group', message);
    });
  });
  
  socket.on('newMessage', (message) => {
    addMessageToChat('group', message);
  });
  
  socket.on('privateMessage', (message) => {
    const chatId = `private_${message.fromId}`;
    addMessageToChat(chatId, {...message, to: currentUser.username}, true);
  });
  
  socket.on('privateMessageSent', (message) => {
    const chatId = `private_${message.toId}`;
    addMessageToChat(chatId, {...message, from: currentUser.username}, true);
  });
});