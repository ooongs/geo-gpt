import React from 'react';

const SuggestedCommandsList = ({ commands, onSelect }) => {
    if (!commands || commands.length === 0) return null;
    
    return (
        <div className="message assistant">
            <div className="message-content">
                <h3>추천 명령어</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {commands.map((item, index) => (
                        <div 
                            key={index} 
                            style={{ 
                                border: '1px solid #ddd', 
                                borderRadius: '8px', 
                                padding: '10px',
                                backgroundColor: '#f9f9f9'
                            }}
                        >
                            <div style={{ marginBottom: '10px', fontWeight: 'bold' }}>
                                유사도: {(item.score * 100).toFixed(1)}%
                            </div>
                            <pre style={{ 
                                backgroundColor: '#f0f0f0', 
                                padding: '8px', 
                                borderRadius: '4px',
                                overflow: 'auto'
                            }}>
                                {item.command}
                            </pre>
                            <button
                                onClick={() => onSelect(item.command)}
                                style={{
                                    marginTop: '8px',
                                    padding: '6px 12px',
                                    backgroundColor: '#4CAF50',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer'
                                }}
                            >
                                이 명령어 사용하기
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default SuggestedCommandsList; 