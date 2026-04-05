FROM nginx:alpine

COPY nginx.conf /etc/nginx/nginx.conf
COPY www/ /usr/share/nginx/html/

EXPOSE 8099

CMD ["nginx", "-g", "daemon off;"]
