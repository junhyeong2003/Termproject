const socket = io();

// [새로운 요소] 로그인 관련 DOM 요소
const loginForm = document.getElementById("loginForm");
const nicknameInput = document.getElementById("nicknameInput");
const roomSelect = document.getElementById("roomSelect");

// [새로운 요소] 채팅 영역 관련 DOM 요소
const chatArea = document.getElementById("chatArea");
const roomInfo = document.getElementById("roomInfo");

// [기존 요소] 메시지 전송 관련 DOM 요소
const form = document.getElementById("form");
const input = document.getElementById("input");
const messages = document.getElementById("messages");

// ----------------------------------------
// 1. 닉네임 & 방 입장 로직
// ----------------------------------------
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

// ----------------------------------------
// 2. [추가] 과거 메시지 로드 요청 및 수신 로직
// ----------------------------------------

// 서버로부터 메시지 로드 준비 완료 이벤트를 받으면 요청
socket.on("ready to load messages", (data) => {
    // 서버에 과거 메시지 조회를 요청합니다.
    socket.emit("get past messages", { room: data.room });
});

// 💡 [추가] 서버로부터 과거 메시지 목록을 수신
socket.on("past messages", (messages) => {
    messages.forEach(msg => {
        // DB에서 받은 user_nickname, message_text 필드 사용
        appendMessage(msg.user_nickname, msg.message_text); 
    });
    
    appendNotification("✅ 과거 대화 기록을 불러왔습니다.");
});

// ----------------------------------------
// 3. 메시지 전송 로직
// ----------------------------------------
form.addEventListener("submit", (e) => {
  e.preventDefault();
  const msg = input.value.trim();
  
  if (msg) {
    socket.emit("chat message", msg);
    // [유지] 자기 메시지는 로컬에서 즉시 출력
    appendMessage(socket.nickname, msg); 
    
    input.value = "";
  }
});

// 4. [수정] 메시지 수신 로직 (오타 및 변수 문제 해결)
socket.on("chat message", (data) => { 
  // 💡 [수정] 서버에서 보낸 객체 {nickname, message}를 받음
  // 💡 [수정] appendMessages(nickname, msg) 오타 대신 appendMessage(data.nickname, data.message) 사용
  appendMessage(data.nickname, data.message);
});

socket.on("notification", (msg) => {
  appendNotification(msg);
});

// ----------------------------------------
// 5. [기존] 헬퍼 함수
// ----------------------------------------
function appendMessage(nickname, message) {
  const li = document.createElement("li");
  li.innerHTML = `<strong>${nickname}</strong>: ${message}`; 
  messages.appendChild(li);
  messages.scrollTop = messages.scrollHeight; 
}

function appendNotification(msg) {
  const li = document.createElement("li");
  li.textContent = msg;
  li.classList.add("notification"); 
  messages.appendChild(li);
  messages.scrollTop = messages.scrollHeight; 
}