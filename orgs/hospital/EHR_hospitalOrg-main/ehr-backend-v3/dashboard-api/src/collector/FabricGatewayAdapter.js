'use strict';

const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const grpc = require('@grpc/grpc-js');
const { common } = require('@hyperledger/fabric-protos');
const { connect, hash, signers } = require('@hyperledger/fabric-gateway');

async function connectFabricGateway(config, options = {}) {
  const required = [config.endpoint, config.hostAlias, config.mspId,
    config.tlsRootCertPath, config.tlsClientCertPath, config.tlsClientKeyPath,
    config.identityCertPath, config.identityKeyPath];
  if (required.some((value) => !value)) {
    throw new Error('Dashboard observer identity or Fabric TLS configuration is incomplete');
  }

  const [tlsRoot, tlsCertificate, tlsPrivateKeyPem, certificate, privateKeyPem] = await Promise.all([
    fs.readFile(config.tlsRootCertPath),
    fs.readFile(config.tlsClientCertPath),
    fs.readFile(config.tlsClientKeyPath),
    fs.readFile(config.identityCertPath),
    fs.readFile(config.identityKeyPath),
  ]);
  const privateKey = crypto.createPrivateKey(privateKeyPem);
  const client = new grpc.Client(
    config.endpoint,
    grpc.credentials.createSsl(tlsRoot, tlsPrivateKeyPem, tlsCertificate),
    { 'grpc.ssl_target_name_override': config.hostAlias },
  );
  const timeoutMs = options.timeoutMs || 5000;
  const gateway = connect({
    client,
    identity: { mspId: config.mspId, credentials: certificate },
    signer: signers.newPrivateKeySigner(privateKey),
    hash: hash.sha256,
    evaluateOptions: () => ({ deadline: Date.now() + timeoutMs }),
    blockEventsOptions: () => ({ deadline: Date.now() + timeoutMs }),
  });

  try {
    await new Promise((resolve, reject) => {
      client.waitForReady(Date.now() + timeoutMs, (error) => error ? reject(error) : resolve());
    });
  } catch (error) {
    gateway.close();
    client.close();
    throw error;
  }

  const network = gateway.getNetwork(config.channel);
  return {
    async getCurrentHeight() {
      const bytes = await network.getContract('qscc').evaluateTransaction('GetChainInfo', config.channel);
      const info = common.BlockchainInfo.deserializeBinary(bytes);
      return BigInt(info.getHeight().toString());
    },
    getBlockEvents(startBlock) {
      return network.getBlockEvents({ startBlock });
    },
    close() {
      gateway.close();
      client.close();
    },
  };
}

module.exports = { connectFabricGateway };
