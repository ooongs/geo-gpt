import React, { useState, useEffect } from 'react';

const CodeBlock = ({ code, onCodeChange, executeCommands }) => {
    const [localCode, setLocalCode] = useState(code);
    const [isHovered, setIsHovered] = useState(false);

    const copyToClipboard = (text) => {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        
        try {
            textarea.select();
            document.execCommand('copy');
            alert('复制成功!');
        } catch (err) {
            console.error('复制失败:', err);
            alert('复制失败');
        } finally {
            document.body.removeChild(textarea);
        }
    };

    useEffect(() => {
        setLocalCode(code);
    }, [code]);

    const handleModify = () => {
        if (localCode !== code) {
            onCodeChange(localCode);
            executeCommands(localCode);
        }
    };

    return (
        <div 
            style={{ display: 'flex', flexDirection: 'column', gap: '10px', position: 'relative', width: '100%' }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <div style={{ position: 'relative', width: '100%' }}>
                <button
                    onClick={() => copyToClipboard(localCode)}
                    style={{
                        position: 'absolute',
                        top: '13px',
                        right: '25px',
                        padding: '4px 8px',
                        backgroundColor: '#f0f0f0',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: 'var(--font-size-base)',
                        color: '#666',
                        zIndex: 1,
                        opacity: isHovered ? 1 : 0,
                        transition: 'opacity 0.2s'
                    }}
                >
                    복사
                </button>
                <textarea
                    value={localCode}
                    onChange={(e) => setLocalCode(e.target.value)}
                    style={{
                        width: '100%',
                        minHeight: '100px',
                        fontFamily: 'monospace',
                        fontSize: 'var(--font-size-base)',
                        lineHeight: '1.5',
                        padding: '8px',
                        paddingRight: '80px',
                        marginTop: '8px',
                        marginBottom: '8px',
                        backgroundColor: '#f5f5f5',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        resize: 'vertical',
                        boxSizing: 'border-box'
                    }}
                />
            </div>
            <button
                onClick={handleModify}
                style={{
                    padding: '8px 16px',
                    backgroundColor: '#4CAF50',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: 'var(--font-size-base)'
                }}
            >
                修改
            </button>
        </div>
    );
};

export default CodeBlock; 