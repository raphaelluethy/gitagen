# Gitagen – task runner
# Run `just --list` to see all commands

# Default recipe: show help
default:
	@just --list

# Generate Drizzle migrations from schema changes
db-generate:
	pnpm exec drizzle-kit generate

# Apply migrations to local dev database (.gitagen-dev.db)
# Uses LibSQL; no native rebuild needed
db-migrate:
	pnpm exec drizzle-kit migrate

# Dev workflow: generate migrations and apply to local DB
# Use before/while developing when schema changes
db-dev: db-generate db-migrate

# Start Electron app (does not run migrations)
dev:
	pnpm dev

# Start Electron app with verbose agent debug logs (renderer + main)
dev-debug:
	ELECTRON_ENABLE_LOGGING=1 GITAGEN_AGENT_DEBUG=1 VITE_AGENT_DEBUG=1 pnpm dev

# Start Electron app using local dev DB (.gitagen-dev.db)
# Run `just db-migrate` first to create/migrate the DB
dev-local-db:
	DATABASE_URL="file:$(pwd)/.gitagen-dev.db" pnpm dev
