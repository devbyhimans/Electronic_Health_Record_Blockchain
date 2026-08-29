'use strict';

const { Wallets } = require('fabric-network');
const fs = require('fs');
const path = require('path');

async function main() {
    try {
        const walletPath = path.join(process.cwd(), 'wallet');
        const wallet = await Wallets.newFileSystemWallet(walletPath);

        const org1Path = path.resolve(__dirname, '..', '..', 'crypto-config', 'peerOrganizations', 'org1.example.com');
        const usersPath = path.join(org1Path, 'users');

        const getPrivateKey = (keyDir) => {
            const files = fs.readdirSync(keyDir).filter((file) => file.endsWith('_sk') || file === 'priv_sk');
            if (files.length === 0) throw new Error(`No private key in ${keyDir}`);
            return fs.readFileSync(path.join(keyDir, files[0])).toString();
        };

        const importIdentity = async (userName, mspPath) => {
            try {
                const certPath = path.join(mspPath, 'signcerts', fs.readdirSync(path.join(mspPath, 'signcerts'))[0]);
                const keyDir = path.join(mspPath, 'keystore');
                
                const cert = fs.readFileSync(certPath).toString();
                const key = getPrivateKey(keyDir);
                
                const identity = {
                    credentials: { certificate: cert, privateKey: key },
                    mspId: 'Org1MSP',
                    type: 'X.509',
                };
                
                // Map "Admin@org1.example.com" -> "admin", "User1@org1.example.com" -> "user1"
                const alias = userName.split('@')[0].toLowerCase();
                await wallet.put(alias, identity);
                console.log(`[Import] ${alias} success`);
            } catch (e) {
                console.error(`[Import] Failed for ${userName}:`, e.message);
            }
        };

        const users = fs.readdirSync(usersPath);
        for (const userDir of users) {
            await importIdentity(userDir, path.join(usersPath, userDir, 'msp'));
        }

        console.log('--- WALLET RECONSTRUCTION COMPLETE ---');
    } catch (error) {
        console.error(`Failed to import identities: ${error}`);
    }
}

main();
