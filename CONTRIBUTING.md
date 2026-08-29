# Contributing to the EHR Blockchain System

We welcome contributions! This project uses a standard Git workflow. Please follow these guidelines to keep the codebase clean and maintainable.

## Branch Naming Convention

Always create a branch from `develop` for your work. Name your branch according to the organization or module you are working on, followed by a short description:

`<org>-<short-desc>`

**Examples:**
- `hospital-fix-registration`
- `pharmacy-add-inventory-ui`
- `digilocker-chaincode-init`

## Pull Request Process

1. **Fork the Repository:** Create your own fork of this repository to your personal or group GitHub account.
2. **Branch from `develop`:** Make sure your `develop` branch is up to date, then create your feature branch from it.
3. **Commit your changes:** Keep commits focused and provide clear commit messages.
4. **Push and create a PR:** Push your branch to your fork and create a Pull Request targeting the `develop` branch of the main repository.
5. **Review:** At least 1 review is required before merging. Do not merge your own PR without a review from a peer.

## Local Setup

The repository has been restructured so that each organization can be run locally in a single-machine mode. 

### Setting up Environment Variables

Before running any scripts, you must set up your local `.env` files based on the provided templates:
1. Copy `orgs/pharmacy/fabric-network-swarm/deploy.env.example` to `deploy.env` and update it if necessary.
2. Copy `orgs/lab/EHR-LABORG-main/env/network.env.example` to `network.env` and add your Gemini API key and any other local configuration.
3. (Do this for any other `.env.example` files you encounter).

**Important:** Never commit a real key or secret to the repository!

For detailed startup instructions for each organization, see `docs/setup-guide.md` (coming soon).
