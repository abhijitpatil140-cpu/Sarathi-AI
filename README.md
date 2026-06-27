# 🛰️ Sārathi AI — Spacecraft Multi-Agent Operations Command Center

<div align="center">

![Sārathi AI Banner](https://img.shields.io/badge/Sārathi_AI-Multi--Agent_Space_Ops-blue?style=for-the-badge&logo=googlechrome&logoColor=white)
![Kaggle x Google](https://img.shields.io/badge/Kaggle_%C3%97_Google-Capstone_Project-20BEFF?style=for-the-badge&logo=kaggle&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-16%2B-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)
![MCP](https://img.shields.io/badge/MCP-Model_Context_Protocol-purple?style=for-the-badge)

**A real-time autonomous multi-agent AI system for spacecraft telemetry monitoring, anomaly detection, and mission operations — built as a Kaggle × Google Generative AI Capstone Project.**

[Features](#-features) • [Architecture](#-system-architecture) • [Demo](#-dashboard--demo) • [Getting Started](#-getting-started) • [MCP Tools](#-mcp-server--tools) • [CLI](#-cli-operations) • [Testing](#-mcp-integration-testing)

</div>

---

## 🌟 Project Overview

**Sārathi** (Sanskrit: *सारथी*, meaning "Charioteer" or "Guide") is an autonomous AI operations system inspired by ISRO's real-world spacecraft fleet. It demonstrates a practical, production-ready implementation of a **multi-agent AI architecture** using the **Model Context Protocol (MCP)**, enabling AI assistants to directly operate and monitor a spacecraft command center.

The system coordinates **4 specialized autonomous agents** over a real-time **WebSocket event bus**, providing a live glassmorphic command dashboard at `http://localhost:3000`. Each agent has a distinct role in the operations pipeline — from telemetry surveillance, anomaly classification, and mitigation, to periodic mission report generation.

> 🏆 **Capstone Submission** for the [Kaggle × Google Generative AI Intensive 5-Day Course](https://www.kaggle.com/learn-guide/5-day-genai)

---

## ✨ Features

| Feature | Description |
|---|---|
| 🤖 **Multi-Agent Architecture** | 4 specialized agents communicating over an in-memory event bus |
| 🛰️ **Live Telemetry Simulation** | Continuously fluctuating sensor data for 5 ISRO spacecraft |
| 🚨 **Anomaly Detection & Classification** | Real-time rule-based diagnostic engine with severity scoring |
| 🛡️ **Safe Mitigation Engine** | Whitelist-constrained remediation scripts to prevent injection attacks |
| 📡 **MCP Server Integration** | Expose spacecraft tools to any AI assistant via JSON-RPC stdio |
| 📊 **Mission Report Writer** | Periodic fleet health reports with advisory checklists |
| 🖥️ **Glassmorphic Dashboard** | Premium real-time WebSocket-powered command UI |
| 🔧 **CLI Operator Interface** | Human-operated terminal control panel for direct fleet management |

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Sārathi AI System                        │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                 OrchestratorAgent (Agent 4)               │   │
│  │         Master Loop — schedules every 1s / 5s / 60s      │   │
│  └──────────────────┬───────────────────────────────────────┘   │
│                     │  In-Memory Event Bus                      │
│          ┌──────────┴──────────────────┐                        │
│          ▼                             ▼                        │
│  ┌───────────────┐           ┌──────────────────────┐          │
│  │TelemetryWatcher│          │  MissionReportWriter  │          │
│  │   (Agent 1)   │           │      (Agent 3)        │          │
│  │ Polls every 5s│           │   Reports every 60s   │          │
│  └───────┬───────┘           └──────────────────────┘          │
│          │ ANOMALY_DETECTED                                      │
│          ▼                                                       │
│  ┌───────────────┐                                              │
│  │AnomalyClassifier│                                            │
│  │   (Agent 2)   │                                              │
│  │ Classifies &  │                                              │
│  │ Mitigates     │                                              │
│  └───────────────┘                                              │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │         WebSocket Stream  →  Browser Dashboard           │   │
│  │         MCP stdio Server  →  AI Assistants (Claude etc.) │   │
│  │         CLI Interface     →  Human Operators             │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🛰️ Simulated Spacecraft Fleet

Sārathi AI manages **5 simulated ISRO spacecraft** with realistic, continuously fluctuating telemetry parameters:

| # | Spacecraft | Orbit Type | Monitored Parameters |
|---|---|---|---|
| 1 | **INSAT-3DR** | GEO Meteorological | Payload Temp, Battery Voltage, Transponder Signal |
| 2 | **Cartosat-3** | Polar Earth Observation | Gyro Spin Rate, Battery Charge |
| 3 | **RISAT-2BR1** | LEO Radar Imaging | Radar Antenna Temp, Downlink Rate |
| 4 | **Chandrayaan-3** | Lunar Lander | Lander Temp, Deep Space Signal |
| 5 | **Aditya-L1** | Lagrange Point 1 (Solar Observatory) | Coronagraph Temp, Thruster Pressure |

---

## 🤖 The Multi-Agent Core Matrix

The operations loop is coordinated by **4 specialized autonomous agents**:

### Agent 4 — `OrchestratorAgent`
- **Role**: Master Loop Coordinator
- **Action**: Runs every second. Schedules `TelemetryWatcher` (every 5s) and `MissionReportWriter` (every 60s). Maintains a scrolling **Memory Bank** of the last 5 orchestration decisions.

### Agent 1 — `TelemetryWatcher`
- **Role**: Real-time sensor monitor
- **Action**: Initiates a sweep across all 5 satellites every 5 seconds. Fires an `ANOMALY_DETECTED` event on the Event Bus when telemetry values drift outside predefined safety envelopes.

### Agent 2 — `AnomalyClassifier`
- **Role**: Diagnostic evaluator
- **Action**: Intercepts `ANOMALY_DETECTED` events and routes them through a decision tree:
  - `Signal < Threshold` → *"Possible antenna misalignment"*
  - `Temp > Threshold` → *"Thermal regulation issue"*
  - `Battery/Voltage < Threshold` → *"Solar panel underperformance"*
  - `Downlink < Threshold` → *"Atmospheric interference"*
- Determines severity (`WARN` or `CRITICAL`) based on deviation magnitude, logs alerts to the Mission Log, and invokes whitelisted safe mitigation scripts.

### Agent 3 — `MissionReportWriter`
- **Role**: Operations summary compiler
- **Action**: Triggered every 60 seconds (or manually via CLI/MCP). Generates a formatted mission report including:
  - IST Timestamp
  - Per-satellite health badges (🟢 Nominal / 🟡 Warning / 🔴 Critical)
  - Dynamic **Fleet Health Score** (0–100)
  - Recommended **Advisory Checklist** for active anomalies

---

## 🖥️ Dashboard & Demo

The live command dashboard is accessible at **`http://localhost:3000`** and features:

- **Real-time telemetry gauges** for all 5 spacecraft
- **Live mission event log** with color-coded severity alerts
- **Agent status matrix** showing each agent's current state and memory
- **Fleet health score** computed from active anomaly severity
- **Mission report panel** with auto-refreshing summaries

The dashboard uses **WebSockets** for zero-latency live updates and a **glassmorphic dark design** for a premium operator-grade experience.

---
<img width="1906" height="902" alt="Image" src="https://github.com/user-attachments/assets/a5a95fc5-d3bd-43ab-b5cb-f1cb15c51088" />

---

<img width="1908" height="900" alt="Image" src="https://github.com/user-attachments/assets/3ca613c5-9bbd-4092-b644-b7fd60d633cb" />
---

<img width="1873" height="841" alt="Image" src="https://github.com/user-attachments/assets/3650b319-a8b8-4f91-8527-7d9cfaa92264" />
---


https://github.com/user-attachments/assets/22bf6079-70c9-40c9-9095-fcf21e296ee2c9-9095-fcf21e296ee2

## 🛡️ Security Architecture

Sārathi AI enforces safety and validation at **two levels**:

1. **Input Schema Validation** — All telemetry manipulations and anomaly injections are validated against strict JSON schemas (checking satellite ID, parameter ranges, and matching anomaly configurations) before any state is updated.

2. **Whitelisted Mitigation Execution** — No arbitrary commands or scripting payloads can be executed. Anomaly resolution is constrained to a **static whitelist** of predefined, safe parameter restoration targets, preventing remote command injection attacks.

---

## 📡 MCP Server & Tools

Sārathi AI implements a standard **JSON-RPC stdio-based MCP Server** interface directly in `server.js`. AI assistants (such as Claude Desktop, Antigravity, or any MCP-compatible client) can connect and operate the spacecraft fleet via the following tools:

### Available MCP Tools

#### `get_telemetry`
Returns the real-time telemetry matrix, health status, and active anomalies for all 5 satellites.
```json
{ "arguments": {} }
```

#### `inject_fault`
Safely injects a simulated telemetry fault on a specific spacecraft.
```json
{
  "arguments": {
    "satelliteId": "chandrayaan3",
    "anomalyId": "low_signal"
  }
}
```

#### `mitigate_anomaly`
Deploys the whitelisted mitigation script to restore parameters to nominal.
```json
{
  "arguments": {
    "satelliteId": "chandrayaan3"
  }
}
```

### Connecting an MCP Client (e.g. Claude Desktop)

Add the following to your Claude Desktop config file (`%APPDATA%\Claude\claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "sarathi-ai": {
      "command": "node",
      "args": ["c:/Capstone/server.js", "--mcp"]
    }
  }
}
```

> ⚠️ **Windows Note**: Use absolute paths with forward slashes for compatibility.

---

## 🔧 CLI Operations

Sārathi AI includes a **command-line operator interface** for direct human control of the spacecraft fleet:

```bash
# View help and satellite configurations
npm run cli help

# View real-time fleet telemetry matrix
npm run cli status

# Fetch the recent live agent operations log
npm run cli logs

# Inject a transponder signal fault on Chandrayaan-3
npm run cli inject chandrayaan3 low_signal

# Resolve all active anomalies on Cartosat-3
npm run cli mitigate cartosat3
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** v16 or higher — [Download here](https://nodejs.org)
- A modern web browser (Chrome, Firefox, Edge)

### Installation & Running

```bash
# 1. Clone the repository
git clone https://github.com/abhijitpatil140/sarathi-ai.git
cd sarathi-ai

# 2. Install dependencies
npm install

# 3. Start the Sārathi AI Server
npm start

# 4. Open the dashboard in your browser
#    → http://localhost:3000
```

### Project Structure

```
sarathi-ai/
├── server.js           # Core server: agents, event bus, MCP server, WebSocket
├── index.html          # Redirect / root entry point
├── package.json        # Dependencies & scripts
├── cli/
│   └── sarathi-cli.js  # CLI operator interface
└── public/
    ├── index.html      # Glassmorphic dashboard UI
    ├── script.js       # WebSocket client & real-time UI logic
    └── style.css       # Dashboard styling & animations
```

---

## 🧪 MCP Integration Testing

Verify stdio-based JSON-RPC protocol compliance directly from your terminal:

### Step 1 — Start in MCP Mode
```bash
node server.js --mcp
```
*(The server now listens for JSON-RPC requests on stdin)*

### Step 2 — Protocol Handshake
```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test-client","version":"1.0"}}}
```
*Expected: JSON payload listing server capabilities (`sarathi-ai-mcp`)*

### Step 3 — List Available Tools
```json
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
```
*Expected: JSON schemas for `get_telemetry`, `inject_fault`, `mitigate_anomaly`*

### Step 4 — Fetch Telemetry Matrix
```json
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_telemetry","arguments":{}}}
```
*Expected: Full telemetry object with health status and all parameters*

### Step 5 — Inject Anomaly
```json
{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"inject_fault","arguments":{"satelliteId":"chandrayaan3","anomalyId":"low_signal"}}}
```
*Expected: Confirmation of anomaly injection*

### Step 6 — Deploy Mitigation
```json
{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"mitigate_anomaly","arguments":{"satelliteId":"chandrayaan3"}}}
```
*Expected: Confirmation that stabilization commands were received*

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Node.js, Express.js |
| **Real-time Comms** | WebSockets (`ws` library) |
| **AI Integration** | Model Context Protocol (MCP) — JSON-RPC stdio |
| **Frontend** | Vanilla HTML5, CSS3, JavaScript |
| **Design** | Glassmorphism, CSS animations, dark theme |
| **Agent Pattern** | In-memory event bus, autonomous scheduling loops |

---

## 🧠 Concepts Demonstrated

This project showcases the following **Generative AI & Agent Architecture** concepts from the Kaggle × Google Generative AI Intensive course:

- ✅ **Multi-Agent Systems** — Independent agents with distinct roles communicating via events
- ✅ **Agent Orchestration** — A master orchestrator agent scheduling subordinate agents
- ✅ **Tool Use / Function Calling** — MCP server exposing spacecraft control tools to AI
- ✅ **State Management** — Persistent telemetry state and agent memory banks
- ✅ **Safety & Security** — Input schema validation and whitelisted tool execution
- ✅ **Real-time AI Systems** — WebSocket-driven live dashboard with zero-latency updates

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgements

- **Google & Kaggle** for the [5-Day Generative AI Intensive Course](https://www.kaggle.com/learn-guide/5-day-genai)
- **ISRO** for inspiring the spacecraft fleet simulation
- **Anthropic** for the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) specification

---

<div align="center">

*Built with ❤️ for the Kaggle × Google Generative AI Capstone*

**सारथी — Your Spacecraft Fleet's Autonomous Guide**

</div>
