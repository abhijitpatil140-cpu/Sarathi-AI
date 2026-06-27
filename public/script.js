// ==========================================
// 1. AUDIO SYNTHESIZER (Web Audio API)
// ==========================================
class AudioSynth {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.alarmInterval = null;
  }
  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  toggle() {
    this.enabled = !this.enabled;
    if (this.enabled) {
      this.init();
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    } else {
      this.stopAlarmLoop();
    }
    return this.enabled;
  }
  playTone(freq, type, duration, volume = 0.08) {
    if (!this.enabled || !this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      
      gain.gain.setValueAtTime(volume, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {
      console.warn('Audio Context write fail', e);
    }
  }
  playTick() {
    this.playTone(1600, 'sine', 0.02, 0.03);
  }
  playError() {
    this.playTone(400, 'triangle', 0.15, 0.06);
    setTimeout(() => this.playTone(280, 'triangle', 0.25, 0.06), 100);
  }
  playSuccess() {
    const scale = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    scale.forEach((freq, idx) => {
      setTimeout(() => this.playTone(freq, 'triangle', 0.2, 0.04), idx * 80);
    });
  }
  playReport() {
    this.playTone(587.33, 'triangle', 0.08, 0.04);
    setTimeout(() => this.playTone(880, 'triangle', 0.15, 0.04), 80);
  }
  startAlarmLoop() {
    if (this.alarmInterval) return;
    this.alarmInterval = setInterval(() => {
      if (!this.enabled || !this.ctx) return;
      this.playTone(330, 'sawtooth', 0.25, 0.03);
      setTimeout(() => this.playTone(300, 'sawtooth', 0.25, 0.03), 300);
    }, 1200);
  }
  stopAlarmLoop() {
    if (this.alarmInterval) {
      clearInterval(this.alarmInterval);
      this.alarmInterval = null;
    }
  }
}

const audio = new AudioSynth();

// ==========================================
// 2. DYNAMIC EVENT BUS
// ==========================================
class AgentEventBus {
  constructor() {
    this.listeners = {};
  }
  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }
  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => cb(data));
    }
  }
}

const eventBus = new AgentEventBus();

// ==========================================
// 3. SATELLITE CORE STATE & INITIAL DATA
// ==========================================
let Satellites = {};
let selectedSatelliteId = 'insat3dr';
let selectedParameterKey = 'payloadTemp';
let isBackendSynced = false;

// Fallback configuration for offline/client-only run
const FALLBACK_CONFIGS = {
  insat3dr: {
    id: 'insat3dr', name: 'INSAT-3DR', type: 'GEO Meteorological', orbit: 'Geostationary (35,786 km)', color: '#ff9933',
    parameters: {
      payloadTemp: { name: 'Payload Temp', val: 32.5, min: 15, max: 68, unit: '°C' },
      voltage: { name: 'Battery Voltage', val: 32.2, min: 28, max: 34, unit: 'V' },
      signal: { name: 'Transponder Signal', val: -68.0, min: -85, max: -55, unit: 'dBm' }
    },
    anomalies: {
      low_signal: { param: 'signal', targetVal: -98.0, classification: 'Possible antenna misalignment', severity: 'CRITICAL' },
      high_temp: { param: 'payloadTemp', targetVal: 82.5, classification: 'Thermal regulation issue', severity: 'WARN' }
    }
  },
  cartosat3: {
    id: 'cartosat3', name: 'Cartosat-3', type: 'Polar Earth Obs', orbit: 'Sun-synchronous Polar (509 km)', color: '#00f2fe',
    parameters: {
      gyro: { name: 'Gyro Spin Rate', val: 0.015, min: -0.05, max: 0.05, unit: 'rad/s' },
      battery: { name: 'Battery Charge', val: 88.0, min: 65, max: 100, unit: '%' }
    },
    anomalies: {
      low_battery: { param: 'battery', targetVal: 48.0, classification: 'Solar panel underperformance', severity: 'CRITICAL' }
    }
  },
  risat2br1: {
    id: 'risat2br1', name: 'RISAT-2BR1', type: 'LEO Radar Imaging', orbit: 'Low Earth Orbit (576 km)', color: '#00f5a0',
    parameters: {
      radarTemp: { name: 'Radar Antenna Temp', val: 14.5, min: -10, max: 40, unit: '°C' },
      downlink: { name: 'Downlink Rate', val: 124.0, min: 45, max: 200, unit: 'Mbps' }
    },
    anomalies: {
      low_downlink: { param: 'downlink', targetVal: 22.0, classification: 'Atmospheric interference', severity: 'WARN' }
    }
  },
  chandrayaan3: {
    id: 'chandrayaan3', name: 'Chandrayaan-3', type: 'Lunar Lander', orbit: 'Lunar Orbit / Surface', color: '#c084fc',
    parameters: {
      landerTemp: { name: 'Lander Temp', val: -12.0, min: -180, max: 120, unit: '°C' },
      signal: { name: 'Deep Space Signal', val: -84.5, min: -110, max: -65, unit: 'dBm' }
    },
    anomalies: {
      low_signal: { param: 'signal', targetVal: -118.0, classification: 'Possible antenna misalignment', severity: 'CRITICAL' }
    }
  },
  adityal1: {
    id: 'adityal1', name: 'Aditya-L1', type: 'Solar Observatory', orbit: 'Sun-Earth L1 Halo Orbit', color: '#ffdd59',
    parameters: {
      velcTemp: { name: 'Coronagraph Temp', val: -4.5, min: -20, max: 10, unit: '°C' },
      thrusterPres: { name: 'Thruster Pressure', val: 248.0, min: 190, max: 310, unit: 'psi' }
    },
    anomalies: {
      high_temp: { param: 'velcTemp', targetVal: 22.5, classification: 'Thermal regulation issue', severity: 'WARN' }
    }
  }
};

// Initialize fallback state structure
function initFallbackState() {
  Satellites = {};
  for (const [id, cfg] of Object.entries(FALLBACK_CONFIGS)) {
    Satellites[id] = {
      id: cfg.id, name: cfg.name, type: cfg.type, orbit: cfg.orbit, color: cfg.color, status: 'healthy',
      parameters: {}, activeAnomaly: null, resolving: false, restoreTargets: {}
    };
    for (const [pk, p] of Object.entries(cfg.parameters)) {
      Satellites[id].parameters[pk] = {
        name: p.name, val: p.val, min: p.min, max: p.max, unit: p.unit, history: Array(30).fill(p.val)
      };
    }
  }
}

// Local simulation updates (used if server is offline)
function runLocalSimulationTick() {
  if (isBackendSynced) return; // Skip if server handles it
  
  for (const sat of Object.values(Satellites)) {
    for (const [key, p] of Object.entries(sat.parameters)) {
      if (sat.activeAnomaly && sat.activeAnomaly.param === key) {
        p.val += (sat.activeAnomaly.targetVal - p.val) * 0.2;
      } else if (sat.resolving && sat.restoreTargets[key] !== undefined) {
        p.val += (sat.restoreTargets[key] - p.val) * 0.15;
        if (Math.abs(p.val - sat.restoreTargets[key]) < 0.05) {
          p.val = sat.restoreTargets[key];
          delete sat.restoreTargets[key];
          if (Object.keys(sat.restoreTargets).length === 0) {
            sat.resolving = false;
            sat.status = 'healthy';
          }
        }
      } else {
        const range = p.max - p.min;
        p.val += (Math.random() - 0.5) * (range * 0.015);
        if (p.val < p.min - range * 0.1) p.val = p.min;
        if (p.val > p.max + range * 0.1) p.val = p.max;
      }
      p.history.push(p.val);
      if (p.history.length > 30) p.history.shift();
    }
  }
  updateTelemetryDOM();
}

// ==========================================
// 4. WEBSOCKET SYNC CONNECTION
// ==========================================
function connectWebSocket() {
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${wsProtocol}//${window.location.host}/ws`;
  const socket = new WebSocket(wsUrl);

  socket.onopen = () => {
    isBackendSynced = true;
    addLog('SYSTEM', 'WebSocket linked safely. Dashboard synced with backend telemetry database.');
  };

  socket.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'STATE') {
        // Keep history references intact when updating values from backend
        for (const [id, satData] of Object.entries(msg.data)) {
          if (!Satellites[id]) continue;
          Satellites[id].status = satData.status;
          Satellites[id].activeAnomaly = satData.activeAnomaly;
          Satellites[id].resolving = satData.resolving;
          Satellites[id].restoreTargets = satData.restoreTargets;

          for (const [pk, pData] of Object.entries(satData.parameters)) {
            if (!Satellites[id].parameters[pk]) continue;
            Satellites[id].parameters[pk].val = pData.val;
            Satellites[id].parameters[pk].history = pData.history;
          }
        }
        updateTelemetryDOM();
      }
    } catch (e) {
      console.error("WS parse error", e);
    }
  };

  socket.onclose = () => {
    isBackendSynced = false;
    setTimeout(connectWebSocket, 5000); // Retry sync
  };
}

// ==========================================
// 5. GLOBAL TERMINAL LOGGER
// ==========================================
const LOGS = [];
const MAX_LOGS = 100;
let logFilter = 'ALL';

function addLog(source, msg) {
  const now = new Date();
  const timeStr = now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0');
  const log = { id: Date.now() + Math.random(), time: timeStr, source, msg };
  
  LOGS.push(log);
  if (LOGS.length > MAX_LOGS) LOGS.shift();
  
  renderLogs();
  if (audio.enabled && source !== 'SYSTEM') {
    audio.playTick();
  }
}

function renderLogs() {
  const screen = document.getElementById('terminal-screen-logs');
  if (!screen) return;
  screen.innerHTML = '';
  
  const filtered = LOGS.filter(l => logFilter === 'ALL' || l.source === logFilter);
  
  filtered.forEach(log => {
    const line = document.createElement('div');
    line.className = 'log-line';
    line.innerHTML = `
      <span class="log-time">[${log.time}]</span>
      <span class="log-tag tag-${log.source}">${log.source}</span>
      <span class="log-msg">${log.msg}</span>
    `;
    screen.appendChild(line);
  });
  screen.scrollTop = screen.scrollHeight;
}

function filterLogs(filter) {
  logFilter = filter;
  document.querySelectorAll('.terminal-filter').forEach(btn => {
    if (btn.textContent.toUpperCase() === filter || (filter === 'TELEMETRY' && btn.textContent.toUpperCase() === 'WATCHER') || (filter === 'ANOMALY' && btn.textContent.toUpperCase() === 'CLASSIFIER') || (filter === 'REPORT' && btn.textContent.toUpperCase() === 'REPORTER')) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  renderLogs();
}

function clearLogs() {
  LOGS.length = 0;
  renderLogs();
}

// ==========================================
// 6. MULTI-AGENT CORE SYSTEM
// ==========================================

// AGENT 1 - TelemetryWatcher
class TelemetryWatcherAgent {
  async scan() {
    updateAgentUI('watcher', 'running', 'SCANNING SENSORS...');
    addLog('TELEMETRY', 'Starting telemetry telemetry frame scan across 5 active satellites...');
    
    let anomaliesFound = 0;

    for (const sat of Object.values(Satellites)) {
      // Draw scan connection visual lines
      drawFlowLine('agent-card-watcher', `sat-card-${sat.id}`, 'var(--neon-cyan)', true);

      for (const [key, p] of Object.entries(sat.parameters)) {
        const val = p.val;
        if (val < p.min || val > p.max) {
          anomaliesFound++;
          
          addLog('TELEMETRY', `ALERT! Out-of-range sensor feedback on ${sat.name}: ${p.name} = ${val.toFixed(2)} ${p.unit} (Nominal: ${p.min}-${p.max})`);
          
          // Emit anomaly detected event
          eventBus.emit('ANOMALY_DETECTED', {
            satelliteId: sat.id,
            parameterKey: key,
            value: val,
            min: p.min,
            max: p.max
          });
        }
      }
    }

    if (anomaliesFound === 0) {
      addLog('TELEMETRY', 'Nominal check complete: All 5 satellite arrays reporting nominal telemetry.');
    } else {
      addLog('TELEMETRY', `Scan complete: ${anomaliesFound} anomalies flagged to core diagnostics.`);
    }

    document.getElementById('watcher-count').textContent = `Last Checked: ${anomaliesFound} alerts`;
    
    await new Promise(r => setTimeout(r, 600)); // wait scan visual
    updateAgentUI('watcher', 'idle', 'STANDBY');
  }
}
const telemetryWatcher = new TelemetryWatcherAgent();

// AGENT 2 - AnomalyClassifier (Decision Tree)
class AnomalyClassifierAgent {
  constructor() {
    this.resolvedCount = 0;
    eventBus.on('ANOMALY_DETECTED', (data) => this.handleAnomaly(data));
  }

  async handleAnomaly(data) {
    const { satelliteId, parameterKey, value } = data;
    const sat = Satellites[satelliteId];
    if (!sat) return;

    // Classification decision tree
    let classification = "Unknown sensor anomaly";
    if (parameterKey === 'signal') {
      classification = "Possible antenna misalignment";
    } else if (parameterKey === 'payloadTemp' || parameterKey === 'velcTemp' || parameterKey === 'radarTemp' || parameterKey === 'landerTemp') {
      classification = "Thermal regulation issue";
    } else if (parameterKey === 'battery' || parameterKey === 'voltage') {
      classification = "Solar panel underperformance";
    } else if (parameterKey === 'downlink') {
      classification = "Atmospheric interference";
    }

    // Determine severity
    const limitCfg = sat.parameters[parameterKey];
    const deviation = Math.abs(value - (value > limitCfg.max ? limitCfg.max : limitCfg.min));
    const percentDeviation = deviation / (limitCfg.max - limitCfg.min);
    const severity = percentDeviation > 0.3 ? 'CRITICAL' : 'WARN';

    // If already processing or already marked, skip logging again
    if (sat.status === 'critical' && sat.activeAnomaly && sat.activeAnomaly.param === parameterKey) {
      return;
    }

    updateAgentUI('classifier', 'working', `DIAGNOSING ${sat.name}...`);
    addLog('ANOMALY', `ANOMALY_DETECTED payload received. Source: ${sat.name}. Running decision tree classification...`);
    audio.playError();
    audio.startAlarmLoop();

    // Trigger local simulation alert if offline
    if (!isBackendSynced) {
      sat.status = severity.toLowerCase();
      sat.activeAnomaly = {
        id: 'simulated_fault',
        param: parameterKey,
        targetVal: value,
        classification,
        severity
      };
      sat.restoreTargets[parameterKey] = limitCfg.history[0] || limitCfg.min;
      updateTelemetryDOM();
    }

    await new Promise(r => setTimeout(r, 1000)); // Diagnosis time

    addLog('ANOMALY', `Anomaly Classified: Severity: ${severity} | Classification: ${classification}`);
    addLog('ANOMALY', `Initiating autonomous mitigation protocol for ${sat.name}...`);

    // Call API to mitigate (or handle locally if fallback)
    drawFlowLine('agent-card-classifier', `sat-card-${satelliteId}`, 'var(--neon-purple)', true);

    await new Promise(r => setTimeout(r, 1500)); // command dispatch delay

    if (isBackendSynced) {
      // Dispatched to server
      fetch('/api/mitigate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ satelliteId })
      });
    } else {
      // Handle local simulation restore
      sat.activeAnomaly = null;
      sat.resolving = true;
      updateTelemetryDOM();
    }

    this.resolvedCount++;
    document.getElementById('classifier-resolved').textContent = `Resolved: ${this.resolvedCount}`;
    
    addLog('ANOMALY', `Mitigation script dispatched to ${sat.name}. Stabilization command acknowledged.`);
    audio.stopAlarmLoop();
    audio.playSuccess();

    await new Promise(r => setTimeout(r, 500));
    updateAgentUI('classifier', 'idle', 'LISTENING FOR EVENT');
  }
}
const anomalyClassifier = new AnomalyClassifierAgent();

// AGENT 3 - MissionReportWriter
class MissionReportWriterAgent {
  async compileReport() {
    updateAgentUI('reporter', 'running', 'COMPILING STATUS...');
    addLog('REPORT', 'Mission status snapshots captured. Compiling Logbook Card...');
    audio.playReport();

    await new Promise(r => setTimeout(r, 800)); // compile time

    // Calculate dynamic fleet health score
    let totalScore = 100;
    let anomalyCount = 0;
    let recommendations = [];

    let satHtmlList = '';
    for (const sat of Object.values(Satellites)) {
      let statusClass = 'healthy';
      if (sat.status === 'critical') {
        statusClass = 'critical';
        anomalyCount++;
        totalScore -= 20;
      } else if (sat.status === 'warning') {
        statusClass = 'warning';
        anomalyCount++;
        totalScore -= 10;
      }

      satHtmlList += `
        <div class="report-sect-md">
          <span>${sat.name}</span>
          <span class="report-badge ${statusClass}">${sat.status}</span>
        </div>
      `;

      for (const [key, p] of Object.entries(sat.parameters)) {
        const isAnomaly = p.val < p.min || p.val > p.max;
        satHtmlList += `
          <div class="report-row-md">
            <span>&nbsp;&nbsp; - ${p.name}:</span>
            <span class="${isAnomaly ? 'val-fail' : 'val-ok'}">${p.val.toFixed(2)} ${p.unit}</span>
          </div>
        `;
      }

      // Add actionable recommendation if satellite has active anomaly
      if (sat.activeAnomaly) {
        recommendations.push(`Resolve ${sat.activeAnomaly.classification} on ${sat.name} (Restoring ${sat.activeAnomaly.param})`);
      }
    }

    // If all nominal, push standard maintenance advise
    if (recommendations.length === 0) {
      recommendations.push("Maintain standard telemetry downlink scans.");
      recommendations.push("Orbit paths aligned. Solar angle efficiency nominal.");
    }

    const timestampIST = new Date(Date.now() + (5.5 * 60 * 60 * 1000)).toISOString().replace('T', ' ').substring(0, 19) + ' IST';
    const healthScoreClass = totalScore >= 90 ? 'healthy' : (totalScore >= 70 ? 'warning' : 'critical');

    const reportHtml = `
      <div class="report-header-section">
        <div class="report-title-md">SĀRATHI AI FLUTTER REPORT</div>
        <div class="fleet-health-score ${healthScoreClass}">Score: ${totalScore}</div>
      </div>
      <div class="report-row-md"><span>Report Timestamp:</span> <span>${timestampIST}</span></div>
      <div class="report-row-md"><span>Active Faults:</span> <span class="${anomalyCount > 0 ? 'val-fail' : 'val-ok'}">${anomalyCount} flagged</span></div>
      <div style="margin-top: 8px;"></div>
      ${satHtmlList}
      <div class="report-actions-container">
        <div class="report-actions-title">Recommended Advisory Checklist</div>
        <ul class="report-actions-list">
          ${recommendations.map(act => `<li>${act}</li>`).join('')}
        </ul>
      </div>
    `;

    document.getElementById('markdown-report-container').innerHTML = reportHtml;
    addLog('REPORT', 'Logbook record card created successfully.');
    updateAgentUI('reporter', 'idle', 'STANDBY');
  }
}
const missionReportWriter = new MissionReportWriterAgent();

// AGENT 4 - OrchestratorAgent (Master coordinator)
class OrchestratorAgent {
  constructor() {
    this.cycleCount = 0;
    this.watcherTimer = 5;
    this.reporterTimer = 60;
    this.memoryBank = [];
  }

  tick() {
    this.cycleCount++;
    this.watcherTimer--;
    this.reporterTimer--;

    document.getElementById('orchestrator-timer').textContent = `Cycle: ${this.cycleCount}s`;
    document.getElementById('watcher-count').textContent = `Scan in: ${this.watcherTimer}s`;
    document.getElementById('reporter-timer').textContent = `Report in: ${this.reporterTimer}s`;

    // Schedule TelemetryWatcher
    if (this.watcherTimer <= 0) {
      this.watcherTimer = 5;
      this.runWatcher();
    }

    // Schedule ReportWriter
    if (this.reporterTimer <= 0) {
      this.reporterTimer = 60;
      this.runReporter();
    }
  }

  async runWatcher() {
    updateAgentUI('orchestrator', 'running', 'SCHEDULING WATCHER...');
    document.getElementById('orchestrator-action').innerHTML = `Orchestrating <span style="color: var(--neon-cyan);">→ TelemetryWatcher</span><span class="agent-spinner"></span>`;
    
    drawFlowLine('agent-card-orchestrator', 'agent-card-watcher', 'var(--isro-orange)', false);
    
    this.recordDecision("Scheduled Telemetry Scan");
    await telemetryWatcher.scan();
    
    updateAgentUI('orchestrator', 'idle', 'STANDBY');
    document.getElementById('orchestrator-action').textContent = 'STANDBY';
  }

  async runReporter() {
    updateAgentUI('orchestrator', 'running', 'SCHEDULING REPORTER...');
    document.getElementById('orchestrator-action').innerHTML = `Orchestrating <span style="color: var(--neon-green);">→ MissionReportWriter</span><span class="agent-spinner"></span>`;
    
    drawFlowLine('agent-card-orchestrator', 'agent-card-reporter', 'var(--isro-orange)', false);
    
    this.recordDecision("Scheduled Report Compiler");
    await missionReportWriter.compileReport();
    
    updateAgentUI('orchestrator', 'idle', 'STANDBY');
    document.getElementById('orchestrator-action').textContent = 'STANDBY';
  }

  recordDecision(decision) {
    const time = new Date().toLocaleTimeString();
    this.memoryBank.unshift({ time, decision });
    if (this.memoryBank.length > 5) {
      this.memoryBank.pop();
    }
    this.renderMemoryBank();
  }

  renderMemoryBank() {
    const container = document.getElementById('orchestrator-memory-bank');
    if (!container) return;
    container.innerHTML = '';
    this.memoryBank.forEach(item => {
      const el = document.createElement('div');
      el.className = 'memory-bank-item';
      el.innerHTML = `
        <span>[${item.time}] ${item.decision}</span>
        <span style="color: var(--text-muted);">OK</span>
      `;
      container.appendChild(el);
    });
  }
}
const orchestrator = new OrchestratorAgent();

// ==========================================
// 7. UI INTERACTIONS & RENDERING
// ==========================================
function updateAgentUI(agentKey, state, actionText) {
  const card = document.getElementById(`agent-card-${agentKey}`);
  if (!card) return;

  if (state === 'running') {
    card.className = 'agent-card running';
  } else if (state === 'working') {
    card.className = 'agent-card working';
  } else {
    card.className = 'agent-card';
  }

  const actionEl = card.querySelector('.agent-action');
  if (actionEl) actionEl.innerHTML = actionText;
}

function updateTelemetryDOM() {
  let isSystemNominal = true;

  for (const sat of Object.values(Satellites)) {
    const card = document.getElementById(`sat-card-${sat.id}`);
    if (!card) continue;

    // Toggle Selection class
    if (sat.id === selectedSatelliteId) {
      card.classList.add('selected');
    } else {
      card.classList.remove('selected');
    }

    // Toggle status styling
    const statusBadge = card.querySelector('.sat-status-badge');
    statusBadge.textContent = sat.status.toUpperCase();
    statusBadge.className = `sat-status-badge status-${sat.status}`;
    
    if (sat.status === 'critical' || sat.status === 'warning') {
      card.classList.add('has-anomaly');
      isSystemNominal = false;
    } else {
      card.classList.remove('has-anomaly');
    }

    // Update individual values inside telemetry cards
    for (const [key, p] of Object.entries(sat.parameters)) {
      const row = card.querySelector(`.param-row-${key}`);
      if (!row) continue;

      row.querySelector('.param-value').textContent = `${p.val.toFixed(1)} ${p.unit}`;
      
      let percent = ((p.val - p.min) / (p.max - p.min)) * 100;
      percent = Math.max(5, Math.min(95, percent));

      const fill = row.nextElementSibling.querySelector('.param-bar-fill');
      fill.style.width = `${percent}%`;

      if (p.val < p.min || p.val > p.max) {
        fill.classList.add('fill-error');
        row.classList.add('param-anomaly');
      } else {
        fill.classList.remove('fill-error');
        row.classList.remove('param-anomaly');
      }
    }
  }

  // Update Header Overall Health Dot
  const globalDot = document.getElementById('system-health-dot');
  const globalText = document.getElementById('system-health-text');
  if (isSystemNominal) {
    globalDot.className = 'status-dot';
    globalText.textContent = 'NOMINAL';
    globalText.style.color = 'var(--neon-green)';
  } else {
    globalDot.className = 'status-dot anomaly';
    globalText.textContent = 'FAULT DETECTED';
    globalText.style.color = 'var(--neon-red)';
  }
}

// CANVAS ORBITAL FLIGHT SIMULATION
const spaceCanvas = document.getElementById('space-canvas');
const spaceCtx = spaceCanvas.getContext('2d');
let orbitAngle = 0;

function resizeSpaceCanvas() {
  if (!spaceCanvas) return;
  const parent = spaceCanvas.parentElement;
  spaceCanvas.width = parent.clientWidth;
  spaceCanvas.height = parent.clientHeight;
}

function drawSpaceScene() {
  if (!spaceCanvas || !spaceCanvas.width) return;
  
  spaceCtx.clearRect(0, 0, spaceCanvas.width, spaceCanvas.height);
  const cx = spaceCanvas.width / 2;
  const cy = spaceCanvas.height / 2;

  orbitAngle += 0.005;

  // Star charts lines
  spaceCtx.strokeStyle = 'rgba(255,255,255,0.03)';
  spaceCtx.beginPath();
  spaceCtx.moveTo(0, cy); spaceCtx.lineTo(spaceCanvas.width, cy);
  spaceCtx.moveTo(cx, 0); spaceCtx.lineTo(cx, spaceCanvas.height);
  spaceCtx.stroke();

  // Draw Earth Core
  const earthRadius = 32;
  const earthGlow = spaceCtx.createRadialGradient(cx, cy, 2, cx, cy, earthRadius + 15);
  earthGlow.addColorStop(0, '#0052d4');
  earthGlow.addColorStop(0.5, '#4364f7');
  earthGlow.addColorStop(0.9, '#6fb1fc');
  earthGlow.addColorStop(1, 'transparent');
  
  spaceCtx.fillStyle = earthGlow;
  spaceCtx.beginPath();
  spaceCtx.arc(cx, cy, earthRadius + 15, 0, Math.PI * 2);
  spaceCtx.fill();

  spaceCtx.fillStyle = '#0f172a';
  spaceCtx.strokeStyle = 'rgba(0, 242, 254, 0.4)';
  spaceCtx.lineWidth = 1.5;
  spaceCtx.beginPath();
  spaceCtx.arc(cx, cy, earthRadius, 0, Math.PI * 2);
  spaceCtx.fill();
  spaceCtx.stroke();
  
  // Orbit configurations
  const orbits = {
    risat2br1: { r: 52, speed: 1.8, color: 'var(--neon-green)' },
    cartosat3: { rx: 78, ry: 40, speed: 1.2, color: 'var(--neon-cyan)', polar: true },
    insat3dr: { r: 104, speed: 0.6, color: 'var(--isro-orange)' },
    chandrayaan3: { r: 140, speed: 0.3, color: 'var(--neon-purple)', lunar: true },
    adityal1: { rx: 25, ry: 12, speed: 0.5, color: '#ffdd59', halo: true }
  };

  // Draw Orbit lines
  drawOrbitEllipse(spaceCtx, cx, cy, orbits.risat2br1.r, orbits.risat2br1.r, false);
  drawOrbitEllipse(spaceCtx, cx, cy, orbits.cartosat3.rx, orbits.cartosat3.ry, true);
  drawOrbitEllipse(spaceCtx, cx, cy, orbits.insat3dr.r, orbits.insat3dr.r, false);
  drawOrbitEllipse(spaceCtx, cx, cy, orbits.chandrayaan3.r, orbits.chandrayaan3.r, false);

  // L1 Sun line
  spaceCtx.strokeStyle = 'rgba(255, 221, 89, 0.08)';
  spaceCtx.lineWidth = 1;
  spaceCtx.setLineDash([4, 6]);
  spaceCtx.beginPath();
  spaceCtx.moveTo(cx, cy);
  spaceCtx.lineTo(spaceCanvas.width - 20, cy);
  spaceCtx.stroke();
  spaceCtx.setLineDash([]);

  // L1 marker
  const l1x = cx + 185;
  const l1y = cy;
  spaceCtx.strokeStyle = 'rgba(255, 221, 89, 0.3)';
  spaceCtx.lineWidth = 1;
  spaceCtx.beginPath();
  spaceCtx.moveTo(l1x - 5, l1y); spaceCtx.lineTo(l1x + 5, l1y);
  spaceCtx.moveTo(l1x, l1y - 5); spaceCtx.lineTo(l1x, l1y + 5);
  spaceCtx.stroke();
  
  // Halo orbit
  drawOrbitEllipse(spaceCtx, l1x, l1y, orbits.adityal1.rx, orbits.adityal1.ry, false);

  for (const [id, sat] of Object.entries(Satellites)) {
    const o = orbits[id];
    if (!o) continue;
    let sx = cx, sy = cy;

    if (o.polar) {
      const angle = orbitAngle * o.speed;
      sx = cx + o.rx * Math.cos(angle);
      sy = cy + o.ry * Math.sin(angle);
      const rot = -Math.PI / 4;
      const rx = (sx - cx) * Math.cos(rot) - (sy - cy) * Math.sin(rot) + cx;
      const ry = (sx - cx) * Math.sin(rot) + (sy - cy) * Math.cos(rot) + cy;
      sx = rx; sy = ry;
    } else if (o.lunar) {
      const moonAngle = orbitAngle * o.speed;
      const mx = cx + o.r * Math.cos(moonAngle);
      const my = cy + o.r * Math.sin(moonAngle);
      
      // Draw Moon
      spaceCtx.fillStyle = '#475569';
      spaceCtx.beginPath();
      spaceCtx.arc(mx, my, 8, 0, Math.PI * 2);
      spaceCtx.fill();
      
      // Chandrayaan-3 orbit line around Moon
      spaceCtx.strokeStyle = 'rgba(192, 132, 252, 0.2)';
      spaceCtx.lineWidth = 0.8;
      spaceCtx.setLineDash([2, 3]);
      spaceCtx.beginPath();
      spaceCtx.arc(mx, my, 14, 0, Math.PI * 2);
      spaceCtx.stroke();
      spaceCtx.setLineDash([]);

      const cyAngle = orbitAngle * 2.5;
      sx = mx + 14 * Math.cos(cyAngle);
      sy = my + 14 * Math.sin(cyAngle);
    } else if (o.halo) {
      const angle = orbitAngle * o.speed;
      sx = l1x + o.rx * Math.cos(angle);
      sy = l1y + o.ry * Math.sin(angle);
    } else {
      const angle = orbitAngle * o.speed;
      sx = cx + o.r * Math.cos(angle);
      sy = cy + o.r * Math.sin(angle);
    }

    const size = (sat.id === selectedSatelliteId) ? 7 : 5;
    const color = (sat.status === 'critical') ? 'var(--neon-red)' : sat.color;
    
    // Draw Sat marker
    spaceCtx.shadowColor = color;
    spaceCtx.shadowBlur = (sat.status === 'critical') ? 12 : 6;
    spaceCtx.fillStyle = color;
    spaceCtx.beginPath();
    spaceCtx.arc(sx, sy, size, 0, Math.PI * 2);
    spaceCtx.fill();
    
    spaceCtx.shadowColor = 'transparent';
    spaceCtx.shadowBlur = 0;

    spaceCtx.fillStyle = 'rgba(255,255,255,0.7)';
    spaceCtx.font = '9px var(--font-mono)';
    spaceCtx.fillText(sat.name, sx + 8, sy + 3);

    sat.screenX = sx;
    sat.screenY = sy;
  }

  requestAnimationFrame(drawSpaceScene);
}

function drawOrbitEllipse(ctx, cx, cy, rx, ry, rotate) {
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 5]);
  ctx.beginPath();
  if (rotate) {
    ctx.ellipse(cx, cy, rx, ry, -Math.PI / 4, 0, Math.PI * 2);
  } else {
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

// CANVAS TELEMETRY OSCILLOSCOPE
const chartCanvas = document.getElementById('telemetry-chart');
const chartCtx = chartCanvas ? chartCanvas.getContext('2d') : null;

function drawChart() {
  if (!chartCanvas || !chartCtx || !chartCanvas.width) return;
  
  chartCtx.clearRect(0, 0, chartCanvas.width, chartCanvas.height);

  const sat = Satellites[selectedSatelliteId];
  if (!sat) return;

  const p = sat.parameters[selectedParameterKey];
  if (!p) return;

  const w = chartCanvas.width;
  const h = chartCanvas.height;
  const pad = 24;

  chartCtx.strokeStyle = 'rgba(255,255,255,0.03)';
  chartCtx.lineWidth = 1;
  
  // Vert grids
  for (let x = pad; x < w - pad; x += (w - 2 * pad) / 6) {
    chartCtx.beginPath();
    chartCtx.moveTo(x, pad);
    chartCtx.lineTo(x, h - pad);
    chartCtx.stroke();
  }

  // Horiz grids
  for (let y = pad; y < h - pad; y += (h - 2 * pad) / 4) {
    chartCtx.beginPath();
    chartCtx.moveTo(pad, y);
    chartCtx.lineTo(w - pad, y);
    chartCtx.stroke();
  }

  const graphMinVal = p.min - (p.max - p.min) * 0.3;
  const graphMaxVal = p.max + (p.max - p.min) * 0.3;

  const yValToPixel = (val) => {
    const pct = (val - graphMinVal) / (graphMaxVal - graphMinVal);
    return h - pad - pct * (h - 2 * pad);
  };

  const yMaxLine = yValToPixel(p.max);
  const yMinLine = yValToPixel(p.min);

  chartCtx.strokeStyle = 'rgba(255, 56, 56, 0.4)';
  chartCtx.lineWidth = 1;
  chartCtx.setLineDash([4, 4]);
  
  chartCtx.beginPath();
  chartCtx.moveTo(pad, yMaxLine);
  chartCtx.lineTo(w - pad, yMaxLine);
  chartCtx.stroke();
  
  chartCtx.beginPath();
  chartCtx.moveTo(pad, yMinLine);
  chartCtx.lineTo(w - pad, yMinLine);
  chartCtx.stroke();
  
  chartCtx.setLineDash([]);

  chartCtx.fillStyle = 'rgba(255, 56, 56, 0.7)';
  chartCtx.font = '8px var(--font-mono)';
  chartCtx.fillText(`MAX: ${p.max} ${p.unit}`, w - pad - 60, yMaxLine - 4);
  chartCtx.fillText(`MIN: ${p.min} ${p.unit}`, w - pad - 60, yMinLine + 10);

  const history = p.history;
  if (!history || history.length === 0) return;

  const step = (w - 2 * pad) / 29;
  
  const lineGlow = chartCtx.createLinearGradient(0, 0, 0, h);
  lineGlow.addColorStop(0, (sat.status === 'critical') ? 'rgba(255, 56, 56, 0.15)' : 'rgba(0, 242, 254, 0.15)');
  lineGlow.addColorStop(1, 'transparent');

  chartCtx.fillStyle = lineGlow;
  chartCtx.beginPath();
  chartCtx.moveTo(pad, h - pad);

  for (let i = 0; i < history.length; i++) {
    const x = pad + i * step;
    const y = yValToPixel(history[i]);
    chartCtx.lineTo(x, y);
  }
  chartCtx.lineTo(pad + (history.length - 1) * step, h - pad);
  chartCtx.closePath();
  chartCtx.fill();

  chartCtx.strokeStyle = (sat.status === 'critical') ? 'var(--neon-red)' : 'var(--neon-cyan)';
  chartCtx.lineWidth = 2;
  chartCtx.beginPath();
  
  for (let i = 0; i < history.length; i++) {
    const x = pad + i * step;
    const y = yValToPixel(history[i]);
    if (i === 0) chartCtx.moveTo(x, y);
    else chartCtx.lineTo(x, y);
  }
  chartCtx.stroke();

  const lastIdx = history.length - 1;
  const lx = pad + lastIdx * step;
  const ly = yValToPixel(history[lastIdx]);
  
  chartCtx.fillStyle = (sat.status === 'critical') ? 'var(--neon-red)' : 'var(--neon-cyan)';
  chartCtx.beginPath();
  chartCtx.arc(lx, ly, 4, 0, Math.PI * 2);
  chartCtx.fill();
}

// DRAW FLOW MESSAGING PATH
function drawFlowLine(fromId, toId, color, pulse = false) {
  const fromEl = document.getElementById(fromId);
  const toEl = document.getElementById(toId);
  const svg = document.getElementById('flow-overlay');
  if (!fromEl || !toEl || !svg) return;

  const svgRect = svg.getBoundingClientRect();
  const fromRect = fromEl.getBoundingClientRect();
  const toRect = toEl.getBoundingClientRect();

  const x1 = fromRect.left + fromRect.width / 2 - svgRect.left;
  const y1 = fromRect.top + fromRect.height / 2 - svgRect.top;
  const x2 = toRect.left + toRect.width / 2 - svgRect.left;
  const y2 = toRect.top + toRect.height / 2 - svgRect.top;

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  const dx = Math.abs(x2 - x1) * 0.4;
  const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

  path.setAttribute('d', d);
  path.setAttribute('stroke', color);
  path.setAttribute('stroke-width', '2.5');
  path.setAttribute('fill', 'none');
  path.setAttribute('opacity', '0.85');
  
  if (pulse) {
    path.setAttribute('class', 'glowing-flow-path');
  }

  svg.appendChild(path);

  setTimeout(() => {
    path.style.transition = 'opacity 0.6s ease';
    path.style.opacity = '0';
    setTimeout(() => path.remove(), 600);
  }, 1000);
}

// SELECTION HELPER
function selectSatellite(satId) {
  selectedSatelliteId = satId;
  const sat = Satellites[satId];
  if (!sat) return;

  document.getElementById('selected-sat-title').textContent = sat.name;
  document.getElementById('injector-target-sat').textContent = `${sat.name} (${sat.type})`;
  
  selectedParameterKey = Object.keys(sat.parameters)[0];
  document.getElementById('selected-param-title').textContent = `Parameter: ${sat.parameters[selectedParameterKey].name}`;

  const btnContainer = document.getElementById('hud-param-buttons');
  btnContainer.innerHTML = '';
  
  for (const [key, p] of Object.entries(sat.parameters)) {
    const btn = document.createElement('button');
    btn.className = `control-btn ${key === selectedParameterKey ? 'active' : ''}`;
    btn.textContent = p.name;
    btn.onclick = () => {
      selectedParameterKey = key;
      document.getElementById('selected-param-title').textContent = `Parameter: ${p.name}`;
      document.querySelectorAll('#hud-param-buttons .control-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    };
    btnContainer.appendChild(btn);
  }

  // Populate Anomaly Injector dropdown matching backend mappings
  const select = document.getElementById('anomaly-vector-select');
  select.innerHTML = '<option value="">-- No anomaly selected --</option>';
  
  const config = FALLBACK_CONFIGS[satId];
  for (const [anomalyId, anomaly] of Object.entries(config.anomalies)) {
    const opt = document.createElement('option');
    opt.value = anomalyId;
    opt.textContent = anomaly.classification;
    select.appendChild(opt);
  }

  document.getElementById('inject-anomaly-btn').disabled = true;
  document.getElementById('mitigation-vector-desc').textContent = "Select an anomaly vector above to view AI system mitigation scripts.";
  
  updateTelemetryDOM();
}

// ==========================================
// 8. EVENT REGISTRATIONS & START
// ==========================================
window.onload = () => {
  initFallbackState();
  selectSatellite('insat3dr');
  
  addLog('SYSTEM', 'Sārathi AI Command Interface online.');
  addLog('SYSTEM', 'Listening for telemetry carrier downlink sync streams...');

  // Start Canvas orbital scene
  resizeSpaceCanvas();
  drawSpaceScene();
  window.addEventListener('resize', resizeSpaceCanvas);

  // Setup graph updates
  setInterval(drawChart, 250);

  // Fetch initial telemetry API, then spin WebSocket
  fetch('/api/telemetry')
    .then(r => r.json())
    .then(data => {
      // Backend is alive, load real telemetry
      for (const [id, sat] of Object.entries(data)) {
        Satellites[id] = sat;
      }
      isBackendSynced = true;
      updateTelemetryDOM();
      connectWebSocket();
    })
    .catch(() => {
      // Backend is offline, run fallback local fluctuations
      addLog('SYSTEM', 'Offline standalone client mode active (Local fluctuation simulation).');
      setInterval(runLocalSimulationTick, 1000);
    });

  // Clock updates (IST / UTC)
  setInterval(() => {
    const now = new Date();
    document.getElementById('time-utc').textContent = now.toISOString().replace('T', ' ').substring(11, 19) + ' UTC';
    const istTime = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
    document.getElementById('time-ist').textContent = istTime.toISOString().replace('T', ' ').substring(11, 19) + ' IST';
  }, 200);

  // Orchestrator scheduling loop tick (1s)
  setInterval(() => {
    orchestrator.tick();
  }, 1000);

  // Dynamic selector event bindings
  document.getElementById('anomaly-vector-select').addEventListener('change', (e) => {
    const sat = Satellites[selectedSatelliteId];
    const anomalyId = e.target.value;
    const btn = document.getElementById('inject-anomaly-btn');
    const desc = document.getElementById('mitigation-vector-desc');

    if (!anomalyId) {
      btn.disabled = true;
      desc.textContent = "Select a satellite and anomaly vector to display AI system mitigation scripts.";
      return;
    }

    const config = FALLBACK_CONFIGS[selectedSatelliteId];
    const anomaly = config.anomalies[anomalyId];
    if (anomaly) {
      btn.disabled = false;
      desc.innerHTML = `
        <strong>Vector Classification:</strong> ${anomaly.classification}<br>
        <strong>Mitigation script:</strong> <span style="color: var(--neon-purple);">Restore ${anomaly.param} to nominal.</span>
      `;
    }
  });

  // Inject Anomaly Button
  document.getElementById('inject-anomaly-btn').addEventListener('click', () => {
    const select = document.getElementById('anomaly-vector-select');
    const anomalyId = select.value;
    const satelliteId = selectedSatelliteId;

    if (!anomalyId) return;

    drawFlowLine('inject-anomaly-btn', `sat-card-${satelliteId}`, 'var(--neon-red)', true);

    if (isBackendSynced) {
      fetch('/api/inject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ satelliteId, anomalyId })
      })
      .then(r => r.json())
      .catch(e => console.error("Injection failed", e));
    } else {
      // Injects locally in fallback mode
      const limitCfg = FALLBACK_CONFIGS[satelliteId].anomalies[anomalyId];
      Satellites[satelliteId].activeAnomaly = {
        id: anomalyId,
        param: limitCfg.param,
        targetVal: limitCfg.targetVal,
        classification: limitCfg.classification,
        severity: limitCfg.severity
      };
      Satellites[satelliteId].status = limitCfg.severity.toLowerCase();
      Satellites[satelliteId].restoreTargets[limitCfg.param] = Satellites[satelliteId].parameters[limitCfg.param].history[0];
      updateTelemetryDOM();
      addLog('SYSTEM', `Local Fault Injected on ${Satellites[satelliteId].name}: ${limitCfg.classification}`);
    }

    select.value = '';
    document.getElementById('inject-anomaly-btn').disabled = true;
    document.getElementById('mitigation-vector-desc').textContent = "Fault successfully dispatched. TelemetryWatcher scanning pending...";
  });

  // Master Reset Button
  document.getElementById('reset-system-btn').addEventListener('click', () => {
    addLog('SYSTEM', 'Master hardware reset dispatched to fleet.');
    audio.stopAlarmLoop();

    if (isBackendSynced) {
      // For each satellite, send restore command
      Object.keys(Satellites).forEach(satelliteId => {
        if (Satellites[satelliteId].activeAnomaly) {
          fetch('/api/mitigate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ satelliteId })
          });
        }
      });
    } else {
      // Local reset
      for (const [id, cfg] of Object.entries(FALLBACK_CONFIGS)) {
        Satellites[id].activeAnomaly = null;
        Satellites[id].resolving = false;
        Satellites[id].status = 'healthy';
        for (const [pk, p] of Object.entries(cfg.parameters)) {
          Satellites[id].parameters[pk].val = p.val;
        }
      }
      updateTelemetryDOM();
      selectSatellite(selectedSatelliteId);
      audio.playSuccess();
    }
  });

  // Audio Toggle Button
  const audioBtn = document.getElementById('audio-toggle-btn');
  audioBtn.addEventListener('click', () => {
    const isEnabled = audio.toggle();
    if (isEnabled) {
      audioBtn.textContent = 'Audio: ON';
      audioBtn.classList.add('active');
      audio.playSuccess();
    } else {
      audioBtn.textContent = 'Audio: OFF';
      audioBtn.classList.remove('active');
    }
  });

  // Manual Compile Report
  document.getElementById('generate-report-btn').addEventListener('click', () => {
    missionReportWriter.compileReport();
  });

  // Orbit selection clicks
  spaceCanvas.addEventListener('click', (e) => {
    const rect = spaceCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    let found = null;
    let minDist = 18;

    for (const sat of Object.values(Satellites)) {
      const dist = Math.hypot(sat.screenX - mx, sat.screenY - my);
      if (dist < minDist) {
        minDist = dist;
        found = sat.id;
      }
    }

    if (found) {
      selectSatellite(found);
    }
  });
};
