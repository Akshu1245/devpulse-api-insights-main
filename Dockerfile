# Use Node base image
FROM node:20

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy project files
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build frontend (Vite)
RUN npm run build

# Expose port
EXPOSE 5000

# Start server (uses tsx for TypeScript)
CMD ["npx", "tsx", "server/server.ts"]
