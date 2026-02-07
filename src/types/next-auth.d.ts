import 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      isPro?: boolean
      name?: string | null
      email?: string | null
      image?: string | null
    }
  }
}

declare module 'next-auth/adapters' {
  interface AdapterUser {
    isPro?: boolean
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken?: string
  }
}


