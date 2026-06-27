const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const readline = require('readline');

// ==========================================
// 1. SIMULATED SATELLITES & STATE MANAGEMENT
// ==========================================
const SATELLITE_DATA = {
  insat3dr: {
    id: 'insat3dr',
    name: 'INSAT-3DR',
    type: 'GEO Meteorological',
    orbit: 'Geostationary (35,786 km)',
    color: '#ff9933',
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
    id: 'cartosat3',
    name: 'Cartosat-3',
    type: 'Polar Earth Obs',
    orbit: 'Sun-synchronous Polar (509 km)',
    color: '#00f2fe',
    parameters: {
      gyro: { name: 'Gyro Spin Rate', val: 0.015, min: -0.05, max: 0.05, unit: 'rad/s' },
      battery: { name: 'Battery Charge', val: 88.0, min: 65, max: 100, unit: '%' }
    },
    anomalies: {
      low_battery: { param: 'battery', targetVal: 48.0, classification: 'Solar panel underperformance', severity: 'CRITICAL' }
    }
  },
  risat2br1: {
    id: 'risat2br1',
    name: 'RISAT-2BR1',
    type: 'LEO Radar Imaging',
    orbit: 'Low Earth Orbit (576 km)',
    color: '#00f5a0',
    parameters: {
      radarTemp: { name: 'Radar Antenna Temp', val: 14.5, min: -10, max: 40, unit: '°C' },
      downlink: { name: 'Downlink Rate', val: 124.0, min: 45, max: 200, unit: 'Mbps' }
    },
    anomalies: {
      low_downlink: { param: 'downlink', targetVal: 22.0, classification: 'Atmospheric interference', severity: 'WARN' }
    }
  },
  chandrayaan3: {
    id: 'chandrayaan3',
    name: 'Chandrayaan-3',
    type: 'Lunar Lander',
    orbit: 'Lunar Orbit / Surface',
    color: '#c084fc',
    parameters: {
      landerTemp: { name: 'Lander Temp', val: -12.0, min: -180, max: 120, unit: '°C' },
      signal: { name: 'Deep Space Signal', val: -84.5, min: -110, max: -65, unit: 'dBm' }
    },
    anomalies: {
      low_signal: { param: 'signal', targetVal: -118.0, classification: 'Possible antenna misalignment', severity: 'CRITICAL' }
    }
  },
  adityal1: {
    id: 'adityal1',
    name: 'Aditya-L1',
    type: 'Solar Observatory',
    orbit: 'Sun-Earth L1 Halo Orbit',
    color: '#ffdd59',
    parameters: {
      velcTemp: { name: 'Coronagraph Temp', val: -4.5, min: -20, max: 10, unit: '°C' },
      thrusterPres: { name: 'Thruster Pressure', val: 248.0, min: 190, max: 310, unit: 'psi' }
    },
    anomalies: {
      high_temp: { param: 'velcTemp', targetVal: 22.5, classification: 'Thermal regulation issue', severity: 'WARN' }
    }
  }
};

// Initialize active state
const Satellites = {};
for (const [id, cfg] of Object.entries(SATELLITE_DATA)) {
  Satellites[id] = {
    id: cfg.id,
    name: cfg.name,
    type: cfg.type,
    orbit: cfg.orbit,
    color: cfg.color,
    status: 'healthy', // 'healthy', 'warning', 'critical'
    parameters: {},
    activeAnomaly: null,
    resolving: false,
    restoreTargets: {}
  };
  for (const [paramKey, p] of Object.entries(cfg.parameters)) {
    Satellites[id].parameters[paramKey] = {
      name: p.name,
      val: p.val,
      min: p.min,
      max: p.max,
      unit: p.unit,
      history: Array(30).fill(p.val)
    };
  }
}

// Telemetry Fluctuations & Updates Loop
setInterval(() => {
  for (const sat of Object.values(Satellites)) {
    for (const [key, p] of Object.entries(sat.parameters)) {
      if (sat.activeAnomaly && sat.activeAnomaly.param === key) {
        // Pull towards anomaly target value
        const delta = (sat.activeAnomaly.targetVal - p.val) * 0.2;
        p.val += delta;
      } else if (sat.resolving && sat.restoreTargets[key] !== undefined) {
        // Return to normal target value
        const delta = (sat.restoreTargets[key] - p.val) * 0.15;
        p.val += delta;
        if (Math.abs(p.val - sat.restoreTargets[key]) < 0.05) {
          p.val = sat.restoreTargets[key];
          delete sat.restoreTargets[key];
          if (Object.keys(sat.restoreTargets).length === 0) {
            sat.resolving = false;
            sat.status = 'healthy';
          }
        }
      } else {
        // Normal minor fluctuations
        const range = p.max - p.min;
        const drift = (Math.random() - 0.5) * (range * 0.015);
        p.val += drift;
        // Restrict within reasonable limits
        if (p.val < p.min - range * 0.1) p.val = p.min;
        if (p.val > p.max + range * 0.1) p.val = p.max;
      }

      p.history.push(p.val);
      if (p.history.length > 30) p.history.shift();
    }
  }
  broadcastState();
}, 1000);

// ==========================================
// 2. SECURITY INPUT VALIDATIONS (Joi-like)
// ==========================================
function validateFaultInjection(satelliteId, anomalyId) {
  if (!Satellites[satelliteId]) {
    return { valid: false, error: `Invalid Satellite ID: ${satelliteId}` };
  }
  const config = SATELLITE_DATA[satelliteId];
  if (!config.anomalies[anomalyId]) {
    return { valid: false, error: `Invalid Anomaly ID: ${anomalyId} for ${config.name}` };
  }
  return { valid: true };
}

function validateMitigation(satelliteId) {
  if (!Satellites[satelliteId]) {
    return { valid: false, error: `Invalid Satellite ID: ${satelliteId}` };
  }
  if (!Satellites[satelliteId].activeAnomaly) {
    return { valid: false, error: `No active anomaly to mitigate on ${Satellites[satelliteId].name}` };
  }
  return { valid: true };
}

// In-Memory Operations logs
const systemLogs = [];
function logToSystem(source, message) {
  const time = new Date().toLocaleTimeString();
  systemLogs.push({ time, source, message });
  if (systemLogs.length > 100) systemLogs.shift();
}

// ==========================================
// 3. EXPRESS APP & WEBSOCKET SETUP
// ==========================================
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.get('/api/telemetry', (req, res) => {
  res.json(Satellites);
});

app.post('/api/inject', (req, res) => {
  const { satelliteId, anomalyId } = req.body;
  const validation = validateFaultInjection(satelliteId, anomalyId);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  const sat = Satellites[satelliteId];
  const anomaly = SATELLITE_DATA[satelliteId].anomalies[anomalyId];

  sat.activeAnomaly = {
    id: anomalyId,
    param: anomaly.param,
    targetVal: anomaly.targetVal,
    classification: anomaly.classification,
    severity: anomaly.severity
  };
  sat.status = anomaly.severity === 'CRITICAL' ? 'critical' : 'warning';
  sat.resolving = false;
  sat.restoreTargets[anomaly.param] = SATELLITE_DATA[satelliteId].parameters[anomaly.param].val;

  logToSystem('SYSTEM', `Fault Injected on ${sat.name}: ${anomaly.classification}`);
  broadcastState();
  res.json({ success: true, satellite: sat });
});

app.post('/api/mitigate', (req, res) => {
  const { satelliteId } = req.body;
  const validation = validateMitigation(satelliteId);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  const sat = Satellites[satelliteId];
  sat.activeAnomaly = null;
  sat.resolving = true;
  logToSystem('SYSTEM', `Mitigation script uploaded to ${sat.name}`);
  broadcastState();
  res.json({ success: true, satellite: sat });
});

app.get('/api/logs', (req, res) => {
  res.json(systemLogs);
});

// WebSocket broadcasting
const clients = new Set();
wss.on('connection', (ws) => {
  clients.add(ws);
  // Send initial state immediately
  ws.send(JSON.stringify({ type: 'STATE', data: Satellites }));
  ws.on('close', () => clients.delete(ws));
});

function broadcastState() {
  const payload = JSON.stringify({ type: 'STATE', data: Satellites });
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

// ==========================================
// 4. MODEL CONTEXT PROTOCOL (MCP) IMPLEMENTATION
// ==========================================
const mcpTools = {
  get_telemetry: {
    description: "Retrieve real-time telemetry parameters, active anomalies, and health states of all 5 ISRO satellites.",
    handler: async () => {
      return { content: [{ type: "text", text: JSON.stringify(Satellites, null, 2) }] };
    }
  },
  inject_fault: {
    description: "Safely injects a simulated telemetry fault on a specific spacecraft. Validates satellite and anomaly ID.",
    inputSchema: {
      type: "object",
      properties: {
        satelliteId: { type: "string", description: "Target satellite: insat3dr, cartosat3, risat2br1, chandrayaan3, adityal1" },
        anomalyId: { type: "string", description: "Anomaly ID: low_signal, high_temp, low_battery, low_downlink" }
      },
      required: ["satelliteId", "anomalyId"]
    },
    handler: async (args) => {
      const { satelliteId, anomalyId } = args;
      const validation = validateFaultInjection(satelliteId, anomalyId);
      if (!validation.valid) {
        return { isError: true, content: [{ type: "text", text: validation.error }] };
      }

      const sat = Satellites[satelliteId];
      const anomaly = SATELLITE_DATA[satelliteId].anomalies[anomalyId];

      sat.activeAnomaly = {
        id: anomalyId,
        param: anomaly.param,
        targetVal: anomaly.targetVal,
        classification: anomaly.classification,
        severity: anomaly.severity
      };
      sat.status = anomaly.severity === 'CRITICAL' ? 'critical' : 'warning';
      sat.resolving = false;
      sat.restoreTargets[anomaly.param] = SATELLITE_DATA[satelliteId].parameters[anomaly.param].val;

      logToSystem('SYSTEM', `Fault Injected via MCP on ${sat.name}: ${anomaly.classification}`);
      broadcastState();

      return { content: [{ type: "text", text: `SUCCESS: Injected ${anomaly.classification} (${anomaly.severity}) onto ${sat.name}.` }] };
    }
  },
  mitigate_anomaly: {
    description: "Deploys a safe mitigation script to reset satellite anomalies and return values to nominal.",
    inputSchema: {
      type: "object",
      properties: {
        satelliteId: { type: "string", description: "Target satellite ID: insat3dr, cartosat3, etc." }
      },
      required: ["satelliteId"]
    },
    handler: async (args) => {
      const { satelliteId } = args;
      const validation = validateMitigation(satelliteId);
      if (!validation.valid) {
        return { isError: true, content: [{ type: "text", text: validation.error }] };
      }

      const sat = Satellites[satelliteId];
      sat.activeAnomaly = null;
      sat.resolving = true;

      logToSystem('SYSTEM', `Mitigation deployed via MCP to ${sat.name}`);
      broadcastState();

      return { content: [{ type: "text", text: `SUCCESS: Mitigation commands received by ${sat.name}. Restoring nominal values.` }] };
    }
  }
};

// Handle JSON-RPC stdio stream for MCP
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', async (line) => {
  try {
    const request = JSON.parse(line);
    const { jsonrpc, id, method, params } = request;

    if (jsonrpc !== '2.0') return;

    if (method === 'initialize') {
      const response = {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: "sarathi-ai-mcp",
            version: "1.0.0"
          }
        }
      };
      process.stdout.write(JSON.stringify(response) + '\n');
    }
    else if (method === 'tools/list') {
      const toolsArray = Object.entries(mcpTools).map(([name, tool]) => ({
        name,
        description: tool.description,
        inputSchema: tool.inputSchema || { type: "object", properties: {} }
      }));
      const response = {
        jsonrpc: '2.0',
        id,
        result: { tools: toolsArray }
      };
      process.stdout.write(JSON.stringify(response) + '\n');
    }
    else if (method === 'tools/call') {
      const toolName = params.name;
      const toolArgs = params.arguments || {};
      const tool = mcpTools[toolName];

      if (!tool) {
        const response = {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Tool not found: ${toolName}` }
        };
        process.stdout.write(JSON.stringify(response) + '\n');
        return;
      }

      try {
        const result = await tool.handler(toolArgs);
        const response = {
          jsonrpc: '2.0',
          id,
          result
        };
        process.stdout.write(JSON.stringify(response) + '\n');
      } catch (err) {
        const response = {
          jsonrpc: '2.0',
          id,
          error: { code: -32603, message: err.message }
        };
        process.stdout.write(JSON.stringify(response) + '\n');
      }
    }
  } catch (err) {
    // If not valid JSON, ignore or write to stderr so we don't break the stdio interface
    console.error("MCP Protocol Error:", err);
  }
});

// START HTTP SERVER
const PORT = 3000;
server.listen(PORT, () => {
  // Write non-JSON-RPC logs to stderr so we don't pollute stdout in MCP mode!
  console.error(`Sārathi AI Web Server listening on http://localhost:${PORT}`);
  console.error(`MCP Server Stdio Stream Interface listening on stdin/stdout`);
});
