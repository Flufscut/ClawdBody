/**
 * Notifications for credit exhaustion and other events.
 * Uses Resend by default; set RESEND_API_KEY and FROM_EMAIL.
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY
const FROM_EMAIL = process.env.FROM_EMAIL ?? 'Samantha <onboarding@resend.dev>'
const APP_NAME = process.env.APP_NAME ?? 'Samantha'
const BASE_URL = process.env.NEXTAUTH_URL ?? 'https://clawdbody.com'

export async function sendCreditExhaustedNotification(
  userId: string,
  email?: string
): Promise<void> {
  const creditsUrl = `${BASE_URL}/dashboard/credits`
  const subject = `${APP_NAME} – Your AI credits are used up`
  const html = `
    <p>Your monthly AI credits have been used up.</p>
    <p>Add more credits to keep using your Pro workspace:</p>
    <p><a href="${creditsUrl}">${creditsUrl}</a></p>
    <p>— ${APP_NAME}</p>
  `.trim()

  if (email && RESEND_API_KEY) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: email,
          subject,
          html,
        }),
      })
      if (!res.ok) {
        const err = await res.text()
        console.error('[notifications] Resend error:', res.status, err)
      }
    } catch (err) {
      console.error('[notifications] sendCreditExhaustedNotification failed:', err)
    }
  } else {
    // No email provider or no email – log for in-app notification later
    console.log(`[notifications] Credit exhausted for user ${userId} (email ${email ?? 'none'}). In-app: ${creditsUrl}`)
  }
}
