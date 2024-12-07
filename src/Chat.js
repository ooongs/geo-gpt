import React, { useState } from 'react';
import axios from 'axios';
import './Chat.css';
import Geogebra from 'react-geogebra';

function Chat() {
    // 定义输入状态和消息历史记录状态
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState([
        // 初始系统消息，设置GeoGebra指令生成器的规则
        {
            sender: 'system',
            text: "你是 geoGebra 指令生成器。如果用户给你一个几个图像的描述，请你给出生成的每一个步骤和对应的 geoGebra 指令。每个步骤以 1. 2. 3. 4. 这样的形式给出，并用换行隔开。geoGebra 指令格式为 ```\nA(0,0)\nB(1,0)\nC(0.5, sqrt(3)/2)\nPolygon[A,B,C]\n```请不要在指令中添加任何其他文字。"
        },
        // 助手确认消息
        {
            sender: 'assistant',
            text: 'Sure, I will follow all rules.'
        },
        // 示例用户消息
        {
            sender: 'user',
            text: '请画出正三角形 ABC'  
        },
        // 示例助手回复
        {
            sender: 'assistant',
            text: "Let's think step by step.\n1. 画出点 A\n2. 画出点 B\n3. 画出点 C\n4. 画出三角形 ABC\n ```\nA(0,0)\nB(1,0)\nC(0.5, sqrt(3)/2)\nPolygon[A,B,C]\n```"
        },
    ]);
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
        // 如果输入为空或正在加载，则返回
        if (!input.trim() || isLoading) return;

        // 创建用户消息对象并添加到消息历史
        const userMessage = { sender: 'user', text: input };
        setMessages(prev => [...prev, userMessage]);
        setIsLoading(true);
        const app = window.app1;
        
        // 重置GeoGebra画板
        app.reset();
        
        try {
            // 发送API请求到OpenAI
            const response = await axios.post(
                'https://api.openai.com/v1/chat/completions',
                {
                    model: "gpt-4o-mini",
                    messages: [
                        ...messages.map(msg => ({
                            role: msg.sender === 'user' ? 'user' : 'assistant',
                            content: msg.text
                        })),
                        {
                            role: 'user',
                            content: input
                        }
                    ]
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
            // 提取代码块中的命令
            const commands = normalizedText.match(/```\n([\s\S]*?)\n```/s);

            console.log(commands);
            // 执行GeoGebra命令
            if (commands && commands[1]) {
                const commandLines = commands[1].split('\n');
                commandLines.forEach(command => {
                    app.evalCommand(command.trim());
                });
            }
            // 添加GPT响应消息历史
            const gptMessage = {
                sender: 'gpt',
                text: responseText
            };
            setMessages(prev => [...prev, gptMessage]);
            
        } catch (error) {
            // 错误处理
            console.error('Error:', error);
            setMessages(prev => [...prev, {
                sender: 'gpt',
                text: '抱歉，发生错误。'
            }]);
        }

        // 重置状态
        setIsLoading(false);
        setInput('');
    };

    // 代码块组件：显示和编辑GeoGebra命令
    const CodeBlock = ({ code, onCodeChange, executeCommands }) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <textarea
                value={code}
                onChange={(e) => onCodeChange(e.target.value)}
                style={{
                    width: '95%',
                    minHeight: '100px',
                    fontFamily: 'monospace',
                    fontSize: '16px',
                    lineHeight: '1.5',
                    padding: '8px',
                    marginTop: '8px',
                    marginBottom: '8px',
                    backgroundColor: '#f5f5f5',
                    border: '1px solid #ddd',
                    borderRadius: '4px'
                }}
            />
            <button
                onClick={() => executeCommands(code)}
                style={{
                    padding: '8px 16px',
                    backgroundColor: '#4CAF50',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '14px'
                }}
            >
                修改
            </button>
        </div>
    );

    // 消息内容组件：处理消息文本和代码块的显示
    const MessageContent = ({ text, onCodeChange }) => {
        // 分割文本和代码块
        const parts = text.split(/```\n([\s\S]*?)\n```/);
        const app = window.app1;

        // 执行GeoGebra命令的函数
        const executeCommands = (code) => {
            const commandLines = code.split('\n');
            app.reset(); // 重置画板
            commandLines.forEach(command => {
                if (command.trim()) {
                    app.evalCommand(command.trim());
                }
            });
        };
        
        return (
            <>
                {parts.map((part, index) => {
                    if (index % 2 === 0) {
                        // 渲染普通文本
                        return part.split('\n').map((line, i) => (
                            <React.Fragment key={i}>
                                {line}
                                {i < part.split('\n').length - 1 && <br />}
                            </React.Fragment>
                        ));
                    } else {
                        // 渲染代码块
                        return <CodeBlock 
                            key={index} 
                            code={part} 
                            onCodeChange={(newCode) => onCodeChange(text.replace(/```\n[\s\S]*?\n```/, '```\n' + newCode + '\n```'))}
                            executeCommands={executeCommands}
                        />;
                    }
                })}
            </>
        );
    };

    // 保存聊天记录的函数
    const saveChat = () => {
        const chatPairs = [];
        for (let i = 4; i < messages.length; i += 2) {
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
                        保存聊天
                    </button>
                </div>
                
                {/* 消息显示区域 */}
                <div className="messages">
                    {messages.slice(4).map((msg, index) => (
                        <div key={index} className={`message ${msg.sender}`}>
                            <div className="message-content">
                                <MessageContent 
                                    text={msg.text} 
                                    onCodeChange={(newText) => {
                                        setMessages(prev => prev.map((m, i) => 
                                            i === index + 4 ? {...m, text: newText} : m
                                        ));
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
                        onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                        placeholder="给ChatGPT发送消息"
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