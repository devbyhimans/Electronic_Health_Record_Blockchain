# Architecture And Scope

## Goal

Build a distributed Hyperledger Fabric network across three PCs using Docker Swarm and Tailscale, while keeping the current single-PC project working independently.

## Machine Roles

- PC1: Swarm manager, orderer, peer0, couchdb0, optional backend, optional frontend
- PC2: Swarm worker, peer1, couchdb1
- PC3: Swarm worker, peer2, couchdb2

## What Is Separate From The Local Project

- project folder: `/home/ankit/fabric-network/fabric-network-swarm`
- overlay network: `fabric-swarm-net`
- manager host ports:
  - orderer: `17050`
  - peer0: `17051`
  - CA: `17054`
  - backend: `4100`
  - frontend: `5174`
- app wallet, logs, runtime files, and future stack names

## Delivery Strategy

Phase 1:
- make Swarm network healthy
- deploy orderer and peers
- create channel and join peers
- deploy chaincode
- test with CLI first

Phase 2:
- connect backend to Swarm peer0
- run frontend against the Swarm backend

Phase 3:
- harden recovery flow
- document every machine command

## Design Decisions

- keep a single organization with three peers first
- keep IPFS single-node on PC1 first unless distribution is required later
- keep local project unchanged
- build everything in this new Swarm workspace only
