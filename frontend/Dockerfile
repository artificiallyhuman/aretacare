FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

# Change ownership to the built-in 'node' user (UID 1000, already exists in node:alpine)
RUN chown -R node:node /app

# Switch to non-root user
USER node

EXPOSE 3000

CMD ["npm", "run", "dev"]
