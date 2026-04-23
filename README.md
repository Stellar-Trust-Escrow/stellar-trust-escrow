# 🌟 StellarTrustEscrow

> A decentralized, milestone-based escrow platform with an on-chain reputation system — built on the Stellar blockchain using Soroban smart contracts.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Contributors Welcome](https://img.shields.io/badge/contributors-welcome-brightgreen)](CONTRIBUTING.md)
[![Built on Stellar](https://img.shields.io/badge/built%20on-Stellar-blueviolet)](https://stellar.org)
[![Soroban](https://img.shields.io/badge/Soroban-Smart%20Contracts-orange)](https://soroban.stellar.org)

---

## 📖 Overview

StellarTrustEscrow allows clients and freelancers to create trustless payment agreements secured by Soroban smart contracts. Funds are locked on-chain and released milestone by milestone — no intermediaries, no trust required.

Every completed milestone builds an immutable, on-chain **reputation score** for freelancers and clients, creating a trustworthy track record that persists across all future engagements.

---

## ✨ Features

| Feature                         | Status         |
| ------------------------------- | -------------- |
| Milestone-based escrow contract | 🚧 In Progress |
| On-chain reputation system      | 🚧 In Progress |
| Dispute resolution mechanism    | 🚧 In Progress |
| REST API + event indexer        | 🚧 In Progress |
| Next.js dashboard               | 🚧 In Progress |
| Wallet connection (Freighter)   | 🚧 In Progress |
| Public escrow explorer          | 🚧 In Progress |

> This project is actively seeking contributors! See [CONTRIBUTING.md](CONTRIBUTING.md) and the [Issues](../../issues) tab.

---

## 🏗️ Tech Stack

| Layer           | Technology                  |
| --------------- | --------------------------- |
| Smart Contracts | Rust + Soroban SDK          |
| Backend         | Node.js + Express           |
| Database        | PostgreSQL + Prisma         |
| Frontend        | Next.js 14 + Tailwind CSS   |
| Blockchain      | Stellar (Testnet / Mainnet) |
| Wallet          | Freighter Browser Extension |

---

## 🔄 How It Works

```
Client                Contract              Freelancer
  │                      │                      │
  ├─── create_escrow() ──►│                      │
  │    (funds locked)     │                      │
  │                       │◄── add_milestone() ──┤
  │                       │                      │
  │◄── milestone done ────┤─── notify client ────┤
  │                       │                      │
  ├─── approve_milestone()►│                      │
  │                       ├─── release_funds() ──►│
  │                       │    (partial payout)   │
  │                       │                       │
  │              [dispute raised]                 │
  │                       │                       │
  ├─── raise_dispute() ───►│◄── raise_dispute() ──┤
  │                       │                       │
  │            [arbiter resolves]                 │
  │                       ├─── resolve_dispute() ─►│
  │                       │                       │
  └── reputation updated ─┴── reputation updated ─┘
```

---

## 🚀 Quick Start

### Prerequisites

- Node.js >= 18
- Rust >= 1.74
- Soroban CLI >= 21.0.0
- PostgreSQL >= 14
- [Freighter Wallet](https://www.freighter.app/) (browser extension)

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/stellar-trust-escrow
cd stellar-trust-escrow
```

### 2. Install Dependencies

```bash
# Backend
cd backend && npm install

# Frontend
cd ../frontend && npm install
```

### 3. Set Up Environment Variables

```bash
# Backend
cp backend/.env.example backend/.env
# Edit backend/.env with your database URL, Stellar keys, etc.

# Frontend
cp frontend/.env.example frontend/.env.local
# Edit with your API URL and Stellar network config
```

### 4. Set Up the Database

```bash
cd backend
npx prisma migrate dev
npx prisma generate
```

### 5. Build the Smart Contract

```bash
cd contracts/escrow_contract
cargo build --release --target wasm32-unknown-unknown
```

### 6. Run the Development Server

```bash
# Terminal 1 — Backend
cd backend && npm run dev

# Terminal 2 — Frontend
cd frontend && npm run dev
```

Visit `http://localhost:3000` to see the app.

---

## 📁 Project Structure

```
stellar-trust-escrow/
├── contracts/
│   └── escrow_contract/       # Soroban smart contract (Rust)
├── backend/
│   ├── api/
│   │   ├── controllers/       # Route handler logic
│   │   └── routes/            # Express route definitions
│   ├── services/              # Business logic & indexers
│   └── database/              # Prisma models & migrations
├── frontend/
│   ├── app/                   # Next.js 14 App Router pages
│   └── components/            # Reusable React components
├── docs/                      # Architecture & guides
├── scripts/                   # Deployment & utility scripts
├── README.md
├── CONTRIBUTING.md
└── ARCHITECTURE.md
```

---

## 🤝 Contributing

We welcome contributions of all kinds! This repository is designed to be beginner-friendly with clearly scoped issues.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide, or jump straight to [open issues](../../issues).

---

## 🔒 Security

- **Security Model**: [`docs/SECURITY.md`](docs/SECURITY.md)
- **Privacy Policy**: [`docs/PRIVACY.md`](docs/PRIVACY.md)
- **Bug Bounty**: [`docs/BUG_BOUNTY.md`](docs/BUG_BOUNTY.md)

Report vulnerabilities to security@stellartrustescrow.example.com.

---

## 📄 License

MIT — see [LICENSE](LICENSE).
