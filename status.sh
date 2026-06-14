#!/bin/bash

# Server Layer Container Management Script
# This script shows the status of Docker containers

cd "$(dirname "$0")/configs"

echo "Container Status:"
echo "================"
docker-compose ps

echo ""
echo "Resource Usage:"
echo "==============="
docker stats --no-stream $(docker-compose ps -q)
