FROM node:22-bookworm-slim

WORKDIR /app

# better-sqlite3 may need native build tooling depending on platform/prebuild availability.
# Use Debian/glibc + Node 22 to match its supported engine range and avoid Alpine/musl issues.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ wget \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .

RUN mkdir -p /app/data

EXPOSE 5000

CMD ["npm", "start"]
