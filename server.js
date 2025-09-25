// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Cambia el tick si quieres más rápido (ej. 1 o 0.5)
const TICK_SECONDS = parseFloat(process.env.TICK_SECONDS || '0.5');

let timer = null;

app.use(express.static('public'));

io.on('connection', (socket) => {
  // Enviar config inicial al cliente
  socket.emit('config', { tickSeconds: TICK_SECONDS });
});

// Reloj: emite 'tick' a todos los clientes
function startClock() {
  if (timer) return;
  timer = setInterval(() => {
    io.emit('tick');
    console.log('Tick emitido a clientes');
  }, TICK_SECONDS * 1000);
}
startClock();

server.listen(PORT, () => {
  console.log(`Servidor en http://localhost:${PORT}`);
  console.log(`Unidad de tiempo: ${TICK_SECONDS} s`);
});
