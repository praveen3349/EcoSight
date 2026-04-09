import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

export default async function Home() {
  const { userId, sessionClaims } = await auth()
  
  if (userId) {
    const role = (sessionClaims?.metadata as any)?.role;
    if (!role) {
      redirect('/select-role')
    } else {
      redirect('/dashboard')
    }
  } else {
    redirect('/sign-in')
  }
}
