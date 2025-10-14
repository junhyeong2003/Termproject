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
    const{nickname, room} = data; //객체에서 방 이름과 닉네임을 가져온다
    socket.nickname = nickname;
    socket.room = room;
    users[socket.id] = {nickname: nickname, room: room};

    socket.join(room);

    socket.broadcast.to(room).emit("notification", `${nickname}님이 입장하셨습니다.`);
    socket.emit("login success", {room: room, nickname: nickname});
    
    socket.emit("ready to load messages", {room: room});
  });

  socket.on("get past messages", async (data) => { //과거 채팅 기록 요청 이벤트
    const {room} = data;
    try {
      const sql = 'SELECT user_nickname, message_text, timestamp FROM messages WHERE room_name = ? ORDER BY timestamp DESC LIMIT 50'; //가장 최신 메시지50개를 내림차순으로 출력한다
      const [rows] = await db.execute(sql, [room]); //async&await를 사용하여 DB 조회 쿼리를 실행한다. db.execute는 Promise를 반환하고, 결과는 배열로 옴.
      const messages = rows.reverse(); //db에서 최신순으로 가져왔지만, 사용자가 볼 때 시간순으로 보이게 reverse를 사용하여 가장 오래된 메시지부터 출력하게함.
      socket.emit("past messages", messages); //과거 메시지를 볼 사용자 한 명에게만 출력하는 코드

    } catch (err) {
      console.error("과거 메시지 조회 실패", err);
    }
  });

  socket.on("chat message", async (msg) => { //async는 오래 걸리는 작업(db저장)할 때 사용
    const{room, nickname} = socket;

    if(!nickname || !room){
      console.log("로그인 정보 없음");
      return;
    }
    
    const messageData = {nickname: nickname, message: msg};
    
    console.log(`[${room}] ${nickname}: ${msg}`);
  
    try {
      const sql = 'INSERT INTO messages (room_name, user_nickname, message_text) VALUES (?, ?, ?)'; //메시지 저장 로직이다. ?는 나중에 실제 닉네임, 방 이름이 들어간다
      await db.execute(sql, [room, nickname, msg]); //await을 사용하여 db 저장이 완료될 때까지 기다린다(비동기 처리)
    } catch (err) {
      console.error('메시지 DB 저장 실패:', err);
    }
    socket.broadcast.to(room).emit("chat message", messageData); 
  });

  socket.on("disconnect", () => {
    console.log("사용자 연결 종료:", socket.id);
    const user = users[socket.id];
    if (user){
      socket.broadcast.to(user.room).emit("notification", `${user.nickname}님이 퇴장하셨습니다.`);
      delete users[socket.id];
    }
  });
});

server.listen(3000, () => {
  console.log("서버 실행중  http://localhost:3000");

});
