import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './Chat.css';
import Geogebra from 'react-geogebra';
import 'katex/dist/katex.min.css';
import { InlineMath } from 'react-katex';
import { SYSTEM_PROMPTS } from './constants/prompts';

function Chat() {
    // 定义输入状态和消息历史记录状态
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState([...SYSTEM_PROMPTS]);
    // 定义加载状态
    const [isLoading, setIsLoading] = useState(false);

    // 添加消息容器的引用
    const messagesEndRef = React.useRef(null);

    // 滚动到底部的函数
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    // 每当消息更新时滚动
    React.useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // 发送消息的异步函数
    const sendMessage = async () => {
        if (!input.trim() || isLoading) return;

        const userMessage = { sender: 'user', text: input };
        setMessages(prev => [...prev, userMessage]);
        setInput('');  // 입력값 초기화
        setIsLoading(true);
        
        const app = window.app1;
        app.reset();
        
        try {
            // 发送API请求到OpenAI
            console.log('sending message...')
            const newMessages = [
                ...SYSTEM_PROMPTS,  // 시스템 프롬프트 먼저 전송
                ...messages.slice(SYSTEM_PROMPTS.length).map(msg => ({  // 시스템 프롬프트 이후의 메시지들만 매핑
                    role: msg.role,
                    content: msg.text
                })),
                {
                    role: 'user',
                    content: input
                }
            ]
            console.log(newMessages)
            const response = await axios.post(
                'https://api.openai.com/v1/chat/completions',
                {
                    model: "gpt-4o-mini",
                    messages: newMessages
                },
                {
                    headers: {
                        'Authorization': `Bearer ${process.env.REACT_APP_OPENAI_API_KEY}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            const responseText = response.data.choices[0].message.content;
            
            // 处理响应文本，规范化换行符
            const normalizedText = responseText.replace(/\n{2,}/g, '\n');
            // 提取代码块中的指令
            const commands = normalizedText.match(/```\s*([\s\S]*?)\s*```/s);
            console.log('responseText: ', responseText);
            console.log('normalizedText: ', normalizedText);
            console.log('commands: ', commands);
            // 执行GeoGebra命令
            if (commands && commands[1]) {
                const commandLines = commands[1].split('\n');
                commandLines.forEach(command => {
                    app.evalCommand(command.trim());
                });
            }
            // 添加GPT响应消息历史
            const gptMessage = {
                role: 'assistant',
                text: responseText
            };
            setMessages(prev => [...prev, gptMessage]);
            
        } catch (error) {
            // 错误处理
            console.error('Error:', error);
            setMessages(prev => [...prev, {
                sender: 'assistant',
                text: '抱歉，发生错误。'
            }]);
        }

        setIsLoading(false);
    };

    // 代码块组件：显示和编辑GeoGebra命令
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
                alert('复制成功！');
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
            onCodeChange(localCode);
            executeCommands(localCode);
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
                        复制
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

    // 消息内容组件：处理消息文本和代码块的显示
    const MessageContent = ({ text, onCodeChange }) => {
        const [isHovered, setIsHovered] = useState(false);

        const copyToClipboard = (text) => {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            
            try {
                textarea.select();
                document.execCommand('copy');
                alert('复制成功！');
            } catch (err) {
                console.error('复制失败:', err);
                alert('复制失败');
            } finally {
                document.body.removeChild(textarea);
            }
        };

        const parseContent = (text) => {
            const parts = [];
            let currentText = '';
            let i = 0;
            
            while (i < text.length) {
                if (text.slice(i).match(/^([A-Z]+\^?[0-9]*(=|\+|-|\*|\/)?)+/)) {
                    if (currentText) {
                        parts.push({ type: 'text', content: currentText });
                        currentText = '';
                    }
                    const match = text.slice(i).match(/^([A-Z]+\^?[0-9]*(=|\+|-|\*|\/)?)+/)[0];
                    parts.push({ type: 'inline-math', content: match });
                    i += match.length;
                    continue;
                } else if (text.slice(i, i + 3) === '```') {
                    if (currentText) {
                        parts.push({ type: 'text', content: currentText });
                        currentText = '';
                    }
                    const endIndex = text.indexOf('```', i + 3);
                    if (endIndex !== -1) {
                        parts.push({ type: 'code', content: text.slice(i + 3, endIndex).trim() });
                        i = endIndex + 3;
                        continue;
                    }
                }
                currentText += text[i];
                i++;
            }
            
            if (currentText) {
                parts.push({ type: 'text', content: currentText });
            }
            
            return parts;
        };

        const parts = parseContent(text);
        const app = window.app1;

        const executeCommands = (code) => {
            app.reset();
            const commandLines = code.split('\n');
            commandLines.forEach(command => {
                if (command.trim()) {
                    app.evalCommand(command.trim());
                }
            });
        };

        return (
            <div 
                style={{ lineHeight: '1.6', position: 'relative' }}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
            >
                <button
                    onClick={() => copyToClipboard(text)}
                    style={{
                        position: 'absolute',
                        top: '5px',
                        right: '5px',
                        padding: '4px 8px',
                        backgroundColor: '#f0f0f0',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: 'var(--font-size-base)',
                        color: '#666',
                        opacity: isHovered ? 1 : 0,
                        transition: 'opacity 0.2s',
                    }}
                >
                    复制
                </button>
                
                {parts.map((part, index) => {
                    switch (part.type) {
                        case 'code':
                            return (
                                <CodeBlock
                                    key={index}
                                    code={part.content}
                                    onCodeChange={(newCode) => {
                                        const newText = text.replace(/```\n[\s\S]*?\n```/, '```\n' + newCode + '\n```');
                                        onCodeChange(newText);
                                    }}
                                    executeCommands={executeCommands}
                                />
                            );
                        case 'inline-math':
                            return <InlineMath key={index} math={part.content.replace(/\^/g, '^').replace(/=/g, '=')} />;
                        default:
                            return (
                                <span key={index}>
                                    {part.content.split('\n').map((line, i) => (
                                        <React.Fragment key={i}>
                                            {line}
                                            {i < part.content.split('\n').length - 1 && <br />}
                                        </React.Fragment>
                                    ))}
                                </span>
                            );
                    }
                })}
            </div>
        );
    };

    // 保存聊天记录的函数
    const saveChat = () => {
        const chatPairs = [];
        for (let i = SYSTEM_PROMPTS.length; i < messages.length; i += 2) {
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

        // 文件下载逻辑
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

    // messages 업데이트 함수 추가
    const updateMessage = (index, newText) => {
        setMessages(prevMessages => {
            const newMessages = [...prevMessages];
            newMessages[index] = {
                ...newMessages[index],
                text: newText
            };
            return newMessages;
        });
    };

    // 渲染主界面
    return (
        <div style={{ display: 'flex', gap: '20px'}}>
            {/* GeoGebra画板组件 */}
            <Geogebra
                id = 'app1'
                width="800"
                height="800"
                showMenuBar
                showToolBar
                showAlgebraInput
            />

            {/* 聊天界面容器 */}
            <div className="chat-container">
                {/* 保存聊天按钮 */}
                <div style={{ 
                    display: 'flex', 
                    justifyContent: 'flex-end', 
                    padding: '10px' 
                }}>
                    <button
                        onClick={saveChat}
                        style={{
                            padding: '8px 16px',
                            backgroundColor: '#484fdcc2',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '14px'
                        }}
                    >
                        保存聊天记录
                    </button>
                </div>
                
                {/* 消息显示区域 */}
                <div className="messages">
                    {messages.slice(SYSTEM_PROMPTS.length).map((msg, index) => (
                        <div key={index} className={`message ${msg.sender}`}>
                            <div className="message-content">
                                <MessageContent 
                                    text={msg.text} 
                                    onCodeChange={(newText) => {
                                        updateMessage(index + 4, newText);  // index + 4로 실제 인덱스 계산
                                    }}
                                />
                            </div>
                        </div>
                    ))}
                    {/* 加载提示 */}
                    {isLoading && (
                        <div className="message gpt">
                            <div className="message-content">
                                正在生成回答...
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} /> {/* 用于指定滚动位置的元素 */}
                </div>
                
                {/* 输入区域 */}
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
                        placeholder="请输入几何描述（例如：画出正三角形 ABC）"
                        disabled={isLoading}
                    />
                    <button 
                        onClick={sendMessage}
                        disabled={isLoading}
                        style={{fontSize: '14px'}}
                    >
                        发送
                    </button>
                </div>
            </div>
        </div>
    );
}

export default Chat; 