FROM docker.io/cloudflare/sandbox:0.10.1

USER root

RUN apt-get update \
  && apt-get install -y --no-install-recommends bubblewrap \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g @openai/codex@latest \
  && git config --system --add safe.directory '*'

ENV TERM=xterm-256color

EXPOSE 8080
