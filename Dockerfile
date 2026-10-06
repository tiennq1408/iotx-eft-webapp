FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM deps AS build
# NEXT_PUBLIC_* đi vào mã chạy trong trình duyệt nên bắt buộc có mặt lúc build.
# Đổi các giá trị này thì phải build lại ảnh, không đổi được lúc chạy.
ARG NEXT_PUBLIC_IOTX_MODE=iotx
ARG NEXT_PUBLIC_IOTX_API_BASE=/v1
ARG NEXT_PUBLIC_IOTX_TENANT=livotec
ARG NEXT_PUBLIC_IOTX_LANG=vi
ENV NEXT_PUBLIC_IOTX_MODE=$NEXT_PUBLIC_IOTX_MODE \
    NEXT_PUBLIC_IOTX_API_BASE=$NEXT_PUBLIC_IOTX_API_BASE \
    NEXT_PUBLIC_IOTX_TENANT=$NEXT_PUBLIC_IOTX_TENANT \
    NEXT_PUBLIC_IOTX_LANG=$NEXT_PUBLIC_IOTX_LANG
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# Địa chỉ IBS đọc ở từng request trong app/v1/[...path]/route.ts.
# Đổi môi trường bằng: docker run -e IOTX_API_UPSTREAM=https://api.staging.example ...
ENV IOTX_API_UPSTREAM=https://api.dev.happibot.net
# output "standalone" đã gói sẵn phụ thuộc cần thiết — không chạy npm ci lần hai.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
