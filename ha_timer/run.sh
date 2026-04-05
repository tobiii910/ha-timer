#!/bin/sh
set -e

# Create required runtime directories
mkdir -p /var/log/nginx /var/lib/nginx/tmp /run/nginx

exec nginx -g "daemon off;"
