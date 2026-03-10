FROM node:22-alpine

WORKDIR /app

# Copy package files first (for layer caching)
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

# Install all workspace dependencies (clean Alpine binaries)
RUN npm install

# Copy source code (node_modules excluded via .dockerignore)
COPY . .

# Build: web frontend first, then API
RUN npm run build -w apps/web && npm run build -w apps/api

EXPOSE 8000

ENV NODE_ENV=production

CMD ["node", "apps/api/dist/index.js"]
