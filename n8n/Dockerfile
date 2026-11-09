FROM n8nio/n8n:2.6.4
COPY --chown=node:node n8n/workflows /workflows
COPY --chown=node:node n8n/start.sh /bootstrap/start.sh
RUN sed -i 's/\r$//' /bootstrap/start.sh
ENTRYPOINT ["/bin/sh", "/bootstrap/start.sh"]
