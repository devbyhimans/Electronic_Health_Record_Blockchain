'use strict';

const { Wallets } = require('fabric-network');
const FabricCAServices = require('fabric-ca-client');
const fs = require('fs');
const path = require('path');

async function main() {
    try {
        const args = process.argv.slice(2);
        if (args.length < 2) {
            console.log('Usage: node registerUser.js <username> <role (employee|manager)>');
            process.exit(1);
        }
        const [username, role] = args;
        const enrollmentSecret = `${username}pw`;

        const ccpPath = path.resolve(__dirname, 'connection.json');
        const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

        const caURL = ccp.certificateAuthorities['ca.org1.example.com'].url;
        const ca = new FabricCAServices(caURL);

        const walletPath = path.join(process.cwd(), 'wallet');
        const wallet = await Wallets.newFileSystemWallet(walletPath);

        const userIdentity = await wallet.get(username);
        if (userIdentity) {
            console.log(`An identity for the user "${username}" already exists in the wallet`);
            return;
        }

        const adminIdentity = await wallet.get('admin');
        if (!adminIdentity) {
            console.log('An identity for the admin user does not exist in the wallet. Run enrollAdmin.js first.');
            return;
        }

        const provider = wallet.getProviderRegistry().getProvider(adminIdentity.type);
        const adminUser = await provider.getUserContext(adminIdentity, 'admin');

        let secret = enrollmentSecret;
        try {
            secret = await ca.register({
                affiliation: 'org1.department1',
                enrollmentID: username,
                enrollmentSecret,
                role: 'client',
                attrs: [{ name: 'role', value: role, ecert: true }]
            }, adminUser);
        } catch (error) {
            const alreadyRegistered = Array.isArray(error?.responses) && error.responses.some((response) =>
                response?.code === 74 || String(response?.message || '').includes('already registered')
            );
            if (!alreadyRegistered) {
                throw error;
            }
            console.log(`User "${username}" already registered with CA, retrying enrollment`);
        }

        const enrollment = await ca.enroll({
            enrollmentID: username,
            enrollmentSecret: secret
        });

        const x509Identity = {
            credentials: {
                certificate: enrollment.certificate,
                privateKey: enrollment.key.toBytes(),
            },
            mspId: 'Org1MSP',
            type: 'X.509',
        };
        await wallet.put(username, x509Identity);
        console.log(`Successfully registered and enrolled user "${username}" with role "${role}"`);

    } catch (error) {
        console.error(`Failed to register user: ${error}`);
        process.exit(1);
    }
}

main();
