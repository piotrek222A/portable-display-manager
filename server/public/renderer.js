console.log('Init renderer');

const content = document.getElementById('content');

// 🔹 Socket.IO: wybór połączenia
let socket;

if (window.api && window.api.socket) {
    socket = window.api.socket;
} else if (window.api && window.api.serverUrl && typeof io === 'function') {
    socket = io(window.api.serverUrl);
} else if (typeof io === 'function') {
    socket = io();
} else {
    console.error('Brak dostępnego socketu (ani window.api.socket ani io()).');
    socket = { on: () => {}, emit: () => {} };
}

// DODANE: wykrywanie stanu połączenia i timeout na brak połączenia
let socketConnected = false;
const SOCKET_CONNECT_TIMEOUT_MS = 4000;
let socketConnectTimer = setTimeout(() => {
  if (!socketConnected) {
    try { showMessage('Brak połączenia z serwerem'); } catch(e){ console.warn(e); }
  }
}, SOCKET_CONNECT_TIMEOUT_MS);

if (socket && typeof socket.on === 'function') {
  socket.on('connect', () => {
    socketConnected = true;
    clearTimeout(socketConnectTimer);
    try { showMessage('Brak danych PDM'); } catch(e){ console.warn(e); }
    console.log('Socket connected');
  });
  socket.on('connect_error', (err) => {
    socketConnected = false;
    clearTimeout(socketConnectTimer);
    try { showMessage('Brak połączenia z serwerem'); } catch(e){ console.warn(e); }
    console.warn('Socket connect_error', err);
  });
  socket.on('disconnect', () => {
    socketConnected = false;
    try { showMessage('Brak połączenia z serwerem'); } catch(e){ console.warn(e); }
    console.log('Socket disconnected');
  });
}

// 🔹 Playlista
let playlist = [];
let index = 0;
let loop = false;
let timer = null;

// 🔹 Podstawowe style dla kontenera
content.style.width = '100%';
content.style.height = '100%';
content.style.display = 'flex';
content.style.alignItems = 'center';
content.style.justifyContent = 'center';

// 🔹 Helpery
function clearContent() {
    content.innerHTML = '';
}

function showMessage(msg) {
    clearTimeout(timer);
    playlist = [];
    index = 0;
    clearContent();

    const p = document.createElement('div');
    p.style.color = '#fff';
    p.style.padding = '12px';
    p.style.textAlign = 'center';
    p.style.fontSize = /\b(błąd|brak)\b/i.test(msg) ? '36px' : '20px';
    p.style.fontWeight = /\b(błąd|brak)\b/i.test(msg) ? '600' : '400';
    p.textContent = msg;

    content.appendChild(p);
}

function showCustomText(text, durationSec, keepPlaylist = false) {
    clearTimeout(timer);
    if (!keepPlaylist) playlist = [], index = 0;

    clearContent();

    const p = document.createElement('div');
    p.style.color = '#fff';
    p.style.padding = '20px';
    p.style.textAlign = 'center';
    p.style.fontSize = '48px';
    p.style.fontWeight = '700';
    p.style.lineHeight = '1.1';
    p.style.wordBreak = 'break-word';
    p.textContent = text;

    content.appendChild(p);

    if (durationSec && durationSec > 0) {
        timer = setTimeout(() => {
            if (keepPlaylist) next();
            else showMessage('Brak danych PDM');
        }, durationSec * 1000);
    }
}

// 🔹 Wyświetlanie treści
function setIframe(url, attempt = 1) {
    clearContent();

    const f = document.createElement('iframe');
    f.src = url;
    f.style.width = '100%';
    f.style.height = '100%';
    f.style.border = '0';
    f.style.objectFit = 'cover';
    content.appendChild(f);

    let loaded = false;
    const to = setTimeout(() => {
        if (!loaded) {
            console.warn('Iframe timeout dla:', url, 'attempt', attempt);
            if (attempt < 2) setTimeout(() => setIframe(url, attempt + 1), 200);
            else showMessage('Błąd ładowania strony w iframe (X-Frame-Options / problem sieciowy).');
        }
    }, 5000);

    f.addEventListener('load', () => {
        loaded = true;
        clearTimeout(to);
        console.log('Iframe załadowany:', url, 'attempt', attempt);
    });
}

function playVideo(url) {
    clearContent();

    const v = document.createElement('video');
    v.src = url;
    v.autoplay = true;
    v.playsInline = true;
    v.controls = false;
    v.muted = false; // chcemy dźwięk jeśli przeglądarka pozwoli
    v.style.width = '100%';
    v.style.height = '100%';
    v.style.objectFit = 'cover';
    content.style.position = 'relative';
    content.appendChild(v);

    v.addEventListener('error', () => {
        console.error('Błąd odtwarzania wideo:', url);
        showMessage('Błąd odtwarzania wideo. Sprawdź URL lub format pliku.');
    });

    const createUnmuteButton = () => {
        const btn = document.createElement('button');
        btn.textContent = 'Włącz dźwięk';
        btn.style.position = 'absolute';
        btn.style.right = '12px';
        btn.style.bottom = '12px';
        btn.style.zIndex = '9999';
        btn.style.padding = '8px 12px';
        btn.style.fontSize = '16px';
        btn.addEventListener('click', async () => {
            try { v.muted = false; await v.play(); btn.remove(); } catch(e){ console.warn('Unmute play failed', e); }
        });
        return btn;
    };

    const playUnmuted = v.play();
    if (playUnmuted !== undefined) {
        playUnmuted.then(() => {
            console.log('Wideo odtwarzane z dźwiękiem');
        }).catch(async (err) => {
            console.warn('Autoplay z dźwiękiem zablokowany:', err);
            try {
                v.muted = true;
                const p2 = await v.play();
                console.log('Wideo odtwarzane w trybie muted (fallback).');
                const unmuteBtn = createUnmuteButton();
                content.appendChild(unmuteBtn);
            } catch (e2) {
                console.warn('Muted autoplay też nie zadziałał:', e2);
                const overlay = document.createElement('div');
                overlay.style.position = 'absolute';
                overlay.style.left = '0';
                overlay.style.top = '0';
                overlay.style.right = '0';
                overlay.style.bottom = '0';
                overlay.style.display = 'flex';
                overlay.style.alignItems = 'center';
                overlay.style.justifyContent = 'center';
                overlay.style.background = 'rgba(0,0,0,0.6)';
                overlay.style.color = '#fff';
                overlay.style.fontSize = '22px';
                overlay.style.cursor = 'pointer';
                overlay.textContent = 'Kliknij, aby uruchomić odtwarzanie z dźwiękiem';
                content.appendChild(overlay);

                async function startOnInteraction() {
                    try { overlay.remove(); } catch(e){}
                    try { v.muted = false; await v.play(); } catch(err) {
                        console.warn('Play po interakcji nieudane', err);
                        showMessage('Odtwarzanie nie powiodło się');
                    }
                    window.removeEventListener('pointerdown', startOnInteraction);
                }
                window.addEventListener('pointerdown', startOnInteraction, { once: true });
            }
        });
    }
}

function showImage(url) {
    clearContent();

    // jeśli strona działa pod https: i obraz jest http:, użyjemy lokalnego proxy, żeby uniknąć mixed-content
    try {
        if (location.protocol === 'https:' && /^http:\/\//i.test(url)) {
            url = '/proxy?url=' + encodeURIComponent(url);
        }
    } catch (e) {
        // w razie błędu po prostu zostaw oryginalny URL
    }

    const img = document.createElement('img');
    img.src = url;
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'cover';
    content.appendChild(img);

    img.addEventListener('error', () => {
        console.error('Błąd ładowania obrazu:', url);
        showMessage('Błąd ładowania obrazu. Sprawdź URL.');
    });
}

// 🔹 Playlist logic
function playItem(item) {
    switch(item.type) {
        case 'url': setIframe(item.url); break;
        case 'video': playVideo(item.url); break;
        case 'image': showImage(item.url); break;
        case 'text': showCustomText(item.text || '', item.duration || 15, true); break;
    }
}

function next() {
    if (index >= playlist.length) {
        if (loop) index = 0;
        else return showMessage('Brak danych PDM');
    }

    playItem(playlist[index]);
    timer = setTimeout(next, (playlist[index].duration || 15) * 1000);
    index++;
}

function startPlaylist(data, isLoop) {
    clearTimeout(timer);

    if (!Array.isArray(data) || data.length === 0) {
        return showMessage('Brak danych PDM');
    }

    playlist = data;
    loop = isLoop;
    index = 0;
    next();
}

function stopPlaylist() {
    clearTimeout(timer);
    playlist = [];
    index = 0;
    showMessage('Brak danych PDM');
}

// 🔹 Socket.IO – obsługa komend
function handleIncomingCommand(cmd) {
    console.log('Otrzymano komendę:', cmd);
    if (!cmd || typeof cmd !== 'object') return;

    switch(cmd.action) {
        case 'showText':
            showCustomText(cmd.text || '', cmd.duration || 0);
            break;
        case 'startPlaylist':
            if (!cmd.playlist || !Array.isArray(cmd.playlist) || !cmd.playlist.length) {
                showMessage('Brak danych PDM');
            } else startPlaylist(cmd.playlist, cmd.loop);
            break;
        case 'stopPlaylist': stopPlaylist(); break;
        case 'openUrl':
            const url = (typeof cmd.url === 'string') ? cmd.url.trim() : '';
            if (!url) return showMessage('Brak URL');
            if (!/^https?:\/\//i.test(url)) return showMessage('Nieprawidłowy protokół URL');
            setIframe(url);
            break;
    }
}

socket.on('command', handleIncomingCommand);

// 🔹 Eksport funkcji globalnie
window.showCustomText = showCustomText;
window.startPlaylist = startPlaylist;
window.stopPlaylist = stopPlaylist;
window.nextPlaylistItem = next;
window.clearDisplayContent = clearContent;
window._handlePresentationCommand = handleIncomingCommand;

// 🔹 Przetwarzanie zbuforowanych komend przed załadowaniem renderer.js
try {
    if (Array.isArray(window._pendingPresentationCommands) && window._pendingPresentationCommands.length) {
        window._pendingPresentationCommands.forEach(cmd => {
            try { handleIncomingCommand(cmd); } catch(e) { console.error('pending cmd error', e); }
        });
        window._pendingPresentationCommands = [];
    }
} catch(e) {
    console.warn('Brak pendingPresentationCommands lub błąd przetwarzania', e);
}
