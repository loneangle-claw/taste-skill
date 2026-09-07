// Thin WebSocket client. The host is authoritative: it simulates and sends
// snapshots, the guest sends input and renders what it is told.

export function createNet() {
  return {
    ws: null,
    code: null,
    you: null,      // 0 = host, 1 = guest
    connected: false,
    peer: null,
    handlers: {},
  };
}

export function on(net, type, fn) {
  net.handlers[type] = fn;
}

function emit(net, type, payload) {
  const fn = net.handlers[type];
  if (fn) fn(payload);
}

export function connect(net) {
  if (net.ws && (net.ws.readyState === 0 || net.ws.readyState === 1)) return Promise.resolve();
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  net.ws = new WebSocket(`${proto}://${location.host}`);

  return new Promise((resolve, reject) => {
    net.ws.onopen = () => {
      net.connected = true;
      resolve();
    };
    net.ws.onerror = () => reject(new Error('connection failed'));
    net.ws.onclose = () => {
      net.connected = false;
      emit(net, 'closed');
    };
    net.ws.onmessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.t === 'created' || msg.t === 'joined') {
        net.code = msg.code;
        net.you = msg.you;
        if (msg.peer) net.peer = msg.peer;
      }
      if (msg.t === 'peerJoined') net.peer = msg.peer;
      emit(net, msg.t, msg);
    };
  });
}

export function send(net, msg) {
  if (net.ws && net.ws.readyState === 1) net.ws.send(JSON.stringify(msg));
}

export function disconnect(net) {
  if (net.ws && net.ws.readyState === 1) send(net, { t: 'leave' });
  if (net.ws) net.ws.close();
  net.ws = null;
  net.code = null;
  net.you = null;
  net.peer = null;
  net.connected = false;
}

export const isHost = (net) => net.you === 0;
