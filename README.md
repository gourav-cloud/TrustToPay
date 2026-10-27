# TrustToPay

TrustToPay routes uncertain AI answers to human reviewers. Reviewer submissions are checked against evidence requirements before a reward is released.

It supports programming, crypto/blockchain, conceptual, and hardware questions. Payments are simulated by default; live payments are disabled, and PayPal Sandbox is the only supported PayPal mode.

## Run locally

**Requirements:** Node.js 20 or newer and npm.

From the project root, run setup once:

```bash
npm run setup
```

This installs dependencies, creates `.env`, prepares the SQLite database, and adds demo accounts. No AI or PayPal credentials are needed for local demo mode.

### Start both services together

```bash
npm run dev
```

### Or start them in separate terminals

Run each command from the project root and leave both terminals open:

```bash
# Terminal 1: backend API
npm run dev:api
```

```bash
# Terminal 2: frontend
npm run dev:web
```

Open the app at [http://localhost:5173](http://localhost:5173). The frontend proxies API requests to the backend.

| Service | URL |
| --- | --- |
| Web app | http://localhost:5173 |
| Backend health check | http://localhost:4000/health |
| API documentation | http://localhost:4000/api-docs |

Stop the services with `Ctrl+C`.

## Demo accounts

All demo accounts use the password `Demo1234!`.

| Role | Email |
| --- | --- |
| Requester | `agent@demo.trusttopay.dev` |
| Reviewer | `reviewer@demo.trusttopay.dev` |
| Reviewer | `reviewer2@demo.trusttopay.dev` |
| Admin | `admin@demo.trusttopay.dev` |

## Common commands

| Command | Purpose |
| --- | --- |
| `npm run setup` | Install and initialize the project |
| `npm run dev` | Run backend and frontend together |
| `npm run dev:api` | Run the backend only |
| `npm run dev:web` | Run the frontend only |
| `npm run build` | Build both apps |
| `npm test` | Run all tests |
| `npm run test:api` | Run backend tests |
| `npm run test:web` | Run frontend tests |

## Configuration

Setup creates `.env` from `.env.example`. The default configuration uses the deterministic demo AI engine and simulated payments. To use an OpenAI-compatible AI provider or PayPal Sandbox, update the relevant settings in `.env`. Never use live PayPal credentials; live payments are not supported.

## How it works

1. A requester submits a question and evidence.
2. The AI answers, asks for more information, or escalates the question.
3. A reviewer submits an answer with supporting evidence.
4. The backend verifies the submission. A passing review can receive a simulated or Sandbox reward.

## Tech stack

- **Frontend:** React, TypeScript, Vite
- **Backend:** Express, TypeScript
- **Database:** SQLite with Prisma
- **Tests:** Vitest, Supertest, Testing Library

## License

MIT — see [LICENSE](LICENSE).
