const socket = io();
let currentUser = null;
let activeChats = {};
let currentChatId = 'group';

function initializeCurrentUser() {
  try {
    const userDataElement = document.getElementById('userData');
    if (userDataElement && userDataElement.dataset.user) {
      currentUser = JSON.parse(userDataElement.dataset.user);
      console.log(`Текущ потребител: ${currentUser.username}`);
      
      activeChats['group'] = {
        type: 'group',
        messages: []
      };
    } else {
      console.error('Липсват потребителски данни - пренасочване към вход');
      window.location.href = '/login';
    }
  } catch (e) {
    console.error('Грешка при парсване на потребителски данни:', e);
    window.location.href = '/login';
  }
}
function showErrorAlert(message) {
  Swal.fire({
    icon: 'error',
    title: 'Грешка',
    text: message,
    confirmButtonText: 'OK'
  });
}

function initializeCurrentUser() {
  try {
    const userDataElement = document.getElementById('userData');
    if (userDataElement && userDataElement.dataset.user) {
      currentUser = JSON.parse(userDataElement.dataset.user);
      
      activeChats['group'] = {
        type: 'group',
        messages: []
      };
    } else {
      showErrorAlert('Липсват потребителски данни');
      window.location.href = '/login';
    }
  } catch (e) {
    showErrorAlert('Грешка при зареждане на потребителски данни');
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
    ? (isMyMessage ? `(Съобщение до: ${message.to})` : `Съобщение от: ${message.from}`)
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
  
  const isDuplicate = activeChats[chatId].messages.some(
    m => m.text === message.text && 
         m.timestamp === message.timestamp && 
         (m.user?._id === message.user?._id || m.fromId === message.fromId)
  );
  
  if (!isDuplicate) {
    activeChats[chatId].messages.push(message);
    
    if (chatId === currentChatId) {
      const messagesList = document.getElementById(`${chatId}Messages`);
      if (!messagesList) return;

      const messageElement = createMessageElement(message, isPrivate);
      messagesList.appendChild(messageElement);
      scrollToBottom();
    }
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

  // Update active tab
  document.querySelectorAll('.chat-tab').forEach(tab => {
    tab.classList.remove('active');
    if (tab.dataset.tab === chatId) {
      tab.classList.add('active');
    }
  });

  // Focus input
  document.getElementById('messageInput')?.focus();
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
    chatBox.scrollTo({
      top: chatBox.scrollHeight,
      behavior: 'smooth'
    });
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

async function loadMessageHistory() {
  try {
    const response = await fetch('/api/message-history');
    if (!response.ok) throw new Error('Network response was not ok');
    
    const messages = await response.json();
    const chats = {};
    
    messages.forEach(message => {
      let chatId;
      
      if (!message.isPrivate) {
        chatId = 'group';
      } else {
        const otherUserId = isCurrentUser(message.user._id) 
          ? message.toUser?._id 
          : message.user._id;
        chatId = `private_${otherUserId}`;
      }
      
      if (!chats[chatId]) {
        chats[chatId] = {
          type: chatId === 'group' ? 'group' : 'private',
          messages: []
        };
      }
      
      chats[chatId].messages.push(message);
    });
    
    Object.keys(chats).forEach(chatId => {
      activeChats[chatId] = chats[chatId];
      
      if (chatId !== 'group') {
        const otherUser = chats[chatId].messages.find(m => 
          m.user._id !== currentUser._id
        )?.user;
        
        if (otherUser) {
          addChatTab(chatId, otherUser.username);
        }
      }
      
      chats[chatId].messages.forEach(message => {
        addMessageToChat(
          chatId, 
          {
            text: message.text,
            timestamp: new Date(message.timestamp).toLocaleTimeString(),
            user: message.user,
            from: message.user?.username,
            fromId: message.user?._id,
            to: message.toUser?.username,
            toId: message.toUser?._id
          },
          message.isPrivate
        );
      });
    });
    
  } catch (error) {
    console.error('Грешка при зареждане на история:', error);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initializeCurrentUser();
  loadMessageHistory();

  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    window.location.href = '/logout';
  });
  
  document.querySelector('.search-input')?.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const userItems = document.querySelectorAll('.user-item');
    
    userItems.forEach(item => {
      const username = item.querySelector('.user-name').textContent.toLowerCase();
      item.style.display = username.includes(searchTerm) ? 'flex' : 'none';
    });
  });

  document.querySelectorAll('.user-item').forEach(item => {
    item.addEventListener('click', () => {
      const userId = item.dataset.userId;
      const username = item.querySelector('.user-name').textContent;
      const chatId = `private_${userId}`;
      
      addChatTab(chatId, username);

      // Update active user
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
          text: messageText
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
    addMessageToChat(chatId, {
      ...message,
      to: currentUser.username
    }, true);
  });
  
  socket.on('privateMessageSent', (message) => {
    const chatId = `private_${message.toId}`;
    addMessageToChat(chatId, {
      ...message,
      from: currentUser.username
    }, true);
  });
});