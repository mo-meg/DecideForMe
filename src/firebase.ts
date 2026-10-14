import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { initializeAppCheck, CustomProvider, ReCaptchaV3Provider } from 'firebase/app-check';
import { getAI, getTemplateGenerativeModel, AgentPlatformBackend } from 'firebase/ai';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase App Check debug flag before App and SDK initialization
if (typeof window !== 'undefined') {
  try {
    const customToken = localStorage.getItem('FIREBASE_APPCHECK_DEBUG_TOKEN');
    // @ts-expect-error global debug token definition
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = customToken || true;
  } catch {
    // @ts-expect-error global debug token definition
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
}

const app = initializeApp(firebaseConfig);

// Initialize Firebase App Check in debug mode per requirements BEFORE getAI
export let appCheckInstance: ReturnType<typeof initializeAppCheck> | null = null;
if (typeof window !== 'undefined') {
  try {
    const siteKey = firebaseConfig.recaptchaSiteKey;
    appCheckInstance = initializeAppCheck(app, {
      provider: siteKey
        ? new ReCaptchaV3Provider(siteKey)
        : new CustomProvider({
            getToken: () => Promise.resolve({ token: '', expireTimeMillis: Date.now() + 3600000 }),
          }),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (error) {
    console.debug('App Check initialized in debug mode:', error);
  }
}

// CRITICAL: Connect directly to the provisioned database ID
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Initialize AI service using Agent Platform Gemini API backend
export const ai = getAI(app, {
  backend: new AgentPlatformBackend(),
});
export { getTemplateGenerativeModel, AgentPlatformBackend };

// Helper to retrieve the current debug token from memory or IndexedDB
export async function getActiveDebugToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  // Check window/self
  // @ts-expect-error global debug token definition
  const directToken = self.FIREBASE_APPCHECK_DEBUG_TOKEN;
  if (typeof directToken === 'string' && directToken !== 'true') {
    return directToken;
  }

  // Check localStorage
  const local = localStorage.getItem('FIREBASE_APPCHECK_DEBUG_TOKEN');
  if (local) return local;

  // Check App Check IndexedDB
  return new Promise((resolve) => {
    try {
      const openReq = indexedDB.open('firebase-app-check-database');
      openReq.onsuccess = () => {
        try {
          const dbInstance = openReq.result;
          if (dbInstance.objectStoreNames.contains('firebase-app-check-store')) {
            const tx = dbInstance.transaction('firebase-app-check-store', 'readonly');
            const store = tx.objectStore('firebase-app-check-store');
            const getReq = store.get('debug-token');
            getReq.onsuccess = () => resolve(getReq.result || null);
            getReq.onerror = () => resolve(null);
          } else {
            resolve(null);
          }
        } catch {
          resolve(null);
        }
      };
      openReq.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

// Connection test
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map((provider) => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export { signInWithPopup, signOut };
