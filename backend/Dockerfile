FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./

FROM base AS deps
RUN npm ci

FROM deps AS dev
COPY . .
EXPOSE 3001
CMD ["npm", "run", "start:dev"]

FROM deps AS build
COPY . .
RUN npm run build

FROM base AS prod-deps
RUN npm ci --omit=dev

FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package*.json ./
EXPOSE 3001
CMD ["node", "dist/main"]
