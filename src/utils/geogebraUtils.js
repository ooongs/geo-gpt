// GeoGebra 관련 유틸리티 함수

export const executeGeoGebraCommands = (code) => {
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
                console.error('명령어 실행 오류:', error);
            }
        }
    });
};

export const resetGeoGebra = () => {
    const app = window.app1;
    if (app) {
        app.reset();
    }
}; 