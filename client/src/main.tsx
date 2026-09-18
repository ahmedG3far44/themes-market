import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/react'


import App from './App.tsx'

import './index.css'

// Suppress expected Clerk dev-keys warning in console (dev instances).
// The warning is intentional from Clerk when using `pk_test_*` and pollutes the dev console.
// Use production publishable key (`pk_live_*`) in production to remove it at the source:
// https://clerk.com/docs/deployments/overview
if (typeof window !== 'undefined') {
  const shouldSuppressClerkDevWarning = (args: unknown[]) =>
    args.join(' ').includes('Clerk has been loaded with development keys');

  for (const method of ['warn', 'log', 'info'] as const) {
    const original = console[method].bind(console) as (...args: unknown[]) => void;
    console[method] = (...args: unknown[]) => {
      if (shouldSuppressClerkDevWarning(args)) return;
      original(...args);
    };
  }
}

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!clerkPublishableKey) throw new Error("VITE_CLERK_PUBLISHABLE_KEY is required");


createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClerkProvider publishableKey={clerkPublishableKey}>
      <App />
    </ClerkProvider>
  </StrictMode>,
)
