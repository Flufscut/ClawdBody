/**
 * Migration script to bucket existing users and mark them as legacy
 * 
 * Run this ONCE when deploying the monetization feature.
 * All existing users at the time of running this script will be:
 * 1. Marked as legacy (isLegacyUser = true)
 * 2. Given the legacy_free plan
 * 3. Assigned to a bucket (A, B, C, D) based on their API keys
 * 
 * Usage:
 *   npx tsx scripts/migrate-legacy-users.ts
 *   
 * Options:
 *   --dry-run    Preview changes without applying them
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

type BucketId = 'A' | 'B' | 'C' | 'D'

interface UserWithSetup {
  id: string
  email: string | null
  name: string | null
  createdAt: Date
  plan: string
  isLegacyUser: boolean
  setup: {
    orgoApiKey: string | null
    awsAccessKeyId: string | null
    awsSecretAccessKey: string | null
    e2bApiKey: string | null
    llmApiKey: string | null
  } | null
}

function detectBucket(setupState: UserWithSetup['setup']): BucketId {
  if (!setupState) return 'D'

  const hasVMKeys = !!(
    setupState.orgoApiKey ||
    (setupState.awsAccessKeyId && setupState.awsSecretAccessKey) ||
    setupState.e2bApiKey
  )
  const hasLLMKeys = !!setupState.llmApiKey

  if (hasVMKeys && hasLLMKeys) return 'A'
  if (hasVMKeys && !hasLLMKeys) return 'B'
  if (!hasVMKeys && hasLLMKeys) return 'C'
  return 'D'
}

function getBucketDescription(bucket: BucketId): string {
  switch (bucket) {
    case 'A': return 'Has both VM and LLM keys (full BYOK)'
    case 'B': return 'Has VM keys only (BYOK VMs, managed LLM available)'
    case 'C': return 'Has LLM keys only (managed VMs available)'
    case 'D': return 'Has neither (needs setup or upgrade)'
  }
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run')
  
  console.log('='.repeat(60))
  console.log('ClawdBody Legacy User Migration')
  console.log('='.repeat(60))
  console.log('')
  
  if (isDryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n')
  }

  // Fetch all users with their setup state
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      plan: true,
      isLegacyUser: true,
      setup: {
        select: {
          orgoApiKey: true,
          awsAccessKeyId: true,
          awsSecretAccessKey: true,
          e2bApiKey: true,
          llmApiKey: true,
        },
      },
    },
  }) as UserWithSetup[]

  console.log(`Found ${users.length} total users\n`)

  // Filter out users who are already marked as legacy
  const usersToMigrate = users.filter((u) => !u.isLegacyUser)
  console.log(`Users to migrate: ${usersToMigrate.length}`)
  console.log(`Already legacy: ${users.length - usersToMigrate.length}\n`)

  // Bucket counts
  const bucketCounts: Record<BucketId, number> = { A: 0, B: 0, C: 0, D: 0 }
  const usersByBucket: Record<BucketId, UserWithSetup[]> = { A: [], B: [], C: [], D: [] }

  for (const user of usersToMigrate) {
    const bucket = detectBucket(user.setup)
    bucketCounts[bucket]++
    usersByBucket[bucket].push(user)
  }

  console.log('Bucket Distribution:')
  console.log('-'.repeat(40))
  for (const bucket of ['A', 'B', 'C', 'D'] as BucketId[]) {
    const count = bucketCounts[bucket]
    const percentage = usersToMigrate.length > 0 
      ? ((count / usersToMigrate.length) * 100).toFixed(1) 
      : '0.0'
    console.log(`  Bucket ${bucket}: ${count} users (${percentage}%)`)
    console.log(`           ${getBucketDescription(bucket)}`)
  }
  console.log('')

  // Show sample users from each bucket
  console.log('Sample Users by Bucket:')
  console.log('-'.repeat(40))
  for (const bucket of ['A', 'B', 'C', 'D'] as BucketId[]) {
    const bucketUsers = usersByBucket[bucket]
    if (bucketUsers.length > 0) {
      console.log(`\n  Bucket ${bucket}:`)
      for (const user of bucketUsers.slice(0, 3)) {
        const email = user.email ? user.email.substring(0, 20) + '...' : 'no email'
        console.log(`    - ${user.name || 'Anonymous'} (${email})`)
      }
      if (bucketUsers.length > 3) {
        console.log(`    ... and ${bucketUsers.length - 3} more`)
      }
    }
  }
  console.log('')

  if (isDryRun) {
    console.log('🔍 DRY RUN - Would update the following:')
    console.log(`   - Mark ${usersToMigrate.length} users as legacy`)
    console.log(`   - Set plan to 'legacy_free'`)
    console.log(`   - Assign bucket IDs (A, B, C, D)`)
    console.log(`   - Set legacyCutoffAt to current timestamp`)
    console.log('')
    console.log('Run without --dry-run to apply changes.')
    return
  }

  // Confirm before proceeding
  console.log('⚠️  This will permanently mark these users as legacy.')
  console.log('   They will get the legacy_free plan forever.')
  console.log('')
  console.log('Press Ctrl+C to cancel, or wait 5 seconds to proceed...')
  
  await new Promise((resolve) => setTimeout(resolve, 5000))
  
  console.log('\nMigrating users...\n')

  // Batch update users
  let migratedCount = 0
  const now = new Date()

  for (const user of usersToMigrate) {
    const bucket = detectBucket(user.setup)
    
    await prisma.user.update({
      where: { id: user.id },
      data: {
        isLegacyUser: true,
        legacyBucket: bucket,
        plan: 'legacy_free',
        legacyCutoffAt: now,
      },
    })
    
    migratedCount++
    if (migratedCount % 100 === 0) {
      console.log(`  Migrated ${migratedCount}/${usersToMigrate.length} users...`)
    }
  }

  console.log('')
  console.log('='.repeat(60))
  console.log('✅ Migration Complete!')
  console.log('='.repeat(60))
  console.log('')
  console.log(`Total users migrated: ${migratedCount}`)
  console.log(`  Bucket A: ${bucketCounts.A}`)
  console.log(`  Bucket B: ${bucketCounts.B}`)
  console.log(`  Bucket C: ${bucketCounts.C}`)
  console.log(`  Bucket D: ${bucketCounts.D}`)
  console.log('')
  console.log('All existing users are now on the legacy_free plan.')
  console.log('New users signing up after this will be on the free plan.')
}

main()
  .catch((e) => {
    console.error('Migration failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
