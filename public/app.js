// @ts-nocheck
import { Scheduler, Algorithm, createProcess } from './scheduler.js';

// ===== Socket.IO =====
const socket = io();
let TICK_SECONDS = 5;

socket.on('config', ({ tickSeconds }) => {
  TICK_SECONDS = tickSeconds;
  document.getElementById('tickInfo').textContent = `${TICK_SECONDS} s`;
});

socket.on('tick', () => {
  if (state.running) simulateStep();
});

// ===== Estado =====
const state = {
  processesDraft: [],
  scheduler: null,
  running: false
};

// ===== Utilidades UI =====
function $(id) { return document.getElementById(id); }
function fmtProc(p) { return `(${p.pid}) ${p.name}`; }
function nameForPid(pid) {
  if (!state.scheduler) return `P${pid}`;
  const found = state.scheduler.all.find(x => x.pid === pid);
  return found ? found.name : `P${pid}`;
}

// ========= Tema claro/oscuro =========
function applyTheme(mode){
  const root = document.documentElement;
  if (mode === 'light') {
    root.classList.add('theme-light');
    localStorage.setItem('theme','light');
    const btn = $('themeToggle'); if (btn) btn.textContent = '🌞';
  } else {
    root.classList.remove('theme-light');
    localStorage.setItem('theme','dark');
    const btn = $('themeToggle'); if (btn) btn.textContent = '🌙';
  }
}
(function initTheme(){
  const saved = localStorage.getItem('theme') || 'dark';
  applyTheme(saved);
})();
const themeBtn = $('themeToggle');
if (themeBtn) {
  themeBtn.addEventListener('click', () => {
    const current = localStorage.getItem('theme') || 'dark';
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });
}

// ========= Historial narrado por tick =========
function renderHistory(list){
  const cont = $('history');
  if (!cont) return;

  cont.className = 'history';  // usa el contenedor estilizado si tienes styles.css mejorado
  cont.innerHTML = '';

  // Tomamos los últimos eventos para no crecer infinito
  const lastN = list.slice(-200);

  // Agrupar por tiempo t
  const byTime = new Map();
  for (const h of lastN){
    if (!byTime.has(h.time)) byTime.set(h.time, []);
    byTime.get(h.time).push(h);
  }

  // Por cada t construimos una sola frase:
  // "t=K → llega P?[, P?] → CPU toma Ps | CPU sigue con Ps | CPU interrumpe Ps | Ps termina | CPU en IDLE"
  for (const [t, events] of byTime.entries()){
    let parts = [`t=${t} → `];

    // Llegadas en ese t
    if (state.scheduler) {
      const arrivals = state.scheduler.all.filter(p => p.arrival === t);
      if (arrivals.length) {
        parts.push(arrivals.map(p => `llega ${p.name}`).join(', '));
        parts.push('→');
      }
    }

    // Detectar eventos clave en ese t
    const dispatch = events.find(e => e.event === 'DISPATCH');
    const finish   = events.find(e => e.event === 'FINISH');
    const preempt  = events.find(e => e.event === 'PREEMPT');
    const tick     = events.find(e => e.event === 'TICK');
    const idle     = events.find(e => e.event === 'IDLE');

    // Nota: el orden de prioridad ayuda a que la frase sea más natural
    if (finish) {
      parts.push(`${nameForPid(finish.pid)} termina`);
      // Si además hubo un dispatch justo después en el mismo t, lo añadimos:
      if (dispatch) parts.push('→', `CPU toma ${nameForPid(dispatch.pid)}`);
    } else if (dispatch) {
      parts.push(`CPU toma ${nameForPid(dispatch.pid)}`);
    } else if (preempt) {
      parts.push(`CPU interrumpe ${nameForPid(preempt.pid)}`);
    } else if (tick) {
      parts.push(`CPU sigue con ${nameForPid(tick.pid)}`);
    } else if (idle) {
      parts.push('CPU en IDLE');
    } else {
      // Sin eventos visibles (raro), no ponemos nada extra
      parts.push('—');
    }

    const row = document.createElement('div');
    row.className = 'hist-row';
    row.textContent = parts.join(' ');
    cont.appendChild(row);
  }

  // Auto-scroll al final
  cont.scrollTop = cont.scrollHeight;
}

function renderDraftTable() {
  const tbody = $('draftTbody');
  tbody.innerHTML = '';
  state.processesDraft
    .slice().sort((a,b)=> a.arrival - b.arrival || a.pid - b.pid)
    .forEach(p => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${p.pid}</td>
        <td>${p.name}</td>
        <td>${p.burst}</td>
        <td>${p.arrival}</td>
        <td><button class="btn btn-sm btn-danger" data-pid="${p.pid}">Eliminar</button></td>
      `;
      tbody.appendChild(tr);
    });
}

function renderRuntime(snapshot) {
  $('timeNow').textContent = snapshot.time;
  $('algNow').textContent = snapshot.algorithm;
  $('qNow').textContent = snapshot.algorithm === Algorithm.RR ? snapshot.quantum : '-';

  // CPU
  const cpu = $('cpuNow');
  cpu.textContent = snapshot.running
    ? `${fmtProc(snapshot.running)} | restante: ${snapshot.running.remaining}`
    : '— IDLE —';

  // Ready queue
  const ready = $('readyList');
  ready.innerHTML = '';
  snapshot.ready.forEach(p => {
    const li = document.createElement('li');
    li.textContent = `${fmtProc(p)} · rem: ${p.remaining}`;
    ready.appendChild(li);
  });

  // Historial narrado
  renderHistory(snapshot.history);

  // Finalizados + métricas
  const tbody = $('doneTbody');
  tbody.innerHTML = '';
  snapshot.finished
    .slice().sort((a,b)=> a.finishTime - b.finishTime)
    .forEach(p => {
      const turnaround = p.finishTime - p.arrival;
      const waiting = turnaround - p.burst;
      const response = (p.firstResponseAt ?? p.finishTime) - p.arrival;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${p.pid}</td>
        <td>${p.name}</td>
        <td>${p.burst}</td>
        <td>${p.arrival}</td>
        <td>${p.startTime}</td>
        <td>${p.finishTime}</td>
        <td>${turnaround}</td>
        <td>${waiting}</td>
        <td>${response}</td>
      `;
      tbody.appendChild(tr);
    });
}

function simulateStep() {
  const sch = state.scheduler;
  if (!sch) return;
  sch.step();
  renderRuntime(sch.snapshot());
  if (sch.isDone()) {
    state.running = false;
    $('startBtn').disabled = false;
    $('stopBtn').disabled = true;
  }
}

// ===== Eventos =====
$('addBtn').addEventListener('click', () => {
  const name = $('name').value.trim() || undefined;
  const burst = Number(($('burst').value || '').trim());
  const arrival = Number(($('arrival').value || '').trim());

  if (!Number.isFinite(burst) || burst <= 0) return alert('Tiempo en CPU (burst) debe ser un entero > 0');
  if (!Number.isFinite(arrival) || arrival < 0) return alert('Instante de llegada debe ser un entero >= 0');

  const p = createProcess({ name, arrival, burst });
  state.processesDraft.push(p);
  renderDraftTable();
  $('name').value = '';
  $('burst').value = '';
  $('arrival').value = '';
});

$('draftTbody').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-pid]');
  if (!btn) return;
  const pid = Number(btn.getAttribute('data-pid'));
  state.processesDraft = state.processesDraft.filter(p => p.pid !== pid);
  renderDraftTable();
});

$('startBtn').addEventListener('click', () => {
  if (!state.processesDraft.length) return alert('Agrega al menos un proceso');
  const alg = $('algorithm').value;
  const quantum = Number(($('quantum').value || '').trim() || '1');
  if (alg === Algorithm.RR && (!Number.isFinite(quantum) || quantum <= 0)) return alert('Quantum inválido');

  state.scheduler = new Scheduler({ algorithm: alg, quantum });
  state.scheduler.loadProcesses(state.processesDraft);
  state.running = true;
  $('startBtn').disabled = true;
  $('stopBtn').disabled = false;
  renderRuntime(state.scheduler.snapshot());
});

$('stopBtn').addEventListener('click', () => {
  state.running = false;
  $('startBtn').disabled = false;
  $('stopBtn').disabled = true;
});

// Inicializar
renderDraftTable();
