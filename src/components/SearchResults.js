import React from 'react';

const SearchResults = ({ searchResults, isSearching, selectCommand }) => {
  return (
    <div className="search-results-container" style={{ 
      border: '1px solid #ddd',
      borderRadius: '8px',
      padding: '15px 20px',
      backgroundColor: '#f9f9f9',
      height: '800px',
      boxSizing: 'border-box',
      overflowY: 'auto',
      width: '350px',
      marginRight: '20px'
    }}>
      <h3 style={{ 
        margin: '0 0 10px 0', 
        fontSize: '16px', 
        color: '#333',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <span>相关 GeoGebra 指令</span>
        {isSearching && <span style={{ fontSize: '14px', color: '#666' }}>搜索中...</span>}
      </h3>
      
      {!isSearching && searchResults.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {searchResults.map((result, index) => (
            <div 
              key={index}
              style={{
                border: '1px solid #e0e0e0',
                borderRadius: '6px',
                padding: '10px',
                backgroundColor: 'white',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
              }}
            >
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between',
                marginBottom: '8px',
                alignItems: 'center'
              }}>
                <span style={{ 
                  fontWeight: 'bold', 
                  fontSize: '14px'
                }}>
                  <span style={{ color: '#000' }}>相似度: </span>
                  <span style={{ color: '#4CAF50' }}>{(result.similarity).toFixed(1)}%</span>
                </span>
              </div>
              <div style={{
                position: 'relative',
                width: '100%',
                maxHeight: '300px',
                overflow: 'auto'
              }}>
                <pre style={{ 
                  backgroundColor: '#f5f5f5',
                  padding: '8px',
                  borderRadius: '4px',
                  fontSize: '13px',
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  overflowX: 'auto'
                }}>
                  {result.command}
                </pre>
              </div>
            </div>
          ))}
        </div>
      ) : !isSearching && (
        <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
          <p>没有搜索结果</p>
        </div>
      )}
    </div>
  );
};

export default SearchResults; 