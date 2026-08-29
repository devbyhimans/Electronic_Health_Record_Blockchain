'use strict';

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Gateway, Wallets } = require('fabric-network');
const EventStrategies = require('fabric-network/lib/impl/event/defaulteventhandlerstrategies');
const { SingleQueryHandler } = require('fabric-network/lib/impl/query/singlequeryhandler');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ── CONFIG ───────────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const DEFAULT_QUERY_USER = 'user1';
const DEFAULT_UPDATE_USER = 'manager';
const IPFS_API = process.env.IPFS_API || 'http://127.0.0.1:5001/api/v0';
const WALLET_PATH = path.join(__dirname, 'wallet');

const FABRIC_CHANNEL_NAME = process.env.FABRIC_CHANNEL_NAME || 'mychannel';
const FABRIC_CHAINCODE_NAME = process.env.FABRIC_CHAINCODE_NAME || 'ehr';

const PC1_IP = "100.124.176.94"; // Manager PC (This machine)

const ccpPath = path.resolve(__dirname, 'connection.json');
let ccp = {};
try {
    ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));
} catch (e) {
    console.error("Connection profile NOT FOUND at", ccpPath);
}

// ── IDENTITY MAPPING ──────────────────────────────────────────────────────────

/**
 * Deterministically maps any physical ID (e.g. pat001) to one of the 50 
 * unique X.509 certificates in the wallet.
 */
function mintUserCertificate(id) {
    if (!id) return DEFAULT_QUERY_USER;
    
    // Internal technical IDs use fixed certs
    // Map the symbolic "manager" role to the physical "admin" certificate in the wallet
    if (id === 'admin' || id === 'manager') return 'admin';
    
    // Hash the ID to pick a cert index (1-50)
    const hash = crypto.createHash('sha256').update(id).digest('hex');
    const index = (parseInt(hash.slice(0, 8), 16) % 50) + 1;
    return `user${index}`;
}

// ── GATEWAY HELPERS ───────────────────────────────────────────────────────────

async function getGateway(userId) {
    const certIdentity = mintUserCertificate(userId);
    const wallet = await Wallets.newFileSystemWallet(WALLET_PATH);
    
    const identity = await wallet.get(certIdentity);
    if (!identity) {
        console.warn(`[Identity] ${certIdentity} not in wallet. Falling back to user1.`);
        const fallback = await wallet.get('user1');
        if (!fallback) throw new Error("Wallet is EMPTY. Run import_wallet.sh first.");
    }

    const gateway = new Gateway();
    await gateway.connect(ccp, {
        wallet,
        identity: identity ? certIdentity : 'user1',
        discovery: { enabled: true, asLocalhost: false },
        eventHandlerOptions: { strategy: EventStrategies.MSPID_SCOPE_ALLFORTX },
        queryHandlerOptions: {
            strategy: (network) => new SingleQueryHandler(network.getChannel().client.getEndorsers())
        }
    });
    return gateway;
}

/**
 * Routing logic based on Chaincode functions 
 * (Distributes load across PC1, PC2, PC3 in the Swarm)
 */
function autoRoute(fnName) {
    const lower = fnName.toLowerCase();
    if (lower.includes('billing') || lower.includes('payment')) return 'billing';
    if (lower.includes('inventory') || lower.includes('stock')) return 'inventory';
    if (lower.includes('management') || lower.includes('register')) return 'manager';
    return 'default';
}

function getContractAndPeer(network, moduleHint = 'default') {
    const contract = network.getContract(FABRIC_CHAINCODE_NAME);
    const endorsers = network.getChannel().getEndorsers();
    
    if (!endorsers || endorsers.length === 0) {
        throw new Error('No endorsers found on the channel. Check if peers are joined.');
    }

    // Distribute based on module role
    // PC1 = peer0, PC2 = peer1, PC3 = peer2
    let peer;
    try {
        if (moduleHint === 'billing' && endorsers.length > 1) {
            // Prefer Peer1 (PC2) for billing
            peer = endorsers.find(p => p.endpoint.url.includes(':8051')) || endorsers[1] || endorsers[0];
        } else if (moduleHint === 'inventory' && endorsers.length > 2) {
            // Prefer Peer2 (PC3) for inventory
            peer = endorsers.find(p => p.endpoint.url.includes(':8052') || p.endpoint.url.includes(':9051')) || endorsers[2] || endorsers[0];
        } else {
            // Default to Peer0 (PC1)
            peer = endorsers[0];
        }
    } catch (e) {
        peer = endorsers[0];
    }
    
    return { contract, peer };
}

// ── IPFS HELPERS ──────────────────────────────────────────────────────────────
async function ipfsAdd(jsonData) {
    const form = new FormData();
    form.append('file', Buffer.from(JSON.stringify(jsonData)));
    const response = await axios.post(`${IPFS_API}/add`, form, { headers: form.getHeaders() });
    return response.data.Hash;
}

async function ipfsCat(hash) {
    const response = await axios.post(`${IPFS_API}/cat?arg=${hash}`);
    return typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
}

/**
 * Check if IPFS daemon is reachable.
 * Returns 'UP' or 'DOWN'.
 */
async function checkIpfsStatus() {
    try {
        const response = await axios.post(`${IPFS_API}/id`, null, { timeout: 3000 });
        if (response.data && response.data.ID) return 'UP';
        return 'DOWN';
    } catch (e) {
        return 'DOWN';
    }
}

// ── CHAINCODE AGNOSTIC HELPERS ───────────────────────────────────────────────

async function invokeChaincode(user, fnName, ...args) {
    const channelName = (String(args[0]).endsWith('-channel')) ? args.shift() : FABRIC_CHANNEL_NAME;
    const gateway = await getGateway(user);
    try {
        const network = await gateway.getNetwork(channelName);
        const { contract, peer } = getContractAndPeer(network, autoRoute(fnName));
        const tx = contract.createTransaction(fnName).setEndorsingPeers([peer]);
        const result = await tx.submit(...args);
        return JSON.parse(result.toString());
    } finally {
        gateway.disconnect();
    }
}

async function queryChaincode(user, fnName, ...args) {
    const channelName = (String(args[0]).endsWith('-channel')) ? args.shift() : FABRIC_CHANNEL_NAME;
    const gateway = await getGateway(user);
    try {
        const network = await gateway.getNetwork(channelName);
        const { contract, peer } = getContractAndPeer(network, autoRoute(fnName));
        const result = await contract.evaluateTransaction(fnName, ...args);
        return JSON.parse(result.toString());
    } finally {
        gateway.disconnect();
    }
}

// ── API ROUTES ───────────────────────────────────────────────────────────────

// Middleware
const requireBody = (...fields) => (req, res, next) => {
    for (const f of fields) if (!req.body[f]) return res.status(400).json({ error: `Missing ${f}` });
    next();
};

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'UP', swarm: true, pc: PC1_IP }));

// ── IPFS Status (Live Check) ───────────────────────────────────────────────────
app.get('/api/ipfs-status', async (req, res) => {
    try {
        const status = await checkIpfsStatus();
        res.json({ status });
    } catch (err) {
        res.json({ status: 'DOWN', error: err.message });
    }
});

// ── Register Employee ─────────────────────────────────────────────────────────
/**
 * POST /api/register-employee
 * Dynamic employee registration with ledger-backed state
 */
app.post('/api/register-employee', requireBody('userId', 'role', 'name'), async (req, res) => {
    try {
        const { user = 'manager', userId, role, name, metadata = {} } = req.body;
        // Map the provided userId (e.g. inv_bob) to its deterministic physical ID (user21)
        const certIdentity = mintUserCertificate(userId);
        // Register using the physical ID as the primary key for the ledger record
        const result = await invokeChaincode(user, 'registerEmployee', certIdentity, role, name, JSON.stringify(metadata));
        res.status(200).json({ success: true, employee: result, certMapped: certIdentity });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── Create Patient ────────────────────────────────────────────────────────────
/**
 * POST /api/create-patient
 */
app.post('/api/create-patient', requireBody('patientId', 'name', 'age'), async (req, res) => {
    try {
        const { user = DEFAULT_UPDATE_USER, patientId, name, age } = req.body;
        // Compute the cert alias for the patient so the chaincode can store the reverse-lookup
        const patientCertAlias = mintUserCertificate(patientId).replace('user', 'user');
        const result = await invokeChaincode(user, 'createPatient', patientId, name, String(age), patientCertAlias);
        res.status(200).json({ success: true, patient: result });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── Get Patient Profile ───────────────────────────────────────────────────────
/**
 * GET /api/patient/:id
 * Fetch patient profile from the ledger
 */
app.get('/api/patient/:id', async (req, res) => {
    try {
        const user = req.query.user || DEFAULT_QUERY_USER;
        const result = await queryChaincode(user, 'getPatientProfile', req.params.id);
        res.status(200).json(result);
    } catch (err) {
        if (err.message && err.message.includes('not found')) {
            res.status(404).json({ success: false, message: err.message });
        } else {
            res.status(500).json({ success: false, message: err.message });
        }
    }
});

// ── Get Patient Access List ───────────────────────────────────────────────────
/**
 * GET /api/patient/:id/access-list
 * Returns the list of identities that have been granted access by the patient
 */
app.get('/api/patient/:id/access-list', async (req, res) => {
    try {
        const user = req.query.user || req.params.id;
        const result = await queryChaincode(user, 'getAccessList', req.params.id);
        res.status(200).json(result);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── Billing (main route + /api/prescription alias) ───────────────────────────
/**
 * POST /api/billing
 * Production billing flow: Template -> IPFS -> Ledger -> Inventory Deduction
 */
async function processBilling(req, res) {
    try {
        const {
            user = DEFAULT_QUERY_USER,
            patientId,
            medicineList,
            amount,
            name: templateName = 'Custom Prescription',
            templateId = 'custom',
            billId = `BILL_${Date.now()}`
        } = req.body;

        if (!patientId) return res.status(400).json({ error: 'Missing patientId' });
        if (!medicineList || medicineList.length === 0) return res.status(400).json({ error: 'Missing medicineList' });

        // Compute amount if not provided (sum up quantities as units)
        const resolvedAmount = amount || medicineList.reduce((sum, m) => sum + (parseFloat(m.quantity) || 1), 0);

        // 1. Validate Patient Exists
        const exists = await queryChaincode(user, 'checkPatientExists', patientId);
        if (!exists) return res.status(404).json({ success: false, message: 'Patient not registered on the blockchain' });

        // 2. Upload full prescription document to IPFS
        const doc = {
            billId,
            patientId,
            templateName,
            templateId,
            medicineList,
            amount: resolvedAmount,
            issuedBy: user,
            issuedAt: new Date().toISOString(),
            org: "MedBlock Swarm Pharmacy",
            version: "2.0"
        };
        const ipfsHash = await ipfsAdd(doc);

        // 3. Commit to Blockchain
        const result = await invokeChaincode(
            user,
            'createBill',
            billId,
            patientId,
            user,
            String(resolvedAmount),
            JSON.stringify(medicineList),
            ipfsHash
        );

        // 4. Auto-deduct inventory if itemId is provided on any medicine
        const deductErrors = [];
        for (const med of medicineList) {
            if (med.itemId && med.quantity) {
                try {
                    await invokeChaincode(user, 'deductInventoryItem', med.itemId, String(med.quantity));
                } catch (e) {
                    deductErrors.push(`${med.name || med.itemId}: ${e.message}`);
                }
            }
        }

        res.status(200).json({
            success: true, billId, ipfsHash, tx: result,
            inventoryWarnings: deductErrors.length > 0 ? deductErrors : undefined
        });
    } catch (err) {
        console.error('[Billing Error]', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
}

app.post('/api/billing', processBilling);
// Alias — billing portal calls /api/prescription
app.post('/api/prescription', processBilling);

// ── Access Control ────────────────────────────────────────────────────────────
/**
 * POST /api/grant-access
 */
app.post('/api/grant-access', requireBody('requesterId'), async (req, res) => {
    try {
        const { user = DEFAULT_QUERY_USER, requesterId } = req.body;
        const result = await invokeChaincode(user, 'grantAccess', requesterId);
        res.status(200).json({ success: true, result });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * POST /api/revoke-access
 */
app.post('/api/revoke-access', requireBody('requesterId'), async (req, res) => {
    try {
        const { user = DEFAULT_QUERY_USER, requesterId } = req.body;
        const result = await invokeChaincode(user, 'revokeAccess', requesterId);
        res.status(200).json({ success: true, result });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── Patient Bills ─────────────────────────────────────────────────────────────
/**
 * GET /api/bills/patient/:id
 */
app.get('/api/bills/patient/:id', async (req, res) => {
    try {
        const user = req.query.user || DEFAULT_QUERY_USER;
        const result = await queryChaincode(user, 'getPatientBills', req.params.id);
        res.status(200).json(result);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── Global Audit (Manager Only) ───────────────────────────────────────────────
/**
 * GET /api/bills/audit
 */
app.get('/api/bills/audit', async (req, res) => {
    try {
        const user = req.query.user || 'manager';
        const result = await queryChaincode(user, 'getAllBills');
        res.status(200).json(result);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── Employees (Manager Only) ──────────────────────────────────────────────────
/**
 * GET /api/employees
 */
app.get('/api/employees', async (req, res) => {
    try {
        const user = req.query.user || 'manager';
        const result = await queryChaincode(user, 'getAllEmployees');
        res.status(200).json(result);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── Inventory ─────────────────────────────────────────────────────────────────

/**
 * GET /api/inventory
 * Returns all inventory items from the ledger.
 */
app.get('/api/inventory', async (req, res) => {
    try {
        const user = req.query.user || 'manager';
        const result = await queryChaincode(user, 'getAllInventory');
        res.status(200).json(result);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * POST /api/inventory
 * Add a new inventory item or restock an existing one.
 * Body: { user, itemId, name, quantity, price, unit }
 */
app.post('/api/inventory', requireBody('itemId', 'name', 'quantity'), async (req, res) => {
    try {
        const { user = 'manager', itemId, name, quantity, price = 0, unit = 'tablets' } = req.body;
        const result = await invokeChaincode(user, 'addInventoryItem', itemId, name, String(quantity), String(price), unit);
        res.status(200).json({ success: true, item: result });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * POST /api/inventory/deduct
 * Manually deduct items (for testing or corrections).
 * Body: { user, itemId, quantity }
 */
app.post('/api/inventory/deduct', requireBody('itemId', 'quantity'), async (req, res) => {
    try {
        const { user = 'manager', itemId, quantity } = req.body;
        const result = await invokeChaincode(user, 'deductInventoryItem', itemId, String(quantity));
        res.status(200).json({ success: true, item: result });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * GET /api/roles
 * Returns the pharmacy role taxonomy for reference.
 */
app.get('/api/roles', (req, res) => {
    res.json({
        roles: [
            { role: 'manager', description: 'Pharmacy administrator — registers staff, audits everything, manages inventory' },
            { role: 'billing', description: 'Pharmacist / billing officer — issues prescriptions, creates bills' },
            { role: 'inventory', description: 'Stock officer — manages medicine stock levels' },
            { role: 'patient', description: 'Self-governance only — view own records and manage access' }
        ],
        note: 'Doctors are at the hospital. Pharmacists fulfil prescriptions brought from hospital.'
    });
});

// ── Network Status ────────────────────────────────────────────────────────────
/**
 * GET /api/network-status
 */
app.get('/api/network-status', async (req, res) => {
    try {
        const results = { nodes: {}, ipfs: 'DOWN' };
        const { execSync } = require('child_process');

        // Live IPFS check
        results.ipfs = await checkIpfsStatus();

        // Helper: get block height of a peer service (discovers actual node dynamically)
        const HOSTNAME_SSH = {
            'ankit': null,                                    // local
            'rajput': `rajput_mt@100.83.121.98`,
            'ronit': `ronit@100.117.138.55`
        };

        const queryServiceHeight = (serviceName) => {
            try {
                // 1. Find which host the service is on
                const hostRaw = execSync(
                    `docker service ps ${serviceName} --format '{{.Node}}' --filter desired-state=running 2>/dev/null | head -1`,
                    { timeout: 5000 }
                ).toString().trim();
                
                // 2. Map hostname to SSH target
                let sshTarget = null;
                for (const [keyword, target] of Object.entries(HOSTNAME_SSH)) {
                    if (hostRaw.toLowerCase().includes(keyword)) { sshTarget = target; break; }
                }
                
                // 3. Build the command to run on the correct node
                const peerCmd = `docker exec -e CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/admin_msp \\$(docker ps -q -f name=${serviceName} | head -1) peer channel getinfo -c ${FABRIC_CHANNEL_NAME}`;
                
                let output;
                if (sshTarget) {
                    output = execSync(`ssh -o BatchMode=yes -o ConnectTimeout=5 ${sshTarget} "${peerCmd}"`, { timeout: 10000 }).toString();
                } else {
                    // Local: peer0 is on manager node
                    const containerId = execSync(`docker ps -q -f name=${serviceName}`, { timeout: 3000 }).toString().trim();
                    if (!containerId) return 'OFFLINE';
                    output = execSync(`docker exec -e CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/admin_msp ${containerId} peer channel getinfo -c ${FABRIC_CHANNEL_NAME}`, { timeout: 5000 }).toString();
                }
                
                const match = output.match(/"?height"?\s*[:=]\s*(\d+)/);
                return match ? parseInt(match[1]) : 'Unknown';
            } catch (e) { return 'OFFLINE'; }
        };

        results.nodes.peer0 = queryServiceHeight('ehrswarm-peer0_peer0');
        results.nodes.peer1 = queryServiceHeight('ehrswarm-peer1_peer1');
        results.nodes.peer2 = queryServiceHeight('ehrswarm-peer2_peer2');

        res.status(200).json(results);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── START ────────────────────────────────────────────────────────────────────
app.listen(PORT, HOST, () => {
    console.log(`MedBlock Swarm Backend v2.0 running on http://${HOST}:${PORT}`);
    console.log(`Wallet Path: ${WALLET_PATH}`);
    console.log(`Channel: ${FABRIC_CHANNEL_NAME} | Chaincode: ${FABRIC_CHAINCODE_NAME}`);
    console.log(`IPFS API: ${IPFS_API}`);
});
