import React, { useState, useRef, useEffect } from 'react';

const SearchResults = ({ searchResults, isSearching, selectCommand }) => {
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [popupPosition, setPopupPosition] = useState('bottom');
  const resultRefs = useRef([]);
  const containerRef = useRef(null);

  // 윈도우 크기 변경 감지
  useEffect(() => {
    const handleResize = () => {
      if (hoveredIndex !== null && resultRefs.current[hoveredIndex]) {
        calculatePopupPosition(hoveredIndex);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [hoveredIndex]);

  // 팝업 위치 계산 함수
  const calculatePopupPosition = (index) => {
    if (!resultRefs.current[index] || !containerRef.current) return;
    
    const element = resultRefs.current[index];
    const container = containerRef.current;
    
    // 요소와 컨테이너의 위치 정보
    const elementRect = element.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    
    // 컨테이너 내에서 요소의 상대적 위치 계산
    const elementBottomRelativeToContainer = elementRect.bottom - containerRect.top;
    
    // 컨테이너 아래쪽에 남은 공간 계산
    const spaceBelow = containerRect.height - elementBottomRelativeToContainer;
    
    // 팝업 높이와 비교하여 위치 결정
    const popupHeight = 250; // 팝업 예상 높이
    
    if (spaceBelow < popupHeight) {
      setPopupPosition('top');
    } else {
      setPopupPosition('bottom');
    }
  };

  // 아이템에 마우스 올렸을 때
  const handleMouseEnter = (index) => {
    setHoveredIndex(index);
    calculatePopupPosition(index);
  };

  return (
    <div 
      ref={containerRef}
      className="search-results-container" 
      style={{ 
        border: '1px solid #ddd',
        borderRadius: '8px',
        backgroundColor: '#f9f9f9',
        height: '800px',
        boxSizing: 'border-box',
        width: '350px',
        marginRight: '20px',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden' // 컨테이너 자체의 오버플로우는 숨김
      }}
    >
      {/* 고정 헤더 영역 */}
      <div style={{
        padding: '0 20px',
        height: '60px',  // 헤더 높이 고정
        borderBottom: '1px solid #e0e0e0',
        backgroundColor: '#f9f9f9',
        zIndex: 10,
        display: 'flex',
        alignItems: 'center'  // 세로 중앙 정렬
      }}>
        <h3 style={{ 
          margin: 0,  // 마진 제거
          fontSize: '16px', 
          color: '#333',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%'  // 너비 100%로 설정
        }}>
          <span>Related Commands {!isSearching && `(${searchResults.length})`}</span>
          {isSearching && <span style={{ fontSize: '14px', color: '#666' }}>Searching...</span>}
        </h3>
      </div>

      {/* 스크롤 가능한 내용 영역 */}
      <div style={{
        padding: '15px 20px',
        flex: 1,
        overflowY: 'auto'
      }}>
        <p style={{ 
          margin: '0 0 15px 0',
          fontSize: '13px',
          color: '#666',
          fontStyle: 'italic',
          borderBottom: '1px solid #e0e0e0',
          paddingBottom: '12px'
        }}>
          Commands found through SBERT similarity search
        </p>
        
        {!isSearching && searchResults.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {searchResults.map((result, index) => (
              <div 
                key={index}상세 정보 
                ref={el => resultRefs.current[index] = el}
                style={{
                  border: '1px solid #e0e0e0',
                  borderRadius: '6px',
                  padding: '10px',
                  backgroundColor: 'white',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                  position: 'relative',
                  cursor: 'pointer'
                }}
                onMouseEnter={() => handleMouseEnter(index)}
                onMouseLeave={() => setHoveredIndex(null)}
                onClick={() => selectCommand && selectCommand(result.command)}
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
                    <span style={{ color: '#000' }}>Similarity: </span>
                    <span style={{ color: '#4CAF50' }}>{(result.similarity).toFixed(4)}</span>
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
                
                {hoveredIndex === index && (
                  <div style={{
                    position: 'absolute',
                    ...(popupPosition === 'bottom' ? {
                      top: 'calc(100% + 10px)',
                    } : {
                      bottom: 'calc(100% + 10px)',
                    }),
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: '110%',
                    maxWidth: 'calc(100vw - 40px)',
                    zIndex: 1000,
                  }}>
                    {/* 화살표 - 테두리 부분 */}
                    <div 
                      style={{
                        position: 'absolute',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        width: '0',
                        height: '0',
                        borderLeft: '8px solid transparent',
                        borderRight: '8px solid transparent',
                        ...(popupPosition === 'bottom' ? {
                          top: '-8px',
                          borderBottom: '8px solid #ddd',
                        } : {
                          bottom: '-8px',
                          borderTop: '8px solid #ddd',
                        }),
                        zIndex: 1001
                      }}
                    />
                    
                    {/* 화살표 - 내부 배경색 부분 */}
                    <div 
                      style={{
                        position: 'absolute',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        width: '0',
                        height: '0',
                        borderLeft: '7px solid transparent',
                        borderRight: '7px solid transparent',
                        ...(popupPosition === 'bottom' ? {
                          top: '-6px', // -6px로 조정하여 테두리와 더 자연스럽게 겹치도록 함
                          borderBottom: '7px solid white',
                        } : {
                          bottom: '-6px', // -6px로 조정하여 테두리와 더 자연스럽게 겹치도록 함
                          borderTop: '7px solid white',
                        }),
                        zIndex: 1002
                      }}
                    />
                    
                    {/* 팝업 컨테이너 */}
                    <div 
                      style={{
                        width: '100%',
                        padding: '15px',
                        backgroundColor: 'white',
                        border: '1px solid #ddd',
                        borderRadius: '6px',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                        fontSize: '13px',
                        maxHeight: '200px',
                        overflowY: 'auto',
                        position: 'relative',
                        boxSizing: 'border-box'
                      }}
                    >
                        {result.syntax && (
                          <div style={{ marginBottom: '12px' }}>
                          <strong style={{ display: 'flex', alignItems: 'center', marginBottom: '5px' }}>
                              <span style={{ marginRight: '5px' }}>🔠</span> Syntax:
                          </strong> 
                          <div style={{ 
                              wordBreak: 'break-all', 
                              background: '#f0f8ff', 
                              padding: '10px',
                              borderRadius: '4px',
                              border: '1px solid #d0e5ff',
                              fontSize: '12px',
                              fontFamily: 'monospace',
                              lineHeight: '1.5',
                              color: '#0066cc'
                          }}>
                              {result.syntax}
                          </div>
                          </div>
                      )}
                      {result.link && (
                        <div style={{ marginBottom: '12px' }}>
                          <strong style={{ display: 'flex', alignItems: 'center', marginBottom: '5px' }}>
                            <span style={{ marginRight: '5px' }}>🔗</span> Link:
                          </strong> 
                            <div style={{
                              wordBreak: 'break-all',
                              overflowWrap: 'break-word',
                              marginTop: '4px',
                              background: '#f5f5f5',
                              padding: '10px',
                              borderRadius: '4px',
                              border: '1px solid #e0e0e0'
                            }}>
                              <a 
                                href={result.link} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                style={{
                                  display: 'inline-block',
                                  width: '100%',
                                  textOverflow: 'ellipsis',
                                  wordWrap: 'break-word',
                                  color: '#2a7ed2',
                                  textDecoration: 'none'
                                }}
                              >
                                {result.link}
                              </a>
                            </div>
                        </div>
                      )}
                      
                      {result.example && result.example.length > 0 && (
                        <div style={{ marginBottom: '12px' }}>
                          <strong style={{ display: 'flex', alignItems: 'center', marginBottom: '5px' }}>
                            <span style={{ marginRight: '5px' }}>✏️</span> Example:
                          </strong>
                          <div style={{ 
                            background: '#f5f7f9', 
                            borderRadius: '4px', 
                            padding: '8px 10px',
                            border: '1px solid #e9ecef'
                          }}>
                            <ul style={{ 
                              margin: '0', 
                              paddingLeft: '20px', 
                              listStyleType: 'circle' 
                            }}>
                              {result.example.map((ex, idx) => (
                                <li key={idx} style={{ 
                                  wordBreak: 'break-all', 
                                  marginBottom: '4px',
                                  lineHeight: '1.4'
                                }}>
                                  {ex}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}
                      
                      {result.note && (
                        <div style={{ marginBottom: '8px' }}>
                          <strong style={{ display: 'flex', alignItems: 'center', marginBottom: '5px' }}>
                            <span style={{ marginRight: '5px' }}>💡</span> Note:
                          </strong> 
                            <div style={{ 
                              wordBreak: 'break-all', 
                              background: '#f5f5f5',
                              padding: '10px',
                              borderRadius: '4px',
                              border: '1px solid #e0e0e0',
                              fontSize: '12px',
                              lineHeight: '1.5'
                            }}>
                              {result.note}
                            </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : !isSearching && (
          <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
            <p>No search results</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchResults; 