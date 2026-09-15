FROM node:22-alpine

WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json* bun.lock* ./

# Install all dependencies (including devDependencies needed for build)
RUN npm install

# Copy application code
COPY . .

# Build the frontend and backend
RUN npm run build

# Expose the port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Start the server
CMD ["npm", "start"]
