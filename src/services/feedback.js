import { generateCommands } from './api';
import { validateCommand, resetApp, executeCommand } from './geogebra';
import { sendQuery, sendCommandResult } from './websocket';

// 최대 피드백 재시도 횟수
const MAX_FEEDBACK_RETRY = 3;

// 오류 피드백을 위한 서버 요청 함수
export const getCommandFeedback = async (originalMessages, responseText, errorDetails, ws, retryCount = 0) => {
    try {
        const userQuery = [...originalMessages].reverse().find(msg => msg.role === 'user')?.content || '';

        // 재시도 횟수 초과 확인
        if (retryCount >= MAX_FEEDBACK_RETRY) {
            return `Exceeded the maximum number of GeoGebra command modification attempts (${MAX_FEEDBACK_RETRY} times). Please try a different question.`;
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
                content: `Error occurred during command execution. Please provide the corrected command:\n\n${
                    errorDetails.map(err => `Command: ${err.command}\nError: ${err.error}`).join('\n\n')
                }`
            }];
            console.log('No WebSocket:', feedbackMessages);
            const response = await generateCommands(originalMessages[0].selectedModel, feedbackMessages);
            return response.content;
        }
    } catch (error) {
        console.error('Error in feedback request:', error);
        return 'Error occurred during feedback request: ' + error.message;
    }
};

// 명령어 검증 및 실행 함수
export const validateAndExecuteCommands = async (commandsToValidate, responseToUpdate, setFeedbackInProgress, 
                                               errorHandler, ws, retryCount = 0) => {
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
        const result = await validateCommand(command, errorHandler.setErrorMessage, ws);
        if (!result.valid) {
            hasErrors = true;
            errors.push({
                command: command,
                error: result.error
            });
        }
    }
    
    // 검증 결과 반환
    return {
        hasErrors,
        errors,
        errorBlockId
    };
};

// 명령어 실행 함수
export const executeValidatedCommands = (commands) => {
    // 메인 앱 초기화
    resetApp();
    
    // 검증된 명령어 모두 실행
    for (const command of commands) {
        if (command.trim()) {
            executeCommand(command);
        }
    }
    
    return true;
};

// 상태 초기화 함수
export const resetFeedbackState = (setters) => {
    const { setFeedbackMessages, setFeedbackInProgress, setCommandErrors, 
            setErrorMessage, setDetectedError } = setters;
            
    setFeedbackMessages([]);
    setFeedbackInProgress(false);
    setCommandErrors([]);
    setErrorMessage(null);
    setDetectedError(null);
};

// MAX_FEEDBACK_RETRY 상수 내보내기
export { MAX_FEEDBACK_RETRY }; 