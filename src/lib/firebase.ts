import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  User,
  getAuth,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// CRITICAL: Connect to the provisioned Enterprise Firestore database ID
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export const GOOGLE_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
] as const;

export const googleProvider = new GoogleAuthProvider();
for (const scope of GOOGLE_CALENDAR_SCOPES) {
  googleProvider.addScope(scope);
}
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Strictly in-memory Google Calendar access token cache (never stored in localStorage/sessionStorage)
let cachedGoogleAccessToken: string | null = null;
let isSigningInFlag = false;

export function getGoogleAccessToken(): string | null {
  return cachedGoogleAccessToken;
}

export function setGoogleAccessToken(token: string | null): void {
  cachedGoogleAccessToken = token;
}

export function clearGoogleAccessToken(): void {
  cachedGoogleAccessToken = null;
}

export function isAuthSignInInProgress(): boolean {
  return isSigningInFlag;
}

export async function signInWithGoogleCalendar(): Promise<{
  user: User;
  accessToken: string | null;
}> {
  isSigningInFlag = true;
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const accessToken = credential?.accessToken ?? null;
    cachedGoogleAccessToken = accessToken;
    return { user: result.user, accessToken };
  } finally {
    isSigningInFlag = false;
  }
}

export async function signOutFromGoogle(): Promise<void> {
  cachedGoogleAccessToken = null;
  await signOut(auth);
}

export const BOOTSTRAP_ADMIN_EMAIL = 'onegretedesign@gmail.com';

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

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
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

async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();
