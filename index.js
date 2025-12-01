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
const themeToggle = document.getElementById("themeToggle");
const reactionContextMenu = document.getElementById("reactionContextMenu");

const replyContextDisplay = document.getElementById("replyContextDisplay");
const replyToNickname = document.getElementById("replyToNickname");
const cancelReply = document.getElementById("cancelReply");
let currentReplyToId = null; // 답글 대상 메시지의 ID
let currentReplyToNickname = null; // 답글 대상의 닉네임

let isTyping = false;
let typingTimeout = undefined;
const typingUsers = {}; 
let currentTargetMessageId = null;

// 채팅창 배경 설정하기
function applyTheme(theme) { //body에 css클래스를 추가or삭제해서 다크모드로 변경됨
    const body = document.body;
    if (theme === 'dark') {
        body.classList.add('dark-mode');
    } else {
        body.classList.remove('dark-mode');
    }
    localStorage.setItem('chatTheme', theme); //다음 접속 시에도 배경 색 유지함
}

document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('chatTheme') || 'light';
    applyTheme(savedTheme);
});

// 배경 버튼 이벤트 리스너
if (themeToggle) { //토글로직 -> 클릭 시 상태변환
    themeToggle.addEventListener('click', () => {
        const currentTheme = document.body.classList.contains('dark-mode') ? 'light' : 'dark';//현재 body태그에 다크모드가 적용됐는지 확인
        applyTheme(currentTheme);
    });
}

function updateTypingNotification() {
    const nicknames = Object.keys(typingUsers);
    if (nicknames.length > 0) {
        let text = nicknames.join(', ');
        if (nicknames.length > 1) {
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

function updateReactionUI(messageLi, emojiCode, count) {
    let reactionArea = messageLi.querySelector('.reaction-container'); //<-클래스를 가진 div찾음
    
    if (!reactionArea) { //반응 없으면 새div찾음
        reactionArea = document.createElement('div');
        reactionArea.className = 'reaction-container';
        messageLi.appendChild(reactionArea);
    }
    
    reactionArea.innerHTML = `
        <span class="reaction-bubble" data-emoji="${emojiCode}">
            ${emojiCode} ${count}
        </span>
    `; //화면에 보이는 ui
}

function appendMessage(nickname, message, messageId, replyToId, repliedNickname, replyText) {
  const li = document.createElement("li");
  if(messageId) {
    li.setAttribute('data-message-id', messageId);
  }
  const now = new Date();
  const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  let replyContextHTML = '';
  if (replyToId && repliedNickname && replyText) {
      // replyText는 원본 메시지 내용을 표시합니다.
      replyContextHTML = `<div class="reply-context">
                            <strong>${repliedNickname}</strong>: ${replyText}
                         </div>`;
  }

  const reactionPlaceholder = messageId ? 
        `<div class="reaction-container" data-message-id="${messageId}"></div>` : '';
  li.innerHTML = `${replyContextHTML}<strong>${nickname}</strong>: ${message} ${reactionPlaceholder} <span class="timestamp">${timeString}</span>`; 

  if (nickname === socket.nickname) {
        li.classList.add("my-message");
    } else {
        li.classList.add("other-message");
    }
    messages.appendChild(li);
    messages.scrollTop = messages.scrollHeight;
}

function appendFileMessage(data, messageId, replyToId, repliedNickname, replyText) {
    const li = document.createElement("li");
    let content = `<strong>${data.nickname || data.user_nickname}</strong>: `;
    
    let replyContextHTML = '';
    if (replyToId && repliedNickname && replyText) {
      replyContextHTML = `<div class="reply-context">
                            <strong>${repliedNickname}</strong>: ${replyText}
                         </div>`;
    }

    if(messageId) {
        li.setAttribute('data-message-id', messageId);
    }

    const url = data.file_url || data.fileUrl; 
    const now = new Date(); 
    const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const messageNickname = data.nickname || data.user_nickname;
    if (messageNickname === socket.nickname) { 
        li.classList.add("my-message");
    } else {
        li.classList.add("other-message");
    }
    
    if (data.isImage || data.is_image) {
        content += `<a href="${url}" target="_blank">
                       [이미지] <br>
                       <img src="${url}" alt="${data.message}" class="chat-image"> 
                    </a>`;
    } else {
        content += `<a href="${url}" target="_blank" download class="file-download">
                       ⬇️ ${data.message}
                    </a>`;
    }
    const reactionPlaceholder = messageId ? 
            `<div class="reaction-container" data-message-id="${messageId}"></div>` : '';

    content += `${reactionPlaceholder} <span class="timestamp">${timeString}</span>`;

    li.innerHTML = `${replyContextHTML} ${content} ${reactionPlaceholder} <span class="timestamp">${timeString}</span>`;
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

document.addEventListener('DOMContentLoaded', () => {
    messages.addEventListener('contextmenu', (e) => { //우클릭 이벤트 감지함
        const messageLi = e.target.closest('#messages > li'); 

        if (messageLi && !messageLi.classList.contains('notification')) {
            e.preventDefault(); //기본 브라우저 메뉴가 안 나오게 고정함
            
            currentTargetMessageId = messageLi.getAttribute('data-message-id');

            const nicknameElement = messageLi.querySelector('strong');
            // 닉네임 다음 노드의 텍스트를 메시지로 간주
            const messageTextNode = nicknameElement ? nicknameElement.nextSibling : null;
            
            const repliedNickname = nicknameElement ? nicknameElement.textContent.trim() : '알 수 없음';
            // 메시지 텍스트를 추출 (파일 메시지 등은 다르게 처리될 수 있음)
            const repliedMessageText = messageTextNode ? messageTextNode.textContent.trim().split('\n')[0].replace(/:\s*$/, '').substring(0, 30) + '...' : '(파일 또는 알림)';
            
            // 메뉴 클릭 시 사용할 임시 데이터 저장
            reactionContextMenu.dataset.repliedNickname = repliedNickname;
            reactionContextMenu.dataset.repliedMessageText = repliedMessageText;

            reactionContextMenu.style.left = `${e.clientX}px`;
            reactionContextMenu.style.top = `${e.clientY}px`;
            reactionContextMenu.style.display = 'flex'; 
        } else {
            reactionContextMenu.style.display = 'none';
        }
    });

    document.addEventListener('click', () => {
        reactionContextMenu.style.display = 'none';
    });

    // [추가] 답글 취소 버튼 이벤트 리스너
    if (cancelReply) {
        cancelReply.addEventListener('click', () => {
            currentReplyToId = null;
            currentReplyToNickname = null;
            replyContextDisplay.style.display = 'none';
        });
    }

    //이모티콘 옵션 클릭 이벤트 리스너
    reactionContextMenu.addEventListener('click', (e) => {
        const option = e.target.closest('.reaction-option, .reply-option');
        if (option && currentTargetMessageId) {
            if (!option.classList.contains('reply-option')) {
                const emojiCode = option.getAttribute('data-emoji');

                // 서버로 반응 이벤트 전송
                socket.emit('react message', {
                    messageId: currentTargetMessageId,
                    emojiCode: emojiCode
                });
            }

            // 2. 답글 달기 처리
            if (option.classList.contains('reply-option')) {
                currentReplyToId = currentTargetMessageId;
                currentReplyToNickname = reactionContextMenu.dataset.repliedNickname;
                const repliedMessageText = reactionContextMenu.dataset.repliedMessageText;

                // 답글 UI 업데이트
                replyToNickname.innerHTML = `<strong>${currentReplyToNickname}</strong>: ${repliedMessageText}`;
                replyContextDisplay.style.display = 'flex'; 
                input.focus();
            }

            reactionContextMenu.style.display = 'none'; 
            currentTargetMessageId = null; // ID는 메뉴가 사라진 후 초기화 
        }
    });
});

// 실시간 반응 업데이트
socket.on('reaction updated', (data) => {
    const { messageId, emojiCode, count } = data; // 서버가 count를 함께 보낸다고 가정
    
    const messageLi = document.querySelector(`li[data-message-id="${messageId}"]`);// data-message-id 속성을 가진 HTML요소를 찾음
    
    if (messageLi) {
        updateReactionUI(messageLi, emojiCode, count); // UI에 실시간으로 적용하는 함수 호출
    }
});

input.addEventListener('input', () => {
    if (!socket.nickname || !socket.room) return;

    if (!isTyping) {
        isTyping = true;
        socket.emit("typing");
    }
    
    if (typingTimeout) {
        clearTimeout(typingTimeout);
    }

    typingTimeout = setTimeout(() => {
        isTyping = false;
        socket.emit("stop typing");
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
  socket.id = data.socketId; 
  socket.profileUrl = data.profileUrl || 'default_url'; // 서버가 보내준 프로필 URL 저장
  
  loginForm.style.display = 'none';
  chatArea.style.display = 'block';
  roomInfo.textContent = `현재 방: ${data.room} (당신의 닉네임: ${data.nickname})`;
});

socket.on("ready to load messages", (data) => {
    socket.emit("get past messages", { room: data.room });
});

socket.on("past messages", (rows) => {
    rows.forEach(msg => {
        const messageId = msg.id;
        if (msg.file_url) {
             appendFileMessage(msg, messageId);
        } else {
             appendMessage(msg.user_nickname, msg.message_text, messageId);
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
      socket.emit("stop typing"); 
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
        li.style.cursor = 'pointer'; 
        li.title = `우클릭하여 ${nickname}님에게 귓속말 보내기`;

        li.addEventListener('contextmenu', (e) => { 
            e.preventDefault();
            
            input.value = `/w ${nickname} `; 
            input.focus(); 
        });
    }
    
    userListElement.appendChild(li);
  });
});

socket.on("typing notification", (data) => {
    typingUsers[data.nickname] = true; 
    updateTypingNotification();
});

socket.on("stop typing notification", (data) => {
    delete typingUsers[data.nickname];
    updateTypingNotification();
});

socket.on("chat message", (data) => { 
  if (data.nickname && typingUsers[data.nickname]) {
      delete typingUsers[data.nickname];
      updateTypingNotification();
  }
    
  if (data.ispersonal) {
    appendpersonalMessage(data);
  } else if (data.file_url) {
    appendFileMessage(data, data.id); 
  } else {
    appendMessage(data.nickname, data.message, data.id);
  }
});

socket.on("notification", (msg) => {
  appendNotification(msg);
});

function uploadFile(file) {
    const formData = new FormData();
    formData.append('chatFile', file); 
    formData.append('socketId', socket.id); 

    appendNotification(`파일 업로드 시작: ${file.name}...`);
    
    fetch('/upload', {
        method: 'POST',
        body: formData
    })
    .then(response => {
        if (response.status === 401) {
             throw new Error('인증 실패: 로그인이 유효하지 않습니다.');
        }
        if (!response.ok) {
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
        appendNotification(`파일 업로드 실패: ${error.message || '알 수 없는 오류'}`);
    })
    .finally(() => {
        fileInput.value = '';
    });
}
