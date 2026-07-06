FROM node:20-alpine AS build
WORKDIR /app
# Electron binary is never needed inside Docker
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
COPY package*.json ./
COPY scripts ./scripts
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY scripts ./scripts
RUN npm ci --omit=dev --no-audit --no-fund
COPY server ./server
COPY --from=build /app/dist ./dist
VOLUME /app/data
EXPOSE 5324
CMD ["node", "server/index.js"]
