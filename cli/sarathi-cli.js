const http = require('http');

const PORT = 3000;
const HOST = 'localhost';

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: HOST,
      port: PORT,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(data ? JSON.parse(data) : {});
          } catch (e) {
            resolve(data);
          }
        } else {
          try {
            const errObj = JSON.parse(data);
            reject(new Error(errObj.error || `Status Code ${res.statusCode}`));
          } catch (e) {
            reject(new Error(`Status Code ${res.statusCode}: ${data}`));
          }
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error(`Failed to connect to Sārathi AI Server at http://${HOST}:${PORT}. Make sure the server is running!`));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

function printHelp() {
  console.log(`
============================================================
           SĀRATHI AI - SATELLITE COMMAND LINE SKILL        
============================================================
Usage:
  node cli/sarathi-cli.js <command> [args]

Commands:
  status                                 Display current fleet telemetry matrix.
  inject <satelliteId> <anomalyId>       Safely inject simulated spacecraft fault.
  mitigate <satelliteId>                 Execute mitigation scripts to stabilize orbit.
  logs                                   Fetch recent live operations logs stream.
  help                                   Show this guide.

Satellites:
  insat3dr, cartosat3, risat2br1, chandrayaan3, adityal1

Anomaly Options:
  insat3dr     -> low_signal, high_temp
  cartosat3    -> low_battery
  risat2br1    -> low_downlink
  chandrayaan3 -> low_signal
  adityal1     -> high_temp
============================================================
`);
}

async function run() {
  const args = process.argv.slice(2);
  const command = args[0] ? args[0].toLowerCase() : 'help';

  switch (command) {
    case 'help':
      printHelp();
      break;

    case 'status':
      try {
        console.log("Connecting to Sārathi AI Command Center...");
        const data = await makeRequest('GET', '/api/telemetry');
        
        console.log("\n=========================================================================");
        console.log("                  SĀRATHI AI SPACECRAFT FLEET STATUS                     ");
        console.log("=========================================================================");
        
        for (const [id, sat] of Object.entries(data)) {
          const statusGlow = sat.status === 'healthy' ? '✅ NOMINAL' : (sat.status === 'warning' ? '⚠️ WARNING' : '🚨 CRITICAL');
          console.log(`\n🛰️  ${sat.name.padEnd(15)} [${sat.type}]`);
          console.log(`   Orbit:  ${sat.orbit}`);
          console.log(`   Health: ${statusGlow}`);
          
          if (sat.activeAnomaly) {
            console.log(`   Fault:  ${sat.activeAnomaly.classification} (${sat.activeAnomaly.severity})`);
          }
          
          console.log("   Telemetry Parameters:");
          for (const [pk, p] of Object.entries(sat.parameters)) {
            const isAnomaly = p.val < p.min || p.val > p.max ? '[OUT OF RANGE]' : '[OK]';
            console.log(`     - ${p.name.padEnd(22)}: ${p.val.toFixed(2).padStart(6)} ${p.unit.padEnd(4)} ${isAnomaly}`);
          }
        }
        console.log("\n=========================================================================");
      } catch (err) {
        console.error("Error:", err.message);
      }
      break;

    case 'inject':
      const targetSat = args[1];
      const targetAnomaly = args[2];
      if (!targetSat || !targetAnomaly) {
        console.error("Error: Missing arguments. Usage: node cli/sarathi-cli.js inject <satelliteId> <anomalyId>");
        process.exit(1);
      }
      try {
        console.log(`Dispatching fault command to Sārathi AI Server...`);
        const result = await makeRequest('POST', '/api/inject', { satelliteId: targetSat, anomalyId: targetAnomaly });
        console.log(`\n✅ SUCCESS: Simulated telemetry fault dispatched to ${result.satellite.name}.`);
        console.log(`Active Anomaly: ${result.satellite.activeAnomaly.classification} (${result.satellite.activeAnomaly.severity})`);
      } catch (err) {
        console.error("\n❌ Injection Failed:", err.message);
      }
      break;

    case 'mitigate':
      const mitigateSat = args[1];
      if (!mitigateSat) {
        console.error("Error: Missing satelliteId. Usage: node cli/sarathi-cli.js mitigate <satelliteId>");
        process.exit(1);
      }
      try {
        console.log(`Dispatching stabilization instructions...`);
        await makeRequest('POST', '/api/mitigate', { satelliteId: mitigateSat });
        console.log(`\n✅ SUCCESS: Mitigation command sequence verified. Spacecraft ${mitigateSat} restoring parameters to nominal.`);
      } catch (err) {
        console.error("\n❌ Mitigation Failed:", err.message);
      }
      break;

    case 'logs':
      try {
        const logs = await makeRequest('GET', '/api/logs');
        console.log("\n=========================================================================");
        console.log("                   LIVE AGENTS OPERATIONS STREAM                         ");
        console.log("=========================================================================");
        if (logs.length === 0) {
          console.log("No operation logs in buffer.");
        } else {
          logs.forEach(log => {
            console.log(`[${log.time}] [${log.source.padEnd(10)}] ${log.message}`);
          });
        }
        console.log("=========================================================================");
      } catch (err) {
        console.error("Error:", err.message);
      }
      break;

    default:
      console.log(`Unknown command: ${command}`);
      printHelp();
      break;
  }
}

run();
