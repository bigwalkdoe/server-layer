#!/bin/bash

# Server Layer Container Management Script
# This script stops Docker containers using docker-compose

set -e

# Change to configs directory where docker-compose files are located
cd "$(dirname "$0")/configs"

echo "Stopping Docker containers..."
docker-compose down

echo "Containers stopped successfully!"
