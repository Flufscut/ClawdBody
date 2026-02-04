#!/bin/bash

# Local Development Database Setup Script
# This script sets up a local PostgreSQL database for development

set -e

echo "🐘 Setting up local PostgreSQL database..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Start PostgreSQL container
echo "📦 Starting PostgreSQL container..."
docker-compose up -d postgres

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL to be ready..."
until docker exec samantha-postgres-dev pg_isready -U postgres > /dev/null 2>&1; do
    sleep 1
done
echo "✅ PostgreSQL is ready!"

# Set local database URL for this session
export POSTGRES_PRISMA_URL="postgresql://postgres:postgres@localhost:5432/samantha_dev?schema=public"
export POSTGRES_URL_NON_POOLING="postgresql://postgres:postgres@localhost:5432/samantha_dev?schema=public"

# Generate Prisma client
echo ""
echo "🔧 Generating Prisma client..."
npx prisma generate

# Push schema to LOCAL database (creates tables)
echo ""
echo "📊 Creating database tables in LOCAL database..."
echo "   URL: postgresql://postgres:postgres@localhost:5432/samantha_dev"
npx prisma db push --skip-generate

echo ""
echo "✅ Local database setup complete!"
echo ""
echo "📋 Database Info:"
echo "   Host: localhost"
echo "   Port: 5432"
echo "   Database: samantha_dev"
echo "   User: postgres"
echo "   Password: postgres"
echo ""
echo "🚀 To run the app with the local database:"
echo ""
echo "   export POSTGRES_PRISMA_URL=\"postgresql://postgres:postgres@localhost:5432/samantha_dev?schema=public\""
echo "   export POSTGRES_URL_NON_POOLING=\"postgresql://postgres:postgres@localhost:5432/samantha_dev?schema=public\""
echo "   npm run dev"
echo ""
echo "   Or run: source scripts/use-local-db.sh && npm run dev"
echo ""
echo "💡 Useful commands:"
echo "   • View database: POSTGRES_PRISMA_URL=\"postgresql://postgres:postgres@localhost:5432/samantha_dev\" npx prisma studio"
echo "   • Stop database: docker-compose down"
echo "   • Reset database: docker-compose down -v && ./scripts/setup-local-db.sh"
