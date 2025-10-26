const { app, BrowserWindow, globalShortcut, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
// Zezwól na autoplay z dźwiękiem w Electron (ułatwia odtwarzanie w kiosk)
app.commandLine.appendSwitch('ignore-certificate-errors');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// Spróbuj wczytać .env, jeśli jest dostępny (bez błędu, gdy brak pakietu)
let _envLoaded = false;
let _envPathTried = path.join(__dirname, '..', '.env');
try {
    if (fs.existsSync(_envPathTried)) {
        require('dotenv').config({ path: _envPathTried });
        _envLoaded = true;
    } else {
        // spróbuj także dist/.env (packaged)
        const distEnv = path.join(__dirname, '..', 'dist', '.env');
        if (fs.existsSync(distEnv)) {
            require('dotenv').config({ path: distEnv });
            _envPathTried = distEnv;
            _envLoaded = true;
        }
    }
} catch (e) { /* dotenv not installed */ }

// Użyj zmiennej środowiskowej z .env lub fallback
let ELECTRON_URL = process.env.ELECTRON_URL || 'http://localhost:3000/display.html';

// Jeśli podczas kompilacji wygenerowano electron/build-config.json, priorytetowo użyj tamtej wartości
try {
    const buildCfgPath = path.join(__dirname, 'build-config.json');
    if (fs.existsSync(buildCfgPath)) {
        try {
            const cfg = JSON.parse(fs.readFileSync(buildCfgPath, 'utf8') || '{}');
            if (cfg && cfg.ELECTRON_URL) {
                ELECTRON_URL = cfg.ELECTRON_URL;
            }
        } catch (e) {
            // ignoruj błąd parsowania, użyj process.env
        }
    }
} catch (e) { /* ignore */ }

// nowa funkcja sprawdzająca dostępność serwera (HEAD request z timeout)
function checkServer(urlString, timeout = 3000) {
    return new Promise((resolve) => {
        try {
            const u = new URL(urlString);
            const lib = u.protocol === 'https:' ? https : http;
            const opts = {
                method: 'HEAD',
                hostname: u.hostname,
                port: u.port || (u.protocol === 'https:' ? 443 : 80),
                path: u.pathname + (u.search || ''),
                timeout
            };
            const req = lib.request(opts, (res) => {
                // status < 500 traktujemy jako dostępny
                resolve(res.statusCode < 500);
            });
            req.on('error', () => resolve(false));
            req.on('timeout', () => { try { req.destroy(); } catch(e){}; resolve(false); });
            req.end();
        } catch (e) {
            resolve(false);
        }
    });
}

// --- ZAMIENIONE: bezpieczny logger zapisujący natychmiast (sync) do kilku lokalizacji ---
let _resolvedLogPaths = null;
function resolveLogPaths() {
	try {
		const paths = [];
		// 1) preferowana, stała lokalizacja dla użytkownika Windows: %APPDATA%\display-manager\log.txt
		try {
			const appDataEnv = process.env.APPDATA;
			const appDataPath = appDataEnv || (app.getPath ? app.getPath('appData') : null);
			if (appDataPath) {
				paths.push(path.join(appDataPath, 'display-manager', 'log.txt'));
			}
		} catch (e) { /* ignore */ }

		// 2) userData (standard Electron) jako dodatkowa lokalizacja
		try {
			const user = app.getPath && app.getPath('userData');
			if (user) paths.push(path.join(user, 'log.txt'));
		} catch (e) { /* ignore */ }

		// 3) fallback: katalog obok main.js (przy uruchomieniu z rozpakowanego folderu)
		try {
			paths.push(path.join(__dirname, 'log.txt'));
		} catch (e) { /* ignore */ }

		return Array.from(new Set(paths));
	} catch (e) {
		return [path.join(__dirname, 'log.txt')];
	}
}

function appendLog(level, message) {
	try {
		if (!_resolvedLogPaths) _resolvedLogPaths = resolveLogPaths();

		const t = new Date().toISOString();
		const line = `${t} | ${String(level || 'info').toUpperCase()} | ${String(message).replace(/\r?\n/g,' ')}\n`;

		_resolvedLogPaths.forEach(p => {
			try {
				const dir = path.dirname(p);
				if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
				fs.appendFileSync(p, line, { encoding: 'utf8' });
			} catch (e) {
				// kontynuuj dla innych ścieżek
			}
		});

		// jednorazowy debug: wypisz do konsoli listę użytych ścieżek (przy pierwszym zapisie)
		if (_resolvedLogPaths && _resolvedLogPaths._debugShown !== true) {
			try {
				console.log('Logger: zapisywać będzie do:', _resolvedLogPaths.join(' ; '));
				_resolvedLogPaths._debugShown = true;
			} catch(e){}
		}

		// dodatkowo loguj do konsoli
		if ((level || '').toLowerCase() === 'error') console.error(message);
		else if ((level || '').toLowerCase() === 'warn') console.warn(message);
		else console.log(message);
	} catch (e) {
		// cichy fail-safe
	}
}
// --- KONIEC zmiany loggera ---

// udostępnij IPC aby preload/renderer mogły logować przez main
ipcMain.handle('log', async (_, level, msg) => {
	appendLog(level || 'info', msg);
	return true;
});

function createWindow() {
    const win = new BrowserWindow({
        width: 1280,
        height: 720,
        kiosk: true,
        frame: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    // DEBUG: pokaż skąd ładowano .env i jaka wartość ELECTRON_URL zostanie użyta
    const envInfo = `ENV loaded: ${_envLoaded} (path: ${_envPathTried}), ELECTRON_URL="${ELECTRON_URL}"`;
    console.log(envInfo);
    appendLog('info', envInfo);

    // dodatkowe debugowe zdarzenia webContents
    win.webContents.on('did-start-loading', () => {
        const msg = `did-start-loading ${ELECTRON_URL}`;
        console.log(msg);
        appendLog('info', msg);
    });
    win.webContents.on('did-stop-loading', () => {
        const msg = `did-stop-loading ${ELECTRON_URL}`;
        console.log(msg);
        appendLog('info', msg);
    });
    win.webContents.on('did-frame-finish-load', (event, isMainFrame) => {
        if (isMainFrame) {
            const msg = `did-frame-finish-load (main frame) ${ELECTRON_URL}`;
            console.log(msg);
            appendLog('info', msg);
        }
    });

    win.loadURL(ELECTRON_URL);

    // logowanie zdarzeń ładowania (przydatne gdy serwer jest niedostępny)
    win.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
        const msg = `did-fail-load ${isMainFrame ? 'mainFrame' : 'subFrame'} url=${validatedURL} code=${errorCode} desc=${errorDescription}`;
        console.error(msg);
        appendLog('error', msg);
    });

    win.webContents.on('did-finish-load', () => {
        const msg = `did-finish-load ${ELECTRON_URL}`;
        console.log(msg);
        appendLog('info', msg);
    });

    win.on('unresponsive', () => {
        const msg = 'Okno aplikacji przestało odpowiadać';
        console.error(msg);
        appendLog('error', msg);
    });

    win.webContents.on('crashed', () => {
        const msg = 'Renderer process crashed';
        console.error(msg);
        appendLog('error', msg);
    });

    // 🔹 Zabezpieczenie globalnych skrótów
    try {
        globalShortcut.register('CommandOrControl+R', () => {});
        globalShortcut.register('CommandOrControl+Shift+I', () => {});
        globalShortcut.register('Alt+Tab', () => {});
        globalShortcut.register('F11', () => {});
        globalShortcut.register('Alt+F4', () => { /* blokujemy zamknięcie */ });
    } catch (err) {
        console.warn('Nie udało się zarejestrować globalShortcut:', err);
        appendLog('warn', `globalShortcut register error: ${err && err.message ? err.message : err}`);
    }

    // 🔹 Blokada zamknięcia okna
    win.on('close', (e) => {
        e.preventDefault();
        const msg = 'Zablokowano próbę zamknięcia okna';
        console.log(msg);
        appendLog('info', msg);
    });
}

// zamiast bezpośrednio createWindow — najpierw sprawdź serwer i zaloguj błąd jeśli niedostępny
app.whenReady().then(async () => {
    // upewnij się że logi będą zapisywane i dodaj pierwszy wpis
    appendLog('info', 'Aplikacja: main process ready');

    const ok = await checkServer(ELECTRON_URL, 3000);
    if (!ok) {
        const msg = `Nie można połączyć się z serwerem: ${ELECTRON_URL}`;
        console.error(msg);
        appendLog('error', msg);
    } else {
        const msg = `Serwer dostępny: ${ELECTRON_URL}`;
        console.log(msg);
        appendLog('info', msg);
    }
    createWindow();
});

app.on('will-quit', () => {
    try { globalShortcut.unregisterAll(); } catch (e) {}
    appendLog('info', 'Aplikacja will-quit');
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
