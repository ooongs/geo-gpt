import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './Chat.css';
import Geogebra from 'react-geogebra';
import 'katex/dist/katex.min.css';
import MessageContent from './components/MessageContent';
import SuggestedQueries from './components/SuggestedQueries';
import SuggestedCommandsList from './components/SuggestedCommands';
import { executeGeoGebraCommands, resetGeoGebra } from './utils/geogebraUtils';
import ModelSelector from './components/ModelSelector';
import SearchResults from './components/SearchResults';

function Chat() {
    // 상태 관리
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState([]); // 시스템 프롬프트 제외
    const [isLoading, setIsLoading] = useState(false);
    const [searchResults, setSearchResults] = useState([]); // 검색 결과 상태 추가
    const [isSearching, setIsSearching] = useState(false); // 검색 중 상태 추가
    const [suggestedCommands, setSuggestedCommands] = useState([]);
    const [suggestedQueries, setSuggestedQueries] = useState([
        "请画出边长为5的正三角形 ",
        "请画出过(0,0)、(1,2)、(2,2)的圆",
        "请画出边长为2的正方形",
        "请画出圆心为(0,0)、半径为2的圆",
        "请画出正四面体"
    ]);
    const [selectedModel, setSelectedModel] = useState('gpt-4o-mini');

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
                    threshold: 0.5 // 유사도 임계값
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
        
        resetGeoGebra();
        
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
                executeGeoGebraCommands(commands[1]);
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
                text: '죄송합니다, 오류가 발생했습니다.'
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

    // 명령어 선택 함수
    const selectCommand = (command) => {
        resetGeoGebra();
        executeGeoGebraCommands(command);
        
        // 선택한 명령어를 메시지에 추가
        const assistantMessage = {
            role: 'assistant',
            text: `선택하신 명령어를 실행했습니다:\n\n\`\`\`\n${command}\n\`\`\``
        };
        setMessages(prev => [...prev, assistantMessage]);
        
        // 추천 명령어 초기화
        setSuggestedCommands([]);
    };

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
                        채팅 기록 저장
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
                                응답 생성 중...
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
                            placeholder="도형에 대한 설명을 입력하세요"
                            disabled={isLoading}
                        />
                        <button 
                            onClick={sendMessage}
                            disabled={isLoading}
                        >
                            전송
                        </button>
                    </div>
                </div>
            </div>

            {/* 유사한 명령어 검색 결과 컴포넌트 */}
            <SearchResults 
                searchResults={searchResults}
                isSearching={isSearching}
                selectCommand={selectCommand}
            />
        </div>
    );
}

export default Chat; 