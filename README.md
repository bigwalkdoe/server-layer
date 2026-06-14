# Server Layer Configuration

This folder contains Docker-based server operations configuration with containerized services management.

## Directory Structure

```
server-layer/
├── configs/           # Docker and service configurations
│   ├── docker-compose.yml          # Main Docker Compose configuration
│   ├── docker-compose.override.yml # Local development overrides
│   ├── .env.example                # Environment variables template
│   ├── logging.json                # Docker logging configuration
│   ├── logrotate.conf             # Log rotation configuration
│   └── nginx/                     # Nginx configuration files
│       ├── nginx.conf             # Main nginx configuration
│       └── conf.d/                # Site-specific configurations
│           └── default.conf       # Default site configuration
├── containers/         # Docker container data (auto-generated)
├── logs/              # Application and service logs
├── volumes/           # Persistent data volumes
│   ├── nginx/         # Nginx data and logs
│   │   ├── html/      # Static files
│   │   └── logs/      # Nginx logs
│   ├── postgres/      # PostgreSQL data and logs
│   │   ├── data/      # Database files
│   │   └── logs/      # Database logs
│   ├── redis/         # Redis data and logs
│   │   ├── data/      # Redis persistence
│   │   └── logs/      # Redis logs
│   └── app/           # Application files
│       ├── package.json
│       └── index.js
├── start.sh          # Start all containers
├── stop.sh           # Stop all containers
├── status.sh         # Check container status
├── logs.sh           # View container logs
└── README.md         # This file
```

## Quick Start

1. **Set up environment variables:**
   ```bash
   cd configs
   cp .env.example .env
   # Edit .env with your configuration values
   ```

2. **Configure your services:**
   Edit `configs/docker-compose.yml` to add your services

3. **Start containers:**
   ```bash
   ./start.sh
   ```

4. **Check status:**
   ```bash
   ./status.sh
   ```

5. **View logs:**
   ```bash
   ./logs.sh
   # Or for specific service:
   ./logs.sh service-name
   ```

6. **Stop containers:**
   ```bash
   ./stop.sh
   ```

## Management Scripts

### `start.sh`
- Starts all Docker containers defined in docker-compose.yml
- Loads environment variables from `.env` file if present
- Runs containers in detached mode

### `stop.sh`
- Stops and removes all containers
- Preserves volumes (data is not deleted)

### `status.sh`
- Shows running container status
- Displays resource usage statistics

### `logs.sh [service-name]`
- Shows logs from all containers (or specific service)
- Follows log output in real-time
- Press Ctrl+C to exit

## Full Stack Configuration

This setup comes pre-configured with a complete full stack:

### Services Included:
- **Nginx** (Port 80/443) - Web server and reverse proxy
- **Node.js Application** (Port 3000) - Express.js backend server
- **PostgreSQL** (Port 5432) - Relational database
- **Redis** (Port 6379) - In-memory cache

### Service Communication:
- Nginx proxies requests to the Node.js application
- Application connects to PostgreSQL for data storage
- Application uses Redis for caching
- All services communicate via Docker network `app-network`

### Sample Endpoints:
- `http://localhost/` - Static HTML page
- `http://localhost/health` - Health check endpoint
- `http://localhost/api/info` - System information
- `http://localhost/api/data` - Sample data with Redis caching

### Application Structure:
The sample Node.js application in `volumes/app/` includes:
- Express.js server with REST API
- PostgreSQL connection and table initialization
- Redis caching for performance
- Graceful shutdown handling

## Configuration

### Docker Compose
Main configuration is in `configs/docker-compose.yml`. Add your services following the commented examples.

### Environment Variables
Copy `configs/.env.example` to `configs/.env` and configure:

**Important: Change the default PostgreSQL password!**
```bash
POSTGRES_PASSWORD=your_secure_password
```

**Key Variables:**
- `NODE_ENV` - Environment (development/production)
- `APP_PORT` - Application port (default: 3000)
- `POSTGRES_DB` - Database name (default: appdb)
- `POSTGRES_USER` - Database user (default: appuser)
- `POSTGRES_PASSWORD` - Database password (CHANGE THIS!)
- `REDIS_HOST` - Redis host (default: redis)
- `REDIS_PORT` - Redis port (default: 6379)

### Local Development
Use `docker-compose.override.yml` for development-specific overrides without modifying the main configuration.

### Logging
- Docker logs are configured in `configs/logging.json`
- Application logs are stored in `logs/` directory
- Log rotation is configured in `configs/logrotate.conf`

## Volume Management

Persistent data is stored in the `volumes/` directory:
- Create subdirectories for each service
- Mount these directories in docker-compose.yml
- Data persists even when containers are stopped

## Best Practices

1. **Never commit sensitive data** - `.env` is gitignored
2. **Use override file for local development** - Keep main config production-ready
3. **Monitor logs regularly** - Use `./logs.sh` to watch for issues
4. **Backup volumes** - Regular backup of data in `volumes/` directory
5. **Update images** - Pull latest images and restart containers periodically

## Troubleshooting

### Containers won't start
```bash
cd configs
docker-compose up --no-deps service-name  # Check service config
docker-compose logs service-name          # Check logs
```

### Permission issues
```bash
sudo chown -R $USER:$USER volumes/ logs/
```

### Clean restart
```bash
cd configs
docker-compose down -v  # Stops and removes volumes
./start.sh              # Restart fresh
```

## Adding New Services

1. Edit `configs/docker-compose.yml`
2. Add service definition following existing examples
3. Create necessary volume directories in `volumes/`
4. Add environment variables to `.env`
5. Restart: `./stop.sh && ./start.sh`
