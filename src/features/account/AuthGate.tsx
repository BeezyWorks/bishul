import React from 'react'

import { Loading } from '@/components'

import { SignInScreen } from './SignInScreen'
import { useAccount } from './store'

/** Signed-out visitors see the landing and sign-in; signed-in users get the app. */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { status } = useAccount()
  if (status === 'unknown') return <Loading />
  if (status === 'signedOut') return <SignInScreen />
  return <>{children}</>
}
