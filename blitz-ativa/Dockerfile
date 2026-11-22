FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY worker/urls.js ./worker/urls.js
COPY firebase-applet-config.json ./firebase-applet-config.json
COPY blitz-ativa ./blitz-ativa
RUN mkdir -p /var/data && chown -R node:node /var/data
ENV NODE_ENV=production BLITZ_ATIVA_HOST=0.0.0.0 BLITZ_ATIVA_DB=/var/data/blitz.sqlite
USER node
EXPOSE 9090
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||9090)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "blitz-ativa/server.js"]
