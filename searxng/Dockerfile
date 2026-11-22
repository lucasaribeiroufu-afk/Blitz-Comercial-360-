FROM docker.io/searxng/searxng:latest
USER root
RUN uv pip install --python /usr/local/searxng/.venv/bin/python 'PyJWT[crypto]==2.10.1'
COPY searxng/gateway.py /usr/local/searxng/blitz_gateway.py
COPY searxng/start.py /usr/local/searxng/blitz_start.py
ENV SEARXNG_SETTINGS_PATH=/tmp/blitz-searxng/settings.yml
ENTRYPOINT ["/usr/local/searxng/.venv/bin/python", "/usr/local/searxng/blitz_start.py"]
