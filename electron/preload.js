const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');

try {
    require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch (e) {}

let SERVER_URL = process.env.SERVER_URL || null;
if (!SERVER_URL && process.env.ELECTRON_URL) {
    try {
        SERVER_URL = new URL(process.env.ELECTRON_URL).origin;
    } catch (e) {}
}
SERVER_URL = SERVER_URL || 'https://localhost:3002';

contextBridge.exposeInMainWorld('api', {
    serverUrl: SERVER_URL,
    log: async (level, message) => {
        try { await ipcRenderer.invoke('log', level, message); } catch(e){ }
    }
});
