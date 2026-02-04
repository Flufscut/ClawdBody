#!/bin/bash

# Source this script to use the local database
# Usage: source scripts/use-local-db.sh

export POSTGRES_PRISMA_URL="postgresql://postgres:postgres@localhost:5432/samantha_dev?schema=public"
export POSTGRES_URL_NON_POOLING="postgresql://postgres:postgres@localhost:5432/samantha_dev?schema=public"
export NEXTAUTH_SECRET="dev-secret-change-in-production-12345"
export NEXTAUTH_URL="http://localhost:3000"
export ENCRYPTION_KEY="dev-encryption-key-not-for-production"
export USER_DATA_ENCRYPTION_KEY="dev-user-data-key-not-for-production"

echo "✅ Environment set to use LOCAL database"
echo "   Database: postgresql://postgres:postgres@localhost:5432/samantha_dev"
echo ""
echo "   You can now run: npm run dev"
