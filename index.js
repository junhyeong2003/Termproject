const socket = io();

const userListElement = document.getElementById("userList");

const loginForm = document.getElementById("loginForm");
const nicknameInput = document.getElementById("nicknameInput");
const roomSelect = document.getElementById("roomSelect");

const chatArea = document.getElementById("chatArea");
const roomInfo = document.getElementById("roomInfo");

const form = document.getElementById("form");
const input = document.getElementById("input");
const messages = document.getElementById("messages");

const fileInput = document.getElementById("fileInput");
const fileButton = document.getElementById("fileButton");

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
  socket.room = data.room; 
  //서버가 보내준 socketId 저장 (파일 업로드 인증용)
  socket.id = data.socketId; 
  
  loginForm.style.display = 'none';
  chatArea.style.display = 'block';
  roomInfo.textContent = `현재 방: ${data.room} (당신의 닉네임: ${data.nickname})`;
});

socket.on("ready to load messages", (data) => {
    socket.emit("get past messages", { room: data.room });
});

socket.on("past messages", (messages) => {
    messages.forEach(msg => {
        // 과거 메시지에 file_url이 있으면 파일 메시지로 처리
        if (msg.file_url) {
             appendFileMessage(msg);
        } else {
             appendMessage(msg.user_nickname, msg.message_text);
        }
    });
    
    appendNotification("과거 대화 기록을 불러왔습니다.");
    messages.scrollTop = messages.scrollHeight;
});

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const msg = input.value.trim();
  
  if (msg) {
    socket.emit("chat message", msg);
    
    if (!msg.startsWith('/w ')) {
        appendMessage(socket.nickname, msg); 
    }
    
    input.value = "";
  }
});

fileButton.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
        uploadFile(fileInput.files[0]);
    }
});

socket.on("user list", (users) => {
  userListElement.innerHTML = ''; 

  const titleLi = document.createElement("li");
  titleLi.textContent = `-- 현재 접속 (${users.length}명) --`;
  userListElement.appendChild(titleLi);
  
  users.forEach(nickname => {
    const li = document.createElement("li");
    li.textContent = nickname;

    if(nickname === socket.nickname) {
      li.style.fontWeight = 'bold';
    }
    userListElement.appendChild(li);
  });
});

socket.on("chat message", (data) => { 
  if (data.ispersonal) {
    appendpersonalMessage(data);
  } else if (data.file_url) { // 서버의 DB 컬럼명과 일치하는 'file_url'로 확인
    appendFileMessage(data); 
  } else {
    appendMessage(data.nickname, data.message);
  }
});

socket.on("notification", (msg) => {
  appendNotification(msg);
});

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

function appendpersonalMessage(data) {
  const li = document.createElement("li");
  li.classList.add("personal"); 
  
  let textContent = '';
  
  if (data.type === 'sent_personal') {
      textContent = `(나 → ${data.targetNickname}): ${data.message}`;
      li.classList.add("sent"); 
  } else if (data.type === 'received_personal') {
      textContent = `(${data.sender}님의 귓속말): ${data.message}`;
      li.classList.add("received"); 
  }
  
  li.innerHTML = `<em>${textContent}</em>`; 
  messages.appendChild(li);
  messages.scrollTop = messages.scrollHeight;
}

function uploadFile(file) {
    const formData = new FormData();
    //  파일 데이터와 함께 인증을 위한 socket.id를 전송
    formData.append('chatFile', file); 
    formData.append('socketId', socket.id); 

    appendNotification(`파일 업로드 시작: ${file.name}...`);
    
    // HTTP POST 요청으로 서버 /upload 엔드포인트에 파일 전송
    fetch('/upload', {
        method: 'POST',
        body: formData
    })
    .then(response => {
        if (response.status === 401) {
             throw new Error('인증 실패: 로그인이 유효하지 않습니다.');
        }
        if (!response.ok) {
            // 서버에서 보낸 에러 메시지를 확인해서 사용자에게 더 자세한 정보를 제공할 수 있음
            return response.text().then(text => { throw new Error(text) });
        }
        return response.json();
    })
    .then(data => {
        if (data.fileUrl) {
            appendNotification(`업로드 완료: ${data.originalName}`);
        }
    })
    .catch(error => {
        console.error('파일 업로드 실패:', error);
        // 서버의 에러 메시지를 사용자에게 표시
        appendNotification(`파일 업로드 실패: ${error.message || '알 수 없는 오류'}`);
    })
    .finally(() => {
        fileInput.value = ''; // 파일 입력 필드 초기화
    });
}

function appendFileMessage(data) {
    const li = document.createElement("li");
    let content = `<strong>${data.nickname || data.user_nickname}</strong>: `;
    
    // DB에서 오는 데이터는 file_url, Socket.IO에서 오는 데이터는 fileUrl일 수 있으므로 통합 처리
    const url = data.file_url || data.fileUrl; 
    
    if (data.isImage || data.is_image) {
        // 이미지일 경우 <img> 태그로 미리보기 생성
        content += `<a href="${url}" target="_blank">
                       [이미지] <br>
                       <img src="${url}" alt="${data.message}" class="chat-image">
                    </a>`;
    } else {
        // 기타 파일일 경우 다운로드 링크 생성
        content += `<a href="${url}" target="_blank" download class="file-download">
                       ⬇️ ${data.message}
                    </a>`;
    }
    
    li.innerHTML = content;
    messages.appendChild(li);
    messages.scrollTop = messages.scrollHeight;
}
