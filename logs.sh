#!/bin/bash

# Server Layer Container Management Script
# This script shows logs from Docker containers

cd "$(dirname "$0")/configs"

if [ -z "$1" ]; then
    echo "Showing logs from all containers (press Ctrl+C to exit)..."
    docker-compose logs -f
else
    echo "Showing logs for service: $1"
    docker-compose logs -f "$1"
fi
