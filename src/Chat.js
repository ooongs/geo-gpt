import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './Chat.css';
import Geogebra from 'react-geogebra';
import 'katex/dist/katex.min.css';
import MessageContent from './components/MessageContent';
import SuggestedQueries from './components/SuggestedQueries';
import ModelSelector from './components/ModelSelector';
import SearchResults from './components/SearchResults';
import { io } from 'socket.io-client';

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

// 소켓 연결 함수
const connectSocket = () => {
  try {
    const socket = io(API_BASE_URL + '/ws', {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
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

function Chat() {
    // 상태 관리
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState([]); // 시스템 프롬프트 제외
    const [isLoading, setIsLoading] = useState(false);
    const [searchResults, setSearchResults] = useState([]); // 검색 결과 상태 유지
    const [isSearching, setIsSearching] = useState(false); // 검색 중 상태 유지
    const [suggestedQueries, setSuggestedQueries] = useState([
        "请画出边长为5的正三角形 ",
        "请画出过(0,0)、(1,2)、(2,2)的圆",
        "请画出边长为2的正方形",
        "请画出圆心为(0,0)、半径为2的圆",
        "请画出正四面体"
    ]);
    const [selectedModel, setSelectedModel] = useState('gpt-4o-mini');
    const [errorMessage, setErrorMessage] = useState(null);
    const [feedbackInProgress, setFeedbackInProgress] = useState(false);
    const [commandErrors, setCommandErrors] = useState([]);
    const testAppRef = useRef(null);
    const [socket, setSocket] = useState(null);

    // 메시지 컨테이너 참조
    const messagesEndRef = useRef(null);

    // 스크롤 관련 함수
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    // 메시지 업데이트 시 스크롤
    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // 모델 옵션 정의
    const modelOptions = [
        { id: 'gpt-4o-mini', name: 'ChatGPT (GPT-4o-mini)' },
        { id: 'deepseek-chat', name: 'DeepSeek Chat' }
    ];

    // 명령어 검색 함수
    const searchCommands = async (query) => {
        setIsSearching(true);
        try {
            const response = await axios.post(
                'http://localhost:8000/search-command',
                {
                    query: query,
                    top_k: 5,
                    threshold: 0.8 // 유사도 임계값
                }
            );
            
            setSearchResults(response.data.results);
        } catch (error) {
            console.error('명령어 검색 오류:', error);
            setSearchResults([]);
        }
        setIsSearching(false);
    };

    // 명령어 테스트 실행 함수
    const testCommands = async (commands) => {
        const testApp = window.testApp;
        if (!testApp) {
            console.error('테스트용 GeoGebra 앱이 초기화되지 않았습니다.');
            return { valid: false, errors: ['테스트 앱 초기화 실패'] };
        }
        
        // 테스트 앱 초기화
        testApp.reset();
        
        const errors = [];
        const validCommands = [];
        
        // errorMessage 상태를 체크하기 위한 Promise 생성 함수
        const waitForError = () => {
            return new Promise(resolve => {
                // 짧은 시간 후 현재 에러 메시지 확인
                setTimeout(() => {
                    resolve(errorMessage);
                }, 300); // 에러 다이얼로그 표시 및 Observer 처리 시간 고려
            });
        };
        
        // 각 명령어 개별 테스트
        for (const command of commands) {
            if (!command.trim()) continue;
            
            setErrorMessage(null); // 에러 메시지 초기화
            
            try {
                // 명령어 실행
                const success = testApp.evalCommand(command.trim());
                
                // 에러 메시지 확인을 위해 잠시 대기
                const error = await waitForError();
                
                if (error || !success) {
                    errors.push({
                        command: command.trim(),
                        error: error || '알 수 없는 오류'
                    });
                } else {
                    validCommands.push(command.trim());
                }
            } catch (e) {
                errors.push({
                    command: command.trim(),
                    error: e.message
                });
            }
        }
        
        return {
            valid: errors.length === 0,
            errors,
            validCommands
        };
    };
    
    // 오류 피드백을 위한 서버 요청 함수
    const getCommandFeedback = async (originalMessages, errorDetails) => {
        try {
            setFeedbackInProgress(true);
            
            // 에러 정보를 포함한 추가 메시지 생성
            const feedbackMessages = [...originalMessages, {
                role: 'user',
                content: `다음 명령어 실행 중 오류가 발생했습니다. 수정된 명령어를 제공해주세요:\n\n${
                    errorDetails.map(err => `명령어: ${err.command}\n오류: ${err.error}`).join('\n\n')
                }`
            }];
            
            // 서버에 피드백 요청
            const response = await axios.post(
                'http://localhost:8000/generate-commands',
                {
                    model: selectedModel,
                    messages: feedbackMessages.map(msg => ({
                        role: msg.role,
                        content: msg.content || msg.text
                    }))
                }
            );
            
            return response.data.content;
        } catch (error) {
            console.error('피드백 요청 오류:', error);
            return '명령어 수정 중 오류가 발생했습니다.';
        } finally {
            setFeedbackInProgress(false);
        }
    };
    
    // 메시지 전송 함수
    const sendMessage = async () => {
        if (!input.trim() || isLoading) return;

        const userMessage = { role: 'user', text: input };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);
        
        // 테스트 앱 초기화
        if (window.testApp) window.testApp.reset();
        
        try {
            // API 요청 준비
            const apiMessages = messages.map(msg => ({
                role: msg.role,
                content: msg.text
            }));
            
            // 현재 사용자 메시지 추가
            apiMessages.push({
                role: 'user',
                content: input
            });
            
            // 로컬 서버 호출
            const response = await axios.post(
                'http://localhost:8000/generate-commands',
                {
                    model: selectedModel,
                    messages: apiMessages
                }
            );
            
            const responseText = response.data.content;
            
            // 명령어 추출
            const commands = responseText.match(/```\s*([\s\S]*?)\s*```/s);
            
            if (commands && commands[1]) {
                const commandLines = commands[1].split('\n').filter(cmd => cmd.trim());
                
                // 모든 명령어 검증
                let hasErrors = false;
                const errors = [];
                
                for (const command of commandLines) {
                    if (!command.trim()) continue;
                    
                    const result = await validateCommand(command);
                    if (!result.valid) {
                        hasErrors = true;
                        errors.push({
                            command: command,
                            error: result.error
                        });
                    }
                }
                
                if (hasErrors) {
                    // 오류가 있는 경우 피드백 요청
                    console.log('명령어 오류 발견:', errors);
                    setCommandErrors(errors);
                    
                    // 피드백 요청
                    const updatedResponse = await getCommandFeedback(apiMessages, errors);
                    
                    // 수정된 응답 메시지 추가
                    const assistantMessage = {
                        role: 'assistant',
                        text: updatedResponse
                    };
                    setMessages(prev => [...prev, assistantMessage]);
                    
                    // 수정된 명령어 추출 및 실행
                    const newCommands = updatedResponse.match(/```\s*([\s\S]*?)\s*```/s);
                    if (newCommands && newCommands[1]) {
                        // 메인 앱 초기화
                        if (window.app1) window.app1.reset();
                        
                        const newCommandLines = newCommands[1].split('\n').filter(cmd => cmd.trim());
                        // 각 명령어 실행 (성공한 것만)
                        for (const command of newCommandLines) {
                            if (!command.trim()) continue;
                            
                            const result = await validateCommand(command);
                            if (result.valid && window.app1) {
                                window.app1.evalCommand(command.trim());
                            }
                        }
                    }
                } else {
                    // 오류가 없는 경우 바로 실행
                    const assistantMessage = {
                        role: 'assistant',
                        text: responseText
                    };
                    setMessages(prev => [...prev, assistantMessage]);
                    
                    // 메인 앱 초기화
                    if (window.app1) window.app1.reset();
                    
                    // 검증된 명령어 모두 실행
                    for (const command of commandLines) {
                        if (command.trim() && window.app1) {
                            window.app1.evalCommand(command.trim());
                        }
                    }
                }
            } else {
                // 명령어가 없는 경우 메시지만 추가
                const assistantMessage = {
                    role: 'assistant',
                    text: responseText
                };
                setMessages(prev => [...prev, assistantMessage]);
            }
        } catch (error) {
            console.error('API 요청 오류:', error);
            
            // 서버 연결 오류 처리
            if (error.code === 'ERR_NETWORK') {
              setMessages(prev => [...prev, {
                role: 'assistant',
                text: '서버 연결 오류가 발생했습니다. 백엔드 서버가 실행 중인지 확인해주세요.'
              }]);
            } else {
              setMessages(prev => [...prev, {
                role: 'assistant',
                text: '오류가 발생했습니다: ' + (error.message || '알 수 없는 오류')
              }]);
            }
        }
        
        setIsLoading(false);
    };

    // 채팅 저장 함수
    const saveChat = () => {
        const chatPairs = [];
        for (let i = 0; i < messages.length; i += 2) {
            if (i + 1 < messages.length) {
                chatPairs.push({
                    input: messages[i].text,
                    output: messages[i + 1].text
                });
            }
        }
        
        const chatData = {
            conversations: chatPairs,
            timestamp: new Date().toISOString()
        };

        // 파일 다운로드
        const blob = new Blob([JSON.stringify(chatData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `geogebra-chat-${new Date().toISOString().slice(0,10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // 메시지 업데이트 함수
    const updateMessage = (index, newText) => {
        setMessages(prevMessages => {
            const newMessages = [...prevMessages];
            if (index < newMessages.length) {
                newMessages[index] = {
                    ...newMessages[index],
                    text: newText
                };
            }
            return newMessages;
        });
    };

    // 추천 검색어 선택 함수
    const selectQuery = (query) => {
        setInput(query);
    };

    // 더 구조화된 오류 메시지 추출
    const extractErrorMessage = (dialogNode) => {
        const dialogContent = dialogNode.querySelector('.dialogContent');
        if (!dialogContent) return null;
        
        const labels = dialogContent.querySelectorAll('.gwt-Label');
        if (labels.length < 2) return null;
        
        // 명령어와 오류 메시지 (첫 두 줄)
        const command = labels[0].textContent.trim();
        const errorMsg = labels[1].textContent.trim();
        
        // 문법 정보 (Syntax: 이후의 모든 줄)
        const syntaxLines = [];
        let syntaxStarted = false;
        
        for (let i = 2; i < labels.length; i++) {
            const text = labels[i].textContent.trim();
            if (!text) continue;
            
            if (text === 'Syntax:') {
                syntaxStarted = true;
            } else if (syntaxStarted) {
                syntaxLines.push(text);
            }
        }
        
        return `${command} ${errorMsg}${syntaxLines.length ? '\n\n올바른 문법:\n' + syntaxLines.join('\n') : ''}`;
    };

    useEffect(() => {
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.addedNodes.length) {
                    for (const node of mutation.addedNodes) {
                        // 상위 요소가 dialogComponent인지 확인
                        if (node.classList && node.classList.contains('dialogComponent')) {
                            const errorMsg = extractErrorMessage(node);
                            if (errorMsg) {
                                console.log('오류 내용:', errorMsg);
                                setErrorMessage(errorMsg);
                            }
                            
                            // 자동으로 다이얼로그 닫기
                            setTimeout(() => {
                                const closeButton = node.querySelector('.dialogTextButton');
                                if (closeButton) closeButton.click();
                            }, 2000);
                            
                            return; // 첫 번째 오류 메시지만 처리
                        }
                        
                        // 다른 방법: 내부 컴포넌트 확인
                        const dialogPanel = node.querySelector && node.querySelector('.dialogMainPanel');
                        if (dialogPanel) {
                            console.log('오류 다이얼로그 패널 감지됨:', dialogPanel);
                            
                            // 명령어와 오류 메시지 추출
                            const labels = dialogPanel.querySelectorAll('.gwt-Label');
                            if (labels.length >= 2) {
                                const errorMessage = `${labels[0].textContent} ${labels[1].textContent}`;
                                console.log('오류 내용:', errorMessage);
                                setErrorMessage(errorMessage);
                            }
                            
                            // 자동으로 다이얼로그 닫기
                            setTimeout(() => {
                                const closeButton = dialogPanel.querySelector('.dialogTextButton');
                                if (closeButton) closeButton.click();
                            }, 2000);
                        }
                    }
                }
            }
        });
        
        // 문서 전체 관찰
        observer.observe(document.body, { childList: true, subtree: true });
        
        return () => observer.disconnect();
    }, []);

    // GeoGebra 테스트 앱 초기화 관련 코드 추가
    useEffect(() => {
        // 메인 앱 로드 확인
        const checkMainApp = setInterval(() => {
            if (window.app1) {
                clearInterval(checkMainApp);
                console.log('메인 GeoGebra 앱이 초기화되었습니다.');
            }
        }, 500);
        
        // 테스트 앱 로드 확인
        const checkTestApp = setInterval(() => {
            if (window.testApp) {
                clearInterval(checkTestApp);
                console.log('테스트 GeoGebra 앱이 초기화되었습니다.');
                
                // 직접적인 오류 리스너 대신 MutationObserver만 사용
                console.log('테스트 앱 초기화 완료 - MutationObserver로 오류 감지');
            }
        }, 500);
        
        return () => {
            clearInterval(checkMainApp);
            clearInterval(checkTestApp);
        };
    }, []);

    // 명령어 검증 함수 업데이트
    const validateCommand = async (command) => {
        return new Promise((resolve) => {
            if (!window.testApp) {
                resolve({ valid: false, error: '테스트 앱이 초기화되지 않았습니다.' });
                return;
            }
            
            // 오류 메시지 초기화
            setErrorMessage(null);
            
            try {
                // 테스트 앱에서 명령 실행
                const success = window.testApp.evalCommand(command.trim());
                
                // 오류 메시지 확인을 위해 잠시 대기
                setTimeout(() => {
                    if (errorMessage) {
                        resolve({ valid: false, error: errorMessage });
                    } else if (!success) {
                        resolve({ valid: false, error: '명령어 실행이 실패했습니다.' });
                    } else {
                        resolve({ valid: true });
                    }
                }, 300); // 오류 다이얼로그 표시 대기 시간
            } catch (e) {
                resolve({ valid: false, error: e.message });
            }
        });
    };

    // 소켓 연결
    useEffect(() => {
        const newSocket = connectSocket();
        if (newSocket) setSocket(newSocket);
        
        return () => {
            if (newSocket) newSocket.disconnect();
        };
    }, []);

    return (
        <div style={{ display: 'flex', gap: '20px'}}>
            {/* 메인 GeoGebra 컴포넌트 */}
            <Geogebra
                id='app1'
                width="800"
                height="800"
                showMenuBar
                showToolBar
                showAlgebraInput
            />
            
            {/* 보이지 않는 테스트용 GeoGebra 컴포넌트 */}
            <div style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden' }}>
                <Geogebra
                    id='testApp'
                    width="400"
                    height="400"
                    showMenuBar={false}
                    showToolBar={false}
                    showAlgebraInput={false}
                />
            </div>
            
            {/* 채팅 인터페이스 */}
            <div className="chat-container" style={{ display: 'flex', flexDirection: 'column', flex: 1, width: '500px' }}>
                {/* 모델 선택 및 채팅 저장 버튼 */}
                <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    padding: '5px' 
                }}>
                    <ModelSelector 
                        selectedModel={selectedModel}
                        setSelectedModel={setSelectedModel}
                        modelOptions={modelOptions}
                    />
                    <button
                        onClick={saveChat}
                        style={{
                            padding: '6px 12px',
                            backgroundColor: '#484fdcc2',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '13px'
                        }}
                    >
                        保存聊天记录
                    </button>
                </div>
                
                {/* 메시지 표시 영역 */}
                <div className="messages" style={{ flex: 1, overflowY: 'auto', maxHeight: 'calc(100vh - 350px)' }}>
                    {messages.map((msg, index) => (
                        <div key={index} className={`message ${msg.role}`}>
                            <div className="message-content">
                                <MessageContent 
                                    text={msg.text} 
                                    onCodeChange={(newText) => {
                                        updateMessage(index, newText);
                                    }}
                                />
                            </div>
                        </div>
                    ))}
                    
                    {/* 로딩 표시 */}
                    {isLoading && (
                        <div className="message assistant">
                            <div className="message-content">
                                正在生成 GeoGebra 指令...
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>
                
                {/* 하단 영역: 추천 검색어 + 입력창 */}
                <div style={{ padding: '5px', borderTop: '1px solid #eaeaea' }}>
                    {/* 추천 검색어 표시 */}
                    <SuggestedQueries 
                        queries={suggestedQueries} 
                        onSelect={selectQuery}
                    />
                    
                    {/* 입력 컨테이너 */}
                    <div className="input-container">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !isLoading) {
                                    sendMessage();
                                }
                            }}
                            placeholder="请输入几何图形描述"
                            disabled={isLoading}
                        />
                        <button 
                            onClick={sendMessage}
                            disabled={isLoading}
                        >
                            发送
                        </button>
                    </div>
                </div>
                
                {/* 피드백 진행 중 표시 */}
                {feedbackInProgress && (
                    <div style={{
                        padding: '10px',
                        backgroundColor: '#e3f2fd',
                        borderRadius: '4px',
                        margin: '10px 0'
                    }}>
                        명령어 오류를 분석하고 수정된 응답을 생성 중입니다...
                    </div>
                )}
                
                {/* 기존 에러 메시지 표시 */}
                {errorMessage && (
                    <div className="error-message" style={{
                        backgroundColor: '#ffebee',
                        color: '#d32f2f',
                        padding: '10px',
                        borderRadius: '4px',
                        margin: '10px 0',
                        fontSize: '14px'
                    }}>
                        <h4 style={{ margin: '0 0 5px 0' }}>GeoGebra 명령 오류:</h4>
                        <pre style={{ 
                            margin: '0',
                            whiteSpace: 'pre-wrap',
                            fontSize: '13px'
                        }}>{errorMessage}</pre>
                    </div>
                )}
            </div>

            {/* 유사한 명령어 검색 결과 컴포넌트 */}
            <SearchResults 
                searchResults={searchResults}
                isSearching={isSearching}
            />
        </div>
    );
}

export default Chat; 