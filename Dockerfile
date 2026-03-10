FROM node:22-alpine

WORKDIR /app

# Copy root workspace files
COPY package.json package-lock.json* ./

# Copy workspace package.json files
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

# Install all dependencies
RUN npm install

# Copy source code
COPY . .

# Build web frontend then API
RUN npm run build -w apps/web && npm run build -w apps/api

EXPOSE 8000

ENV NODE_ENV=production

CMD ["node", "apps/api/dist/index.js"]
