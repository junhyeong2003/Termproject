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

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// 파일 필터 함수 (보안: 허용된 타입만)
const fileFilter = (req, file, cb) => {
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'];
    if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true); // 허용
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
    fileFilter: fileFilter // 파일 타입 필터 적용
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
  
  socket.on("login", (data) => {
    const{nickname, room} = data;

    socket.nickname = nickname;
    socket.room = room;
    //socket.id를 키로 사용하여 사용자 정보 저장
    users[socket.id] = {nickname: nickname, room: room};

    socket.join(room);

    socket.broadcast.to(room).emit("notification", ` ${nickname}님이 입장하셨습니다.`);
    //socket.id를 클라이언트로 전송하여 인증에 사용
    socket.emit("login success", {room: room, nickname: nickname, socketId: socket.id});
    
    socket.emit("ready to load messages", {room: room});

    broadcastUserList(room);
  });

  socket.on("get past messages", async (data) => {
    const {room} = data;
    try {
      //DB에서 file_url과 is_image 컬럼도 함께 조회
      const sql = 'SELECT user_nickname, message_text, timestamp, file_url, is_image FROM messages WHERE room_name = ? ORDER BY timestamp DESC LIMIT 50';
      const [rows] = await db.execute(sql, [room]);
      const messages = rows.reverse();
  
      socket.emit("past messages", messages); 

    } catch (err) {
      console.error("과거 메시지 조회 실패", err);
    }
  });

  socket.on("chat message", async (msg) => {
    const{room, nickname} = socket;

    if(!nickname || !room){
      console.log("로그인 정보 없음");
      return;
    }
    
    const personalMatch = msg.match(/^\/w\s+(\S+)\s+(.*)/);

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
      //일반 텍스트 메시지만 DB에 저장
      const messageData = { nickname: nickname, message: msg };
      console.log(`[${room}] ${nickname}: ${msg}`);
      
      try {
        // file_url과 is_image는 null로 설정
        const sql = 'INSERT INTO messages (room_name, user_nickname, message_text, file_url, is_image) VALUES (?, ?, ?, NULL, 0)';
        await db.execute(sql, [room, nickname, msg]); 
      } catch (err) {
        console.error('메시지 DB 저장 실패:', err);
      }
      
      socket.broadcast.to(room).emit("chat message", messageData);
    }
  });
  
  socket.on("disconnect", () => {
    console.log("사용자 연결 종료:", socket.id);
    const user = users[socket.id];
    if (user){
      const roomToUpdate = user.room;
      socket.broadcast.to(user.room).emit("notification", `${user.nickname}님이 퇴장하셨습니다.`);
      delete users[socket.id]; //socket.id를 키로 삭제

      broadcastUserList(roomToUpdate);
    }
  });
});

app.post('/upload', upload.single('chatFile'), async (req, res) => {
    
    // 1. 파일 유무 확인
    if (!req.file) {
        return res.status(400).send('업로드된 파일이 없습니다.');
    }

    // 2. 인증: FormData로 전송된 socketId를 기반으로 사용자 정보 조회
    const { socketId } = req.body;
    const user = users[socketId];

    // 3. 인증 실패 처리
    if (!user) {
        return res.status(401).send('인증 실패: 유효하지 않은 사용자입니다.');
    }

    // 4. 신뢰할 수 있는 사용자 정보 사용 (req.body 대신)
    const { nickname, room } = user;
    const fileUrl = `/uploads/${req.file.filename}`;
    const isImage = req.file.mimetype.startsWith('image/');
    const messageText = `${req.file.originalname} (파일)`;

    // 5. 파일 메시지를 DB에 저장
    try {
        const sql = 'INSERT INTO messages (room_name, user_nickname, message_text, file_url, is_image) VALUES (?, ?, ?, ?, ?)';
        await db.execute(sql, [room, nickname, messageText, fileUrl, isImage]);
    } catch (err) {
        console.error('파일 메시지 DB 저장 실패:', err);
        return res.status(500).send('서버 오류: DB 저장 실패');
    }

    // 6. Socket.IO로 클라이언트들에게 파일 공유 메시지 전송
    const messageData = { 
        nickname: nickname, 
        message: messageText,
        file_url: fileUrl, // DB 컬럼명과 일치
        is_image: isImage, // DB 컬럼명과 일치
    };

    io.to(room).emit("chat message", messageData);

    // 7. 업로드 성공 응답 전송
    res.status(200).json({ fileUrl: fileUrl, originalName: req.file.originalname });
});

server.listen(3000, () => {
  console.log("서버 실행중  http://localhost:3000");
});

