import axios from 'axios';

// API 기본 URL 설정
const API_BASE_URL = 'http://localhost:8000';  // 개발 환경
// const API_BASE_URL = '/api';  // 프로덕션 환경

// axios 인스턴스 생성
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 명령어 생성 API 호출
export const generateCommands = async (model, messages) => {
  try {
    const response = await apiClient.post('/generate-commands', {
      model,
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content || msg.text || ''
      }))
    });
    return response.data;
  } catch (error) {
    throw error;
  }
};

// 명령어 검색 API 호출
export const searchCommands = async (query, topK = 5) => {
  try {
    const response = await apiClient.post('/search-commands', {
      query,
      top_k: topK,
      // threshold
    });
    return response.data.results;
  } catch (error) {
    console.error('명령어 검색 오류:', error);
    return [];
  }
};

export { API_BASE_URL }; 