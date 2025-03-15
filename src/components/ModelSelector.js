import React from 'react';

const ModelSelector = ({ selectedModel, setSelectedModel, modelOptions }) => {
  return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center',
      gap: '10px',
      padding: '5px'
    }}>
      <span style={{ fontSize: '13px', fontWeight: 'bold' }}>모델 선택:</span>
      <div style={{ 
        display: 'flex', 
        gap: '8px'
      }}>
        {modelOptions.map(model => (
          <button
            key={model.id}
            onClick={() => setSelectedModel(model.id)}
            style={{
              padding: '4px 10px',
              backgroundColor: selectedModel === model.id ? '#484fdcc2' : '#f0f0f0',
              color: selectedModel === model.id ? 'white' : '#333',
              border: '1px solid #ddd',
              borderRadius: '12px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: selectedModel === model.id ? 'bold' : 'normal'
            }}
          >
            {model.name}
          </button>
        ))}
      </div>
    </div>
  );
};

export default ModelSelector; 