FROM docker.io/cloudflare/sandbox:0.10.1

USER root

RUN mkdir -p /workspace /tmp \
  && git config --system --add safe.directory '*'

ENV TERM=xterm-256color

EXPOSE 3000
