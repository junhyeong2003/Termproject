const db = require('./db'); 
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const multer = require('multer'); 
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server); 

app.use(express.static("public"));
app.use('/uploads', express.static('uploads')); 

const users = {}; 
const typingUsers = {}; // 방별 입력 중인 사용자 닉네임 목록 (배열)

function broadcastTypingStatus(room) {
  const currentTypingUsers = typingUsers[room] || [];
  io.to(room).emit("typing", currentTypingUsers);
}

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

const fileFilter = (req, file, cb) => {
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'];
    if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('허용되지 않는 파일 형식입니다. (jpeg, png, gif, pdf만 가능)'), false); // 거부
    }
};

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir); 
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '_' + file.originalname);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 1024 * 1024 * 5 }, // 5MB 파일 크기 제한
    fileFilter: fileFilter 
});

function getUsersInRoom(room) {
  const roomUsers = Array.from(Object.values(users))
                          .filter(user => user.room === room);
  return roomUsers.map(user => user.nickname);
}

function broadcastUserList(room) {
  const currentUsers = getUsersInRoom(room);
  io.to(room).emit("user list", currentUsers);
}

io.on("connection", (socket) => {
  console.log("사용자 연결됨:", socket.id);
  
  // ⭐ [수정] 비동기 처리를 위해 async 키워드 추가
socket.on("login", async (data) => {
  const{nickname, room} = data;
    
    // 기본 프로필 URL 설정
  let profileUrl = "/images/default_avatar.png"; // 웹에서 접근 가능한 경로로 수정 (필요하다면)

    // ⭐ [추가] DB에서 프로필 URL을 조회하고 없으면 기본값으로 삽입
  try {
      // 1. 프로필 URL 조회
    const selectSql = 'SELECT profile_url FROM user_profiles WHERE nickname = ?';
    const [rows] = await db.execute(selectSql, [nickname]);

    if (rows.length > 0) {
            // 프로필이 존재하는 경우
        profileUrl = rows[0].profile_url;
    } else {
            // 프로필이 없는 경우 (첫 로그인 등): 기본 프로필을 DB에 삽입
        const insertSql = 'INSERT INTO user_profiles (nickname, profile_url) VALUES (?, ?)';
        await db.execute(insertSql, [nickname, profileUrl]);
    }
} catch (err) {
    console.error('프로필 조회/생성 실패:', err);
        // DB 오류 발생 시에도 기본 URL로 진행
}

  socket.nickname = nickname;
  socket.room = room;
    // ⭐ [추가] socket 객체에 profileUrl 저장  socket.profileUrl = profileUrl; 
    
  users[socket.id] = {nickname: nickname, room: room, profileUrl: profileUrl}; // ⭐ users 객체에도 추가 (선택 사항)

  socket.join(room);
  socket.broadcast.to(room).emit("notification", ` ${nickname}님이 입장하셨습니다.`);

    // ⭐ [수정] profileUrl을 login success 데이터에 포함하여 클라이언트로 전송
  socket.emit("login success", {
    room: room, 
    nickname: nickname, 
    socketId: socket.id, 
    profileUrl: profileUrl
});
    
  socket.emit("ready to load messages", {room: room});
  broadcastUserList(room);
});

  socket.on('react message', (data) => {
    console.log("서버가 반응 수신:", data);

    io.emit('reaction updated', {
        messageId: data.messageId,
        emojiCode: data.emojiCode,
        count: count
    });
});

  // 메시지 반응 처리 이벤트 리스너
  socket.on('react message', async (data) => {
    const { messageId, emojiCode } = data;
    const nickname = socket.nickname;
    const room = socket.room;

    if (!nickname || !messageId || !emojiCode) {//닉네임, 메시지, 이모티콘
        console.error('Reaction data missing.');
        return; 
    }

    try {
        const sql = 'INSERT INTO reactions (message_id, user_nickname, emoji_code) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE emoji_code = VALUES(emoji_code)';
        await db.execute(sql, [messageId, nickname, emojiCode]); //db에 반응 정보를 저장한다

        const count = await getReactionCount(messageId, emojiCode);
        
        //같은 방 모든 클라이언트에게 반응 업데이트를 전송
        io.to(room).emit('reaction updated', { messageId, nickname, emojiCode, count });

    } catch (err) {
        console.error('Reaction DB update failed:', err);
        // 실패 시 알람 보내기
    }
});

  socket.on("typing start", () => { //
    const { room, nickname } = socket;
    if (!room || !nickname) return; //닉네임과 방 둘 다 있어야 함

    typingUsers[room] = typingUsers[room] || [];

    if (!typingUsers[room].includes(nickname)) {
      typingUsers[room].push(nickname);
      broadcastTypingStatus(room);
    }
  });

  socket.on("typing stop", () => {
    const { room, nickname } = socket;
    if (!room || !nickname) return;

    if (typingUsers[room]) {
      typingUsers[room] = typingUsers[room].filter(user => user !== nickname);
      broadcastTypingStatus(room);
    }
  });

  socket.on("get past messages", async (data) => {
    const {room} = data;
    try {
      const sql = 'SELECT id, user_nickname, message_text, timestamp, file_url, is_image FROM messages WHERE room_name = ? ORDER BY timestamp DESC LIMIT 50';
      const [rows] = await db.execute(sql, [room]);
      const messages = rows.reverse();
  
      socket.emit("past messages", messages); 

    } catch (err) {
      console.error("과거 메시지 조회 실패", err);
    }
  });

  socket.on("chat message", async (msg) => {
    const{room, nickname} = socket;
    socket.nickname = nickname; 
    socket.room = room;
    users[socket.id] = { nickname, room }; 
    socket.join(room);
    
    if(!nickname || !room){
      console.log("로그인 정보 없음");
      return;
    }

    let messageText;
    let replyToId = null;
    let repliedNickname = null;
    let replyText = null;
    
    if (typeof msg === 'object' && msg.messageText) {
        // 1. 답글 기능 사용 시 (객체 페이로드)
        messageText = msg.messageText;
        replyToId = msg.replyToId || null;
        repliedNickname = msg.repliedNickname || null;
        replyText = msg.replyText || null;
    } else if (typeof msg === 'string') {
        // 2. 귓속말 또는 이전 버전의 메시지 (문자열)
        messageText = msg;
    } else {
        console.error("잘못된 메시지 형식:", msg);
        return;
    }
    
    // ⭐ [수정] messageText에 대해 .match()를 호출합니다. (TypeError 해결)
    const personalMatch = messageText.match(/^\/w\s+(\S+)\s+(.*)/);

    if (personalMatch) {
      const targetNickname = personalMatch[1];
      const personalMessage = personalMatch[2];
      const targetSocketId = Object.keys(users).find(
        (id) => users[id].nickname === targetNickname
      );

      if (!targetSocketId) {
        socket.emit("notification", `오류: 사용자 ${targetNickname}님을 찾을 수 없거나 접속 중이 아닙니다.`);
        return;
      }
      
      const personalData = {
        sender: nickname, targetNickname: targetNickname,
        message: personalMessage, ispersonal: true,
      };

      io.to(targetSocketId).emit("chat message", { ...personalData, type: 'received_personal' });
      socket.emit("chat message", { ...personalData, type: 'sent_personal' });
      
    } else {
      
      // ⭐ [수정] messageData에 모든 답글 정보를 포함합니다.
      const messageData = { 
          nickname: nickname, 
          message: messageText, // messageText 사용
          reply_to_id: replyToId, 
          replied_nickname: repliedNickname, 
          reply_text: replyText,
          profileUrl: socket.profileUrl
      };
      
      let messageId;
      console.log(`[${room}] ${nickname}: ${messageText}`); // messageText 사용
      
      try {
        const sql = 'INSERT INTO messages (room_name, user_nickname, message_text, reply_to_id, file_url, is_image) VALUES (?, ?, ?, ?, NULL, 0)';
        // messageText와 replyToId를 DB에 전달합니다.
        const [result] = await db.execute(sql, [room, nickname, messageText, replyToId]);

        messageId = result.insertId; // DB에서 자동 생성된 ID를 추출
        messageData.id = messageId; // messageData에 ID 포함
        // messageData에 이미 답글 정보가 포함되었으므로 추가적인 할당은 필요 없습니다.
      } catch (err) {
        console.error('메시지 DB 저장 실패:', err);
      }
      
      io.to(room).emit("chat message", messageData);
    }
});
  
  socket.on("disconnect", () => {
    console.log("사용자 연결 종료:", socket.id);
    const user = users[socket.id];
    if (user){
      const roomToUpdate = user.room;

      if (typingUsers[roomToUpdate]) {
        typingUsers[roomToUpdate] = typingUsers[roomToUpdate].filter(currentTypingUser => currentTypingUser !== user.nickname);
        broadcastTypingStatus(roomToUpdate);
      }
      
      socket.broadcast.to(user.room).emit("notification", `${user.nickname}님이 퇴장하셨습니다.`);
      delete users[socket.id]; 
      broadcastUserList(roomToUpdate);
    }
  });
});

app.post('/upload', upload.single('chatFile'), async (req, res) => {
    
    if (!req.file) {
        return res.status(400).send('업로드된 파일이 없습니다.');
    }

    const { socketId } = req.body;
    const user = users[socketId];

    if (!user) {
        return res.status(401).send('인증 실패: 유효하지 않은 사용자입니다.');
    }

    const { nickname, room } = user;
    const fileUrl = `/uploads/${req.file.filename}`;
    const isImage = req.file.mimetype.startsWith('image/');
    const messageText = `${req.file.originalname} (파일)`;

    try {
        const sql = 'INSERT INTO messages (room_name, user_nickname, message_text, file_url, is_image) VALUES (?, ?, ?, ?, ?)';
        await db.execute(sql, [room, nickname, messageText, fileUrl, isImage]);
    } catch (err) {
        console.error('파일 메시지 DB 저장 실패:', err);
        return res.status(500).send('서버 오류: DB 저장 실패');
    }

    const messageData = { 
        nickname: nickname, 
        message: messageText,
        file_url: fileUrl, 
        is_image: isImage, 
    };

    io.to(room).emit("chat message", messageData);

    res.status(200).json({ fileUrl: fileUrl, originalName: req.file.originalname });
});

server.listen(3000, () => {
  console.log("서버 실행중  http://localhost:3000");
});
