# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim
RUN --mount=type=secret,id=proxy_bundle \
    if [ -f /run/secrets/proxy_bundle ]; then export CURL_CA_BUNDLE=/run/secrets/proxy_bundle SSL_CERT_FILE=/run/secrets/proxy_bundle; fi; \
    apt-get -o Acquire::https::CaInfo="${SSL_CERT_FILE:-/etc/ssl/certs/ca-certificates.crt}" update && apt-get -o Acquire::https::CaInfo="${SSL_CERT_FILE:-/etc/ssl/certs/ca-certificates.crt}" install -y --no-install-recommends chromium ca-certificates libnss3-tools && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --chmod=0644 package.json package-lock.json ./
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci --omit=dev --strict-ssl=true
COPY --chmod=0644 *.js ./
COPY --chmod=0644 entrypoint.sh ./
ENV NODE_ENV=production PORT=8080 CHROMIUM_PATH=/usr/bin/chromium
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
ENTRYPOINT ["/bin/sh", "/app/entrypoint.sh"]
CMD ["node", "server.js"]
