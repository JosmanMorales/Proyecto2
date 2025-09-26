// @ts-nocheck

export const Algorithm = Object.freeze({
  FCFS: 'FCFS',
  SJF: 'SJF',
  SRTF: 'SRTF',
  RR: 'RR'
});

let _nextPid = 1;
export function newPID() { return _nextPid++; }

export function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

export function createProcess({ name, arrival, burst }) {
  return {
    pid: newPID(),
    name: name || `P${_nextPid - 1}`,
    arrival: Number(arrival),
    burst: Number(burst),
    remaining: Number(burst),
    startTime: null,
    finishTime: null,
    firstResponseAt: null,
    lastDispatchAt: null
  };
}

// Métricas por proceso
export function metricsOf(p) {
  const turnaround = (p.finishTime ?? 0) - p.arrival;  // CT - AT
  const waiting = turnaround - p.burst;                // TT - BT
  const response = (p.firstResponseAt ?? p.finishTime) - p.arrival; // RT
  return { turnaround, waiting, response };
}

// Selección de proceso según algoritmo
function pickNext(algorithm, ready, time, current, quantumCfg) {
  if (!ready.length) return null;

  switch (algorithm) {
    case Algorithm.FCFS:
      // No expropiativo: por llegada
      return ready[0];

    case Algorithm.SJF:
      // No expropiativo: menor ráfaga total
      return ready.reduce((best, p) => {
        if (!best) return p;
        if (p.burst < best.burst) return p;
        if (p.burst === best.burst && p.arrival < best.arrival) return p;
        return best;
      }, null);

    case Algorithm.SRTF:
      // Expropiativo: menor tiempo restante
      return ready.reduce((best, p) => {
        if (!best) return p;
        if (p.remaining < best.remaining) return p;
        if (p.remaining === best.remaining && p.arrival < best.arrival) return p;
        return best;
      }, null);

    case Algorithm.RR:
      // Round Robin: cola circular (tomar el primero)
      return ready[0];

    default:
      return ready[0];
  }
}

export class Scheduler {
  constructor({ algorithm = Algorithm.FCFS, quantum = 1 } = {}) {
    this.algorithm = algorithm;
    this.quantum = Math.max(1, Number(quantum) || 1);
    this.time = 0;
    this.all = [];
    this.incoming = [];
    this.ready = [];
    this.running = null;
    this.quantumLeft = Infinity;
    this.history = []; // { time, pid, event }
  }

  loadProcesses(list) {
    // Normaliza y ordena por llegada (NO clonar; usaremos las mismas instancias)
    const normalized = list.map(p => ({
      pid: typeof p.pid === 'number' ? p.pid : newPID(),
      name: p.name || `P${_nextPid - 1}`,
      arrival: Number(p.arrival),
      burst: Number(p.burst),
      remaining: Number(p.burst),
      startTime: null,
      finishTime: null,
      firstResponseAt: null,
      lastDispatchAt: null
    })).sort((a,b) => a.arrival - b.arrival || a.pid - b.pid);

    // Compartimos referencias para que remaining/finishTime se reflejen en todos
    this.all = normalized;
    this.incoming = normalized.slice(); // copia superficial (mismas referencias)
    this.ready = [];
    this.running = null;
    this.time = 0;
    this.history = [];
    this.quantumLeft = Infinity;
  }

  _admitArrivals() {
    while (this.incoming.length && this.incoming[0].arrival <= this.time) {
      const p = this.incoming.shift();
      this.ready.push(p);
    }
  }

  _dispatchIfNeeded() {
    if (this.running) return;
    const next = pickNext(this.algorithm, this.ready, this.time, null, this.quantum);
    if (next) this._dispatch(next);
  }

  _dispatch(p) {
    const idx = this.ready.findIndex(x => x.pid === p.pid);
    if (idx !== -1) this.ready.splice(idx, 1);

    this.running = p;
    this.quantumLeft = this.algorithm === Algorithm.RR ? this.quantum : Infinity;
    if (p.startTime === null) p.startTime = this.time;
    if (p.firstResponseAt === null) p.firstResponseAt = this.time;
    p.lastDispatchAt = this.time;
    this.history.push({ time: this.time, pid: p.pid, event: 'DISPATCH' });
  }

  _maybePreempt() {
    if (!this.running) return;
    if (this.algorithm === Algorithm.SRTF) {
      const best = pickNext(this.algorithm, this.ready.concat(this.running), this.time, this.running);
      if (best && best.pid !== this.running.pid) {
        this.ready.push(this.running);
        this.history.push({ time: this.time, pid: this.running.pid, event: 'PREEMPT' });
        this._dispatch(best);
      }
    }
  }

  _tickCPU() {
    if (!this.running) {
      this.history.push({ time: this.time, pid: null, event: 'IDLE' });
      return;
    }

    this.running.remaining -= 1;
    this.quantumLeft -= 1;
    this.history.push({ time: this.time, pid: this.running.pid, event: 'TICK' });

    if (this.running.remaining <= 0) {
      this.running.finishTime = this.time + 1; // termina al final del tick
      this.history.push({ time: this.time + 1, pid: this.running.pid, event: 'FINISH' });
      this.running = null;
      this.quantumLeft = 0;
      return;
    }

    if (this.algorithm === Algorithm.RR && this.quantumLeft <= 0) {
      const p = this.running;
      this.running = null;
      this.ready.push(p); // vuelve al final de la cola
      this.history.push({ time: this.time + 1, pid: p.pid, event: 'PREEMPT' });
    }
  }

  step() {
    this._admitArrivals();
    this._dispatchIfNeeded();
    this._maybePreempt();
    this._tickCPU();
    this.time += 1;
    this._admitArrivals();
  }

  isDone() {
    // Fin cuando todos los procesos tienen remaining <= 0
    if (this.all.length === 0) return true;
    return this.all.every(p => p.remaining <= 0);
  }

  snapshot() {
    return {
      time: this.time,
      algorithm: this.algorithm,
      quantum: this.quantum,
      ready: this.ready.map(clone),
      running: this.running ? clone(this.running) : null,
      incoming: this.incoming.map(clone),
      finished: this.all.filter(p => p.finishTime !== null).map(clone),
      all: this.all.map(clone),
      history: this.history.slice()
    };
  }
}
