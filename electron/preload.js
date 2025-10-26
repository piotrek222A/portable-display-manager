const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');

// Spróbuj wczytać .env jeśli jest dostępny
try {
    require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch (e) { /* dotenv not installed */ }

// Wyznacz serverUrl: najpierw SERVER_URL, potem origin z ELECTRON_URL, fallback
let SERVER_URL = process.env.SERVER_URL || null;
if (!SERVER_URL && process.env.ELECTRON_URL) {
    try {
        SERVER_URL = new URL(process.env.ELECTRON_URL).origin;
    } catch (e) { /* ignore */ }
}
SERVER_URL = SERVER_URL || 'https://localhost:3002';

contextBridge.exposeInMainWorld('api', {
    serverUrl: SERVER_URL,
    // log(level, message) -> zapisze do pliku log.txt przez main
    log: async (level, message) => {
        try { await ipcRenderer.invoke('log', level, message); } catch(e){ /* ignore */ }
    }
});
