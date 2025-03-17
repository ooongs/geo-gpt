import React, { useState } from 'react';

const ErrorInfoBlock = ({ errorMessage, originalResponse, isResolved = false }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  return (
    <div className="error-info-block" style={{
      backgroundColor: isResolved ? '#e8f5e9' : '#fff8f8',
      border: `1px solid ${isResolved ? '#c8e6c9' : '#ffcdd2'}`,
      borderRadius: '8px',
      padding: '12px',
      margin: '10px 0',
      fontSize: '14px',
      display: 'block',
      visibility: 'visible',
      opacity: 1
    }}>
      <div style={{ 
        marginBottom: '10px', 
        fontWeight: 'bold', 
        color: isResolved ? '#2e7d32' : '#d32f2f',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <span>
          {isResolved 
            ? '✓ GeoGebra command regeneration completed' 
            : 'GeoGebra command regeneration in progress'}
        </span>
        {isResolved && (
          <span style={{ 
            fontSize: '12px', 
            backgroundColor: '#c8e6c9', 
            padding: '2px 6px', 
            borderRadius: '4px' 
          }}>
            Resolved
          </span>
        )}
      </div>
      
      <div 
        onClick={() => setIsExpanded(!isExpanded)} 
        style={{ 
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px',
          backgroundColor: '#f5f5f5',
          borderRadius: '4px',
          marginBottom: isExpanded ? '10px' : '0'
        }}
      >
        <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#555' }}>
          Detailed Information {isExpanded ? 'Collapse' : 'Expand'}
        </div>
        <div style={{ color: '#666' }}>
          {isExpanded ? '▼' : '▶'}
        </div>
      </div>
      
      {isExpanded && (
        <div style={{ 
          padding: '10px', 
          backgroundColor: '#fff',
          border: '1px solid #e0e0e0',
          borderRadius: '4px'
        }}>
          <div>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '14px' }}>Original LLM Answer:</h4>
            <pre style={{ 
              margin: '4px 0', 
              padding: '8px', 
              backgroundColor: '#f5f5f5',
              borderRadius: '4px',
              fontSize: '13px',
              whiteSpace: 'pre-wrap',
              maxHeight: '200px',
              overflowY: 'auto'
            }}>{originalResponse}</pre>
          </div>
          
          <div style={{ marginTop: '12px' }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#d32f2f' }}>Error Message:</h4>
            <pre style={{ 
              margin: '4px 0', 
              padding: '8px', 
              backgroundColor: '#ffebee',
              color: '#d32f2f',
              borderRadius: '4px',
              fontSize: '13px',
              whiteSpace: 'pre-wrap'
            }}>{errorMessage}</pre>
          </div>
          
          {!isResolved && (
            <div style={{ 
              marginTop: '12px', 
              padding: '8px', 
              backgroundColor: '#e3f2fd', 
              borderRadius: '4px',
              fontSize: '13px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <div className="loading-spinner" style={{
                  width: '16px',
                  height: '16px',
                  border: '3px solid #f3f3f3',
                  borderTop: '3px solid #3498db',
                  borderRadius: '50%',
                  marginRight: '8px',
                  animation: 'spin 1s linear infinite'
                }}></div>
                <span>Fixing command errors...</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ErrorInfoBlock; 