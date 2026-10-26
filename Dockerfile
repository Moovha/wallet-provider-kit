FROM node:26.12.1-bookworm-slim@sha256:28147155d47dc31abe0a46e0d12b59b2fb3d0a2dcc5dc65fce76a074180b16fe AS build
WORKDIR /app
RUN npm install --global npm@11.11.1 --ignore-scripts
COPY package.json package-lock.json .npmrc ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
COPY scripts/clean-build.mjs scripts/copy-management-assets.mjs ./scripts/
COPY spec/provider-config.schema.json ./spec/
RUN npm run build
RUN npm prune --omit=dev --ignore-scripts
COPY LICENSE NOTICE ./
COPY docs/provider.config.safe.example.json ./docs/provider.config.safe.example.json
RUN chmod -R a+rX /app/dist
RUN chmod 0644 /app/package.json /app/LICENSE /app/NOTICE \
    /app/spec/provider-config.schema.json /app/docs/provider.config.safe.example.json
RUN mkdir -p /runtime-libs/var/lib/dpkg/status.d /runtime-libs/usr/share/doc/libatomic1 \
    && cp --parents /usr/lib/*-linux-gnu/libatomic.so.1 /runtime-libs/ \
    && dpkg-query --status libatomic1 > /runtime-libs/var/lib/dpkg/status.d/libatomic1 \
    && cp /usr/share/doc/libatomic1/copyright /runtime-libs/usr/share/doc/libatomic1/

FROM gcr.io/distroless/cc-debian12:nonroot@sha256:9dac0a79194e45a7da0158a9c6da57b217585af0786db3845d1f0ec1a0dd182f
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 HOME=/home/node
WORKDIR /app
COPY --from=build /runtime-libs/ /
COPY --from=build /usr/local/bin/node /usr/local/bin/node
COPY --from=build /etc/passwd /etc/passwd
COPY --from=build /etc/group /etc/group
COPY --from=build --chown=1000:1000 /home/node /home/node
COPY --from=build --chown=1000:1000 /app/node_modules ./node_modules
COPY --from=build --chown=1000:1000 /app/dist ./dist
COPY --from=build --chown=1000:1000 /app/package.json /app/LICENSE /app/NOTICE ./
COPY --from=build --chown=1000:1000 /app/spec/provider-config.schema.json ./spec/
COPY --from=build --chown=1000:1000 /app/docs/provider.config.safe.example.json ./docs/provider.config.safe.example.json
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD ["node", "-e", "fetch('http://127.0.0.1:8080/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
ENTRYPOINT []
CMD ["node", "dist/main.js"]
