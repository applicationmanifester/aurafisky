// src/services/FirebaseCore.ts
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getMessaging, isSupported } from 'firebase/messaging';
import { FIREBASE_CONFIG } from '../config/constants.js';

const app = initializeApp(FIREBASE_CONFIG);
export const auth = getAuth(app);
export const db = getFirestore(app);

let messagingPromise: Promise<any> | null = null;

export async function getMessagingInstance() {
  if (!messagingPromise) {
    messagingPromise = isSupported().then((supported) => {
      if (supported) return getMessaging(app);
      return null;
    });
  }
  return messagingPromise;
}

export function destroyFirebaseCore(): void {
  messagingPromise = null;
  // Note: Firebase app deletion is async and typically not needed for SPA lifecycle
  // import { deleteApp } from 'firebase/app';
  // await deleteApp(app);
}