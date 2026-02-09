# STAGE 1: Build the Bun application
# This stage remains mostly the same, using a Debian-based image for glibc compatibility.
FROM oven/bun:debian AS build

WORKDIR /app

COPY package.json bun.lock ./

# Install dependencies (dev + prod) for the build
RUN bun install

# Generate third-party license report for the UI
RUN bun run licenses:generate

# Copy source (use .dockerignore to exclude unnecessary files like node_modules, .git)
COPY . .

# Create the JS bundle
RUN bun run build

#####################################################################

# STAGE 1b: Install production-only deps for the runtime image
FROM oven/bun:debian AS deps

WORKDIR /app

COPY package.json bun.lock ./

# Only production deps
RUN bun install --production

#####################################################################

# STAGE 2: Create a minimal base with the RawTherapee CLI from AppImage
FROM debian:12 AS rawtherapee-base

# Pin RawTherapee for compliance (optional build arg; defaults to latest).
ARG RAWTHERAPEE_VERSION=latest

# Set environment variables to avoid interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# TODO: allow it to be configured via env var
ENV TZ=UTC

# Install dependencies for downloading and extracting the AppImage
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        curl \
        ca-certificates \
        libexpat1 \
        gawk \
        jq \
        libimage-exiftool-perl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install rawtherapee from appimage
RUN set -eu; \
  if [ "$RAWTHERAPEE_VERSION" = "latest" ]; then \
    RAWTHERAPEE_VERSION="$(curl -fsSL "https://api.github.com/repos/rawtherapee/rawtherapee/releases/latest" \
      | jq -r '.tag_name // empty')"; \
  fi; \
  if [ -z "$RAWTHERAPEE_VERSION" ]; then \
    echo "Failed to resolve RAWTHERAPEE_VERSION (GitHub API may be rate-limited)." >&2; \
    exit 1; \
  fi; \
  echo "$RAWTHERAPEE_VERSION" > /tmp/rawtherapee-version.txt; \
  cd /tmp; \
  RAWTHERAPEE_URL="$(curl -fsSL "https://api.github.com/repos/rawtherapee/rawtherapee/releases/tags/${RAWTHERAPEE_VERSION}" \
    | jq -r --arg name "RawTherapee_${RAWTHERAPEE_VERSION}_release.AppImage" \
      '.assets[] | select(.name == $name) | .browser_download_url' | head -n1)"; \
  if [ -z "$RAWTHERAPEE_URL" ]; then \
    echo "Failed to locate AppImage asset for ${RAWTHERAPEE_VERSION}." >&2; \
    exit 1; \
  fi; \
  curl -fSL -o /tmp/rawtherapee.app "$RAWTHERAPEE_URL"; \
  chmod +x /tmp/rawtherapee.app && \
  ./rawtherapee.app --appimage-extract && \
  mv squashfs-root /opt/rawtherapee && \
  mkdir -p /opt/rawtherapee/metadata && \
  cp /tmp/rawtherapee-version.txt /opt/rawtherapee/metadata/VERSION && \
  echo "https://github.com/RawTherapee/RawTherapee/tree/${RAWTHERAPEE_VERSION}" > /opt/rawtherapee/metadata/SOURCE_URL && \
  (cp /opt/rawtherapee/usr/share/doc/rawtherapee/About/GPLtxt /opt/rawtherapee/metadata/LICENSE.txt || \
   curl -L https://www.gnu.org/licenses/gpl-3.0.txt -o /opt/rawtherapee/metadata/LICENSE.txt) && \
  rm -rf /tmp/*

# Add rawtherapee to the path
ENV PATH="/opt/rawtherapee/usr/bin:${PATH}"

#####################################################################

# STAGE 3: Final application image
FROM rawtherapee-base

# Copy Bun binary from the build stage (oven/bun places it here; compatible with Debian glibc)
COPY --from=build /usr/local/bin/bun /usr/local/bin/bun

# Set PATH permanently for Bun - this prepends to the existing PATH
ENV PATH="/usr/local/bin:${PATH}"

# Set production env for runtime
ENV NODE_ENV=production

WORKDIR /app

# Ensure import dir exists for the RAF file
RUN mkdir -p /app/import

# Copy the single compiled executable from the 'build' stage
COPY --from=build /app/build/ build/

# Include app license in the runtime image
COPY --from=build /app/LICENSE /app/LICENSE

# Copy production-only node_modules and package.json
COPY --from=deps /app/node_modules/ node_modules
COPY --from=build /app/package.json ./

EXPOSE 3000

# Run your compiled application (assumes it calls rawtherapee-cli internally)
# Your app can now call `rawtherapee-cli` directly as it's in the system's PATH.
CMD ["bun", "/app/build/index.js"]
