const socket = io();

const loginForm = document.getElementById("loginForm");
const nicknameInput = document.getElementById("nicknameInput");
const roomSelect = document.getElementById("roomSelect");

const chatArea = document.getElementById("chatArea");
const roomInfo = document.getElementById("roomInfo");

const form = document.getElementById("form");
const input = document.getElementById("input");
const messages = document.getElementById("messages");

loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const nickname = nicknameInput.value.trim();
  const room = roomSelect.value;
  
  if (nickname) {
    socket.emit("login", { nickname: nickname, room: room });
  }
});

socket.on("login success", (data) => {
  socket.nickname = data.nickname; 
  
  loginForm.style.display = 'none';
  chatArea.style.display = 'block';
  roomInfo.textContent = `현재 방: ${data.room} (당신의 닉네임: ${data.nickname})`;
});

socket.on("ready to load messages", (data) => { //서버에서 신호가 오면, 기록 요청 시작
    socket.emit("get past messages", { room: data.room });
});

socket.on("past messages", (messages) => { //이전 메시지 목록을 배열로 받음
    messages.forEach(msg => {
        appendMessage(msg.user_nickname, msg.message_text);  //하나씩 꺼내서 오래된 메시지 부터 출력한다
    });
    
    appendNotification("과거 대화 기록을 불러왔습니다.");
});

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const msg = input.value.trim();
  
  if (msg) {
    socket.emit("chat message", msg); //입력한 메시지를 서버로 보낸다. 서버는 메시지를 DB에 저장하고, 다른 사용자들에게 브로드캐스팅함
    appendMessage(socket.nickname, msg); //서버가 다른 사용자에게 전파하는 동안 본인 화면에는 메시지를 바로 추가한다.
    
    input.value = ""; //메시지 전송 후, 입력창 리셋
  }
});

socket.on("chat message", (data) => { 
  appendMessage(data.nickname, data.message);
});

socket.on("notification", (msg) => {
  appendNotification(msg);
});

function appendMessage(nickname, message) {
  const li = document.createElement("li");
  li.innerHTML = `<strong>${nickname}</strong>: ${message}`; 
  messages.appendChild(li);
  messages.scrollTop = messages.scrollHeight;  //메시지가 추가 될 때마다 채팅 목록 스크롤을 맨 아래로 내림
}

function appendNotification(msg) {
  const li = document.createElement("li");
  li.textContent = msg;
  li.classList.add("notification"); 
  messages.appendChild(li);
  messages.scrollTop = messages.scrollHeight; 
}
