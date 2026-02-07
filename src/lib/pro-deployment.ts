import { prisma } from '@/lib/prisma'
import { AWSClient } from '@/lib/aws'
import { sanitizeName } from '@/lib/orgo'
import { encrypt, decrypt } from '@/lib/encryption'

// System AWS Credentials for Pro Users (from .env)
const AWS_CONFIG = {
    accessKeyId: process.env.CLAWDBODY_AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CLAWDBODY_AWS_SECRET_ACCESS_KEY!,
    region: process.env.CLAWDBODY_AWS_REGION || 'us-east-1',
}

// System LLM API Key (from .env)
const LLM_API_KEY = process.env.CLAWDBODY_ANTHROPIC_API_KEY!
const LLM_PROVIDER = 'anthropic'
const LLM_MODEL = 'claude-3-5-sonnet-20240620'

interface DeployProVMParams {
    userId: string
    name: string
    templateId?: string // If deploying a specific template
    agentName?: string
}

export async function deployProVM({ userId, name, templateId, agentName }: DeployProVMParams) {
    console.log(`[Pro Deployment] Starting for user ${userId}`)

    try {
        // Validate required environment variables
        if (!AWS_CONFIG.accessKeyId || !AWS_CONFIG.secretAccessKey) {
            throw new Error('CLAWDBODY_AWS_ACCESS_KEY_ID and CLAWDBODY_AWS_SECRET_ACCESS_KEY must be set in environment')
        }
        if (!LLM_API_KEY) {
            throw new Error('CLAWDBODY_ANTHROPIC_API_KEY must be set in environment')
        }

        // 1. Store system AWS credentials and LLM API key in setupState (same as user flow)
        // This allows the setup process to work exactly like when a user provides credentials
        const setupState = await prisma.setupState.upsert({
            where: { userId },
            create: {
                userId,
                status: 'provisioning',
                vmProvider: 'aws',
                awsRegion: AWS_CONFIG.region,
                awsInstanceType: 'm7i-flex.large',
                // Store encrypted system credentials (same format as user credentials)
                awsAccessKeyId: encrypt(AWS_CONFIG.accessKeyId),
                awsSecretAccessKey: encrypt(AWS_CONFIG.secretAccessKey),
                // Store encrypted LLM API key
                llmApiKey: encrypt(LLM_API_KEY),
                llmProvider: LLM_PROVIDER,
                llmModel: LLM_MODEL,
            },
            update: {
                status: 'provisioning',
                vmProvider: 'aws',
                awsRegion: AWS_CONFIG.region,
                awsInstanceType: 'm7i-flex.large',
                errorMessage: null,
                // Update credentials (in case they changed in .env)
                awsAccessKeyId: encrypt(AWS_CONFIG.accessKeyId),
                awsSecretAccessKey: encrypt(AWS_CONFIG.secretAccessKey),
                llmApiKey: encrypt(LLM_API_KEY),
                llmProvider: LLM_PROVIDER,
                llmModel: LLM_MODEL,
            },
        })

        // 2. Create VM record (same as /api/vms does)
        const vmName = name || 'Pro Workspace'
        const sanitizedName = sanitizeName(vmName)
        const instanceType = 'm7i-flex.large' // Free Tier eligible instance type
        
        // Initialize AWS Client with system credentials
        const awsClient = new AWSClient({
            accessKeyId: AWS_CONFIG.accessKeyId,
            secretAccessKey: AWS_CONFIG.secretAccessKey,
            region: AWS_CONFIG.region,
        })

        // Create the EC2 instance (same as /api/vms with provisionNow=true)
        console.log(`[Pro Deployment] Creating EC2 instance: ${sanitizedName} in region ${AWS_CONFIG.region}`)
        const { instance, privateKey } = await awsClient.createInstance({
            name: sanitizedName,
            instanceType: instanceType,
            region: AWS_CONFIG.region,
        })

        // 3. Create VM record with instance details (same as /api/vms)
        const vm = await prisma.vM.create({
            data: {
                userId,
                name: vmName,
                provider: 'aws',
                status: 'running',
                vmCreated: true,
                awsInstanceType: instanceType,
                awsRegion: AWS_CONFIG.region,
                awsInstanceId: instance.id,
                awsPublicIp: instance.publicIp,
                awsPrivateKey: encrypt(privateKey), // Encrypt before storing
            },
        })

        console.log(`[Pro Deployment] Successfully created EC2 instance ${instance.id} with IP ${instance.publicIp}`)

        // 4. Trigger setup process directly (same as /api/setup/start does)
        // Import and call runAWSSetupProcess directly with decrypted credentials
        const setupModule = await import('@/app/api/setup/start/route')
        const runAWSSetupProcess = setupModule.runAWSSetupProcess
        
        // Decrypt credentials for setup process
        const decryptedAccessKeyId = decrypt(setupState.awsAccessKeyId!)
        const decryptedSecretAccessKey = decrypt(setupState.awsSecretAccessKey!)
        const decryptedLlmApiKey = decrypt(setupState.llmApiKey!)
        
        // Start setup process in background (don't await)
        runAWSSetupProcess(
            userId,
            decryptedLlmApiKey,
            setupState.llmProvider || LLM_PROVIDER,
            setupState.llmModel || LLM_MODEL,
            decryptedAccessKeyId,
            decryptedSecretAccessKey,
            AWS_CONFIG.region,
            instanceType,
            undefined, // telegramBotToken (optional)
            undefined, // telegramUserId (optional)
            vm.id // vmId
        ).catch(err => {
            console.error(`[Pro Deployment] Setup process failed for VM ${vm.id}:`, err)
        })

        // Update VM status to indicate setup is in progress
        await prisma.vM.update({
            where: { id: vm.id },
            data: { status: 'configuring_vm' },
        })

        console.log(`[Pro Deployment] VM ${vm.id} created and setup process started`)

        return vm

    } catch (error) {
        console.error('Pro Deployment Failed:', error)
        throw error
    }
}
