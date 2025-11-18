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

const typingNotificationElement = document.getElementById("typingNotification"); 
let isTyping = false;
let typingTimeout = undefined;
const typingUsers = {}; // { nickname: true, ... }

function updateTypingNotification() {
    const nicknames = Object.keys(typingUsers); //현재 입력중인 사용자의 이름만 배열로 저장함
    if (nicknames.length > 0) {
        let text = nicknames.join(', '); //배열을 ,로 구분한 한 문장으로 만듦
        if (nicknames.length > 1) { //여러 명이 입력 중일때 구분
            text += '님들이';
        } else {
            text += '님이';
        }
        typingNotificationElement.textContent = `${text} 메시지를 입력 중입니다...`;
        typingNotificationElement.style.display = 'block';
    } else {
        typingNotificationElement.textContent = '';
        typingNotificationElement.style.display = 'none';
    }
    messages.scrollTop = messages.scrollHeight; 
}

input.addEventListener('input', () => {
    if (!socket.nickname || !socket.room) return; // 로그인 안됐으면 무시

    if (!isTyping) { //방금 입력 시작했으면
        isTyping = true;
        socket.emit("typing"); // 서버로 입력 시작 알림
    }
    
    if (typingTimeout) { // 사용자가 계속 입력중이면 타이머 초기화
        clearTimeout(typingTimeout);
    }

    typingTimeout = setTimeout(() => {
        isTyping = false;
        socket.emit("stop typing"); // 3초 후에 서버로 입력 중지 알림
    }, 3000);
});

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

socket.on("past messages", (rows) => {
    rows.forEach(msg => {
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
  
  if(isTyping){
      isTyping = false;
      clearTimeout(typingTimeout);
      socket.emit("stop typing"); // 메시지 전송 후, 입력 중 상태를 즉시 종료한다
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
    
    if (nickname !== socket.nickname) {
        li.style.cursor = 'pointer'; // 귓속말 가능함을 시각적으로 표시
        li.title = `우클릭하여 ${nickname}님에게 귓속말 보내기`;

        li.addEventListener('contextmenu', (e) => { //contextmenu는 마우스 우클릭을 할 때 발생하는 이벤트
            e.preventDefault(); //작성 안 하면 뒤로,새로고침 나타남
            
            input.value = `/w ${nickname} `; // 입력 필드에 귓속말 명령어 자동 채우기
            input.focus(); //바로 메시지 입력하도록 입력창에 커서 강제이동
        });
    }
    
    userListElement.appendChild(li);
  });
});

socket.on("typing notification", (data) => {
    typingUsers[data.nickname] = true; // 사용자 입력 시작하면 알림
    updateTypingNotification();
});

socket.on("stop typing notification", (data) => {
    delete typingUsers[data.nickname]; //입력 끝나면 객체에서 삭제
    updateTypingNotification();
});

socket.on("chat message", (data) => { 
  if (data.nickname && typingUsers[data.nickname]) {
      delete typingUsers[data.nickname]; // 메시지 수신 시, 해당 사용자가 입력 중 목록에 있었다면 제거
      updateTypingNotification();
  }
    
  if (data.ispersonal) {
    appendpersonalMessage(data);
  } else if (data.file_url) {
    appendFileMessage(data); 
  } else {
    appendMessage(data.nickname, data.message);
  }
});

socket.on("notification", (msg) => {
  appendNotification(msg);
});

/*------수정---------*/
function appendMessage(nickname, message) {
  const li = document.createElement("li");
  // 1. 타임스탬프 생성 (현재 시각 사용)
  const now = new Date();
  const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // 2. 메시지 내용과 타임스탬프를 HTML에 추가
  li.innerHTML = `<strong>${nickname}</strong>: ${message} <span class="timestamp">${timeString}</span>`; 
  
  // 3. 내 메시지와 상대방 메시지 구분 클래스 추가
  if (nickname === socket.nickname) {
    li.classList.add("my-message");
  } else {
    li.classList.add("other-message");
  }
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
      textContent = `(${data.targetNickname}님에게 보낸 메시지): ${data.message}`;
      li.classList.add("sent"); 
  } else if (data.type === 'received_personal') {
      textContent = `(${data.sender}님이 메시지를 보냈습니다.): ${data.message}`;
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

/*-------------수정------------*/
function appendFileMessage(data) {
    const li = document.createElement("li");
    let content = `<strong>${data.nickname || data.user_nickname}</strong>: `;
    
    // 1. 타임스탬프 생성
    const now = new Date(); //date객체 생성
    const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); //시간&분을 2자릿수로 변환
    
    // 2. 내 메시지와 상대방 메시지 구분 클래스 추가
    const messageNickname = data.nickname || data.user_nickname; //메시지 발신자 닉네임과 현재 로그인된 닉네임 비교
    if (messageNickname === socket.nickname) { 
        li.classList.add("my-message");
    } else {
        li.classList.add("other-message");
    }
    
    if (data.isImage || data.is_image) {
      //img태그 사용해서 이미지 미리보기 설정, blank설정으로 url클릭하면 새 탭에서 실행
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
    content += `<span class="timestamp">${timeString}</span>`;
    
    li.innerHTML = content;
    messages.appendChild(li);
    messages.scrollTop = messages.scrollHeight;
}
