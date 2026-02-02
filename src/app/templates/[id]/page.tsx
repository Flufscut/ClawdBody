'use client'

import { useState, useEffect } from 'react'
import { useSession, signIn } from 'next-auth/react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Loader2, 
  ArrowRight, 
  CheckCircle2, 
  X, 
  Key, 
  FolderPlus, 
  AlertCircle, 
  ExternalLink, 
  Server, 
  Plus, 
  Rocket, 
  Sparkles, 
  PenTool, 
  User, 
  Share2,
  Copy,
  Check,
  ArrowLeft,
  Lightbulb
} from 'lucide-react'
import type { Template } from '@/lib/templates'
import { TEMPLATE_IDEAS } from '@/lib/templates'

interface OrgoProject {
  id: string
  name: string
}

interface Credentials {
  hasOrgoApiKey: boolean
}

const categoryConfig: Record<string, { label: string; color: string; bgColor: string }> = {
  'social': { 
    label: 'Social', 
    color: 'text-pink-400 bg-pink-400/10 border-pink-400/30',
    bgColor: 'bg-pink-500/20'
  },
  'productivity': { 
    label: 'Productivity', 
    color: 'text-blue-400 bg-blue-400/10 border-blue-400/30',
    bgColor: 'bg-blue-500/20'
  },
  'dev-tools': { 
    label: 'Dev Tools', 
    color: 'text-green-400 bg-green-400/10 border-green-400/30',
    bgColor: 'bg-green-500/20'
  },
  'other': { 
    label: 'Other', 
    color: 'text-purple-400 bg-purple-400/10 border-purple-400/30',
    bgColor: 'bg-purple-500/20'
  },
}

const orgoRAMOptions = [
  { id: 4, name: '4 GB', description: '2 vCPU', freeTier: true },
  { id: 8, name: '8 GB', description: '4 vCPU', freeTier: false },
  { id: 16, name: '16 GB', description: '4 vCPU', freeTier: false },
  { id: 32, name: '32 GB', description: '8 vCPU', freeTier: false },
]

export default function TemplatePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const templateId = params.id as string
  const shouldDeploy = searchParams.get('deploy') === 'true'

  // Template state
  const [template, setTemplate] = useState<Template | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Deploy modal state
  const [showDeployModal, setShowDeployModal] = useState(false)
  const [credentials, setCredentials] = useState<Credentials | null>(null)
  const [orgoApiKey, setOrgoApiKey] = useState('')
  const [isValidatingKey, setIsValidatingKey] = useState(false)
  const [keyValidated, setKeyValidated] = useState(false)
  const [orgoProjects, setOrgoProjects] = useState<OrgoProject[]>([])
  const [selectedProject, setSelectedProject] = useState<OrgoProject | null>(null)
  const [agentName, setAgentName] = useState('')
  const [selectedRAM, setSelectedRAM] = useState(8)
  const [isDeploying, setIsDeploying] = useState(false)
  const [deployError, setDeployError] = useState<string | null>(null)
  const [isLoadingProjects, setIsLoadingProjects] = useState(false)
  const [newProjectName, setNewProjectName] = useState('claude-brain')
  const [isCreatingProject, setIsCreatingProject] = useState(false)

  // Create template modal state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newTemplateName, setNewTemplateName] = useState('')
  const [newTemplateDescription, setNewTemplateDescription] = useState('')
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Share state
  const [copied, setCopied] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)

  // Success state
  const [showSuccess, setShowSuccess] = useState(false)
  const [deployedVM, setDeployedVM] = useState<any>(null)

  // Load template
  useEffect(() => {
    const loadTemplate = async () => {
      try {
        const res = await fetch(`/api/templates/${templateId}`)
        const data = await res.json()
        
        if (!res.ok) {
          throw new Error(data.error || 'Template not found')
        }
        
        setTemplate(data.template)
        setAgentName(generateAgentName(data.template.name))
        setSelectedRAM(data.template.vmConfig.recommendedRam || 8)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load template')
      } finally {
        setIsLoading(false)
      }
    }
    
    if (templateId) {
      loadTemplate()
    }
  }, [templateId])

  // Load credentials when logged in
  useEffect(() => {
    const loadCredentials = async () => {
      if (session?.user) {
        try {
          const res = await fetch('/api/integrations/status')
          const data = await res.json()
          if (res.ok) {
            setCredentials({ hasOrgoApiKey: data.hasOrgoApiKey })
            if (data.hasOrgoApiKey) {
              setKeyValidated(true)
              fetchOrgoProjects()
            }
          }
        } catch (e) {
          console.error('Failed to load credentials:', e)
        }
      }
    }
    
    loadCredentials()
  }, [session])

  // Auto-open deploy modal if redirected after login
  useEffect(() => {
    if (shouldDeploy && session?.user && template && !showDeployModal) {
      setShowDeployModal(true)
      // Clear the URL parameter
      router.replace(`/templates/${templateId}`)
    }
  }, [shouldDeploy, session, template, showDeployModal, router, templateId])

  const generateAgentName = (templateName: string) => {
    const base = templateName.replace(/[^a-zA-Z0-9]/g, '')
    const suffix = Math.random().toString(36).substring(2, 6).toUpperCase()
    return `${base}Agent_${suffix}`
  }

  const fetchOrgoProjects = async () => {
    setIsLoadingProjects(true)
    try {
      const res = await fetch('/api/setup/orgo/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ useStored: true }),
      })
      const data = await res.json()
      if (res.ok) {
        setOrgoProjects(data.projects || [])
        if (data.projects?.length > 0) {
          setSelectedProject(data.projects[0])
        }
      }
    } catch (e) {
      console.error('Failed to fetch projects:', e)
    } finally {
      setIsLoadingProjects(false)
    }
  }

  const handleDeployClick = () => {
    if (!session?.user) {
      // Redirect to login with callback
      const callbackUrl = `/templates/${templateId}?deploy=true`
      signIn('google', { callbackUrl })
      return
    }
    
    setShowDeployModal(true)
  }

  const handleValidateApiKey = async () => {
    if (!orgoApiKey.trim()) {
      setDeployError('Please enter your Orgo API key')
      return
    }
    
    setIsValidatingKey(true)
    setDeployError(null)
    
    try {
      const res = await fetch('/api/setup/orgo/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: orgoApiKey.trim() }),
      })
      const data = await res.json()
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to validate API key')
      }
      
      setKeyValidated(true)
      setOrgoProjects(data.projects || [])
      if (data.projects?.length > 0) {
        setSelectedProject(data.projects[0])
      }
      setCredentials({ hasOrgoApiKey: true })
    } catch (e) {
      setDeployError(e instanceof Error ? e.message : 'Failed to validate API key')
    } finally {
      setIsValidatingKey(false)
    }
  }

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) {
      setDeployError('Please enter a project name')
      return
    }
    
    setIsCreatingProject(true)
    setDeployError(null)
    
    try {
      const res = await fetch('/api/setup/orgo/create-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName: newProjectName.trim() }),
      })
      const data = await res.json()
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create project')
      }
      
      setOrgoProjects(prev => [...prev, data.project])
      setSelectedProject(data.project)
    } catch (e) {
      setDeployError(e instanceof Error ? e.message : 'Failed to create project')
    } finally {
      setIsCreatingProject(false)
    }
  }

  const handleDeploy = async () => {
    if (!template || !agentName.trim() || !selectedProject) return
    
    setIsDeploying(true)
    setDeployError(null)
    
    try {
      const res = await fetch('/api/templates/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: template.id,
          agentName: agentName.trim(),
          ram: selectedRAM,
          orgoProjectId: selectedProject.id,
          orgoProjectName: selectedProject.name,
        }),
      })
      
      const data = await res.json()
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to deploy template')
      }
      
      setShowDeployModal(false)
      setDeployedVM(data.vm)
      setShowSuccess(true)
    } catch (e) {
      setDeployError(e instanceof Error ? e.message : 'Deployment failed')
    } finally {
      setIsDeploying(false)
    }
  }

  const handleCopyLink = () => {
    const url = `${window.location.origin}/templates/${templateId}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleCreateTemplate = async () => {
    if (!newTemplateName.trim() || !newTemplateDescription.trim()) return
    
    setIsCreatingTemplate(true)
    setCreateError(null)
    
    try {
      const res = await fetch('/api/templates/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newTemplateName.trim(),
          description: newTemplateDescription.trim(),
        }),
      })
      
      const data = await res.json()
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create template')
      }
      
      // Redirect to the new template page
      router.push(`/templates/${data.template.id}`)
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Failed to create template')
    } finally {
      setIsCreatingTemplate(false)
    }
  }

  const closeDeployModal = () => {
    setShowDeployModal(false)
    setDeployError(null)
    if (!credentials?.hasOrgoApiKey) {
      setKeyValidated(false)
      setOrgoApiKey('')
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-sam-bg flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-sam-accent animate-spin" />
      </div>
    )
  }

  if (error || !template) {
    return (
      <div className="min-h-screen bg-sam-bg flex items-center justify-center p-4">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-sam-error mx-auto mb-4" />
          <h1 className="text-xl font-display font-semibold text-sam-text mb-2">
            Template Not Found
          </h1>
          <p className="text-sam-text-dim mb-6">{error || 'This template does not exist.'}</p>
          <button
            onClick={() => router.push('/select-vm')}
            className="px-4 py-2 rounded-lg bg-sam-accent text-sam-bg font-medium text-sm hover:bg-sam-accent/90 transition-colors"
          >
            Browse Templates
          </button>
        </div>
      </div>
    )
  }

  const catConfig = categoryConfig[template.category] || categoryConfig.other

  return (
    <div className="min-h-screen bg-sam-bg">
      {/* Header */}
      <header className="border-b border-sam-border bg-sam-surface/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <button
            onClick={() => router.push('/select-vm')}
            className="flex items-center gap-2 text-sam-text-dim hover:text-sam-text transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">Back to Templates</span>
          </button>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowShareModal(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-sam-border text-sam-text-dim hover:text-sam-text hover:border-sam-accent/50 transition-colors text-sm"
            >
              <Share2 className="w-4 h-4" />
              Share
            </button>
            
            {session?.user ? (
              <button
                onClick={() => router.push('/select-vm')}
                className="text-sm text-sam-text-dim hover:text-sam-text transition-colors"
              >
                Dashboard
              </button>
            ) : (
              <button
                onClick={() => signIn('google')}
                className="text-sm text-sam-accent hover:text-sam-accent/80 transition-colors"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left: Template Details */}
          <div className="lg:col-span-2 space-y-8">
            {/* Template Header */}
            <div className="flex items-start gap-6">
              <div className={`w-20 h-20 rounded-2xl ${catConfig.bgColor} flex items-center justify-center overflow-hidden flex-shrink-0`}>
                <img
                  src={template.logo}
                  alt={template.name}
                  className="w-14 h-14 object-contain"
                />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2 flex-wrap">
                  <h1 className="text-3xl font-display font-bold text-sam-text">
                    {template.name}
                  </h1>
                  <span className={`inline-block text-xs font-mono px-2 py-1 rounded border ${catConfig.color}`}>
                    {catConfig.label}
                  </span>
                  {template.isUserCreated && (
                    <span className="inline-block text-xs font-mono px-2 py-1 rounded border border-sam-accent/30 bg-sam-accent/10 text-sam-accent">
                      Community
                    </span>
                  )}
                </div>
                {template.author && (
                  <p className="text-sm text-sam-text-dim flex items-center gap-1.5 mb-3">
                    <User className="w-3.5 h-3.5" />
                    Created by {template.author}
                  </p>
                )}
                <p className="text-sam-text-dim leading-relaxed">
                  {template.description}
                </p>
              </div>
            </div>

            {/* Website Link */}
            {template.websiteUrl && (
              <a
                href={template.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sam-accent hover:text-sam-accent/80 transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                Learn more about {template.name}
              </a>
            )}

            {/* Create Your Own CTA - Muted */}
            <div className="p-5 rounded-xl bg-sam-surface/50 border border-sam-border">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-sam-bg flex items-center justify-center flex-shrink-0">
                  <PenTool className="w-5 h-5 text-sam-text-dim" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-sam-text mb-1">
                    Create Your Own Template
                  </h3>
                  <p className="text-sam-text-dim text-xs mb-3">
                    Have an idea for an AI agent? Create and share it with the community.
                  </p>
                  <button
                    onClick={() => session?.user ? setShowCreateModal(true) : signIn('google', { callbackUrl: `/templates/${templateId}` })}
                    className="px-3 py-1.5 rounded-lg border border-sam-border text-sam-text-dim hover:text-sam-text hover:border-sam-accent/50 text-xs transition-colors flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Create Template
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Deploy Card */}
          <div className="lg:col-span-1">
            <div className="sticky top-24">
              <div className="p-6 rounded-2xl bg-sam-surface border border-sam-border">
                <h3 className="text-lg font-display font-semibold text-sam-text mb-2">
                  Deploy this Template
                </h3>
                <p className="text-sm text-sam-text-dim mb-6">
                  {session?.user 
                    ? 'Deploy this AI agent to your own VM in just a few clicks.'
                    : 'Sign in to deploy this AI agent to your own VM.'}
                </p>
                
                <button
                  onClick={handleDeployClick}
                  className="w-full px-4 py-3 rounded-xl bg-sam-accent text-sam-bg font-semibold hover:bg-sam-accent/90 transition-colors flex items-center justify-center gap-2"
                >
                  <Rocket className="w-5 h-5" />
                  {session?.user ? 'Deploy Agent' : 'Sign in to Deploy'}
                </button>
              </div>

              {/* Template Ideas */}
              <div className="mt-6 p-4 rounded-xl bg-sam-surface/50 border border-sam-border">
                <h4 className="text-sm font-medium text-sam-text mb-3 flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-amber-400" />
                  Template Ideas
                </h4>
                <div className="space-y-2">
                  {TEMPLATE_IDEAS.slice(0, 4).map((idea, i) => (
                    <div
                      key={i}
                      className="p-2 rounded-lg bg-sam-bg/30"
                    >
                      <p className="text-sm text-sam-text">{idea.name}</p>
                      <p className="text-xs text-sam-text-dim truncate">{idea.description}</p>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-sam-text-dim mt-3 text-center">
                  Sign in to create your own templates
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Deploy Modal */}
      <AnimatePresence>
        {showDeployModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={closeDeployModal}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="bg-sam-surface border border-sam-border rounded-2xl w-full max-w-lg overflow-hidden max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-6 border-b border-sam-border sticky top-0 bg-sam-surface z-10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-sam-bg flex items-center justify-center overflow-hidden">
                    <img
                      src={template.logo}
                      alt={template.name}
                      className="w-8 h-8 object-contain"
                    />
                  </div>
                  <div>
                    <h2 className="text-xl font-display font-semibold text-sam-text">
                      Deploy {template.name}
                    </h2>
                    <p className="text-xs text-sam-text-dim">{catConfig.label}</p>
                  </div>
                </div>
                <button
                  onClick={closeDeployModal}
                  className="p-2 rounded-lg hover:bg-sam-bg transition-colors text-sam-text-dim hover:text-sam-text"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-6">
                {/* API Key Setup - only show if not configured */}
                {!credentials?.hasOrgoApiKey && !keyValidated && (
                  <div className="space-y-4">
                    <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
                      <div className="flex items-start gap-3">
                        <Key className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-amber-400 font-medium text-sm">Orgo API Key Required</p>
                          <p className="text-amber-400/80 text-xs mt-1">
                            Templates are deployed to Orgo VMs. Enter your API key to continue.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-sam-text flex items-center gap-2">
                          <Key className="w-4 h-4 text-sam-accent" />
                          Orgo API Key
                          <span className="text-sam-error">*</span>
                        </label>
                        <a
                          href="https://www.orgo.ai/start"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-sam-accent hover:text-sam-accent/80 flex items-center gap-1"
                        >
                          Get API key <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="password"
                          value={orgoApiKey}
                          onChange={(e) => {
                            setOrgoApiKey(e.target.value)
                            setDeployError(null)
                          }}
                          placeholder="Enter your Orgo API key"
                          className="flex-1 px-4 py-2.5 rounded-lg bg-sam-bg border border-sam-border focus:border-sam-accent focus:ring-1 focus:ring-sam-accent/30 transition-all text-sam-text placeholder:text-sam-text-dim/50 font-mono text-sm"
                        />
                        <button
                          onClick={handleValidateApiKey}
                          disabled={isValidatingKey || !orgoApiKey.trim()}
                          className="px-4 py-2.5 rounded-lg bg-sam-accent text-sam-bg font-medium text-sm hover:bg-sam-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                          {isValidatingKey ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Validating
                            </>
                          ) : (
                            'Validate'
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Show rest of the form only after API key is validated */}
                {(credentials?.hasOrgoApiKey || keyValidated) && (
                  <>
                    {/* Agent Name */}
                    <div className="space-y-3">
                      <label className="text-sm font-medium text-sam-text flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-sam-accent" />
                        Agent Name
                        <span className="text-sam-error">*</span>
                      </label>
                      <input
                        type="text"
                        value={agentName}
                        onChange={(e) => setAgentName(e.target.value)}
                        placeholder="e.g., MyAwesomeAgent"
                        className="w-full px-4 py-2.5 rounded-lg bg-sam-bg border border-sam-border focus:border-sam-accent focus:ring-1 focus:ring-sam-accent/30 transition-all text-sam-text placeholder:text-sam-text-dim/50 text-sm"
                      />
                    </div>

                    {/* Project Selection */}
                    <div className="space-y-3">
                      <label className="text-sm font-medium text-sam-text flex items-center gap-2">
                        <FolderPlus className="w-4 h-4 text-sam-accent" />
                        Orgo Project
                        <span className="text-sam-error">*</span>
                      </label>
                      {isLoadingProjects ? (
                        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-sam-bg border border-sam-border text-sam-text-dim">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span className="text-sm">Loading projects...</span>
                        </div>
                      ) : orgoProjects.length > 0 ? (
                        <div className="space-y-2">
                          {orgoProjects.map((project) => (
                            <button
                              key={project.id}
                              onClick={() => setSelectedProject(project)}
                              className={`w-full p-3 rounded-lg border text-left transition-all ${
                                selectedProject?.id === project.id
                                  ? 'border-sam-accent bg-sam-accent/10'
                                  : 'border-sam-border hover:border-sam-accent/50 hover:bg-sam-bg'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-sam-text font-medium text-sm">{project.name}</span>
                                {selectedProject?.id === project.id && (
                                  <CheckCircle2 className="w-4 h-4 text-sam-accent" />
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <p className="text-sm text-sam-text-dim">
                            No projects found. Create your first project:
                          </p>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={newProjectName}
                              onChange={(e) => setNewProjectName(e.target.value)}
                              placeholder="Project name"
                              className="flex-1 px-4 py-2.5 rounded-lg bg-sam-bg border border-sam-border focus:border-sam-accent focus:ring-1 focus:ring-sam-accent/30 transition-all text-sam-text placeholder:text-sam-text-dim/50 text-sm"
                            />
                            <button
                              onClick={handleCreateProject}
                              disabled={isCreatingProject || !newProjectName.trim()}
                              className="px-4 py-2.5 rounded-lg bg-sam-accent text-sam-bg font-medium text-sm hover:bg-sam-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                              {isCreatingProject ? (
                                <>
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  Creating
                                </>
                              ) : (
                                'Create'
                              )}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* RAM Selection */}
                    <div className="space-y-3">
                      <label className="text-sm font-medium text-sam-text flex items-center gap-2">
                        <Server className="w-4 h-4 text-sam-accent" />
                        Memory (RAM)
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {orgoRAMOptions.map((option) => {
                          const isDisabled = option.id < template.vmConfig.minRam
                          return (
                            <button
                              key={option.id}
                              onClick={() => !isDisabled && setSelectedRAM(option.id)}
                              disabled={isDisabled}
                              className={`p-2.5 rounded-lg border text-left transition-all flex flex-col justify-center ${
                                isDisabled
                                  ? 'border-sam-border/50 opacity-40 cursor-not-allowed'
                                  : selectedRAM === option.id
                                  ? 'border-sam-accent bg-sam-accent/10'
                                  : 'border-sam-border hover:border-sam-accent/50 hover:bg-sam-bg'
                              }`}
                            >
                              <div className="flex items-center justify-between mb-0.5">
                                <span className="text-sam-text font-medium text-sm">{option.name}</span>
                                {option.id === template.vmConfig.recommendedRam && (
                                  <span className="text-[9px] font-mono text-sam-accent bg-sam-accent/10 px-1 py-0.5 rounded">
                                    Best
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-sam-text-dim">{option.description}</div>
                              <div className={`text-[10px] mt-1 font-medium ${option.freeTier ? 'text-green-400' : 'text-amber-400'}`}>
                                {option.freeTier ? 'Free Tier' : 'Paid Plan'}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </>
                )}

                {/* Error Display */}
                {deployError && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="p-3 rounded-lg bg-sam-error/10 border border-sam-error/30 flex items-start gap-2"
                  >
                    <AlertCircle className="w-4 h-4 text-sam-error flex-shrink-0 mt-0.5" />
                    <p className="text-sam-error text-sm">{deployError}</p>
                  </motion.div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-6 border-t border-sam-border flex justify-end gap-3 sticky bottom-0 bg-sam-surface">
                <button
                  onClick={closeDeployModal}
                  disabled={isDeploying}
                  className="px-5 py-2.5 rounded-lg border border-sam-border text-sam-text-dim hover:text-sam-text hover:border-sam-accent/50 font-medium text-sm transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeploy}
                  disabled={isDeploying || isValidatingKey || !agentName.trim() || !selectedProject || (!credentials?.hasOrgoApiKey && !keyValidated)}
                  className="px-5 py-2.5 rounded-lg bg-sam-accent text-sam-bg font-medium text-sm hover:bg-sam-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isDeploying ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Deploying...
                    </>
                  ) : isValidatingKey ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Validating...
                    </>
                  ) : (
                    <>
                      <Rocket className="w-4 h-4" />
                      Deploy Agent
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create Template Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowCreateModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="bg-sam-surface border border-sam-border rounded-2xl w-full max-w-lg overflow-hidden max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-6 border-b border-sam-border">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-sam-accent/10 flex items-center justify-center">
                    <PenTool className="w-5 h-5 text-sam-accent" />
                  </div>
                  <div>
                    <h2 className="text-xl font-display font-semibold text-sam-text">
                      Create Template
                    </h2>
                    <p className="text-xs text-sam-text-dim">Share your AI agent idea</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="p-2 rounded-lg hover:bg-sam-bg transition-colors text-sam-text-dim hover:text-sam-text"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-6">
                <div className="space-y-3">
                  <label className="text-sm font-medium text-sam-text">
                    Template Name <span className="text-sam-error">*</span>
                  </label>
                  <input
                    type="text"
                    value={newTemplateName}
                    onChange={(e) => setNewTemplateName(e.target.value)}
                    placeholder="e.g., Personal Assistant"
                    className="w-full px-4 py-2.5 rounded-lg bg-sam-bg border border-sam-border focus:border-sam-accent focus:ring-1 focus:ring-sam-accent/30 transition-all text-sam-text placeholder:text-sam-text-dim/50 text-sm"
                  />
                </div>

                <div className="space-y-3">
                  <label className="text-sm font-medium text-sam-text">
                    Description <span className="text-sam-error">*</span>
                  </label>
                  <textarea
                    value={newTemplateDescription}
                    onChange={(e) => setNewTemplateDescription(e.target.value)}
                    placeholder="Describe what this AI agent does..."
                    rows={4}
                    className="w-full px-4 py-2.5 rounded-lg bg-sam-bg border border-sam-border focus:border-sam-accent focus:ring-1 focus:ring-sam-accent/30 transition-all text-sam-text placeholder:text-sam-text-dim/50 text-sm resize-none"
                  />
                </div>

                {/* Quick Ideas */}
                <div className="space-y-3">
                  <p className="text-xs text-sam-text-dim flex items-center gap-1">
                    <Lightbulb className="w-3 h-3 text-amber-400" />
                    Quick Start Ideas
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {TEMPLATE_IDEAS.slice(0, 4).map((idea, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setNewTemplateName(idea.name)
                          setNewTemplateDescription(idea.description)
                        }}
                        className="px-3 py-1.5 rounded-full bg-sam-bg border border-sam-border text-xs text-sam-text-dim hover:text-sam-text hover:border-sam-accent/50 transition-colors"
                      >
                        {idea.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Info Box */}
                <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/30">
                  <div className="flex items-start gap-3">
                    <Rocket className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-blue-400 font-medium text-sm">How it works</p>
                      <p className="text-blue-400/80 text-xs mt-1">
                        Your template will be added to the marketplace and can be deployed to any VM.
                        Other users can discover and use your template too!
                      </p>
                    </div>
                  </div>
                </div>

                {/* Error Display */}
                {createError && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="p-3 rounded-lg bg-sam-error/10 border border-sam-error/30 flex items-start gap-2"
                  >
                    <AlertCircle className="w-4 h-4 text-sam-error flex-shrink-0 mt-0.5" />
                    <p className="text-sam-error text-sm">{createError}</p>
                  </motion.div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-6 border-t border-sam-border flex justify-end gap-3">
                <button
                  onClick={() => setShowCreateModal(false)}
                  disabled={isCreatingTemplate}
                  className="px-5 py-2.5 rounded-lg border border-sam-border text-sam-text-dim hover:text-sam-text hover:border-sam-accent/50 font-medium text-sm transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateTemplate}
                  disabled={isCreatingTemplate || !newTemplateName.trim() || !newTemplateDescription.trim()}
                  className="px-5 py-2.5 rounded-lg bg-sam-accent text-sam-bg font-medium text-sm hover:bg-sam-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isCreatingTemplate ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      Create Template
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success Modal */}
      <AnimatePresence>
        {showSuccess && deployedVM && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowSuccess(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="bg-sam-surface border border-sam-border rounded-2xl w-full max-w-md overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-8 text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', delay: 0.1, duration: 0.5 }}
                  className="w-20 h-20 rounded-full bg-sam-accent/20 flex items-center justify-center mx-auto mb-6"
                >
                  <CheckCircle2 className="w-10 h-10 text-sam-accent" />
                </motion.div>
                
                <h2 className="text-2xl font-display font-bold text-sam-text mb-2">
                  Deployment Successful!
                </h2>
                <p className="text-sam-text-dim mb-6">
                  Your {template.name} agent is now running.
                </p>
                
                <div className="space-y-3">
                  <button
                    onClick={() => router.push('/select-vm')}
                    className="w-full px-4 py-3 rounded-xl bg-sam-accent text-sam-bg font-semibold hover:bg-sam-accent/90 transition-colors flex items-center justify-center gap-2"
                  >
                    Go to Dashboard
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setShowSuccess(false)}
                    className="w-full px-4 py-3 rounded-xl border border-sam-border text-sam-text-dim hover:text-sam-text hover:border-sam-accent/50 transition-colors"
                  >
                    Stay on this page
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Share Modal */}
      <AnimatePresence>
        {showShareModal && template && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowShareModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="bg-sam-surface border border-sam-border rounded-2xl w-full max-w-md overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-6 border-b border-sam-border">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-sam-accent/10 flex items-center justify-center">
                    <Share2 className="w-5 h-5 text-sam-accent" />
                  </div>
                  <div>
                    <h2 className="text-xl font-display font-semibold text-sam-text">
                      Share Template
                    </h2>
                    <p className="text-xs text-sam-text-dim">{template.name}</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowShareModal(false)}
                  className="p-2 rounded-lg hover:bg-sam-bg transition-colors text-sam-text-dim hover:text-sam-text"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-4">
                {/* Share URL Preview */}
                <div className="p-3 rounded-lg bg-sam-bg border border-sam-border">
                  <p className="text-xs text-sam-text-dim mb-1">Share URL</p>
                  <p className="text-sm text-sam-text font-mono truncate">
                    {typeof window !== 'undefined' ? `${window.location.origin}/templates/${templateId}` : ''}
                  </p>
                </div>

                {/* Share Options */}
                <div className="space-y-2">
                  {/* Copy Link */}
                  <button
                    onClick={() => {
                      const url = `${window.location.origin}/templates/${templateId}`
                      navigator.clipboard.writeText(url)
                      setCopied(true)
                      setTimeout(() => setCopied(false), 2000)
                    }}
                    className="w-full p-4 rounded-xl border border-sam-border hover:border-sam-accent/50 hover:bg-sam-bg/50 transition-all flex items-center gap-4"
                  >
                    <div className="w-10 h-10 rounded-lg bg-sam-bg flex items-center justify-center flex-shrink-0">
                      {copied ? (
                        <Check className="w-5 h-5 text-green-400" />
                      ) : (
                        <Copy className="w-5 h-5 text-sam-text-dim" />
                      )}
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sam-text font-medium text-sm">
                        {copied ? 'Copied!' : 'Copy Link'}
                      </p>
                      <p className="text-xs text-sam-text-dim">Copy the template URL to clipboard</p>
                    </div>
                  </button>

                  {/* Post on X (Twitter) */}
                  <a
                    href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`This ${template.name} AI agent template is insane.\n\n${template.description}\n\nCheck it out on ClawdBody.`)}&url=${encodeURIComponent(`${typeof window !== 'undefined' ? window.location.origin : 'https://clawdbody.com'}/templates/${templateId}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full p-4 rounded-xl border border-sam-border hover:border-sam-accent/50 hover:bg-sam-bg/50 transition-all flex items-center gap-4"
                  >
                    <div className="w-10 h-10 rounded-lg bg-sam-bg flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-sam-text-dim" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                      </svg>
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sam-text font-medium text-sm">Post on X</p>
                      <p className="text-xs text-sam-text-dim">Share to your X (Twitter) feed</p>
                    </div>
                    <ExternalLink className="w-4 h-4 text-sam-text-dim" />
                  </a>

                  {/* Post on LinkedIn */}
                  <a
                    href={`https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(`Just found this ${template.name} AI agent template and had to share.\n${template.description}\n\nIt's available on ClawdBody.\n\nWhat workflows are you automating with AI agents?`)}&url=${encodeURIComponent(`${typeof window !== 'undefined' ? window.location.origin : 'https://clawdbody.com'}/templates/${templateId}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full p-4 rounded-xl border border-sam-border hover:border-sam-accent/50 hover:bg-sam-bg/50 transition-all flex items-center gap-4"
                  >
                    <div className="w-10 h-10 rounded-lg bg-sam-bg flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-sam-text-dim" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                      </svg>
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sam-text font-medium text-sm">Post on LinkedIn</p>
                      <p className="text-xs text-sam-text-dim">Share to your LinkedIn network</p>
                    </div>
                    <ExternalLink className="w-4 h-4 text-sam-text-dim" />
                  </a>

                  {/* Share via Email */}
                  <a
                    href={`mailto:?subject=${encodeURIComponent(`${template.name} — AI agent template I found to automate entire workflow`)}&body=${encodeURIComponent(`Hey,\n\nFound this AI agent template and thought you might find it useful:\n\n${template.name}\n${template.description}\n\nIt's available on ClawdBody:\n${typeof window !== 'undefined' ? window.location.origin : 'https://clawdbody.com'}/templates/${templateId}`)}`}
                    className="w-full p-4 rounded-xl border border-sam-border hover:border-sam-accent/50 hover:bg-sam-bg/50 transition-all flex items-center gap-4"
                  >
                    <div className="w-10 h-10 rounded-lg bg-sam-bg flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-sam-text-dim" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="4" width="20" height="16" rx="2" />
                        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                      </svg>
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sam-text font-medium text-sm">Share via Email</p>
                      <p className="text-xs text-sam-text-dim">Send template link via email</p>
                    </div>
                    <ExternalLink className="w-4 h-4 text-sam-text-dim" />
                  </a>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-6 border-t border-sam-border">
                <button
                  onClick={() => setShowShareModal(false)}
                  className="w-full px-4 py-2.5 rounded-lg border border-sam-border text-sam-text-dim hover:text-sam-text hover:border-sam-accent/50 font-medium text-sm transition-colors"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
