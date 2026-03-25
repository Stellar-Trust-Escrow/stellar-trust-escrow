# Common base for all stages
FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/
RUN npm ci

# Backend build stage
FROM base AS backend-builder
COPY backend/ ./backend/
# No build step usually for Express, but could run typescripts build if needed
# RUN cd backend && npm run build 

# Frontend build stage
FROM base AS frontend-builder
COPY frontend/ ./frontend/
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
RUN cd frontend && npm run build

# Final Backend Image
FROM node:20-alpine AS backend
WORKDIR /app
COPY --from=backend-builder /app/node_modules ./node_modules
COPY --from=backend-builder /app/backend ./backend
EXPOSE 4000
CMD ["node", "backend/server.js"]

# Final Frontend Image
FROM node:20-alpine AS frontend
WORKDIR /app
COPY --from=frontend-builder /app/frontend/.next ./frontend/.next
COPY --from=frontend-builder /app/frontend/public ./frontend/public
COPY --from=frontend-builder /app/node_modules ./node_modules
COPY --from=frontend-builder /app/frontend/package.json ./frontend/package.json
EXPOSE 3000
CMD ["npm", "start", "-w", "frontend"]

# Selective stage for CI/CD builds
FROM ${BUILD_TYPE:-backend} AS final
