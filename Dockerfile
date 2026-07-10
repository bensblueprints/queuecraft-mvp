FROM node:20-alpine AS build
# py3-setuptools provides the distutils shim node-gyp needs -- Alpine's
# python3 is 3.12+, which dropped distutils from the standard library, and
# without this a native module build (better-sqlite3) fails at gyp's
# configure step. better-sqlite3 has no prebuilt binary for musl/Alpine on
# this Node version, so it always falls back to compiling from source here.
RUN apk add --no-cache python3 py3-setuptools make g++
WORKDIR /app
# Electron binary is never needed inside Docker
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
COPY package*.json ./
COPY scripts ./scripts
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:20-alpine
# Same fix as the build stage: this runtime stage reinstalls production
# deps fresh (npm ci --omit=dev), which recompiles better-sqlite3 here too
# -- needs the same toolchain, not just the build stage above.
RUN apk add --no-cache python3 py3-setuptools make g++
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
