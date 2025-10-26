const fs = require('fs');
const express = require('express');
const http = require('http');
const https = require('https');
const { Server } = require('socket.io');
const path = require('path');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
const PORT_HTTP = 3001;
const PORT_HTTPS = 3002;
const SECRET_KEY = "supersecret";

const USERS = [{ username: "admin", password: "1234" }];

app.use(cors());
app.use(bodyParser.json());

app.use(express.static(path.join(__dirname, 'public')));

try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch(e){}

app.get('/api/config', (req, res) => {
  if (process.env.SERVER_URL) {
    return res.json({ serverUrl: process.env.SERVER_URL });
  }
  let proto = 'http';
  try {
    if (req.headers && req.headers['x-forwarded-proto']) proto = req.headers['x-forwarded-proto'].split(',')[0];
    else if (req.protocol) proto = req.protocol;
    else if (req.socket && req.socket.encrypted) proto = 'https';
  } catch (e) {}
  const host = req.get('host') || `localhost:${PORT_HTTPS}`;
  const serverUrl = `${proto}://${host}`;
  res.json({ serverUrl });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = USERS.find(u => u.username === username && u.password === password);
  if (!user) return res.status(401).json({ error: "Niepoprawny login/hasło" });
  const token = jwt.sign({ username }, SECRET_KEY, { expiresIn: '2h' });
  res.json({ token });
});

let lastCommand = null;
const httpServer = http.createServer(app);
const httpsServer = https.createServer({
  key: fs.readFileSync('./localhost+1-key.pem'),
  cert: fs.readFileSync('./localhost+1.pem')
}, app);

const io = new Server(httpsServer, {
  cors: { origin: "*" }
});

const SERVER_LOG_PATH = path.join(__dirname, 'log.txt');
function serverLog(level, message) {
  try {
    const t = new Date().toISOString();
    const line = `${t} | ${String(level).toUpperCase()} | ${String(message).replace(/\r?\n/g,' ')}\n`;
    fs.appendFile(SERVER_LOG_PATH, line, () => {});
  } catch (e) {}
  try {
    if (level === 'error') console.error(message);
    else console.log(message);
  } catch(e){}
}

io.on('connection', (socket) => {
  serverLog('info', `Socket connected: ${socket.id}`);
  console.log('Socket connected:', socket.id);

  if (lastCommand) socket.emit('command', lastCommand);

  socket.on('send-command', (cmd) => {
    const token = cmd?.token;
    if (!token) {
      socket.emit('command-error', { error: 'Brak tokena' });
      serverLog('warn', `send-command rejected (no token) from ${socket.id}`);
      return;
    }
    try {
      jwt.verify(token, SECRET_KEY);
    } catch {
      socket.emit('command-error', { error: 'Nieprawidłowy token' });
      serverLog('warn', `send-command rejected (invalid token) from ${socket.id}`);
      return;
    }
    const cmdToSend = { ...cmd };
    delete cmdToSend.token;
    lastCommand = cmdToSend;
    io.emit('command', cmdToSend);
    serverLog('info', `send-command broadcast by ${socket.id}: ${JSON.stringify(cmdToSend)}`);
  });

  socket.on('disconnect', () => {
    serverLog('info', `Socket disconnected: ${socket.id}`);
    console.log('Socket disconnected:', socket.id);
  });
});

app.get('/api/status', (req, res) => {
  const clients = Array.from(io.sockets.sockets.keys());
  res.json({ lastCommand, clients });
});

app.post('/api/send-command', (req, res) => {
  const auth = (req.headers.authorization || '').trim();
  let token = null;
  if (auth.toLowerCase().startsWith('bearer ')) token = auth.slice(7).trim();
  else if (req.body?.token) token = req.body.token;
  if (!token) return res.status(401).json({ error: 'Brak tokena' });
  try {
    jwt.verify(token, SECRET_KEY);
  } catch {
    return res.status(401).json({ error: 'Nieprawidłowy token' });
  }
  const cmdToSend = { ...req.body };
  delete cmdToSend.token;
  lastCommand = cmdToSend;
  io.emit('command', cmdToSend);
  res.json({ ok: true, sent: cmdToSend });
});

app.get('/proxy', (req, res) => {
  const target = req.query.url;
  if (!target || typeof target !== 'string') return res.status(400).send('Missing url');
  let parsed;
  try {
    parsed = new URL(target);
  } catch (e) {
    return res.status(400).send('Invalid url');
  }
  if (!/^https?:$/.test(parsed.protocol)) return res.status(400).send('Only http/https allowed');
  const lib = parsed.protocol === 'https:' ? require('https') : require('http');
  const MAX_BYTES = 20 * 1024 * 1024;
  let received = 0;
  const options = {
    method: 'GET',
    headers: {
      'User-Agent': 'RemoteDisplayProxy/1.0'
    }
  };
  const prox = lib.request(parsed, options, (r) => {
    if (r.statusCode >= 400) {
      res.status(r.statusCode).set('content-type', r.headers['content-type'] || 'text/plain').send(`Upstream error ${r.statusCode}`);
      prox.abort();
      return;
    }
    if (r.headers['content-type']) res.setHeader('Content-Type', r.headers['content-type']);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    r.on('data', chunk => {
      received += chunk.length;
      if (received > MAX_BYTES) {
        try { prox.abort(); } catch(e){}
        res.status(413).send('Payload too large');
      } else {
        res.write(chunk);
      }
    });
    r.on('end', () => {
      try { res.end(); } catch(e){}
    });
  });
  prox.on('error', (err) => {
    console.error('Proxy error for', target, err && err.message);
    serverLog('error', `Proxy error for ${target}: ${err && err.message}`);
    try { res.status(502).send('Proxy fetch failed'); } catch(e){}
  });
  prox.setTimeout(20000, () => {
    try { prox.abort(); } catch(e){}
    try { res.status(504).send('Proxy timeout'); } catch(e){}
  });
  prox.end();
});

httpServer.listen(PORT_HTTP, () => {
  const msg = `HTTP server running on http://localhost:${PORT_HTTP}`;
  console.log(msg);
  serverLog('info', msg);
});

httpsServer.listen(PORT_HTTPS, () => {
  const msg = `HTTPS server running on https://localhost:${PORT_HTTPS}`;
  console.log(msg);
  serverLog('info', msg);
});
