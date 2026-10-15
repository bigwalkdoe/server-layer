# The service uses only the Node standard library, so there is nothing to
# install and this image builds with no network access.
FROM node:24-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY --chown=node:node package.json ./
COPY --chown=node:node server.js ./
COPY --chown=node:node lib ./lib

# Drop root. Port 3000 is unprivileged, so no capabilities are needed.
USER node

EXPOSE 3000

CMD ["node", "server.js"]
