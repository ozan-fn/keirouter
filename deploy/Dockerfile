# syntax=docker/dockerfile:1

# ---- frontend build stage ----
FROM node:20-alpine AS frontend
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY frontend/ .
RUN npm run build

# ---- backend build stage ----
FROM golang:1.24-alpine AS backend
WORKDIR /src/backend
COPY backend/go.mod backend/go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY backend/ .
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" \
    -o /out/keirouter ./cmd/keirouter
RUN mkdir -p /out/data

# ---- runtime stage ----
FROM gcr.io/distroless/static-debian12:nonroot

ENV KEIROUTER_DATA__DIR=/data
ENV KEIROUTER_SERVER__HOST=0.0.0.0
ENV KEIROUTER_SERVER__PORT=20180
ENV KEIROUTER_SECURITY__BIND_LOOPBACK_ONLY=false

COPY --from=backend /out/keirouter /usr/local/bin/keirouter
COPY --from=backend --chown=nonroot:nonroot /out/data /data
COPY --from=frontend /src/frontend/dist /usr/local/share/keirouter/frontend/dist

USER nonroot:nonroot
EXPOSE 20180
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD ["/usr/local/bin/keirouter", "-healthcheck"]

ENTRYPOINT ["/usr/local/bin/keirouter"]
