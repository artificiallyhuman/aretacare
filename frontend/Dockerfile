FROM node:18-alpine

WORKDIR /app

# Skip Puppeteer's bundled Chromium download.
# Prerendering only runs during production `vite build`, not `vite dev`, and
# Puppeteer's Chromium isn't compatible with Alpine's musl libc anyway.
ENV PUPPETEER_SKIP_DOWNLOAD=true

COPY package*.json ./

RUN npm install

COPY . .

# Change ownership to the built-in 'node' user (UID 1000, already exists in node:alpine)
RUN chown -R node:node /app

# Switch to non-root user
USER node

EXPOSE 3000

CMD ["npm", "run", "dev"]
