FROM node:24-alpine AS builder

WORKDIR /app/client

COPY client/package*.json ./
RUN npm ci

COPY client/ ./
COPY shared/ /app/shared/

ARG VITE_BASE_URL=/api/v1
ARG VITE_CLERK_PUBLISHABLE_KEY
ENV VITE_BASE_URL=$VITE_BASE_URL
ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY

RUN npm run build

FROM nginx:1.27-alpine AS production

COPY client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/client/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
