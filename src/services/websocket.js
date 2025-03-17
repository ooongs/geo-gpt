import { API_BASE_URL } from './api';
import { io } from 'socket.io-client';

// Socket.IO 연결 함수
export const connectSocket = () => {
  try {
    const socket = io(API_BASE_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      path: '/socket.io'
    });
    
    socket.on('connect', () => {
      console.log('소켓 서버 연결됨');
    });
    
    socket.on('connect_error', (err) => {
      console.error('소켓 연결 오류:', err);
    });
    
    return socket;
  } catch (err) {
    console.error('소켓 초기화 오류:', err);
    return null;
  }
};

// WebSocket 직접 연결 함수
export const connectWebSocket = () => {
  try {
    const ws = new WebSocket(`ws://${API_BASE_URL.replace('http://', '')}/ws`);
    
    ws.onopen = () => {
      console.log('WebSocket 연결 성공');
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket 오류:', error);
    };
    
    ws.onclose = () => {
      console.log('WebSocket 연결 종료');
    };
    
    return ws;
  } catch (err) {
    console.error('WebSocket 초기화 오류:', err);
    return null;
  }
};

// 명령어 결과 전송
export const sendCommandResult = (ws, command, llm_response, success, error, regenerateFull = false) => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'command_result',
      command: command.trim(),
      llm_response: llm_response,
      success,
      error,
      regenerate_full: regenerateFull
    }));
  }
};

// 쿼리 전송
export const sendQuery = (ws, query) => {
  if (ws && ws.readyState === WebSocket.OPEN && query) {
    ws.send(JSON.stringify({
      type: 'query',
      query
    }));
  }
}; 