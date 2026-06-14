#!/bin/bash

# Server Layer Container Management Script
# This script starts Docker containers using docker-compose

set -e

# Change to configs directory where docker-compose files are located
cd "$(dirname "$0")/configs"

# Load environment variables if .env exists
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

echo "Starting Docker containers..."
docker-compose up -d

echo "Containers started successfully!"
echo "Run 'docker-compose ps' to check status"
echo "Run 'docker-compose logs -f' to view logs"
