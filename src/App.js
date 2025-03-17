import React from 'react';
// import Geogebra from 'react-geogebra';
import Chat from './Chat';
import './App.css'; // 필요하다면 별도의 CSS 파일 생성

function App() {
    return (
        <div className="App">
            <header className="app-header">
                <div className="header-content">
                    <div className="logo-container">
                        <h1 className="app-logo">GeoGPT</h1>
                        <span className="app-version">Beta</span>
                    </div>
                    <nav className="app-nav">
                        <button className="nav-button">Documentation</button>
                        <button className="nav-button">Examples</button>
                        <button className="nav-button primary">Feedback</button>
                    </nav>
                </div>
            </header>
            
            <main className="app-main">
                <Chat />
            </main>
            
            <footer className="app-footer">
                <div className="footer-content">
                    <p>GeoGPT - Interactive Geometry Assistant powered by AI</p>
                    <p>© 2023 GeoGebra Integration Project</p>
                </div>
            </footer>
        </div>
    );
}

export default App;
