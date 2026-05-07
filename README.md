# Ramex-Store

Arabic-first fabric retail ERP — Express + React + PostgreSQL. POS, per-roll inventory, factory shipment workflow, multi-payment, Owner dashboard APIs.

See `CORE_PLAN.md` for the full plan and `CLAUDE.md` for AI agent context.

## Quick start

```bash
npm install
cp .env.example .env  # fill in DB creds
npm run db:migrate
npm run db:seed
npm run dev
```
