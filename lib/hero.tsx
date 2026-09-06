// hero.tsx — authentication seam. If NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is set,
// Clerk is wired; otherwise the app runs as the "demo hero" so it builds/demos solo.
// Pages only ever read HeroContext — they never touch Clerk hooks directly.

"use client";

import { ClerkProvider, useAuth, useClerk, useUser } from "@clerk/nextjs";
import { createContext, useContext, type ReactNode } from "react";

export interface Hero {
  enabled: boolean;
  loading: boolean;
  signedIn: boolean;
  userId: string | null;
  name: string;
  token: (() => Promise<string | null>) | null;
  signIn: (() => void | Promise<void>) | null;
  signOut: (() => void | Promise<void>) | null;
}

const DEMO_HERO: Hero = {
  enabled: false,
  loading: false,
  signedIn: true,
  userId: "demo-hero",
  name: "The Wanderer",
  token: null,
  signIn: null,
  signOut: null,
};

const HeroContext = createContext<Hero>(DEMO_HERO);

function ClerkBridge({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, user } = useUser();
  const { getToken } = useAuth();
  const { openSignIn, signOut } = useClerk();

  const hero: Hero = {
    enabled: true,
    loading: !isLoaded,
    signedIn: !!isSignedIn,
    userId: user?.id ?? null,
    name: user?.firstName || user?.username || "The Wanderer",
    token: () => getToken(),
    signIn: async () => {
      openSignIn();
    },
    signOut: () => signOut(),
  };
  return <HeroContext.Provider value={hero}>{children}</HeroContext.Provider>;
}

export function HeroProvider({ children }: { children: ReactNode }) {
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (key) {
    return (
      <ClerkProvider publishableKey={key}>
        <ClerkBridge>{children}</ClerkBridge>
      </ClerkProvider>
    );
  }
  return <HeroContext.Provider value={DEMO_HERO}>{children}</HeroContext.Provider>;
}

export function useHero(): Hero {
  return useContext(HeroContext);
}

export function useHeroToken(): (() => Promise<string | null>) | null {
  return useHero().token;
}