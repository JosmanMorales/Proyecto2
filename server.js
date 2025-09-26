// server.js
const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true, credentials: true } // ok si todo vive en el mismo host
});

const PORT = Number(process.env.PORT) || 3000;
const TICK_SECONDS = Number(process.env.TICK_SECONDS || 0.5);

// ---- estáticos + index ---------------------------------
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));
app.get('/', (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));

// ---- websockets ----------------------------------------
io.on('connection', (socket) => {
  socket.emit('config', { tickSeconds: TICK_SECONDS });
});

// ---- reloj ---------------------------------------------
let timer = null;
function startClock() {
  if (timer) return;
  timer = setInterval(() => {
    io.emit('tick');
    // console.log('Tick emitido a clientes');
  }, TICK_SECONDS * 1000);
}
function stopClock() {
  if (timer) { clearInterval(timer); timer = null; }
}
startClock();

// ---- shutdown limpio -----------------------------------
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    stopClock();
    server.close(() => process.exit(0));
  });
}

server.listen(PORT, () => {
  console.log(`Servidor en http://localhost:${PORT}`);
  console.log(`Unidad de tiempo: ${TICK_SECONDS} s`);
});
