ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base-alpine:latest
FROM $BUILD_FROM

RUN apk add --no-cache nginx

COPY nginx.conf /etc/nginx/nginx.conf
COPY run.sh /run.sh
COPY www/ /usr/share/nginx/html/

RUN chmod a+x /run.sh

EXPOSE 8099

CMD ["/run.sh"]
