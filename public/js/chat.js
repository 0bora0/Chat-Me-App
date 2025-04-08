const socket = io();

socket.on("connect", () => {
  console.log("Свързано със Socket.IO сървъра:", socket.id);
});

socket.on("userList", (users) => {
  const userList = document.getElementById("userList");
  userList.innerHTML = ""; 

  users.forEach((user) => {
    const userItem = document.createElement("li");
    userItem.textContent = user.username;
    userItem.onclick = () => startPrivateChat(user._id, user.username);
    userList.appendChild(userItem);
  });
});

function startPrivateChat(targetUserId, targetUserName) {
  const privateMessageInput = document.getElementById("privateMessageInput");
  privateMessageInput.placeholder = `Чат с ${targetUserName}`;

  document.getElementById("privateMessageForm").onsubmit = (e) => {
    e.preventDefault();
    const messageText = privateMessageInput.value.trim();
    if (messageText) {
      socket.emit("privateMessage", {
        targetUserSocketId: targetUserId, 
        text: messageText
      });
      privateMessageInput.value = "";
    }
  };
}

document.getElementById("messageForm").addEventListener("submit", (e) => {
  e.preventDefault();

  const messageInput = document.getElementById("messageInput");
  const messageText = messageInput.value.trim();

  if (messageText) {
    socket.emit("chatMessage", {
      text: messageText,
      timestamp: new Date()
    });

    messageInput.value = "";
  }
});

socket.on("newMessage", (data) => {
  const messagesList = document.getElementById("messages");
  const messageElement = document.createElement("li");
  messageElement.textContent = `${data.user.username}: ${data.text}`;
  messagesList.appendChild(messageElement);
});

socket.on("privateMessage", (data) => {
  const messagesList = document.getElementById("messages");
  const messageElement = document.createElement("li");
  messageElement.textContent = `(Private) ${data.from}: ${data.text}`;
  messageElement.style.color = "green";  
  messagesList.appendChild(messageElement);
});
