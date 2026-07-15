# ---- Build Stage ----
FROM node:22-alpine AS build

WORKDIR /app

RUN apk add --no-cache python3 make g++ \
    cairo-dev pango-dev jpeg-dev giflib-dev librsvg-dev

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- Production Stage ----
FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache \
    cairo pango jpeg giflib librsvg

# Copy compiled better-sqlite3 + node_modules
COPY --from=build /app/node_modules ./node_modules

COPY server.js ./
COPY middleware/ ./middleware/
COPY routes/ ./routes/
COPY services/ ./services/
COPY db/ ./db/
COPY admin/ ./admin/
COPY public/ ./public/

RUN mkdir -p uploads

EXPOSE 3000

CMD ["node", "server.js"]
