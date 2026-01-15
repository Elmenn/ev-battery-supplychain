# frontend/Dockerfile

# 1. Build stage: use Node to build the React app
FROM node:18-alpine AS build

# Create app directory
WORKDIR /app

# Install build tools for native modules (needed on arm64 / Apple Silicon)
RUN apk add --no-cache python3 make g++

# Install dependencies (use Docker cache by copying only package files first)
COPY package*.json ./
RUN npm install

# Copy the rest of the frontend source (including .env if it exists)
# Note: .env file will be automatically used by react-scripts during build
COPY . .

# Build production bundle
# React apps read environment variables from .env file at build time
# Make sure to create frontend/.env from frontend/.env.sepolia.example before building
RUN npm run build

# 2. Runtime stage: serve the built app with a simple static server
FROM node:18-alpine AS runtime

WORKDIR /app

# Copy the build output from the previous stage
COPY --from=build /app/build ./build

# Install a static file server
RUN npm install -g serve

# The app will run on port 3000 inside the container
EXPOSE 3000

# Start the server
CMD ["serve", "-s", "build", "-l", "3000"]
