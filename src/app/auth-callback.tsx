import { Redirect } from 'expo-router';
import React from 'react';

/** OAuth returns here on native; the sign-in itself is completed by the browser session in cloud/auth.ts. */
export default function AuthCallback() {
  return <Redirect href="/account" />;
}
