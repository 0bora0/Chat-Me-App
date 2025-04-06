const socket = io();
document.getElementById("messageForm").addEventListener("submit", (e) => {
  e.preventDefault();
  
  const messageInput = document.getElementById("messageInput");
  const messageText = messageInput.value.trim();
  
  if (messageText) {
    socket.emit("chat message", {
      text: messageText,
      timestamp: new Date().toLocaleTimeString()
    });
    
    messageInput.value = "";
  }
});
socket.on("chat message", (msg) => {
  const messagesList = document.getElementById("messages");
  const messageItem = document.createElement("li");
  messageItem.style.margin = "8px 0";
  messageItem.style.padding = "8px";
  messageItem.style.backgroundColor = "#f0f0f0";
  messageItem.style.borderRadius = "4px";
  messageItem.textContent = `[${msg.timestamp}] ${msg.text}`;
  messagesList.appendChild(messageItem);
  messagesList.scrollTop = messagesList.scrollHeight;
});