FROM docker.io/cloudflare/sandbox:0.10.1

USER root

RUN npm install -g @openai/codex@0.130.0 \
  && git config --system --add safe.directory '*'

ENV TERM=xterm-256color

EXPOSE 8080
