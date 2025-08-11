FROM oven/bun:alpine AS bun

#########################################################

# build the app
FROM bun AS build

WORKDIR /app

COPY package.json bun.lock ./

RUN bun install

COPY . .

RUN bun run build \
    && bun build --compile ./build/index.js --outfile executable

#########################################################

FROM linuxserver/rawtherapee:5.12.20250810 AS rawtherapee

# install bun
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun

# add bun to PATH
RUN echo 'export PATH=$PATH:/usr/local/bin' >> /etc/profile

# copy node app
WORKDIR /app
COPY --from=build /app/build/ build
COPY --from=build /app/node_modules/ node_modules
COPY --from=build /app/package.json ./

EXPOSE 3000

CMD ["/usr/local/bin/bun", "/app/build/index.js"]