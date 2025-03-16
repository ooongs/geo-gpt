import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './Chat.css';
import Geogebra from 'react-geogebra';
import 'katex/dist/katex.min.css';
import MessageContent from './components/MessageContent';
import SuggestedQueries from './components/SuggestedQueries';
import ModelSelector from './components/ModelSelector';
import SearchResults from './components/SearchResults';

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

    // 메시지 전송 함수
    const sendMessage = async () => {
        if (!input.trim() || isLoading) return;

        const userMessage = { role: 'user', text: input };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);
        
        
        const app = window.app1;
        app.reset();
        // 동시에 명령어 검색 요청 보내기
        searchCommands(input);
        
        try {
            // API 요청 준비
            console.log('sending message...')
            const apiMessages = messages.map(msg => ({
                role: msg.role,
                content: msg.text
            }));
            
            // 현재 사용자 메시지 추가
            apiMessages.push({
                role: 'user',
                content: input
            });
            
            console.log('API Messages:', apiMessages);
            
            // 로컬 FastAPI 서버 호출
            const response = await axios.post(
                'http://localhost:8000/chat',
                {
                    model: selectedModel,
                    messages: apiMessages
                }
            );
            
            const responseText = response.data.content;
            
            // 응답 처리
            const normalizedText = responseText.replace(/\n{2,}/g, '\n');
            const commands = normalizedText.match(/```\s*([\s\S]*?)\s*```/s);
            
            console.log('responseText: ', responseText);
            console.log('normalizedText: ', normalizedText);
            console.log('commands: ', commands);
            
            // GeoGebra 명령어 실행
            if (commands && commands[1]) {
                setErrorMessage(null); // 새 명령 실행 전 오류 메시지 초기화
                const commandLines = commands[1].split('\n');
                const executedCommands = [];
                
                commandLines.forEach(command => {
                    if (!command.trim()) return;
                    
                    try {
                        const success = app.evalCommand(command.trim());
                        executedCommands.push({
                            command: command.trim(),
                            success: success
                        });
                        
                        if (!success) {
                            console.log(`명령 실행 실패: ${command}`);
                            // 오류는 MutationObserver가 캡처할 것임
                        }
                    } catch (error) {
                        console.error('명령 실행 예외:', error);
                    }
                });
                
                // 실행 결과 저장 (선택 사항)
                console.log('명령 실행 결과:', executedCommands);
            }
            
            // 응답 메시지 추가
            const assistantMessage = {
                role: 'assistant',
                text: responseText
            };
            setMessages(prev => [...prev, assistantMessage]);
            
        } catch (error) {
            console.error('Error:', error);
            setMessages(prev => [...prev, {
                role: 'assistant',
                text: '抱歉，发生错误。'
            }]);
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
                            console.log('오류 다이얼로그 감지됨:', node);
                            
                            // 오류 내용 추출 - dialogContent 내부만 선택
                            const dialogContent = node.querySelector('.dialogContent');
                            if (dialogContent) {
                                // dialogContent 내의 레이블만 선택
                                const labels = dialogContent.querySelectorAll('.gwt-Label');
                                
                                // 레이블 텍스트 모으기
                                const errorParts = Array.from(labels)
                                    .map(label => label.textContent.trim())
                                    .filter(text => text); // 빈 문자열 제거
                                
                                const errorMessage = errorParts.join(' ');
                                console.log('오류 내용:', errorMessage);
                                setErrorMessage(errorMessage);
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

    return (
        <div style={{ display: 'flex', gap: '20px'}}>
            {/* GeoGebra 컴포넌트 */}
            <Geogebra
                id='app1'
                width="800"
                height="800"
                showMenuBar
                showToolBar
                showAlgebraInput
            />

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
            </div>

            {/* 유사한 명령어 검색 결과 컴포넌트 */}
            <SearchResults 
                searchResults={searchResults}
                isSearching={isSearching}
            />

            {/* 오류 메시지 표시 */}
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
    );
}

export default Chat; 