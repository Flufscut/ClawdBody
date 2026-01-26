/**
 * AWS EC2 Client
 * Handles VM provisioning and management on AWS
 * Allows programmatic setup without users needing to touch AWS Console
 */

import {
  EC2Client,
  RunInstancesCommand,
  DescribeInstancesCommand,
  TerminateInstancesCommand,
  StartInstancesCommand,
  StopInstancesCommand,
  RebootInstancesCommand,
  CreateKeyPairCommand,
  DeleteKeyPairCommand,
  CreateSecurityGroupCommand,
  AuthorizeSecurityGroupIngressCommand,
  DescribeSecurityGroupsCommand,
  DescribeVpcsCommand,
  DescribeSubnetsCommand,
  waitUntilInstanceRunning,
  DescribeImagesCommand,
  _InstanceType,
} from '@aws-sdk/client-ec2'
import {
  SSMClient,
  SendCommandCommand,
  GetCommandInvocationCommand,
} from '@aws-sdk/client-ssm'

const DEFAULT_REGION = 'us-east-1'

// Ubuntu 22.04 LTS AMI IDs by region (these are official Canonical AMIs)
const UBUNTU_AMIS: Record<string, string> = {
  'us-east-1': 'ami-0c7217cdde317cfec',      // Ubuntu 22.04 LTS
  'us-east-2': 'ami-05fb0b8c1424f266b',
  'us-west-1': 'ami-0ce2cb35386fc22e9',
  'us-west-2': 'ami-008fe2fc65df48dac',
  'eu-west-1': 'ami-0905a3c97561e0b69',
  'eu-west-2': 'ami-0e5f882be1900e43b',
  'eu-central-1': 'ami-0faab6bdbac9486fb',
  'ap-south-1': 'ami-03f4878755434977f',
  'ap-southeast-1': 'ami-078c1149d8ad719a7',
  'ap-southeast-2': 'ami-04f5097681773b989',
  'ap-northeast-1': 'ami-07c589821f2b353aa',
}

export interface AWSCredentials {
  accessKeyId: string
  secretAccessKey: string
  region?: string
}

export interface AWSInstance {
  id: string
  name: string
  publicIp?: string
  privateIp?: string
  status: string
  instanceType: string
  launchTime?: Date
  keyName?: string
}

export interface AWSInstanceConfig {
  name: string
  instanceType?: string  // Default: t3.micro (2 vCPU, 1GB RAM) - Free Tier eligible
  volumeSize?: number    // Default: 30GB
  region?: string
}

export class AWSClient {
  private ec2: EC2Client
  private ssm: SSMClient
  private region: string
  private credentials: AWSCredentials

  constructor(credentials: AWSCredentials) {
    this.credentials = credentials
    this.region = credentials.region || DEFAULT_REGION
    
    const clientConfig = {
      region: this.region,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
      },
    }
    
    this.ec2 = new EC2Client(clientConfig)
    this.ssm = new SSMClient(clientConfig)
  }

  /**
   * Validate AWS credentials by attempting to describe instances
   */
  async validateCredentials(): Promise<{ valid: boolean; error?: string }> {
    try {
      await this.ec2.send(new DescribeInstancesCommand({ MaxResults: 5 }))
      return { valid: true }
    } catch (error: any) {
      if (error.name === 'AuthFailure' || error.name === 'UnauthorizedOperation') {
        return { valid: false, error: 'Invalid AWS credentials' }
      }
      if (error.name === 'AccessDenied') {
        return { valid: false, error: 'Insufficient permissions. Need EC2 and SSM access.' }
      }
      return { valid: false, error: error.message || 'Failed to validate credentials' }
    }
  }

  /**
   * Get or create a security group for Clawdbot VMs
   */
  private async getOrCreateSecurityGroup(): Promise<string> {
    const securityGroupName = 'clawdbot-vm-sg'
    
    try {
      // Check if security group already exists
      const describeResult = await this.ec2.send(new DescribeSecurityGroupsCommand({
        Filters: [{ Name: 'group-name', Values: [securityGroupName] }],
      }))
      
      if (describeResult.SecurityGroups && describeResult.SecurityGroups.length > 0) {
        return describeResult.SecurityGroups[0].GroupId!
      }
    } catch (error) {
      // Security group doesn't exist, create it
    }

    // Get default VPC
    const vpcResult = await this.ec2.send(new DescribeVpcsCommand({
      Filters: [{ Name: 'is-default', Values: ['true'] }],
    }))
    
    const vpcId = vpcResult.Vpcs?.[0]?.VpcId
    if (!vpcId) {
      throw new Error('No default VPC found. Please create one in AWS or specify a VPC ID.')
    }

    // Create security group
    const createResult = await this.ec2.send(new CreateSecurityGroupCommand({
      GroupName: securityGroupName,
      Description: 'Security group for Clawdbot VMs - allows SSH and outbound traffic',
      VpcId: vpcId,
    }))

    const groupId = createResult.GroupId!

    // Allow SSH (port 22) from anywhere - needed for initial setup
    // In production, you might want to restrict this
    await this.ec2.send(new AuthorizeSecurityGroupIngressCommand({
      GroupId: groupId,
      IpPermissions: [
        {
          IpProtocol: 'tcp',
          FromPort: 22,
          ToPort: 22,
          IpRanges: [{ CidrIp: '0.0.0.0/0', Description: 'SSH access' }],
        },
        {
          // Allow HTTPS outbound for API calls
          IpProtocol: 'tcp',
          FromPort: 443,
          ToPort: 443,
          IpRanges: [{ CidrIp: '0.0.0.0/0', Description: 'HTTPS outbound' }],
        },
      ],
    }))

    return groupId
  }

  /**
   * Create an SSH key pair for the instance
   */
  private async createKeyPair(keyName: string): Promise<string> {
    // Delete existing key pair if it exists (ignore errors)
    try {
      await this.ec2.send(new DeleteKeyPairCommand({ KeyName: keyName }))
    } catch (error) {
      // Ignore - key might not exist
    }

    const result = await this.ec2.send(new CreateKeyPairCommand({
      KeyName: keyName,
      KeyType: 'ed25519',
    }))

    return result.KeyMaterial! // This is the private key - save it!
  }

  /**
   * Create a new EC2 instance
   */
  async createInstance(config: AWSInstanceConfig): Promise<{ instance: AWSInstance; privateKey: string }> {
    const instanceType = config.instanceType || 't3.micro'
    const volumeSize = config.volumeSize || 30
    const region = config.region || this.region
    
    // Update region if different
    if (region !== this.region) {
      this.region = region
      const clientConfig = {
        region: this.region,
        credentials: {
          accessKeyId: this.credentials.accessKeyId,
          secretAccessKey: this.credentials.secretAccessKey,
        },
      }
      this.ec2 = new EC2Client(clientConfig)
      this.ssm = new SSMClient(clientConfig)
    }

    // Get AMI for the region
    const ami = UBUNTU_AMIS[region]
    if (!ami) {
      throw new Error(`No Ubuntu AMI found for region ${region}. Supported regions: ${Object.keys(UBUNTU_AMIS).join(', ')}`)
    }

    // Create security group
    const securityGroupId = await this.getOrCreateSecurityGroup()

    // Create key pair
    const keyName = `clawdbot-${config.name}-${Date.now()}`
    const privateKey = await this.createKeyPair(keyName)

    // User data script to install SSM agent and basic tools
    const userData = Buffer.from(`#!/bin/bash
# Update system
apt-get update -y
apt-get upgrade -y

# Install SSM agent for remote command execution
snap install amazon-ssm-agent --classic
systemctl enable snap.amazon-ssm-agent.amazon-ssm-agent.service
systemctl start snap.amazon-ssm-agent.amazon-ssm-agent.service

# Install basic tools
apt-get install -y curl git python3 python3-pip openssh-client

# Create user for Clawdbot
useradd -m -s /bin/bash clawdbot || true
echo "clawdbot ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/clawdbot

# Mark instance as ready
touch /tmp/clawdbot-ready
`).toString('base64')

    // Get default subnet
    const subnetResult = await this.ec2.send(new DescribeSubnetsCommand({
      Filters: [{ Name: 'default-for-az', Values: ['true'] }],
    }))
    
    const subnetId = subnetResult.Subnets?.[0]?.SubnetId

    // Launch instance - wrap in try/catch to clean up key pair on failure
    let instanceId: string | undefined
    try {
      const runResult = await this.ec2.send(new RunInstancesCommand({
        ImageId: ami,
        InstanceType: instanceType as _InstanceType,
        MinCount: 1,
        MaxCount: 1,
        KeyName: keyName,
        SecurityGroupIds: [securityGroupId],
        SubnetId: subnetId,
        UserData: userData,
        BlockDeviceMappings: [
          {
            DeviceName: '/dev/sda1',
            Ebs: {
              VolumeSize: volumeSize,
              VolumeType: 'gp3',
              DeleteOnTermination: true,
            },
          },
        ],
        TagSpecifications: [
          {
            ResourceType: 'instance',
            Tags: [
              { Key: 'Name', Value: config.name },
              { Key: 'CreatedBy', Value: 'Clawdbot' },
              { Key: 'Project', Value: 'clawdbot-vm' },
            ],
          },
        ],
        // Note: Not attaching IAM Instance Profile - we use SSH for setup, not SSM
      }))

      instanceId = runResult.Instances?.[0]?.InstanceId
      if (!instanceId) {
        throw new Error('Failed to create instance')
      }
    } catch (error) {
      // Clean up the key pair since instance creation failed
      console.log(`Instance creation failed, cleaning up key pair: ${keyName}`)
      try {
        await this.ec2.send(new DeleteKeyPairCommand({ KeyName: keyName }))
      } catch (cleanupError) {
        console.error('Failed to clean up key pair:', cleanupError)
      }
      throw error
    }

    // Wait for instance to be running
    console.log(`Waiting for instance ${instanceId} to be running...`)
    await waitUntilInstanceRunning(
      { client: this.ec2, maxWaitTime: 300 },
      { InstanceIds: [instanceId] }
    )

    // Get instance details
    const instance = await this.getInstance(instanceId)

    return { instance, privateKey }
  }

  /**
   * Get instance details by ID
   */
  async getInstance(instanceId: string): Promise<AWSInstance> {
    const result = await this.ec2.send(new DescribeInstancesCommand({
      InstanceIds: [instanceId],
    }))

    const instance = result.Reservations?.[0]?.Instances?.[0]
    if (!instance) {
      throw new Error(`Instance ${instanceId} not found`)
    }

    const nameTag = instance.Tags?.find(t => t.Key === 'Name')

    return {
      id: instance.InstanceId!,
      name: nameTag?.Value || instance.InstanceId!,
      publicIp: instance.PublicIpAddress,
      privateIp: instance.PrivateIpAddress,
      status: instance.State?.Name || 'unknown',
      instanceType: instance.InstanceType || 'unknown',
      launchTime: instance.LaunchTime,
      keyName: instance.KeyName,
    }
  }

  /**
   * List all Clawdbot instances
   */
  async listInstances(): Promise<AWSInstance[]> {
    const result = await this.ec2.send(new DescribeInstancesCommand({
      Filters: [
        { Name: 'tag:CreatedBy', Values: ['Clawdbot'] },
        { Name: 'instance-state-name', Values: ['pending', 'running', 'stopping', 'stopped'] },
      ],
    }))

    const instances: AWSInstance[] = []
    for (const reservation of result.Reservations || []) {
      for (const instance of reservation.Instances || []) {
        const nameTag = instance.Tags?.find(t => t.Key === 'Name')
        instances.push({
          id: instance.InstanceId!,
          name: nameTag?.Value || instance.InstanceId!,
          publicIp: instance.PublicIpAddress,
          privateIp: instance.PrivateIpAddress,
          status: instance.State?.Name || 'unknown',
          instanceType: instance.InstanceType || 'unknown',
          launchTime: instance.LaunchTime,
          keyName: instance.KeyName,
        })
      }
    }

    return instances
  }

  /**
   * Start an instance
   */
  async startInstance(instanceId: string): Promise<void> {
    await this.ec2.send(new StartInstancesCommand({ InstanceIds: [instanceId] }))
    await waitUntilInstanceRunning(
      { client: this.ec2, maxWaitTime: 300 },
      { InstanceIds: [instanceId] }
    )
  }

  /**
   * Stop an instance
   */
  async stopInstance(instanceId: string): Promise<void> {
    await this.ec2.send(new StopInstancesCommand({ InstanceIds: [instanceId] }))
  }

  /**
   * Reboot an instance
   */
  async rebootInstance(instanceId: string): Promise<void> {
    await this.ec2.send(new RebootInstancesCommand({ InstanceIds: [instanceId] }))
  }

  /**
   * Terminate (delete) an instance
   */
  async terminateInstance(instanceId: string): Promise<void> {
    await this.ec2.send(new TerminateInstancesCommand({ InstanceIds: [instanceId] }))
  }

  /**
   * Execute a command on the instance via SSM
   * Note: Instance must have SSM agent installed and proper IAM role
   */
  async executeCommand(instanceId: string, command: string): Promise<{ output: string; exitCode: number }> {
    try {
      const sendResult = await this.ssm.send(new SendCommandCommand({
        InstanceIds: [instanceId],
        DocumentName: 'AWS-RunShellScript',
        Parameters: {
          commands: [command],
        },
        TimeoutSeconds: 300,
      }))

      const commandId = sendResult.Command?.CommandId
      if (!commandId) {
        throw new Error('Failed to send command')
      }

      // Wait for command to complete
      let status = 'Pending'
      let attempts = 0
      const maxAttempts = 60 // 5 minutes max

      while (status === 'Pending' || status === 'InProgress') {
        await new Promise(resolve => setTimeout(resolve, 5000))
        
        const invocationResult = await this.ssm.send(new GetCommandInvocationCommand({
          CommandId: commandId,
          InstanceId: instanceId,
        }))

        status = invocationResult.Status || 'Failed'
        
        if (status === 'Success' || status === 'Failed' || status === 'Cancelled' || status === 'TimedOut') {
          return {
            output: invocationResult.StandardOutputContent || invocationResult.StandardErrorContent || '',
            exitCode: status === 'Success' ? 0 : 1,
          }
        }

        attempts++
        if (attempts >= maxAttempts) {
          throw new Error('Command execution timed out')
        }
      }

      return { output: '', exitCode: 1 }
    } catch (error: any) {
      // If SSM fails, it might be because the instance doesn't have the proper IAM role
      // In that case, we'll need to fall back to SSH
      if (error.name === 'InvalidInstanceId') {
        throw new Error('Instance not registered with SSM. Please ensure the instance has the AmazonSSMManagedInstanceCore policy attached.')
      }
      throw error
    }
  }

  /**
   * Wait for the instance to be ready (SSM agent running and basic setup complete)
   */
  async waitForReady(instanceId: string, maxAttempts = 30): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const result = await this.executeCommand(instanceId, 'test -f /tmp/clawdbot-ready && echo "ready"')
        if (result.output.includes('ready')) {
          return true
        }
      } catch (error) {
        // Instance might not be ready yet
      }
      await new Promise(resolve => setTimeout(resolve, 10000))
    }
    return false
  }
}

/**
 * Generate a random instance name
 */
export function generateInstanceName(): string {
  const adjectives = ['swift', 'bright', 'calm', 'bold', 'keen', 'wise', 'warm', 'cool']
  const nouns = ['falcon', 'eagle', 'wolf', 'hawk', 'bear', 'lion', 'deer', 'raven']
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)]
  const noun = nouns[Math.floor(Math.random() * nouns.length)]
  const num = Math.floor(Math.random() * 1000)
  return `clawdbot-${adj}-${noun}-${num}`
}

/**
 * Available AWS regions for Clawdbot VMs
 */
export const AWS_REGIONS = [
  { id: 'us-east-1', name: 'US East (N. Virginia)' },
  { id: 'us-east-2', name: 'US East (Ohio)' },
  { id: 'us-west-1', name: 'US West (N. California)' },
  { id: 'us-west-2', name: 'US West (Oregon)' },
  { id: 'eu-west-1', name: 'Europe (Ireland)' },
  { id: 'eu-west-2', name: 'Europe (London)' },
  { id: 'eu-central-1', name: 'Europe (Frankfurt)' },
  { id: 'ap-south-1', name: 'Asia Pacific (Mumbai)' },
  { id: 'ap-southeast-1', name: 'Asia Pacific (Singapore)' },
  { id: 'ap-southeast-2', name: 'Asia Pacific (Sydney)' },
  { id: 'ap-northeast-1', name: 'Asia Pacific (Tokyo)' },
]

/**
 * Available instance types
 */
export const AWS_INSTANCE_TYPES = [
  // Free Tier eligible (as of 2026)
  { id: 't3.micro', name: 't3.micro', vcpu: 2, memory: '1 GB', priceHour: 'Free Tier', freeTier: true },
  { id: 't3.small', name: 't3.small', vcpu: 2, memory: '2 GB', priceHour: 'Free Tier', freeTier: true },
  { id: 'c7i-flex.large', name: 'c7i-flex.large', vcpu: 2, memory: '4 GB', priceHour: 'Free Tier', freeTier: true },
  { id: 'm7i-flex.large', name: 'm7i-flex.large', vcpu: 2, memory: '8 GB', priceHour: 'Free Tier', freeTier: true, recommended: true },
  // Paid options
  { id: 't3.medium', name: 't3.medium', vcpu: 2, memory: '4 GB', priceHour: '~$0.04/hr' },
  { id: 't3.large', name: 't3.large', vcpu: 2, memory: '8 GB', priceHour: '~$0.08/hr' },
  { id: 't3.xlarge', name: 't3.xlarge', vcpu: 4, memory: '16 GB', priceHour: '~$0.17/hr' },
]
