//chat_app/db.js

const mysql = require('mysql2/promise'); // promise API 사용

const poolConfig = {
    host: 'localhost',
    user: 'root',        // 사용자 이름으로 변경 (예: 'root')
    password: 'password',// 비밀번호
    database: 'chat_project_db',    // 이전에 생성한 데이터베이스 이름
    port: 3306,
    waitForConnections: true,       // 풀에 사용 가능한 연결이 없을 때 대기할지 여부
    connectionLimit: 10,            // 최대 연결 수
    queueLimit: 0                   // 대기열의 최대 수 (0은 무한대)
};

// 연결 풀 생성
const pool = mysql.createPool(poolConfig);

// DB 연결 테스트 함수 (서버 시작 시 한 번 호출)
async function testDbConnection() {
    try {
        await pool.getConnection(); // 풀에서 연결 하나를 가져와 테스트
        console.log(' MySQL 연결 풀 생성 및 테스트 성공! ');
    } catch (err) {
        console.error(' MySQL 연결 풀 오류:', err.code, err.message);
        // 서버 시작을 중지하거나, 에러 처리 로직을 추가할 수 있습니다.
    }
}

// 서버 실행 시 연결 테스트
testDbConnection();

module.exports = pool; // server.js에서 이 연결 풀을 사용할 수 있도록 내보냅니다.

//Dbeaver를 먼저 열어야됨