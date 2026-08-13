'use strict';

const {
  createLabResult,
  getAllLabResults,
  getLabResultsByPatient,
  listGatewayPeers,
  readLabResult,
  updateLabStatus,
} = require('./gateway');

async function main() {
  const [, , command, ...args] = process.argv;
  if (!command) {
    printUsage();
    process.exit(1);
  }

  switch (command) {
    case 'getAll': {
      const response = await getAllLabResults();
      printResult(response.result);
      break;
    }
    case 'read': {
      const [resultId] = args;
      const response = await readLabResult(resultId);
      printResult(response.result);
      break;
    }
    case 'byPatient': {
      const [patientId] = args;
      const response = await getLabResultsByPatient(patientId);
      printResult(response.result);
      break;
    }
    case 'create': {
      const [resultId, patientId, testCode, collectedAt, status, resultDataJson] = args;
      const response = await createLabResult({
        resultId,
        patientId,
        testCode,
        collectedAt,
        status,
        resultData: resultDataJson,
      });
      printResult(response.result);
      break;
    }
    case 'updateStatus': {
      const [resultId, status] = args;
      const response = await updateLabStatus(resultId, status);
      printResult(response.result);
      break;
    }
    case 'peers': {
      printResult(listGatewayPeers());
      break;
    }
    default:
      printUsage();
      process.exitCode = 1;
  }
}

function printResult(result) {
  if (typeof result === 'string') {
    console.log(result);
    return;
  }

  console.log(JSON.stringify(result, null, 2));
}

function printUsage() {
  console.log(`Usage:
  node index.js getAll
  node index.js read <resultId>
  node index.js byPatient <patientId>
  node index.js create <resultId> <patientId> <testCode> <collectedAt> <status> <resultDataJson>
  node index.js updateStatus <resultId> <status>
  node index.js peers

Examples:
  node index.js getAll
  node index.js read labresult1
  node index.js byPatient patient-1001
  node index.js create labresult3 patient-1003 LIPID 2026-04-19T10:30:00Z REPORTED '{"hdl":"54","ldl":"110"}'
  node index.js updateStatus labresult2 REPORTED
  node index.js peers
`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
