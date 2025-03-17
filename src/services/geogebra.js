// GeoGebra 명령어 검증 및 실행 관련 함수

// 명령어 검증 함수
export const validateCommand = async (command, setErrorMessage, ws) => {
  return new Promise((resolve) => {
    if (!window.testApp) {
      resolve({ valid: false, error: '테스트 앱이 초기화되지 않았습니다.' });
      return;
    }
    
    // 오류 메시지 초기화
    setErrorMessage(null);
    
    try {
      // 명령어 실행 전 오류 감지 준비
      const errorPromise = new Promise(resolveError => {
        // 오류 감지 타이머
        const errorTimer = setTimeout(() => {
          resolveError(null);
        }, 300);
        
        // errorMessage 상태가 변경되면 즉시 감지하는 함수
        const checkErrorInterval = setInterval(() => {
          const currentError = window.geogebraErrorMessage;
          if (currentError) {
            clearTimeout(errorTimer);
            clearInterval(checkErrorInterval);
            resolveError(currentError);
          }
        }, 50);
        
        // 최대 대기 시간 설정
        setTimeout(() => {
          clearInterval(checkErrorInterval);
        }, 300);
      });
      
      // 명령어 실행
      const success = window.testApp.evalCommand(command.trim());
      
      // 오류 메시지 확인
      errorPromise.then(error => {
        const result = { 
          valid: !error && success, 
          error: error || (success ? '' : 'Failed to execute the GeoGebra command.')
        };
        
        // 결과 로깅
        console.log(`명령어 검증 결과: ${command.trim()} - ${result.valid ? '성공' : '실패'}`);
        if (!result.valid) {
          console.log(`오류 메시지: ${result.error}`);
          setErrorMessage(result.error);
        }
        
        // WebSocket으로 결과 전송
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            command: command.trim(),
            success: result.valid,
            error: result.error
          }));
        }
        
        resolve(result);
      });
    } catch (e) {
      const result = { valid: false, error: e.message };
      console.error(`명령어 실행 예외 발생: ${e.message}`);
      
      // WebSocket으로 오류 전송
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          command: command.trim(),
          success: false,
          error: e.message
        }));
      }
      
      resolve(result);
    }
  });
};

// 명령어 실행 함수 개선
export const executeCommand = (command) => {
  if (!command.trim()) return false;
  
  try {
    if (window.app1) {
      console.log(`GeoGebra 명령어 실행: ${command.trim()}`);
      const result = window.app1.evalCommand(command.trim());
      console.log(`GeoGebra 명령어 실행 결과: ${result ? '성공' : '실패'}`);
      return result;
    }
    return false;
  } catch (error) {
    console.error(`GeoGebra 명령어 실행 오류: ${error.message}`);
    return false;
  }
};

// 앱 초기화 함수
export const resetApp = (appId = 'app1') => {
  if (window[appId]) {
    window[appId].reset();
    return true;
  }
  return false;
};

// 명령어 추출 함수 개선 - 마지막 코드 블록만 추출
export const extractCommands = (text) => {
  const codeBlocks = text.match(/```\s*([\s\S]*?)\s*```/gs);
  if (codeBlocks && codeBlocks.length > 0) {
    // 마지막 코드 블록 선택
    const lastCodeBlock = codeBlocks[codeBlocks.length - 1];
    // 코드 블록 내용 추출 (``` 제거)
    const commandsText = lastCodeBlock.replace(/```\s*([\s\S]*?)\s*```/s, '$1');
    // 줄 단위로 분리하고 빈 줄 제거
    return commandsText.split('\n').filter(cmd => cmd.trim());
  }
  return [];
}; 