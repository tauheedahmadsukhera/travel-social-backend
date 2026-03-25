/**
 * Firebase Authentication Implementation
 * To switch to another provider (Supabase, AWS Cognito), create a new implementation
 */

import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  sendPasswordResetEmail as firebaseSendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  User as FirebaseUser
} from 'firebase/auth';
import { auth } from '../../config/firebase';
import { AuthResult, IAuthService, User } from '../interfaces/IAuthService';

export class FirebaseAuthService implements IAuthService {
  async signUpWithEmail(email: string, password: string): Promise<AuthResult> {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    return {
      user: this.mapFirebaseUser(credential.user),
      token: await credential.user.getIdToken()
    };
  }

  async signUpWithPhone(phone: string): Promise<AuthResult> {
    throw new Error('Phone signup not implemented yet');
  }

  async signInWithEmail(email: string, password: string): Promise<AuthResult> {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    return {
      user: this.mapFirebaseUser(credential.user),
      token: await credential.user.getIdToken()
    };
  }

  async signInWithPhone(phone: string): Promise<AuthResult> {
    throw new Error('Phone signin not implemented yet');
  }

  async signInWithGoogle(): Promise<AuthResult> {
    const provider = new GoogleAuthProvider();
    const credential = await signInWithPopup(auth, provider);
    return {
      user: this.mapFirebaseUser(credential.user),
      token: await credential.user.getIdToken()
    };
  }

  async signInWithApple(): Promise<AuthResult> {
    throw new Error('Apple signin not implemented yet');
  }

  async sendPasswordResetEmail(email: string): Promise<void> {
    await firebaseSendPasswordResetEmail(auth, email);
  }

  async resetPassword(code: string, newPassword: string): Promise<void> {
    throw new Error('Password reset with code not implemented yet');
  }

  getCurrentUser(): User | null {
    const firebaseUser = auth.currentUser;
    return firebaseUser ? this.mapFirebaseUser(firebaseUser) : null;
  }

  async signOut(): Promise<void> {
    await firebaseSignOut(auth);
  }

  onAuthStateChanged(callback: (user: User | null) => void): () => void {
    return firebaseOnAuthStateChanged(auth, (firebaseUser) => {
      callback(firebaseUser ? this.mapFirebaseUser(firebaseUser) : null);
    });
  }

  async verifyPhoneNumber(phone: string): Promise<string> {
    throw new Error('Phone verification not implemented yet');
  }

  async confirmPhoneVerification(verificationId: string, code: string): Promise<AuthResult> {
    throw new Error('Phone verification confirmation not implemented yet');
  }

  private mapFirebaseUser(firebaseUser: FirebaseUser): User {
    return {
      uid: firebaseUser.uid,
      email: firebaseUser.email || undefined,
      phoneNumber: firebaseUser.phoneNumber || undefined,
      displayName: firebaseUser.displayName || undefined,
      photoURL: firebaseUser.photoURL || undefined
    };
  }
}

