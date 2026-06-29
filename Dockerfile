# Multi-stage build. Build context is the repository root so the prod stage can
# bake in db/ (schema, migrations, seed) and scripts/ — see docker-compose*.yml
# and .github/workflows/docker-publish.yml for how each stage is selected.

# ── base: shared dependency layer ────────────────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app
COPY web/package.json web/package-lock.json ./

# ── dev: full deps + nodemon. Source is bind-mounted at runtime (docker-compose.yml). ──
FROM base AS dev
ENV NODE_ENV=development
RUN npm ci
COPY web/ ./
EXPOSE 3000
CMD ["npx", "nodemon", "app.js"]

# ── prod: lean, self-contained image. App + db seed/migrations + scripts are baked
#    in, so it boots with no host bind-mounts (Docker Hub image / Kubernetes). ──
FROM base AS prod
ENV NODE_ENV=production
RUN npm ci --omit=dev
COPY web/ ./
COPY db/ ./db/
COPY scripts/ ./scripts/
EXPOSE 3000
CMD ["node", "app.js"]
