# Both build inputs must be approved immutable image digests.
ARG DOCKER_CLI_IMAGE
ARG PYTHON_IMAGE
FROM ${DOCKER_CLI_IMAGE} AS docker_cli
FROM ${PYTHON_IMAGE}
COPY --from=docker_cli /usr/local/bin/docker /usr/local/bin/docker
WORKDIR /service
RUN pip install --no-cache-dir psycopg[binary]==3.2.10
COPY extensions /service/extensions
CMD ["python", "-m", "extensions.runtime.service", "api"]
