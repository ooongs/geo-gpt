import React from 'react';

const SuggestedQueries = ({ queries, onSelect }) => {
    if (!queries || queries.length === 0) return null;
    
    return (
        <div style={{ 
            display: 'flex', 
            flexWrap: 'wrap', 
            gap: '5px', 
            marginBottom: '8px',
            padding: '5px 0',
            width: '100%',
            boxSizing: 'border-box'
        }}>
            {queries.map((query, index) => (
                <button
                    key={index}
                    onClick={() => onSelect(query)}
                    style={{
                        padding: '4px 10px',
                        backgroundColor: '#f0f0f0',
                        border: '1px solid #ddd',
                        borderRadius: '12px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        color: '#333',
                        margin: '2px'
                    }}
                >
                    {query}
                </button>
            ))}
        </div>
    );
};

export default SuggestedQueries; 