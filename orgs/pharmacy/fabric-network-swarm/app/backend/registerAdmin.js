'use strict';

const { Wallets } = require('fabric-network');
const fs = require('fs');
const path = require('path');

const mspPath = '/home/ankit/fabric-network/crypto-config/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp';
const certPath = path.join(mspPath, 'signcerts', 'Admin@org1.example.com-cert.pem');
const keyDirectoryPath = path.join(mspPath, 'keystore');

async function main() {
    try {
        const walletPath = path.join(process.cwd(), 'wallet');
        const wallet = await Wallets.newFileSystemWallet(walletPath);
        
        // Read certificate and key
        const certificate = fs.readFileSync(certPath).toString();
        const files = fs.readdirSync(keyDirectoryPath);
        const keyPath = path.join(keyDirectoryPath, files[0]);
        const privateKey = fs.readFileSync(keyPath).toString();
        
        const identity = {
            credentials: {
                certificate,
                privateKey,
            },
            mspId: 'Org1MSP',
            type: 'X.509',
        };
        
        await wallet.put('admin', identity);
        console.log('Successfully imported admin identity into the wallet');
        
    } catch (error) {
        console.error(`Failed to register admin user: ${error}`);
        process.exit(1);
    }
}

main();
