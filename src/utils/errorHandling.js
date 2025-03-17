// 오류 메시지 추출 함수
export const extractErrorMessage = (dialogNode) => {
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
  
  return `${command} ${errorMsg}${syntaxLines.length ? '\n\nCorrect Syntax:\n' + syntaxLines.join('\n') : ''}`;
};

// 오류 감지를 위한 MutationObserver 설정
export const setupErrorObserver = (setErrorMessage) => {
  let lastErrorTime = 0;
  const errorDebounceTime = 100; // 중복 오류 방지 시간 (ms)
  
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.addedNodes.length) {
        for (const node of mutation.addedNodes) {
          // 상위 요소가 dialogComponent인지 확인
          if (node.classList && node.classList.contains('dialogComponent')) {
            // 중복 오류 방지
            const now = Date.now();
            if (now - lastErrorTime < errorDebounceTime) continue;
            lastErrorTime = now;
            
            const errorMsg = extractErrorMessage(node);
            if (errorMsg) {
              console.log('GeoGebra 오류 다이얼로그 감지:', errorMsg);
              setErrorMessage(errorMsg);
              window.geogebraErrorMessage = errorMsg;
            }
            
            // 자동으로 다이얼로그 닫기
            setTimeout(() => {
              const closeButton = node.querySelector('.dialogTextButton');
              if (closeButton) closeButton.click();
            }, 500);
            
            return;
          }
          
          // 다른 방법: 내부 컴포넌트 확인
          const dialogPanel = node.querySelector && node.querySelector('.dialogMainPanel');
          if (dialogPanel) {
            // 중복 오류 방지
            const now = Date.now();
            if (now - lastErrorTime < errorDebounceTime) continue;
            lastErrorTime = now;
            
            // 명령어와 오류 메시지 추출
            const labels = dialogPanel.querySelectorAll('.gwt-Label');
            if (labels.length >= 2) {
              const errorMessage = `${labels[0].textContent} ${labels[1].textContent}`;
              console.log('오류 내용:', errorMessage);
              setErrorMessage(errorMessage);
              window.geogebraErrorMessage = errorMessage;
            }
            
            // 자동으로 다이얼로그 닫기
            setTimeout(() => {
              const closeButton = dialogPanel.querySelector('.dialogTextButton');
              if (closeButton) closeButton.click();
            }, 500);
          }
        }
      }
    }
  });
  
  // 문서 전체 관찰
  observer.observe(document.body, { childList: true, subtree: true });
  
  return observer;
}; 