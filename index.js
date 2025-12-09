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

let profileImageInput;
let selectProfileBtn;
let profilePreview;
let isTyping = false;
let typingTimeout = undefined;
const typingUsers = {}; 
let currentTargetMessageId = null;

/* ==========================================================
   공통 유틸: XSS 방지용 HTML escape
========================================================== */
function escapeHTML(str = '') {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/* ==========================================================
   공통 메시지 렌더 함수
   - 텍스트/파일 메시지를 모두 이 함수로 렌더링
========================================================== */
function renderMessageBubble({
    nickname,
    profileUrl,
    isMine,
    messageId,
    replyToId,
    repliedNickname,
    replyText,
    contentHTML
}) {
    const li = document.createElement("li");

    if (messageId) {
        li.dataset.messageId = messageId;
    }

    li.classList.add(isMine ? "my-message" : "other-message");

    const safeProfileUrl = profileUrl || "/images/default_avatar.png";

    const profilePicHtml = `
        <img src="${escapeHTML(safeProfileUrl)}"
             alt="${escapeHTML(nickname)} 프로필"
             class="profile-pic">
    `;

    const now = new Date();
    const timeString = now.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
    });

    let replyContextHTML = "";
    if (replyToId) {
        let cleanedReplyText = replyText || "내용 없음";

        if (repliedNickname && cleanedReplyText.startsWith(repliedNickname + ":")) {
            cleanedReplyText = cleanedReplyText.substring(repliedNickname.length + 1).trim();
        }

        replyContextHTML = `
            <div class="reply-context">
                <strong>${escapeHTML(repliedNickname || "원문")}</strong>:
                ${escapeHTML(cleanedReplyText)}
            </div>
        `;
    }

    // li 내부 HTML 구조 생성
    li.innerHTML = `
        <div class="profile-container">
            ${profilePicHtml}
        </div>
        <div class="message-area">
            <span class="nickname-text"><strong>${escapeHTML(nickname)}</strong></span>
            ${replyContextHTML}
            <div class="main-content-wrapper">
                ${contentHTML}
            </div>
            <span class="timestamp-line">${escapeHTML(timeString)}</span>
        </div>
    `;

    // ⭐ reaction-container를 DOM으로 생성해서 main-content-wrapper 밑에 붙임
    if (messageId) {
        const reactionContainer = document.createElement("div");
        reactionContainer.classList.add("reaction-container");
        reactionContainer.dataset.messageId = messageId;

        const wrapper = li.querySelector(".main-content-wrapper");
        wrapper.appendChild(reactionContainer);
    }

    return li;
}

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

/* ==========================================================
   반응 UI 업데이트
   - reaction-container는 main-content-wrapper 안에 위치
========================================================== */
function updateReactionUI(messageLi, emojiCode, count) {
    let wrapper = messageLi.querySelector('.main-content-wrapper');
    if (!wrapper) wrapper = messageLi;  

    let reactionArea = wrapper.querySelector('.reaction-container');
    
    if (!reactionArea) {
        reactionArea = document.createElement('div');
        reactionArea.className = 'reaction-container';
        wrapper.appendChild(reactionArea);
    }
    
    reactionArea.innerHTML = `
        <span class="reaction-bubble" data-emoji="${emojiCode}">
            ${emojiCode} ${count}
        </span>
    `;
}

/* ==========================================================
   텍스트 메시지 append
========================================================== */
function appendMessage(nickname, message, messageId, replyToId, repliedNickname, replyText, profileUrl) {
    console.log("PROFILE URL 전달됨:", profileUrl);//------------------------------------------test
    const isMine = nickname === socket.nickname;

    const li = renderMessageBubble({
        nickname,
        profileUrl,
        isMine,
        messageId,
        replyToId,
        repliedNickname,
        replyText,
        contentHTML: escapeHTML(message || "")
    });

    messages.appendChild(li);
    messages.scrollTop = messages.scrollHeight;
}

function appendFileMessage(data, messageId, replyToId, repliedNickname, replyText, profileUrl) {
    const messageNickname = data.nickname || data.user_nickname || '익명';
    const isMine = messageNickname === socket.nickname;

    const url = data.file_url || data.fileUrl || "#";
    const safeUrl = escapeHTML(url);
    const fileName = escapeHTML(data.message || "파일");

    let fileContentHtml = '';
    if (data.isImage || data.is_image) {
        fileContentHtml = `
            <a href="${safeUrl}" target="_blank">
                [이미지] <br>
                <img src="${safeUrl}" alt="image" class="chat-image">
            </a>
        `;
    } else {
        fileContentHtml = `
            <a href="${safeUrl}" target="_blank" download class="file-download">
                ⬇️ ${fileName}
            </a>
        `;
    }

    const li = renderMessageBubble({
        nickname: messageNickname,
        profileUrl,
        isMine,
        messageId,
        replyToId,
        repliedNickname,
        replyText,
        contentHTML: fileContentHtml
    });

    messages.appendChild(li);
    messages.scrollTop = messages.scrollHeight;
}

/* ==========================================================
   알림 메시지
========================================================== */
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
  
  li.innerHTML = `<em>${escapeHTML(textContent)}</em>`; 
  messages.appendChild(li);
  messages.scrollTop = messages.scrollHeight;
}

/* ==========================================================
   DOMContentLoaded - 우클릭 메뉴 / 답글 / 반응
========================================================== */
document.addEventListener('DOMContentLoaded', () => {
    messages.addEventListener('contextmenu', (e) => { //우클릭 이벤트 감지함
        const messageLi = e.target.closest('#messages > li'); 

        if (messageLi && !messageLi.classList.contains('notification')) {
            e.preventDefault(); //기본 브라우저 메뉴가 안 나오게 고정함
            
            currentTargetMessageId = messageLi.getAttribute('data-message-id');

            const nicknameElement = messageLi.querySelector('.nickname-text strong');
            const mainContentWrapper = messageLi.querySelector('.main-content-wrapper');
            const textNode = mainContentWrapper ? mainContentWrapper.textContent || '' : '';

            const repliedNickname = nicknameElement ? nicknameElement.textContent.trim() : '알 수 없음';
            const repliedMessageText = textNode
                ? textNode.trim().split('\n')[0].substring(0, 30) + '...'
                : '(파일 또는 알림)';
            
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
                replyToNickname.innerHTML = `<strong>${escapeHTML(currentReplyToNickname)}</strong>: ${escapeHTML(repliedMessageText)}`;
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
    
    if (!messageLi) return;

    updateReactionUI(messageLi, emojiCode, count);
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

loginForm.addEventListener('submit', async function(e) { // ⭐ async 함수로 변경 ⭐
    e.preventDefault();

    const nickname = nicknameInput.value.trim();
    const room = roomSelect.value;

    if (!nickname) {
        alert("닉네임을 입력해 주세요.");
        return;
    }
    
    const profileFile = profileImageInput ? profileImageInput.files[0] : null;
    let profileUrl = "/images/default_avatar.png";

    socket.nickname = nickname;
    socket.profileUrl = profileUrl;

    // -----------------------
    // 1) 프로필 사진 업로드
    // -----------------------
    if (profileFile) {
        const formData = new FormData();
        formData.append("profileImage", profileFile);
        formData.append("nickname", nickname);


        try {
            const response = await fetch("/upload_profile", {
                method: "POST",
                body: formData
            });

            const result = await response.json();

            if (response.ok && result.profileUrl) {
                profileUrl = result.profileUrl;  // 서버가 준 URL로 대체
            } else {
                console.warn("프로필 업로드 실패:", result.error || response.statusText);
                alert("프로필 업로드 실패. 기본 프로필로 진행합니다.");
            }
        } catch (err) {
            console.error("Profile upload error:", err);
            alert("프로필 업로드 중 오류 발생. 기본 프로필 사용.");
        }
    }
    socket.profileUrl = profileUrl;
    // --- 2. 채팅방 입장 (업로드된 URL을 포함하여 입장) ---
     // 소켓 객체에 URL 저장
    
    // 서버에 닉네임, 방 이름, 그리고 최종 프로필 URL을 함께 전달
    socket.emit('login', { 
        nickname: nickname, 
        room: room, 
        profileUrl: profileUrl
    });
    
    // UI 전환
    loginForm.style.display = 'none';
    chatArea.style.display = 'block';
    roomInfo.textContent = `${room}방`;
});

function getRoomDisplayName(room) {
    const map = {
        "public_room": "1학년 채팅방",
        "dev_room": "2학년 채팅방",
        "test_room": "3학년 채팅방"
    };
    return map[room] || room; // 매핑 없으면 원래 이름 사용
}

socket.on("login", async (data) => {
    const { nickname, room, profileUrl } = data;
});

socket.on("login success", (data) => {
  socket.nickname = data.nickname; 
  socket.room = data.room; 
  socket.id = data.socketId; 
  socket.profileUrl = data.profileUrl || '/images/default_avatar.png'; // 서버가 보내준 프로필 URL 저장
  
  document.getElementById("profilePreviewSidebar").src = socket.profileUrl;
  document.getElementById("profilePreview").src = socket.profileUrl;

  loginForm.style.display = 'none';
  chatArea.style.display = 'block';
  roomInfo.textContent = `${getRoomDisplayName(data.room)} (${data.nickname}님)`;

  const myProfileImgElement = document.getElementById("myChatProfileImg"); 
  if (myProfileImgElement) {
    myProfileImgElement.src = socket.profileUrl;
  }
});

socket.on("profile updated", (data) => {
    console.log("프로필 업데이트 감지:", data.profileUrl);
    socket.profileUrl = data.profileUrl;

    // 로그인 화면의 프로필 프리뷰 갱신 (있을 경우)
    const myImg = document.getElementById("myChatProfileImg");
    if (myImg) myImg.src = data.profileUrl;

    // 이미 채팅창에 있는 내 메시지들의 프로필 이미지도 업데이트하려면 여기서 반복문 추가 가능
});

socket.on("ready to load messages", (data) => {
    socket.emit("get past messages", { room: data.room });
});

socket.on("past messages", (rows) => {

    rows.forEach(msg => {
        const messageId = msg.id;

        const repliedNickname = msg.replied_nickname || null;
        const replyText = msg.reply_text || null;
        const replyToId = msg.reply_to_id || null; 
        const profileUrl = msg.profile_url || '/images/default_avatar.png';

        if (msg.file_url) {
             appendFileMessage(msg, messageId, replyToId, repliedNickname, replyText, profileUrl);
        } else {
             appendMessage(msg.user_nickname, msg.message_text, messageId, replyToId, repliedNickname, replyText, profileUrl);
        }
    });
    
    appendNotification("과거 대화 기록을 불러왔습니다.");
    messages.scrollTop = messages.scrollHeight;
});

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const msg = input.value.trim();
  
  if (msg) {
    if (msg.startsWith('/w ')) {
        socket.emit("chat message", msg); // 귓속말은 문자열 그대로 전송
    } else {
        let messagePayload = { messageText: msg };
        
        if (currentReplyToId) {
            messagePayload.replyToId = currentReplyToId;
            messagePayload.repliedNickname = currentReplyToNickname; 
            messagePayload.replyText = replyToNickname.textContent.replace('답글 대상: ', '');
            
            currentReplyToId = null;
            currentReplyToNickname = null;
            replyContextDisplay.style.display = 'none';
        }
        socket.emit("chat message", messagePayload); // 객체 페이로드 전송
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

  const replyToId = data.reply_to_id || null;
  const repliedNickname = data.replied_nickname || null;
  const replyText = data.reply_text || null;
  const profileUrl = data.profileUrl || '/images/default_avatar.png';  

  if (data.ispersonal) {
    appendpersonalMessage(data);
  } else if (data.file_url) {
    appendFileMessage(data, data.id, replyToId, repliedNickname, replyText, profileUrl); 
  } else {
    appendMessage(data.nickname, data.message, data.id, replyToId, repliedNickname, replyText, profileUrl);
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
document.addEventListener("DOMContentLoaded", () => {
    profileImageInput    = document.getElementById("profileImageInput");
    selectProfileBtn = document.getElementById("selectProfileBtn");
    profilePreview   = document.getElementById("profilePreview");
    const logoutBtn = document.getElementById("logoutBtn");

    console.log("profileImageInput:", profileImageInput);
    console.log("selectProfileBtn:", selectProfileBtn);
    console.log("profilePreview:", profilePreview);

    if (!profileImageInput || !selectProfileBtn || !profilePreview) {
        console.warn("프로필 관련 요소를 찾지 못했습니다. id 확인 필요");
        return;
    }
    selectProfileBtn.addEventListener('click', (e) => {
        e.preventDefault();
        profileImageInput.click();
    });

    profileImageInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();   // ✅ 대문자 F, R
        reader.onload = e => {
            profilePreview.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });

    logoutBtn.addEventListener("click", () => {
    socket.emit("logout", { nickname: socket.nickname, room: socket.room });
    // UI 되돌리기
    loginForm.style.display = "block";
    chatArea.style.display = "none";

    // 입력 폼, 사이드바 프로필, 소켓 정보 초기화
    nicknameInput.value = "";
    roomSelect.value = "dev_room";

    document.getElementById("profilePreviewSidebar").src = "/images/default_avatar.png";

    document.getElementById("profilePreview").src = "/images/default_avatar.png";

    socket.nickname = null;
    socket.room = null;
    socket.profileUrl = null;

    document.getElementById("messages").innerHTML = "";
});
});
