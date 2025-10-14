const db = require('./db'); 
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server); 

app.use(express.static("public"));

const users = {}; 

io.on("connection", (socket) => {
  console.log("사용자 연결됨:", socket.id);
  
  socket.on("login", (data) => {
    const{nickname, room} = data;

    socket.nickname = nickname;
    socket.room = room;
    users[socket.id] = {nickname: nickname, room: room};

    socket.join(room);

    socket.broadcast.to(room).emit("notification", `📢 ${nickname}님이 입장하셨습니다.`);
    socket.emit("login success", {room: room, nickname: nickname});
    
    socket.emit("ready to load messages", {room: room});
  });

  // 💡 [수정] get past messages: 메시지 전송 로직 추가 및 테이블 이름 수정
  socket.on("get past messages", async (data) => {
    const {room} = data;
    try {
      // ✅ 테이블 이름 수정: 'message' -> 'messages' (복수형)
      const sql = 'SELECT user_nickname, message_text, timestamp FROM messages WHERE room_name = ? ORDER BY timestamp DESC LIMIT 50';
      const [rows] = await db.execute(sql, [room]);
      const messages = rows.reverse();
      
      // ✅ [핵심 추가]: 조회된 메시지 목록을 클라이언트에게 전송
      socket.emit("past messages", messages); 

    } catch (err) {
      console.error("❌ 과거 메시지 조회 실패", err);
    }
  });
  
  // 2. 채팅 메시지 처리 (DB 저장 및 전송 로직 수정)
  socket.on("chat message", async (msg) => {
    const{room, nickname} = socket;

    if(!nickname || !room){
      console.log("로그인 정보 없음");
      return;
    }
    
    const messageData = {nickname: nickname, message: msg};
    
    console.log(`[${room}] ${nickname}: ${msg}`);
    
    // ❌ [삭제]: io.emit("chat message", msg); // 이 코드를 삭제해야 중복 버그 해결
    
    try {
      const sql = 'INSERT INTO messages (room_name, user_nickname, message_text) VALUES (?, ?, ?)';
      await db.execute(sql, [room, nickname, msg]); 
    } catch (err) {
      console.error('❌ 메시지 DB 저장 실패:', err);
    }

    // [유지]: 본인을 제외한 방 사용자에게만 객체 형식으로 메시지 전송
    socket.broadcast.to(room).emit("chat message", messageData); 
  });

  socket.on("disconnect", () => {
    console.log("사용자 연결 종료:", socket.id);
    const user = users[socket.id];
    if (user){
      socket.broadcast.to(user.room).emit("notification", `📢 ${user.nickname}님이 퇴장하셨습니다.`);
      delete users[socket.id];
    }
  });
});

server.listen(3000, () => {
  console.log("서버 실행중  http://localhost:3000");
});