import React from 'react';
import { InlineMath } from 'react-katex';
import CodeBlock from './CodeBlock';

const MessageContent = ({ text, onCodeChange }) => {
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

    const executeCommands = (code) => {
        const app = window.app1;
        if (!app) return;
        
        app.reset();
        app.enable3D();
        
        const commandLines = code.split('\n');
        commandLines.forEach(command => {
            if (command.trim()) {
                try {
                    app.evalCommand(command.trim());
                } catch (error) {
                    console.error('Command execution error:', error);
                }
            }
        });
    };

    const parts = parseContent(text);

    return (
        <div style={{ lineHeight: '1.6', position: 'relative' }}>
            {parts.map((part, index) => {
                switch (part.type) {
                    case 'code':
                        return (
                            <CodeBlock
                                key={index}
                                code={part.content}
                                onCodeChange={(newCode) => {
                                    const beforeCode = text.split('```')[0];
                                    const afterCode = text.split('```')[2];
                                    const newText = beforeCode + '```\n' + newCode + '\n```' + (afterCode || '');
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

export default MessageContent; 