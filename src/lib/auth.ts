import { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { prisma } from '@/lib/prisma'
import { encryptUserData, decryptUserData, isUserDataEncrypted } from '@/lib/encryption'

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as any,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          prompt: 'consent',
          access_type: 'offline',
          response_type: 'code',
          scope: 'openid email profile',
        },
      },
    }),
  ],
  callbacks: {
    async redirect({ url, baseUrl }) {
      // Redirect to select-vm after sign-in
      if (url.startsWith(baseUrl)) {
        return `${baseUrl}/select-vm`
      }
      // Allow relative callback URLs
      if (url.startsWith('/')) {
        return `${baseUrl}${url}`
      }
      return baseUrl
    },
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id
        session.user.isPro = user.isPro
        // Decrypt email if it's encrypted
        if (user.email && isUserDataEncrypted(user.email)) {
          session.user.email = decryptUserData(user.email)
        }
      }
      return session
    },
    async jwt({ token, account }) {
      // Persist the OAuth access_token to the token right after signin
      if (account) {
        token.accessToken = account.access_token
      }
      return token
    },
    async signIn({ user }) {
      try {
        // Get or create SetupState for the user
        let setupState = await prisma.setupState.findUnique({
          where: { userId: user.id },
        })

        if (!setupState) {
          setupState = await prisma.setupState.create({
            data: {
              userId: user.id,
              status: 'pending',
            },
          })
        }

        // Encrypt user email if not already encrypted
        if (user.email && !isUserDataEncrypted(user.email)) {
          try {
            await prisma.user.update({
              where: { id: user.id },
              data: { email: encryptUserData(user.email) },
            })
          } catch (updateError) {
            // Email update failed, but don't block sign-in
          }
        }
      } catch (error) {
        // Don't block authentication if setup state creation fails
        // Log error for debugging but allow sign-in to proceed
      }

      return true
    },
  },
  pages: {
    signIn: '/',
    error: '/',
  },
  session: {
    strategy: 'database',
  },
}
