import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const count = await prisma.user.count()
    return NextResponse.json({ count })
  } catch {
    return NextResponse.json({ count: 0 })
  }
}
