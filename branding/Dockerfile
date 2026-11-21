FROM ghcr.io/ulsklyc/yuvomi:2.93.0@sha256:530a6fdff7602d80f1a4b96b5071af5e65e6beaa1333a534650276f5c0e92887
WORKDIR /app
# Build the Vite frontend on a machine that supports its native build tooling.
RUN rm -rf /app/dist
ADD frontend.tar.gz ./
COPY apply-branding.mjs /usr/local/share/apply-branding.mjs
RUN node /usr/local/share/apply-branding.mjs server
ENV APP_BUILD_REVISION=6a703e29f19b7d6e5a1a337724a5cf5833c63a55-blanzis-5
