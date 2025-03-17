import React, { useState, useEffect, useRef } from 'react';
import './Chat.css';
import './animations.css';
import Geogebra from 'react-geogebra';
import 'katex/dist/katex.min.css';
import MessageContent from './components/MessageContent';
import SuggestedQueries from './components/SuggestedQueries';
import ModelSelector from './components/ModelSelector';
import SearchResults from './components/SearchResults';
import ErrorInfoBlock from './components/ErrorInfoBlock';

// 서비스 및 유틸리티 가져오기
import { generateCommands, searchCommands as searchCommandsApi } from './services/api';
import { connectWebSocket, sendCommandResult } from './services/websocket';
import { validateCommand, executeCommand, resetApp, extractCommands } from './services/geogebra';
import { setupErrorObserver } from './utils/errorHandling';

// 피드백 서비스 가져오기
import { getCommandFeedback, validateAndExecuteCommands, executeValidatedCommands, 
         resetFeedbackState, MAX_FEEDBACK_RETRY } from './services/feedback';

// 상수 가져오기
import { SUGGESTED_QUERIES, MODEL_OPTIONS } from './constants';

function Chat() {
    // 상태 관리
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [suggestedQueries, setSuggestedQueries] = useState(SUGGESTED_QUERIES);
    const [selectedModel, setSelectedModel] = useState('gpt-4o-mini');
    const [errorMessage, setErrorMessage] = useState(null);
    const [feedbackInProgress, setFeedbackInProgress] = useState(false);
    const [commandErrors, setCommandErrors] = useState([]);
    const [ws, setWs] = useState(null);
    const [feedbackRetryCount, setFeedbackRetryCount] = useState(0);
    const [feedbackMessages, setFeedbackMessages] = useState([]);
    const [detectedError, setDetectedError] = useState(null);
    const [currentResponse, setCurrentResponse] = useState('');
    const [errorBlocks, setErrorBlocks] = useState([]); // 오류 블록 목록 저장
    const [activeTab, setActiveTab] = useState('chat'); // 'chat' 또는 'errors'
    const [unreadErrors, setUnreadErrors] = useState(0); // 읽지 않은 오류 수
    
    // 참조 객체
    const messagesEndRef = useRef(null);

    // 스크롤 관련 함수
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    };

    // 메시지 업데이트 시 스크롤
    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // WebSocket 메시지 핸들러 개선
    const handleWebSocketMessage = async (event) => {
        try {
            const data = JSON.parse(event.data);
            console.log('WebSocket 메시지 수신:', data);
            
            // 메시지 타입에 따라 처리
            switch (data.type) {
                case 'command_correction':
                    // 단일 명령어 수정 응답 처리
                    console.log(`명령어 수정: ${data.original} -> ${data.corrected}`);
                    
                    // 수정된 명령어 실행 전 테스트앱에서 검증
                    if (data.corrected) {
                        // 테스트 앱 초기화
                        resetApp('testApp');
                        
                        // 명령어 검증
                        const result = await validateCommand(data.corrected, setErrorMessage, ws);
                        
                        if (result.valid) {
                            // 유효한 명령어면 실행
                            executeCommand(data.corrected);
                        
                        // 수정 내용 메시지 추가
                            const updatedMessages = [...messages, {
                                role: 'system',
                                text: `**Command automatically corrected**\nOriginal: \`${data.original}\`\nCorrected: \`${data.corrected}\`\nError: ${data.error}`,
                                errorBlockId: null
                            }];
                            setMessages(updatedMessages);
                        } else {
                            // 유효하지 않은 명령어면 다시 피드백 요청
                            console.log('수정된 명령어도 오류 발생:', result.error);
                            
                            // 다시 피드백 요청
                            sendCommandResult(ws, data.corrected, false, result.error, true);
                            
                            // 사용자에게 알림
                            const updatedMessages = [...messages, {
                            role: 'system',
                                text: `**Command modification in progress**\nThe corrected command \`${data.corrected}\` also resulted in an error. Please request modification again.\nError: ${result.error}`,
                                errorBlockId: null
                            }];
                            setMessages(updatedMessages);
                        }
                    }
                    break;
                    
                case 'full_correction':
                    // 전체 응답 재생성 처리
                    console.log('전체 응답 재생성 수신:', data.content);
                    console.log('errorBlockId:', data.errorBlockId);
                    
                    // 디버깅을 위한 메시지 상태 로깅
                    console.log('현재 메시지 목록:', messages.map(msg => ({
                        role: msg.role,
                        isFeedback: msg.isFeedback || false,
                        errorBlockId: msg.errorBlockId
                    })));
                    
                    // 피드백 메시지 찾기 및 대체
                    setMessages(prevMessages => {
                        const newMessages = [...prevMessages];
                        
                        // 피드백 메시지 찾기 (조건 완화)
                        const feedbackIndex = newMessages.findIndex(msg => 
                            msg.role === 'system' && msg.isFeedback === true
                        );
                        
                        console.log('찾은 피드백 메시지 인덱스:', feedbackIndex);
                        
                        if (feedbackIndex !== -1) {
                            // 피드백 메시지 대체
                            newMessages.splice(feedbackIndex, 1, {
                        role: 'assistant',
                        text: data.content,
                                isRegenerated: true,
                        errorBlockId: null
                            });
                            
                            console.log('피드백 메시지를 대체했습니다.');
                        } else {
                            // 피드백 메시지를 찾지 못한 경우 새 메시지 추가
                            newMessages.push({
                                role: 'assistant',
                                text: data.content,
                                errorBlockId: null
                            });
                            
                            console.log('피드백 메시지를 찾지 못해 새 메시지를 추가했습니다.');
                        }
                        return newMessages;
                    });
                    
                    // 오류 블록 상태 업데이트 (errorBlockId가 있는 경우)
                    if (data.errorBlockId) {
                        updateErrorBlockStatus(data.errorBlockId, true);
                    } else {
                        // 모든 미해결 오류 블록을 해결 상태로 표시
                        setErrorBlocks(prev => prev.map(block => 
                            !block.isResolved ? { ...block, isResolved: true } : block
                        ));
                    }
                    
                    // 명령어 추출
                    const commandLines = extractCommands(data.content);
                    
                    if (commandLines.length > 0) {
                        // 테스트 앱 초기화 - 더 확실하게 초기화
                        if (window.testApp) {
                            window.testApp.reset();
                            // 초기화 후 약간의 지연 추가
                            await new Promise(resolve => setTimeout(resolve, 300));
                        }
                        
                        // 오류 메시지 초기화
                        setErrorMessage(null);
                        window.geogebraErrorMessage = null;
                        
                        // 직접 메인 앱에서 실행 (테스트 검증 건너뛰기)
                        resetApp();
                        
                        // 명령어 직접 실행
                        let executionSuccess = true;
                        for (const command of commandLines) {
                            if (!command.trim()) continue;
                            
                            try {
                                console.log(`명령어 실행: ${command}`);
                                const success = executeCommand(command);
                                if (!success) {
                                    console.log(`명령어 실행 실패: ${command}`);
                                    executionSuccess = false;
                                }
                            } catch (err) {
                                console.error(`명령어 실행 오류: ${err.message}`);
                                executionSuccess = false;
                            }
                        }
                        
                        // 실행 결과 로그
                        console.log(`명령어 실행 ${executionSuccess ? '성공' : '실패'}`);
                        
                        // 성공 시 피드백 메시지 초기화
                        if (executionSuccess) {
                            setFeedbackMessages([]);
                        }
                        
                        // 재시도 횟수 초기화
                        setFeedbackRetryCount(0);
                    }
                    break;
                    
                case 'confirmation':
                    // 성공 확인 메시지
                    console.log('서버 확인 메시지:', data.message);
                    break;
                    
                case 'error':
                    // 오류 메시지
                    console.error('서버 오류 메시지:', data.message);
                    break;
                    
                default:
                    console.warn('알 수 없는 메시지 타입:', data.type);
            }
        } catch (error) {
            console.error('WebSocket 메시지 처리 오류:', error);
        }
    };
    
    // WebSocket 연결 설정
    useEffect(() => {
        const newWs = connectWebSocket();
        if (newWs) {
            newWs.onmessage = handleWebSocketMessage;
            setWs(newWs);
        }
        
        return () => {
            if (newWs) {
                newWs.close();
            }
        };
    }, []);
    
    // 오류 감지 설정
    useEffect(() => {
        const observer = setupErrorObserver((errorMsg) => {
            // 오류 메시지 상태 설정
            setErrorMessage(errorMsg);
            
            // 현재 응답과 함께 감지된 오류 정보 설정
            if (errorMsg) {
                setDetectedError({
                    message: errorMsg,
                    response: currentResponse
                });
            }
        });
        
        return () => observer.disconnect();
    }, [currentResponse]);
    
    // GeoGebra 앱 초기화 확인
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
            }
        }, 500);
        
        return () => {
            clearInterval(checkMainApp);
            clearInterval(checkTestApp);
        };
    }, []);

    // 명령어 검색 함수
    const searchCommands = async (query) => {
        setIsSearching(true);
        try {
            const results = await searchCommandsApi(query);
            setSearchResults(results);
        } catch (error) {
            console.error('명령어 검색 오류:', error);
            setSearchResults([]);
        }
        setIsSearching(false);
    };
    
    // 상태 초기화 함수
    const resetAllFeedbackState = () => {
        resetFeedbackState({
            setFeedbackMessages,
            setFeedbackInProgress,
            setCommandErrors,
            setErrorMessage,
            setDetectedError
        });
    };

    // 메시지 전송 함수 개선
    const sendMessage = async () => {
        if (!input.trim() || isLoading) return;

        // 상태 초기화
        resetAllFeedbackState();
        setDetectedError(null);

        const userMessage = { role: 'user', text: input };
        setMessages(prevMessages => [...prevMessages, userMessage]);
        setInput('');
        setIsLoading(true);

        searchCommands(input);
        
        // 테스트 앱 초기화
        resetApp('testApp');
        
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
            const response = await generateCommands(selectedModel, apiMessages);
            const responseText = response.content;
            
            // 현재 응답 저장
            setCurrentResponse(responseText);
            
            // 명령어 추출
            const commandLines = extractCommands(responseText);
            
            if (commandLines.length > 0) {
                // 명령어 검증 및 실행 처리
                const processCommands = async (commandsToValidate, responseToUpdate, retryCount = 0) => {
                    // 명령어 검증
                    const validationResult = await validateAndExecuteCommands(
                        commandsToValidate, 
                        responseToUpdate, 
                        setFeedbackInProgress,
                        { setErrorMessage },
                        ws,
                        retryCount
                    );
                    
                    const { hasErrors, errors } = validationResult;
                    let errorBlockId = validationResult.errorBlockId;
                    
                    if (hasErrors) {
                        // 오류가 있는 경우 피드백 요청
                        console.log(`명령어 오류 발견 (시도 ${retryCount + 1}):`, errors);
                        setCommandErrors(errors);
                        
                        // 첫 번째 시도에서만 오류 블록 추가
                        if (retryCount === 0) {
                            errorBlockId = addErrorBlock(
                                errors.map(err => `Command: ${err.command}\nError: ${err.error}`).join('\n\n'),
                                responseToUpdate
                            );
                            
                            // 오류 피드백 메시지를 messages에 직접 추가
                            setMessages(prev => [...prev, {
                                role: 'system',
                                text: `${errors.map(err => 
                                    `Command: \`${err.command}\`\nError: ${err.error}`).join('\n\n')}`,
                                errorBlockId: errorBlockId,
                                isFeedback: true
                            }]);
                        }
                        
                        // 피드백 메시지 상태 업데이트
                        const feedbackMessage = {
                            retryCount: retryCount + 1,
                            maxRetry: MAX_FEEDBACK_RETRY,
                            errors: errors,
                            originalCommands: commandsToValidate
                        };
                        
                        console.log("피드백 메시지 직접 설정:", feedbackMessage);
                        setFeedbackMessages(prev => [feedbackMessage]);
                        
                        // 약간의 지연 추가
                        await new Promise(resolve => setTimeout(resolve, 100));
                        
                        try {
                            // 피드백 요청
                            const updatedResponse = await getCommandFeedback(apiMessages, responseText, errors, ws, retryCount);
                            
                            // 수정된 응답이 있는 경우 마지막 메시지만 업데이트 (새 메시지 추가 대신)
                            if (updatedResponse) {
                                // 변경된 방식: 마지막 assistant 메시지만 업데이트
                                setMessages(prev => {
                                    const newMessages = [...prev];
                                    // assistant 메시지의 마지막 인덱스 찾기
                                    let lastAssistantIndex = newMessages.length - 1;
                                    while (lastAssistantIndex >= 0 && newMessages[lastAssistantIndex].role !== 'assistant') {
                                        lastAssistantIndex--;
                                    }
                                    
                                    if (lastAssistantIndex >= 0) {
                                        // 마지막 assistant 메시지 업데이트
                                        newMessages[lastAssistantIndex] = {
                                            ...newMessages[lastAssistantIndex],
                                            text: updatedResponse,
                                            isRegenerated: true,
                                            errorBlockId: errorBlockId
                                        };
                                    }
                                    
                                    return newMessages;
                                });
                            }
                            
                            // 수정된 명령어 추출 및 실행
                            const newCommandLines = extractCommands(updatedResponse);
                            if (newCommandLines.length > 0) {
                                // 메인 앱 초기화
                                resetApp();
                                
                                // 재귀적으로 검증 및 실행 (최대 재시도 횟수 제한)
                                if (retryCount < 3) {
                                    await processCommands(newCommandLines, updatedResponse, retryCount + 1);
                                } else {
                                    console.log('최대 재시도 횟수 도달');
                                    // 마지막 시도에서도 실패한 경우, 성공한 명령어만 실행
                                    for (const command of newCommandLines) {
                                        if (!command.trim()) continue;
                                        
                                        const result = await validateCommand(command, setErrorMessage, ws);
                                        if (result.valid) {
                                            executeCommand(command);
                                        }
                                    }
                                    // 피드백 진행 상태 종료
                                    setFeedbackInProgress(false);
                                }
                            } else {
                                // 피드백 진행 상태 종료
                                setFeedbackInProgress(false);
                            }
                        } catch (error) {
                            console.error("피드백 처리 중 오류 발생:", error);
                            // 오류 발생 시에도 피드백 진행 상태 종료
                            setFeedbackInProgress(false);
                        }
                    } else {
                        // 오류가 없는 경우 바로 실행
                        if (retryCount === 0) {
                            // 첫 번째 시도에서 성공한 경우 메시지 추가
                            setMessages(prevMessages => {
                                // 유저 메시지가 있는지 확인
                                const lastMessage = prevMessages[prevMessages.length - 1];
                                const hasUserMessage = lastMessage && lastMessage.role === 'user';
                                
                                // 유저 메시지가 있으면 그대로 두고 응답 추가
                                return [...prevMessages, {
                                    role: 'assistant',
                                    text: responseToUpdate,
                                    errorBlockId: null
                                }];
                            });
                        } else {
                            // 재시도에서 성공한 경우 - 재생성된 메시지로 표시
                            setMessages(prevMessages => {
                                return [...prevMessages, {
                                    role: 'assistant',
                                    text: responseToUpdate,
                                    isRegenerated: true,
                                    errorBlockId: null
                                }];
                            });
                        }
                        
                        // 명령어 실행
                        executeValidatedCommands(commandsToValidate);
                        
                        // 피드백 메시지 초기화
                        setFeedbackMessages([]);
                        
                        // 피드백 진행 상태 종료
                        setFeedbackInProgress(false);
                    }
                };
                
                // 명령어 검증 및 실행 시작
                await processCommands(commandLines, responseText);
                
            } else {
                // 명령어가 없는 경우 메시지만 추가
                const updatedMessages = [...messages, {
                    role: 'assistant',
                    text: responseText,
                    errorBlockId: null
                }];
                setMessages(updatedMessages);
            }
        } catch (error) {
            console.error('API 요청 오류:', error);
            
            // 서버 연결 오류 처리
            if (error.code === 'ERR_NETWORK') {
              const updatedMessages = [...messages, {
                role: 'assistant',
                text: 'A server connection error occurred. Please check if the backend server is running.'
              }];
              setMessages(updatedMessages);
            } else {
              const updatedMessages = [...messages, {
                role: 'assistant',
                text: 'An error occurred: ' + (error.message || 'Unknown error')
              }];
              setMessages(updatedMessages);
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

    // 피드백 메시지 상태 변경 감지
    useEffect(() => {
        console.log('피드백 메시지 상태 변경:', feedbackMessages);
    }, [feedbackMessages]);

    // 피드백 진행 상태 변경 감지
    useEffect(() => {
        console.log('피드백 진행 상태 변경:', feedbackInProgress);
    }, [feedbackInProgress]);

    // 오류 블록 추가 함수 수정
    const addErrorBlock = (errorMessage, originalResponse) => {
        console.log("에러 블록 추가:", errorMessage);
        const newErrorBlock = {
            id: Date.now(),
            errorMessage,
            originalResponse,
            isResolved: false,
            timestamp: new Date(),
            read: false // 읽음 상태 추적
        };
        
        setErrorBlocks(prev => [...prev, newErrorBlock]);
        
        // 현재 메시지 상태 로깅
        console.log("에러 블록 추가 시 메시지 상태:", messages);
        
        // 현재 탭이 errors가 아닌 경우 미읽음 카운트 증가
        if (activeTab !== 'errors') {
            setUnreadErrors(prev => prev + 1);
        }
        
        return newErrorBlock.id;
    };

    // 탭 변경 함수
    const changeTab = (tab) => {
        setActiveTab(tab);
        
        // 'errors' 탭으로 이동 시 모든 오류를 읽음 상태로 표시
        if (tab === 'errors') {
            setUnreadErrors(0);
            setErrorBlocks(prev => 
                prev.map(block => ({...block, read: true}))
            );
        }
    };

    // 오류 블록 제거 함수
    const removeErrorBlock = (id) => {
        setErrorBlocks(prev => prev.filter(block => block.id !== id));
    };

    // 오류 블록 상태 업데이트 함수
    const updateErrorBlockStatus = (id, isResolved = true) => {
        setErrorBlocks(prev => prev.map(block => 
            block.id === id ? { ...block, isResolved } : block
        ));
    };

    // 명령어 검증 부분에 로깅 추가
    console.log("명령어 검증 결과:", commandErrors);
    
    // errorBlocks 상태 변경 감지
    useEffect(() => {
        console.log("오류 블록 상태 변경:", errorBlocks);
    }, [errorBlocks]);

    // 메시지 컴포넌트 분리
    const MessageItem = ({ msg, index, updateMessage, changeTab }) => {
        if (msg.isFeedback) {
            return (
                <div className={`message ${msg.role}`} style={{ marginBottom: '10px' }}>
                    <div className="message-content" style={{ position: 'relative' }}>
                        {/* 로딩 상태 표시 */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            marginBottom: '10px',
                            padding: '8px',
                            backgroundColor: 'rgba(33, 150, 243, 0.1)',
                            borderRadius: '4px'
                        }}>
                            <div className="loading-spinner"></div>
                            <span style={{ fontWeight: 'bold', color: '#2196f3' }}>
                                Fixing command errors...   
                                <button 
                                    onClick={() => changeTab('errors')}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        color: '#2196f3',
                                        textDecoration: 'underline',
                                        cursor: 'pointer',
                                        padding: 0,
                                        fontSize: 'inherit',
                                        fontWeight: 'bold',
                                        marginLeft: '8px'
                                    }}
                                >
                                    View Errors
                                </button>
                            </span>
                        </div>
                        
                        <MessageContent 
                            text={msg.text} 
                            onCodeChange={(newText) => updateMessage(index, newText)}
                        />
                    </div>
                </div>
            );
        }
        
        return (
            <div className={`message ${msg.role}`}>
                <div className="message-content" style={{
                    ...(msg.role === 'user' ? {
                        backgroundColor: 'rgba(255, 255, 255, 0.9)',
                        color: '#000000',
                        marginLeft: 'auto',
                        maxWidth: '100%',
                        border: 'none',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
                    } : {
                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                        color: '#212529',
                        marginRight: 'auto',
                        maxWidth: '100%',
                        border: 'none',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
                    })
                }}>
                    {msg.isRegenerated && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            backgroundColor: '#e8f5e9',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            marginBottom: '8px',
                            fontSize: '13px',
                            color: '#2e7d32',
                            fontWeight: 'bold'
                        }}>
                            <span>✓ Regenerated Command</span>
                            <button 
                                onClick={() => changeTab('errors')}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#2e7d32',
                                    textDecoration: 'underline',
                                    cursor: 'pointer',
                                    marginLeft: '8px',
                                    padding: 0,
                                    fontSize: 'inherit'
                                }}
                            >
                                View Error History
                            </button>
                        </div>
                    )}
                    
                    <MessageContent 
                        text={msg.text} 
                        onCodeChange={(newText) => updateMessage(index, newText)}
                    />
                </div>
            </div>
        );
    };

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
                        modelOptions={MODEL_OPTIONS}
                    />
                    <button
                        onClick={saveChat}
                        style={{
                            padding: '6px 12px',
                            backgroundColor: '#4f46e5',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            boxShadow: '0 2px 4px rgba(79, 70, 229, 0.3)',
                            transition: 'all 0.2s ease'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#4338ca'}
                        onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#4f46e5'}
                    >
                        Save Chat History
                    </button>
                </div>
                
                {/* 탭 인터페이스 */}
                <div style={{ 
                    display: 'flex', 
                    borderBottom: '1px solid #e9ecef',
                    marginBottom: '10px'
                }}>
                    <div 
                        onClick={() => changeTab('chat')}
                        style={{
                            padding: '8px 16px',
                            cursor: 'pointer',
                            borderBottom: activeTab === 'chat' ? '3px solid #4f46e5' : '3px solid transparent',
                            color: activeTab === 'chat' ? '#4f46e5' : '#6b7280',
                            fontWeight: activeTab === 'chat' ? '600' : '400',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        Chat
                    </div>
                    <div 
                        onClick={() => changeTab('errors')}
                        style={{
                            padding: '8px 16px',
                            cursor: 'pointer',
                            borderBottom: activeTab === 'errors' ? '3px solid #ef4444' : '3px solid transparent',
                            color: activeTab === 'errors' ? '#ef4444' : '#6b7280',
                            fontWeight: activeTab === 'errors' ? '600' : '400',
                            position: 'relative',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        Error Log
                        {unreadErrors > 0 && (
                            <span style={{
                                position: 'absolute',
                                top: '2px',
                                right: '2px',
                                backgroundColor: '#ef4444',
                                color: 'white',
                                borderRadius: '50%',
                                width: '20px',
                                height: '20px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '12px',
                                fontWeight: 'bold'
                            }}>
                                {unreadErrors}
                            </span>
                        )}
                    </div>
                </div>
                
                {/* 채팅 탭 컨텐츠 */}
                {activeTab === 'chat' && (
                    <div className="messages" style={{ 
                        flex: 1, 
                        overflowY: 'auto', 
                        maxHeight: 'calc(100vh - 390px)',
                        position: 'relative'
                    }}>
                        {messages.map((msg, index) => (
                            <React.Fragment key={index}>
                                <MessageItem 
                                    msg={msg} 
                                    index={index} 
                                    updateMessage={updateMessage} 
                                    changeTab={changeTab}
                                />
                            </React.Fragment>
                        ))}
                        
                        {/* 로딩 표시 */}
                        {isLoading && (
                            <div className="message assistant">
                                <div className="message-content" style={{
                                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                    color: '#212529',
                                    marginRight: 'auto',
                                    maxWidth: '100%',
                                    border: 'none',
                                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                                    overflow: 'hidden',
                                    position: 'relative',
                                    padding: '16px',
                                    borderRadius: '12px'
                                }}>
                                    <div style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        padding: '12px',
                                        background: 'transparent',
                                        position: 'relative',
                                        overflow: 'hidden'
                                    }}>
                                        {/* 배경 애니메이션
                                        <div style={{
                                            position: 'absolute',
                                            top: '-50%',
                                            left: '-50%',
                                            width: '200%',
                                            height: '200%',
                                            background: `conic-gradient(
                                                transparent 20%, 
                                                rgba(99, 102, 241, 0.1) 40%,
                                                transparent 60%
                                            )`,
                                            animation: 'rotate 3s linear infinite'
                                        }}></div> */}

                                        {/* 웨이브 애니메이션 로딩 인디케이터 */}
                                        <div style={{
                                            display: 'flex',
                                            justifyContent: 'center',
                                            marginBottom: '24px',
                                            position: 'relative',
                                            height: '40px'
                                        }}>
                                            {[...Array(3)].map((_, i) => (
                                                <div key={i} style={{
                                                    width: '8px',
                                                    height: '40px',
                                                    backgroundColor: '#6366f1',
                                                    margin: '0 3px',
                                                    borderRadius: '4px',
                                                    animation: `wave 1.2s ease-in-out infinite`,
                                                    animationDelay: `${i * 0.15}s`,
                                                    transformOrigin: 'bottom'
                                                }}></div>
                                            ))}
                                        </div>

                                        {/* 그라데이션 텍스트 애니메이션 */}
                                        <div style={{
                                            fontSize: '15px',
                                            fontWeight: '600',
                                            marginBottom: '8px',
                                            background: 'linear-gradient(45deg, #4f46e5, #3b82f6, #6366f1)',
                                            backgroundSize: '300% 300%',
                                            WebkitBackgroundClip: 'text',
                                            WebkitTextFillColor: 'transparent',
                                            animation: 'gradient-text 3s ease infinite'
                                        }}>
                                            Generating GeoGebra Commands
                                        </div>

                                        {/* 원형 프로그레스 바 */}
                                        <svg width="60" height="60" style={{ margin: '16px 0', transformOrigin: 'center' }}>
                                            <circle 
                                                cx="30" 
                                                cy="30" 
                                                r="24" 
                                                stroke="#e5e7eb" 
                                                strokeWidth="4" 
                                                fill="none"
                                            />
                                            <circle 
                                                cx="30" 
                                                cy="30" 
                                                r="24" 
                                                stroke="#4f46e5" 
                                                strokeWidth="4" 
                                                fill="none"
                                                strokeLinecap="round"
                                                strokeDasharray="150.8"
                                                strokeDashoffset="150.8"
                                                style={{
                                                    animation: 'circular-progress 2s linear infinite',
                                                    transformOrigin: 'center'
                                                }}
                                            />
                                        </svg>
                                    </div>
                                </div>
                            </div>
                        )}
                        
                        <div ref={messagesEndRef} style={{ overflow: 'hidden' }} />
                    </div>
                )}
                
                {/* 에러 로그 탭 컨텐츠 */}
                {activeTab === 'errors' && (
                    <div className="error-log" style={{ 
                        flex: 1, 
                        overflowY: 'auto', 
                        maxHeight: 'calc(100vh - 390px)',
                        padding: '10px'
                    }}>
                        {errorBlocks.length === 0 ? (
                            <div style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                height: '200px',
                                color: '#6b7280',
                                textAlign: 'center',
                                padding: '20px'
                            }}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <p style={{ marginTop: '16px' }}>No errors.</p>
                                <p style={{ fontSize: '13px' }}>Errors that occur during command execution will be displayed here.</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div style={{ 
                                    display: 'flex', 
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    marginBottom: '8px'
                                }}>
                                    <h3 style={{ margin: 0, fontSize: '16px' }}>Error List</h3>
                                    <button
                                        onClick={() => setErrorBlocks([])}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            color: '#6b7280',
                                            cursor: 'pointer',
                                            fontSize: '13px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px'
                                        }}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                        Clear All
                                    </button>
                                </div>
                                
                                {errorBlocks.map((block, index) => (
                                    <div 
                                        key={block.id} 
                                        style={{
                                            border: '1px solid #e9ecef',
                                            borderLeft: block.isResolved ? '4px solid #10b981' : '4px solid #ef4444',
                                            borderRadius: '8px',
                                            padding: '12px',
                                            backgroundColor: block.isResolved ? 'rgba(16, 185, 129, 0.05)' : 'rgba(239, 68, 68, 0.05)',
                                            position: 'relative'
                                        }}
                                    >
                                        <div style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            marginBottom: '8px'
                                        }}>
                                            <span style={{
                                                fontSize: '14px',
                                                fontWeight: 'bold',
                                                color: block.isResolved ? '#10b981' : '#ef4444'
                                            }}>
                                                {block.isResolved ? 'Resolved' : 'Unresolved'}
                                            </span>
                                            <span style={{
                                                fontSize: '12px',
                                                color: '#6b7280'
                                            }}>
                                                {new Date(block.timestamp || Date.now()).toLocaleString()}
                                            </span>
                                        </div>
                                        
                                        <ErrorInfoBlock 
                                            errorMessage={block.errorMessage}
                                            originalResponse={block.originalResponse}
                                            isResolved={block.isResolved}
                                        />
                                        
                                        <div style={{
                                            display: 'flex',
                                            justifyContent: 'flex-end',
                                            gap: '8px',
                                            marginTop: '8px'
                                        }}>
                                            <button
                                                onClick={() => updateErrorBlockStatus(block.id, !block.isResolved)}
                                                style={{
                                                    backgroundColor: block.isResolved ? '#6b7280' : '#10b981',
                                                    color: 'white',
                                                    border: 'none',
                                                    padding: '4px 8px',
                                                    borderRadius: '4px',
                                                    fontSize: '12px',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                {block.isResolved ? 'Mark as Unresolved' : 'Mark as Resolved'}
                                            </button>
                                            <button
                                                onClick={() => removeErrorBlock(block.id)}
                                                style={{
                                                    backgroundColor: '#ef4444',
                                                    color: 'white',
                                                    border: 'none',
                                                    padding: '4px 8px',
                                                    borderRadius: '4px',
                                                    fontSize: '12px',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                Delete
                                            </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                        </div>
                    )}
                
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
                            placeholder="Please enter a geometric description"
                            disabled={isLoading}
                            style={{
                                flex: 1,
                                padding: '10px 16px',
                                border: '1px solid #e0e7ff',
                                borderRadius: '8px',
                                fontSize: '13px',
                                boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)',
                                transition: 'all 0.2s ease'
                            }}
                        />
                        <button 
                            onClick={sendMessage}
                            disabled={isLoading}
                            style={{
                                padding: '10px 20px',
                                backgroundColor: '#4f46e5',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                cursor: isLoading ? 'not-allowed' : 'pointer',
                                fontSize: '13px',
                                fontWeight: '500',
                                boxShadow: '0 2px 4px rgba(79, 70, 229, 0.3)',
                                opacity: isLoading ? 0.7 : 1,
                                transition: 'all 0.2s ease'
                            }}
                            onMouseOver={(e) => !isLoading && (e.currentTarget.style.backgroundColor = '#4338ca')}
                            onMouseOut={(e) => !isLoading && (e.currentTarget.style.backgroundColor = '#4f46e5')}
                        >
                            Send
                        </button>
                    </div>
                </div>
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