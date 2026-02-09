import { prisma } from '@/lib/prisma'
import { AWSClient } from '@/lib/aws'
import { sanitizeName } from '@/lib/orgo'
import { encrypt, decrypt } from '@/lib/encryption'
import { ensureLlmCreditForProUser } from '@/lib/pro-credits-provisioning'

// System AWS Credentials for Pro Users (from .env)
const AWS_CONFIG = {
    accessKeyId: process.env.CLAWDBODY_AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CLAWDBODY_AWS_SECRET_ACCESS_KEY!,
    region: process.env.CLAWDBODY_AWS_REGION || 'us-east-1',
}

interface DeployProVMParams {
    userId: string
    name: string
    templateId?: string // If deploying a specific template
    agentName?: string
}

export async function deployProVM({ userId, name, templateId, agentName }: DeployProVMParams) {
    console.log(`[Pro Deployment] Starting for user ${userId}`)

    try {
        if (!AWS_CONFIG.accessKeyId || !AWS_CONFIG.secretAccessKey) {
            throw new Error('CLAWDBODY_AWS_ACCESS_KEY_ID and CLAWDBODY_AWS_SECRET_ACCESS_KEY must be set in environment')
        }

        // 1. Ensure Pro user has OpenRouter credit account (no Anthropic key – Pro uses OpenRouter only)
        const hasCredits = await ensureLlmCreditForProUser(userId)
        if (!hasCredits) {
            throw new Error(
                'Please set up your AI credit account first: go to Dashboard → AI Credits and click "Set up credit account". ' +
                'Pro VMs use OpenRouter credits only.'
            )
        }

        // 2. Update setup state with AWS credentials and provisioning status only (do NOT overwrite llmApiKey – it’s already OpenRouter from ensureLlmCreditForProUser)
        const setupState = await prisma.setupState.update({
            where: { userId },
            data: {
                status: 'provisioning',
                vmProvider: 'aws',
                awsRegion: AWS_CONFIG.region,
                awsInstanceType: 'm7i-flex.large',
                awsAccessKeyId: encrypt(AWS_CONFIG.accessKeyId),
                awsSecretAccessKey: encrypt(AWS_CONFIG.secretAccessKey),
                errorMessage: null,
            },
        })

        if (!setupState.llmApiKey || !setupState.llmProvider) {
            throw new Error('AI credit account is not fully set up. Please complete setup at Dashboard → AI Credits and try again.')
        }
        if (setupState.llmProvider !== 'openrouter') {
            throw new Error('Pro VMs use OpenRouter only. Go to Dashboard → AI Credits, click "Set up credit account", then try again.')
        }

        // 3. Create VM record (same as /api/vms does)
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

        // 4. Create VM record with instance details (same as /api/vms)
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

        // 5. Trigger setup process directly (same as /api/setup/start does)
        // Import and call runAWSSetupProcess directly with decrypted credentials
        const { runAWSSetupProcess } = await import('@/lib/aws-setup-process')
        
        // Decrypt credentials for setup process
        const decryptedAccessKeyId = decrypt(setupState.awsAccessKeyId!)
        const decryptedSecretAccessKey = decrypt(setupState.awsSecretAccessKey!)
        const decryptedLlmApiKey = decrypt(setupState.llmApiKey!)
        
        // Start setup process in background (don't await)
        runAWSSetupProcess(
            userId,
            decryptedLlmApiKey,
            setupState.llmProvider || 'openrouter',
            setupState.llmModel || 'anthropic/claude-sonnet-4',
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
