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
  
  if (isPrivate) {
    messageElement.className = isSent ? 'my-message private-message' : 'other-message private-message';
  } else {
    messageElement.className = isMyMessage ? 'my-message' : 'other-message';
  }

  const username = isPrivate 
    ? (isSent ? `(Частно до ${message.to})` : `(Частно от ${message.from})`)
    : message.user?.username;

  messageElement.innerHTML = `
    <div class="message-username">${username}</div>
    ${message.text}
    <span class="message-time">${message.timestamp}</span>
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

document.addEventListener('DOMContentLoaded', () => {
  initializeCurrentUser();
  
  socket.on('onlineUsers', (users) => {
    const onlineUsersList = document.getElementById('onlineUsers');
    if (!onlineUsersList) return;
    
    onlineUsersList.innerHTML = '';
    
    users.forEach(user => {
      if (user.id !== currentUser._id) {
        const userItem = document.createElement('li');
        userItem.className = 'user-item';
        userItem.innerHTML = `
          <span class="user-status online"></span>
          <span>${user.username}</span>
        `;
        
        userItem.addEventListener('click', () => {
          document.querySelectorAll('.user-item').forEach(item => {
            item.classList.remove('active');
          });
          
          userItem.classList.add('active');
          startPrivateChat(user.id, user.username);
        });
        
        onlineUsersList.appendChild(userItem);
      }
    });
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

  document.getElementById('privateMessageForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const privateMessageInput = document.getElementById('privateMessageInput');
    const messageText = privateMessageInput?.value.trim();

    if (messageText && privateChatUserId) {
      socket.emit('privateMessage', {
        targetUserId: privateChatUserId,
        text: messageText
      });
      privateMessageInput.value = '';
    }
  });
});

function startPrivateChat(userId, username) {
  privateChatUserId = userId;
  const privateForm = document.getElementById('privateMessageForm');
  const privateChatWith = document.getElementById('privateChatWith');
  
  if (privateForm && privateChatWith) {
    privateForm.classList.remove('d-none');
    privateChatWith.textContent = username;
    document.getElementById('privateMessageInput').focus();
  }
}