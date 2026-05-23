# Ramex Store — Codex Memory

This project is built phase-by-phase per `CORE_PLAN.md`. Always read `CORE_PLAN.md` before doing any work. Each phase has its own prompt file (PHASE_N_*.md) that lists scope deltas; the master plan is the contract.

Stack: Express.js + TypeScript + PostgreSQL (Knex) backend; React + Vite + TypeScript + Tailwind + shadcn/ui frontend. Single repo monorepo, Express serves built React static files. Hostinger VPS deployment.

Hard rules:
- Arabic-only UI, RTL, EGP, Africa/Cairo timezone, Western digits
- Egyptian phone format only: `01[0125]XXXXXXXX`
- Audit log on every sensitive write
- Online-only, concurrent sessions blocked, no customer deletion
- Each phase: build passes, migrations apply + rollback, commit to main
