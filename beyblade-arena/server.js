// Static file server + WebSocket room relay for online 1v1.
//
// Netcode model: the room host runs the authoritative simulation and pushes
// snapshots; the guest sends only its input. The server never simulates the
// battle, it just forwards messages between the two peers in a room.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const PORT = Number(process.env.PORT || 3000);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const rel = url.pathname === '/' ? '/index.html' : url.pathname;
  const file = path.join(ROOT, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

/** @type {Map<string, {code:string, host:any, guest:any, hostInfo:any, guestInfo:any}>} */
const rooms = new Map();
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const RELAY = new Set(['input', 'state', 'launch', 'rematch', 'emote', 'ready']);

function makeCode() {
  let code;
  do {
    code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  } while (rooms.has(code));
  return code;
}

const send = (ws, msg) => {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
};

function peerOf(room, ws) {
  return room.host === ws ? room.guest : room.host;
}

function closeRoom(room, except) {
  for (const ws of [room.host, room.guest]) {
    if (ws && ws !== except) send(ws, { t: 'peerLeft' });
  }
  rooms.delete(room.code);
}

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  ws.room = null;
  ws.isHost = false;
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg.t !== 'string') return;

    if (msg.t === 'create') {
      if (ws.room) return;
      const code = makeCode();
      const room = { code, host: ws, guest: null, hostInfo: msg.info || {}, guestInfo: null };
      rooms.set(code, room);
      ws.room = room;
      ws.isHost = true;
      send(ws, { t: 'created', code, you: 0 });
      return;
    }

    if (msg.t === 'join') {
      const room = rooms.get(String(msg.code || '').toUpperCase());
      if (!room) return send(ws, { t: 'error', reason: 'no-room' });
      if (room.guest) return send(ws, { t: 'error', reason: 'full' });
      room.guest = ws;
      room.guestInfo = msg.info || {};
      ws.room = room;
      ws.isHost = false;
      send(ws, { t: 'joined', code: room.code, you: 1, peer: room.hostInfo });
      send(room.host, { t: 'peerJoined', peer: room.guestInfo });
      return;
    }

    if (msg.t === 'leave') {
      if (ws.room) closeRoom(ws.room, ws);
      ws.room = null;
      return;
    }

    if (ws.room && RELAY.has(msg.t)) send(peerOf(ws.room, ws), msg);
  });

  ws.on('close', () => {
    if (ws.room) closeRoom(ws.room, ws);
    ws.room = null;
  });
});

// Drop peers that stopped responding so rooms do not leak.
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);
wss.on('close', () => clearInterval(heartbeat));

server.listen(PORT, () => {
  console.log(`Beyblade Arena → http://localhost:${PORT}`);
});
