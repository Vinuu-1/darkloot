FROM node:22-alpine
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack prepare pnpm@11.25.0 --activate && pnpm install --prod --frozen-lockfile
COPY server.js schema.sql index.html logo.svg ./
COPY src ./src
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.js"]
