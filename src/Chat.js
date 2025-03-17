import React, { useState, useEffect, useRef } from 'react';
import './Chat.css';
import Geogebra from 'react-geogebra';
import 'katex/dist/katex.min.css';
import MessageContent from './components/MessageContent';
import SuggestedQueries from './components/SuggestedQueries';
import ModelSelector from './components/ModelSelector';
import SearchResults from './components/SearchResults';
import ErrorInfoBlock from './components/ErrorInfoBlock';

// 서비스 및 유틸리티 가져오기
import { generateCommands, searchCommands as searchCommandsApi } from './services/api';
import { connectWebSocket, sendCommandResult, sendQuery } from './services/websocket';
import { validateCommand, executeCommand, resetApp, extractCommands } from './services/geogebra';
import { setupErrorObserver } from './utils/errorHandling';

function Chat() {
    // 상태 관리
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [suggestedQueries, setSuggestedQueries] = useState([
        "请画出边长为5的正三角形 ",
        "请画出过(0,0)、(1,2)、(2,2)的圆",
        "请画出边长为2的正方形",
        "请画出圆心为(0,0)、半径为2的圆",
        "请画出正四面体",
        "请画出正方体",
        "请画出正八面体",
    ]);
    const [selectedModel, setSelectedModel] = useState('gpt-4o-mini');
    const [errorMessage, setErrorMessage] = useState(null);
    const [feedbackInProgress, setFeedbackInProgress] = useState(false);
    const [commandErrors, setCommandErrors] = useState([]);
    const [ws, setWs] = useState(null);
    const [feedbackRetryCount, setFeedbackRetryCount] = useState(0);
    const [feedbackMessages, setFeedbackMessages] = useState([]);
    const MAX_FEEDBACK_RETRY = 3; // 최대 재시도 횟수
    const [detectedError, setDetectedError] = useState(null);
    const [currentResponse, setCurrentResponse] = useState('');
    const [errorBlocks, setErrorBlocks] = useState([]); // 오류 블록 목록 저장
    
    // 참조 객체
    const messagesEndRef = useRef(null);

    // 모델 옵션 정의
    const modelOptions = [
        { id: 'gpt-4o-mini', name: 'ChatGPT (GPT-4o-mini)' },
        { id: 'deepseek-chat', name: 'DeepSeek Chat' }
    ];

    // 스크롤 관련 함수
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
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
                                text: `**명령어 자동 수정됨**\n원본: \`${data.original}\`\n수정: \`${data.corrected}\`\n오류: ${data.error}`,
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
                                text: `**명령어 수정 중**\n수정된 명령어 \`${data.corrected}\`에서도 오류가 발생했습니다. 다시 수정을 요청합니다.\n오류: ${result.error}`,
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
    
    // 오류 피드백을 위한 서버 요청 함수 개선
    const getCommandFeedback = async (originalMessages, responseText, errorDetails, retryCount = 0) => {
        try {
            const userQuery = originalMessages.find(msg => msg.role === 'user')?.content || '';
            const MAX_RETRY = 3; // 최대 재시도 횟수

            // 재시도 횟수 초과 확인
            if (retryCount >= MAX_RETRY) {
                return `GeoGebra 명령어 수정 시도 횟수(${MAX_RETRY}회)를 초과했습니다. 다른 방식으로 질문해 보세요.`;
            }

            // WebSocket이 연결되어 있는지 확인
            if (ws && ws.readyState === WebSocket.OPEN) {
                // 먼저 사용자 쿼리 전송
                sendQuery(ws, userQuery);
                
                // 각 오류 명령어에 대해 전체 응답 재생성 요청
                console.log('responseText:', responseText);
                for (const err of errorDetails) {
                    sendCommandResult(ws, err.command, responseText, false, err.error, true);
                }
                
                // 백엔드에서 자동으로 수정하므로 여기서는 빈 문자열 반환
                return '';
            } else {
                // WebSocket 연결이 없는 경우 기존 방식으로 처리
                const feedbackMessages = [...originalMessages, {
                    role: 'user',
                    content: `다음 명령어 실행 중 오류가 발생했습니다. 수정된 명령어를 제공해주세요:\n\n${
                        errorDetails.map(err => `명령어: ${err.command}\n오류: ${err.error}`).join('\n\n')
                    }`
                }];
                console.log('No WebSocket:', feedbackMessages);
                const response = await generateCommands(selectedModel, feedbackMessages);
                return response.content;
            }
        } catch (error) {
            console.error('피드백 요청 오류:', error);
            return '명령어 수정 중 오류가 발생했습니다: ' + error.message;
        }
    };

    // 상태 초기화 함수
    const resetFeedbackState = () => {
        setFeedbackMessages([]);
        setFeedbackInProgress(false);
        setCommandErrors([]);
        setErrorMessage(null);
        setDetectedError(null);
    };

    // 메시지 전송 함수 개선
    const sendMessage = async () => {
        if (!input.trim() || isLoading) return;

        // 상태 초기화
        resetFeedbackState();
        setDetectedError(null);

        const userMessage = { role: 'user', text: input };
        const updatedMessages = [...messages, userMessage];
        setMessages(updatedMessages);
        setInput('');
        setIsLoading(true);

        searchCommands(input);
        
        // 테스트 앱 초기화
        resetApp('testApp');
        
        try {
            // API 요청 준비
            const apiMessages = updatedMessages.map(msg => ({
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
                // 명령어 검증 및 실행 함수 (재귀적으로 호출 가능)
                const validateAndExecuteCommands = async (commandsToValidate, responseToUpdate, retryCount = 0) => {
                // 모든 명령어 검증
                let hasErrors = false;
                const errors = [];
                    let errorBlockId = null;
                    
                    console.log("명령어 검증 시작, retryCount:", retryCount);
                    
                    // 로딩 상태 설정 - 검증 시작 시
                    setFeedbackInProgress(true);
                    
                    for (const command of commandsToValidate) {
                    if (!command.trim()) continue;
                    // 명령어 검증 (testApp에서 실행)
                        const result = await validateCommand(command, setErrorMessage, ws);
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
                        console.log(`명령어 오류 발견 (시도 ${retryCount + 1}):`, errors);
                    setCommandErrors(errors);
                    
                        // 첫 번째 시도에서만 오류 블록 추가
                        if (retryCount === 0) {
                            errorBlockId = addErrorBlock(
                                errors.map(err => `명령어: ${err.command}\n오류: ${err.error}`).join('\n\n'),
                                responseToUpdate
                            );
                            
                            // 오류 피드백 메시지를 messages에 직접 추가
                            setMessages(prev => [...prev, {
                                role: 'system',
                                text: `**명령어 오류 발생**\n${errors.map(err => 
                                    `명령어: \`${err.command}\`\n오류: ${err.error}`).join('\n\n')}`,
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
                            const updatedResponse = await getCommandFeedback(apiMessages, responseText, errors, retryCount);
                    
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
                                    await validateAndExecuteCommands(newCommandLines, updatedResponse, retryCount + 1);
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
                            const updatedMessages = [...messages, {
                                role: 'assistant',
                                text: responseToUpdate,
                                errorBlockId: null
                            }];
                            setMessages(updatedMessages);
                        } else {
                            // 재시도에서 성공한 경우 - 재생성된 메시지로 표시
                            const updatedMessages = [...messages, {
                        role: 'assistant',
                                text: responseToUpdate,
                                isRegenerated: true,
                                errorBlockId: null
                            }];
                            setMessages(updatedMessages);
                        }
                        
                        // 메인 앱 초기화 (재시도 시에는 이미 초기화되어 있음)
                        if (retryCount === 0) resetApp();
                    
                    // 검증된 명령어 모두 실행
                        for (const command of commandsToValidate) {
                            if (command.trim()) {
                                executeCommand(command);
                            }
                        }
                        
                        // 피드백 메시지 초기화
                        setFeedbackMessages([]);
                        
                        // 피드백 진행 상태 종료
                        setFeedbackInProgress(false);
                    }
                };
                
                // 명령어 검증 및 실행 시작
                await validateAndExecuteCommands(commandLines, responseText);
                
                // 성공 시 피드백 메시지 초기화
                setFeedbackMessages([]);
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
                text: '서버 연결 오류가 발생했습니다. 백엔드 서버가 실행 중인지 확인해주세요.'
              }];
              setMessages(updatedMessages);
            } else {
              const updatedMessages = [...messages, {
                role: 'assistant',
                text: '오류가 발생했습니다: ' + (error.message || '알 수 없는 오류')
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
            isResolved: false
        };
        
        setErrorBlocks(prev => [...prev, newErrorBlock]);
        
        // 현재 메시지 상태 로깅
        console.log("에러 블록 추가 시 메시지 상태:", messages);
        
        return newErrorBlock.id;
    };

    // 마지막 메시지에 에러 블록 ID 연결 함수 추가
    const attachErrorBlockToLastMessage = (errorBlockId) => {
        setMessages(prev => {
            const newMessages = [...prev];
            // 마지막 assistant 메시지 찾기
            let lastAssistantIndex = newMessages.length - 1;
            while (lastAssistantIndex >= 0 && newMessages[lastAssistantIndex].role !== 'assistant') {
                lastAssistantIndex--;
            }
            
            if (lastAssistantIndex >= 0) {
                newMessages[lastAssistantIndex] = {
                    ...newMessages[lastAssistantIndex],
                    errorBlockId
                };
            }
            
            return newMessages;
        });
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
                        保存聊天记录
                    </button>
                </div>
                
                {/* 메시지 표시 영역 */}
                <div className="messages" style={{ flex: 1, overflowY: 'auto', maxHeight: 'calc(100vh - 350px)' }}>
                    {/* 메시지와 오류 블록을 함께 표시 */}
                    {messages.map((msg, index) => (
                        <React.Fragment key={index}>
                            {/* 피드백 메시지인 경우 특별한 UI 적용 */}
                            {msg.isFeedback ? (
                                <div className={`message ${msg.role}`} style={{
                                    borderLeft: '4px solid #2196f3',
                                    backgroundColor: '#e3f2fd',
                                    marginBottom: '10px'
                                }}>
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
                                            <div className="loading-spinner" style={{
                                                width: '20px',
                                                height: '20px',
                                                border: '3px solid #f3f3f3',
                                                borderTop: '3px solid #2196f3',
                                                borderRadius: '50%',
                                                marginRight: '10px',
                                                animation: 'spin 1s linear infinite'
                                            }}></div>
                                            <span style={{ 
                                                fontWeight: 'bold', 
                                                color: '#2196f3'
                                            }}>
                                                명령어 오류 수정 중... 새로운 명령어를 생성합니다
                                            </span>
                                        </div>
                                        
                                        {/* 에러 메시지 내용 */}
                                        <div style={{
                                            backgroundColor: '#ffebee',
                                            padding: '12px',
                                            borderRadius: '4px',
                                            marginBottom: '10px',
                                            borderLeft: '4px solid #f44336'
                                        }}>
                                            <h4 style={{ margin: '0 0 8px 0', color: '#d32f2f' }}>명령어 오류 발생</h4>
                                            <MessageContent 
                                                text={msg.text} 
                                                onCodeChange={(newText) => {
                                                    updateMessage(index, newText);
                                                }}
                                            />
                                        </div>
                                        
                                        {/* 진행 상태 표시 (선택적) */}
                                        <div style={{
                                            backgroundColor: 'rgba(0,0,0,0.05)',
                                            padding: '8px 12px',
                                            borderRadius: '4px',
                                            fontSize: '13px',
                                            display: 'flex',
                                            justifyContent: 'space-between'
                                        }}>
                                            <span>피드백 처리 중...</span>
                                            <span>잠시만 기다려주세요</span>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                /* 일반 메시지 - 기존 코드 유지 */
                                <div className={`message ${msg.role}`}>
                                    <div className="message-content" style={{
                                        // 메시지 타입에 따른 스타일 적용
                                        ...(msg.role === 'user' ? {
                                            // 사용자 메시지 스타일 유지
                                            backgroundColor: 'rgba(255, 255, 255, 0.9)',
                                            color: '#000000',
                                            marginLeft: 'auto',
                                            maxWidth: '100%',
                                            border: 'none',
                                            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
                                        } : {
                                            // assistant/gpt 메시지 스타일 업데이트: 사용자 메시지와 유사하게 만들기
                                            backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                            color: '#212529',
                                            marginRight: 'auto',
                                            maxWidth: '100%',
                                            border: 'none',
                                            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
                                        })
                                    }}>
                                        {/* 재생성된 메시지인 경우, 에러 블록을 먼저 표시 */}
                                        {msg.isRegenerated && msg.errorBlockId && errorBlocks.find(block => block.id === msg.errorBlockId) && (
                                            <div style={{
                                                backgroundColor: '#ffebee',
                                                padding: '8px',
                                                borderRadius: '4px',
                                                marginBottom: '16px',
                                                fontSize: '13px'
                                            }}>
                                                <ErrorInfoBlock 
                                                    errorMessage={errorBlocks.find(block => block.id === msg.errorBlockId).errorMessage}
                                                    originalResponse={errorBlocks.find(block => block.id === msg.errorBlockId).originalResponse}
                                                    isResolved={errorBlocks.find(block => block.id === msg.errorBlockId).isResolved}
                                                />
                                            </div>
                                        )}
                                        
                                        {/* 재생성된 메시지인 경우 스타일 변경 */}
                                        {msg.isRegenerated && (
                                            <div style={{
                                                backgroundColor: '#e8f5e9',
                                                padding: '8px',
                                                borderRadius: '4px',
                                                marginBottom: '8px',
                                                fontSize: '13px',
                                                color: '#2e7d32',
                                                fontWeight: 'bold'
                                            }}>
                                                ✓ 재생성된 명령어
                                            </div>
                                        )}
                                        
                                        <MessageContent 
                                            text={msg.text} 
                                            onCodeChange={(newText) => {
                                                updateMessage(index, newText);
                                            }}
                                        />
                                    </div>
                                </div>
                            )}
                            
                            {/* 해당 메시지와 연결된 에러 블록을 바로 아래에 표시 (재생성되지 않은 일반 메시지만) */}
                            {!msg.isRegenerated && !msg.isFeedback && msg.errorBlockId && errorBlocks.find(block => block.id === msg.errorBlockId) && (
                                <div className="message system">
                                    <div className="message-content">
                                        <ErrorInfoBlock 
                                            errorMessage={errorBlocks.find(block => block.id === msg.errorBlockId).errorMessage}
                                            originalResponse={errorBlocks.find(block => block.id === msg.errorBlockId).originalResponse}
                                            isResolved={errorBlocks.find(block => block.id === msg.errorBlockId).isResolved}
                                        />
                                    </div>
                                </div>
                            )}
                        </React.Fragment>
                    ))}
                    
                    {/* 별도 섹션에 모든 에러 블록 표시 - 제거하거나 유지할 수 있습니다 */}
                    { errorBlocks.length > 0 && (
                        <div className="error-blocks-section">
                            {errorBlocks.map(block => (
                                <div key={block.id} className="message system">
                                    <div className="message-content">
                                        <ErrorInfoBlock 
                                            errorMessage={block.errorMessage}
                                            originalResponse={block.originalResponse}
                                            isResolved={block.isResolved}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )
                    }
     
                    {/* 로딩 표시 */}
                    {isLoading && (
                        <div className="message assistant" style={{
                            padding: '0',
                            backgroundColor: 'transparent'
                        }}>
                            <div className="message-content" style={{
                                backgroundColor: '#f8f9fa',
                                border: '1px solid #e9ecef',
                                borderRadius: '12px',
                                padding: '16px',
                                boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
                                overflow: 'hidden'
                            }}>
                                <div style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    padding: '8px'
                                }}>
                                    {/* 애니메이션 로딩 인디케이터 */}
                                    <div style={{
                                        display: 'flex',
                                        justifyContent: 'center',
                                        marginBottom: '16px'
                                    }}>
                                        <div className="loading-dots" style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}>
                                            {[...Array(3)].map((_, i) => (
                                                <div key={i} style={{
                                                    width: '12px',
                                                    height: '12px',
                                                    backgroundColor: '#6366f1',
                                                    borderRadius: '50%',
                                                    margin: '0 4px',
                                                    animation: 'bounce 1.4s infinite ease-in-out',
                                                    animationDelay: `${i * 0.16}s`
                                                }}></div>
                                            ))}
                                        </div>
                                    </div>
                                    
                                    {/* 로딩 메시지 */}
                                    <div style={{
                                        fontSize: '15px',
                                        fontWeight: '500',
                                        color: '#4f46e5',
                                        textAlign: 'center',
                                        marginBottom: '8px'
                                    }}>
                                        GeoGebra 명령어 생성 중
                                    </div>
                                    
                                    {/* 부가 텍스트 */}
                                    <div style={{
                                        fontSize: '13px',
                                        color: '#6b7280',
                                        textAlign: 'center'
                                    }}>
                                        최적의 기하학적 표현을 찾고 있습니다...
                                    </div>
                                    
                                    {/* 프로그레스 바 */}
                                    <div style={{
                                        width: '100%',
                                        height: '4px',
                                        backgroundColor: '#e5e7eb',
                                        borderRadius: '2px',
                                        marginTop: '16px',
                                        overflow: 'hidden',
                                        position: 'relative'
                                    }}>
                                        <div className="progress-bar-animation" style={{
                                            position: 'absolute',
                                            top: '0',
                                            left: '0',
                                            height: '100%',
                                            width: '30%',
                                            backgroundColor: '#4f46e5',
                                            borderRadius: '2px',
                                            animation: 'progress-bar 2s infinite ease-in-out'
                                        }}></div>
                                    </div>
                                </div>
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
        </div>
    );
}

export default Chat; 

<style jsx>{`
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
    
    @keyframes bounce {
        0%, 80%, 100% { transform: scale(0); opacity: 0.5; }
        40% { transform: scale(1); opacity: 1; }
    }
    
    @keyframes progress-bar {
        0% { left: -30%; }
        100% { left: 100%; }
    }
`}</style> 