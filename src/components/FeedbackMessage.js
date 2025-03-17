import React, { useState, useEffect } from 'react';

const FeedbackMessage = ({ retryCount, maxRetry, errors, originalCommands }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // 컴포넌트 마운트 시 로그 출력
  useEffect(() => {
    console.log("FeedbackMessage 렌더링:", { retryCount, maxRetry, errors, originalCommands });
  }, [retryCount, maxRetry, errors, originalCommands]);
  
  // errors가 없거나 빈 배열이면 렌더링하지 않음
  if (!errors || errors.length === 0) {
    return null;
  }
  
  return (
    <div className="feedback-message" style={{
      backgroundColor: '#f8f9fa',
      border: '1px solid #e9ecef',
      borderRadius: '8px',
      padding: '10px',
      margin: '10px 0',
      fontSize: '14px'
    }}>
      <div 
        onClick={() => setIsExpanded(!isExpanded)} 
        style={{ 
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <div>
          <span style={{ fontWeight: 'bold', color: '#1976d2' }}>
            GeoGebra 指令生成有误，反馈系统正在自动修复 (尝试次数: {retryCount}/{maxRetry})
          </span>
        </div>
        <div style={{ color: '#666' }}>
          {isExpanded ? '▼' : '▶'}
        </div>
      </div>
      
      {isExpanded && (
        <div style={{ 
          marginTop: '10px', 
          padding: '10px', 
          backgroundColor: '#fff',
          border: '1px solid #e0e0e0',
          borderRadius: '4px'
        }}>
          <h4 style={{ margin: '0 0 8px 0', fontSize: '14px' }}>오류 정보:</h4>
          {errors.map((err, index) => (
            <div key={index} style={{ marginBottom: '8px' }}>
              <div style={{ fontWeight: 'bold' }}>명령어:</div>
              <pre style={{ 
                margin: '4px 0', 
                padding: '6px', 
                backgroundColor: '#f5f5f5',
                borderRadius: '4px',
                fontSize: '13px'
              }}>{err.command}</pre>
              <div style={{ fontWeight: 'bold' }}>오류:</div>
              <pre style={{ 
                margin: '4px 0', 
                padding: '6px', 
                backgroundColor: '#ffebee',
                color: '#d32f2f',
                borderRadius: '4px',
                fontSize: '13px'
              }}>{err.error}</pre>
            </div>
          ))}
          
          {originalCommands && originalCommands.length > 0 && (
            <>
              <h4 style={{ margin: '12px 0 8px 0', fontSize: '14px' }}>원본 명령어:</h4>
              <pre style={{ 
                margin: '4px 0', 
                padding: '6px', 
                backgroundColor: '#f5f5f5',
                borderRadius: '4px',
                fontSize: '13px'
              }}>{originalCommands.join ? originalCommands.join('\n') : originalCommands}</pre>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default FeedbackMessage; 