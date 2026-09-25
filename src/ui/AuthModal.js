/**
 * Authentication Modal UI
 * Handles sign in, sign up, password reset, and user menu
 */
import { authService } from '../services/AuthService.js';
import { showToast } from '../modules/toast.js';

const TEMPLATE = `
<div class="auth-modal-overlay" id="authModalOverlay" role="dialog" aria-modal="true" aria-labelledby="authTitle">
  <div class="auth-modal">
    <button class="auth-close" aria-label="Close">&times;</button>
    
    <!-- Sign In Form -->
    <div class="auth-form" id="signInForm">
      <h2 id="authTitle">Welcome Back</h2>
      <p class="auth-subtitle">Sign in to sync your places & alerts</p>
      
      <div class="auth-divider">
        <span>or continue with</span>
      </div>
      <button class="auth-btn google" id="googleSignInBtn" type="button">
        <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
        <span>Continue with Google</span>
      </button>
      
      <form id="emailSignInForm">
        <div class="auth-field">
          <label for="signInEmail">Email</label>
          <input type="email" id="signInEmail" autocomplete="email" required>
        </div>
        <div class="auth-field">
          <label for="signInPassword">Password</label>
          <input type="password" id="signInPassword" autocomplete="current-password" required>
        </div>
        <button type="submit" class="auth-btn primary">Sign In</button>
      </form>
      
      <p class="auth-error" id="signInError" aria-live="polite"></p>
      <p class="auth-switch">Don't have an account? <button type="button" id="switchToSignUp">Sign up</button></p>
      <p class="auth-switch"><button type="button" id="switchToReset">Forgot password?</button></p>
    </div>

    <!-- Sign Up Form -->
    <div class="auth-form hidden" id="signUpForm">
      <h2 id="authTitle">Create Account</h2>
      <p class="auth-subtitle">Free tier: 3 places, 3 alerts</p>
      
      <form id="emailSignUpForm">
        <div class="auth-field">
          <label for="signUpName">Name</label>
          <input type="text" id="signUpName" autocomplete="name" required minlength="2" maxlength="30">
        </div>
        <div class="auth-field">
          <label for="signUpEmail">Email</label>
          <input type="email" id="signUpEmail" autocomplete="email" required>
        </div>
        <div class="auth-field">
          <label for="signUpPassword">Password</label>
          <input type="password" id="signUpPassword" autocomplete="new-password" required minlength="8">
          <span class="field-hint">At least 8 characters</span>
        </div>
        <div class="auth-field">
          <label for="signUpConfirm">Confirm Password</label>
          <input type="password" id="signUpConfirm" autocomplete="new-password" required>
        </div>
        <button type="submit" class="auth-btn primary">Create Account</button>
      </form>
      
      <p class="auth-error" id="signUpError" aria-live="polite"></p>
      <p class="auth-switch">Already have an account? <button type="button" id="switchToSignIn">Sign in</button></p>
    </div>

    <!-- Password Reset Form -->
    <div class="auth-form hidden" id="resetForm">
      <h2 id="authTitle">Reset Password</h2>
      <p class="auth-subtitle">Enter your email to receive a reset link</p>
      
      <form id="emailResetForm">
        <div class="auth-field">
          <label for="resetEmail">Email</label>
          <input type="email" id="resetEmail" autocomplete="email" required>
        </div>
        <button type="submit" class="auth-btn primary">Send Reset Link</button>
      </form>
      
      <p class="auth-error" id="resetError" aria-live="polite"></p>
      <p class="auth-success hidden" id="resetSuccess"></p>
      <p class="auth-switch"><button type="button" id="switchToSignInFromReset">Back to sign in</button></p>
    </div>
  </div>
</div>

<!-- User Menu (when signed in) -->
<div class="user-menu hidden" id="userMenu" role="menu">
  <div class="user-menu-header">
    <img class="user-avatar" id="userAvatar" src="" alt="">
    <div class="user-info">
      <span class="user-name" id="userName"></span>
      <span class="user-tier" id="userTier">Free</span>
    </div>
  </div>
  <div class="user-menu-divider"></div>
  <button class="user-menu-item" id="menuProfile" role="menuitem">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
    <span>Profile</span>
  </button>
  <button class="user-menu-item" id="menuPlaces" role="menuitem">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
    <span>My Places</span>
  </button>
  <button class="user-menu-item" id="menuAlerts" role="menuitem">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
    <span>Alerts</span>
  </button>
  <button class="user-menu-item" id="menuSettings" role="menuitem">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
    <span>Settings</span>
  </button>
  <div class="user-menu-divider"></div>
  <button class="user-menu-item danger" id="menuSignOut" role="menuitem">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
    <span>Sign Out</span>
  </button>
</div>
`;

const STYLES = `
.auth-modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.5);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000; opacity: 0; visibility: hidden; transition: opacity .2s, visibility .2s;
}
.auth-modal-overlay.visible { opacity: 1; visibility: visible; }
.auth-modal {
  background: var(--bg-primary, #fff); border-radius: 12px; padding: 24px;
  width: 100%; max-width: 400px; box-shadow: 0 20px 40px rgba(0,0,0,.15);
  transform: scale(.95); transition: transform .2s;
}
.auth-modal-overlay.visible .auth-modal { transform: scale(1); }
.auth-close {
  position: absolute; top: 12px; right: 12px; background: none; border: none;
  font-size: 24px; cursor: pointer; color: var(--text-muted, #666);
  width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
}
.auth-form h2 { margin: 0 0 4px; font-size: 22px; }
.auth-subtitle { margin: 0 0 20px; color: var(--text-muted, #666); font-size: 14px; }
.auth-divider { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; color: var(--text-muted, #666); font-size: 13px; }
.auth-divider::before, .auth-divider::after { content: ''; flex: 1; height: 1px; background: var(--border-color, #eee); }
.google { background: #fff; border: 1px solid var(--border-color, #ddd); color: var(--text-primary, #333); }
.google:hover { background: var(--bg-hover, #f5f5f5); }
.auth-field { margin-bottom: 16px; }
.auth-field label { display: block; margin-bottom: 6px; font-size: 13px; font-weight: 500; }
.auth-field input { width: 100%; padding: 10px 12px; border: 1px solid var(--border-color, #ddd); border-radius: 8px; font-size: 15px; box-sizing: border-box; }
.auth-field input:focus { outline: none; border-color: var(--accent, #3b82f6); box-shadow: 0 0 0 3px rgba(59,130,246,.15); }
.field-hint { display: block; margin-top: 4px; font-size: 12px; color: var(--text-muted, #666); }
.auth-btn { width: 100%; padding: 12px; border: none; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; transition: background .15s; }
.auth-btn.primary { background: var(--accent, #3b82f6); color: #fff; }
.auth-btn.primary:hover { background: var(--accent-hover, #2563eb); }
.auth-btn.primary:disabled { opacity: .6; cursor: not-allowed; }
.auth-error { color: var(--error, #ef4444); font-size: 13px; min-height: 18px; margin: 8px 0 0; }
.auth-success { color: var(--success, #22c55e); font-size: 13px; margin: 8px 0 0; }
.auth-switch { margin: 16px 0 0; font-size: 13px; text-align: center; color: var(--text-muted, #666); }
.auth-switch button { background: none; border: none; color: var(--accent, #3b82f6); cursor: pointer; font-weight: 500; }
.auth-form.hidden { display: none; }

/* User Menu */
.user-menu {
  position: absolute; top: calc(100% + 8px); right: 0; min-width: 220px;
  background: var(--bg-primary, #fff); border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,.15);
  border: 1px solid var(--border-color, #eee); overflow: hidden; z-index: 100;
}
.user-menu-header { padding: 12px 16px; display: flex; align-items: center; gap: 12px; }
.user-avatar { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; background: var(--bg-secondary, #f0f0f0); }
.user-info { display: flex; flex-direction: column; }
.user-name { font-weight: 600; font-size: 14px; }
.user-tier { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: var(--accent-light, #dbeafe); color: var(--accent, #3b82f6); text-transform: uppercase; }
.user-menu-divider { height: 1px; background: var(--border-color, #eee); margin: 4px 0; }
.user-menu-item { display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 16px; background: none; border: none; text-align: left; font-size: 14px; color: var(--text-primary, #333); cursor: pointer; }
.user-menu-item:hover { background: var(--bg-hover, #f5f5f5); }
.user-menu-item.danger { color: var(--error, #ef4444); }
`;

export default class AuthModal {
  constructor() {
    this.overlay = null;
    this.currentForm = 'signIn';
    this.init();
  }

  init() {
    // Inject styles once
    if (!document.getElementById('auth-modal-styles')) {
      const style = document.createElement('style');
      style.id = 'auth-modal-styles';
      style.textContent = STYLES;
      document.head.appendChild(style);
    }

    // Inject template
    const container = document.createElement('div');
    container.innerHTML = TEMPLATE;
    document.body.appendChild(container);

    this.overlay = document.getElementById('authModalOverlay');
    this.bindEvents();
    this.bindAuthState();
  }

  bindEvents() {
    // Close handlers
    this.overlay.querySelector('.auth-close').onclick = () => this.hide();
    this.overlay.onclick = (e) => { if (e.target === this.overlay) this.hide(); };

    // Form switching
    this.overlay.querySelector('#switchToSignUp').onclick = () => this.showForm('signUp');
    this.overlay.querySelector('#switchToSignIn').onclick = () => this.showForm('signIn');
    this.overlay.querySelector('#switchToReset').onclick = () => this.showForm('reset');
    this.overlay.querySelector('#switchToSignInFromReset').onclick = () => this.showForm('signIn');

    // Google sign in
    this.overlay.querySelector('#googleSignInBtn').onclick = () => this.handleGoogleSignIn();

    // Email forms
    this.overlay.querySelector('#emailSignInForm').onsubmit = (e) => this.handleEmailSignIn(e);
    this.overlay.querySelector('#emailSignUpForm').onsubmit = (e) => this.handleEmailSignUp(e);
    this.overlay.querySelector('#emailResetForm').onsubmit = (e) => this.handlePasswordReset(e);
  }

  bindAuthState() {
    authService.on('auth:changed', (user) => this.updateUserMenu(user));
    authService.on('profile:loaded', (profile) => this.updateUserMenu(authService.currentUser, profile));
  }

  show() {
    this.overlay.classList.add('visible');
    this.showForm('signIn');
    document.body.style.overflow = 'hidden';
    // Focus first input
    setTimeout(() => this.overlay.querySelector('input')?.focus(), 100);
  }

  hide() {
    this.overlay.classList.remove('visible');
    document.body.style.overflow = '';
    this.clearErrors();
  }

  showForm(formName) {
    this.currentForm = formName;
    this.overlay.querySelectorAll('.auth-form').forEach(f => f.classList.add('hidden'));
    this.overlay.querySelector(`#${formName}Form`).classList.remove('hidden');
    this.clearErrors();
    setTimeout(() => this.overlay.querySelector('input')?.focus(), 50);
  }

  clearErrors() {
    this.overlay.querySelectorAll('.auth-error').forEach(e => e.textContent = '');
    this.overlay.querySelectorAll('.auth-success').forEach(e => e.classList.add('hidden'));
  }

  setError(formName, message) {
    this.overlay.querySelector(`#${formName}Error`).textContent = message;
  }

  setSuccess(formName, message) {
    const el = this.overlay.querySelector(`#${formName}Success`);
    if (el) { el.textContent = message; el.classList.remove('hidden'); }
  }

  setLoading(formName, loading) {
    const btn = this.overlay.querySelector(`#${formName}Form .auth-btn.primary`);
    if (btn) { btn.disabled = loading; btn.textContent = loading ? 'Please wait…' : btn.dataset.originalText || 'Submit'; }
  }

  async handleGoogleSignIn() {
    const btn = this.overlay.querySelector('#googleSignInBtn');
    btn.disabled = true;
    btn.textContent = 'Redirecting…';
    try {
      await authService.signInWithGoogle();
      this.hide();
      showToast('Signed in with Google');
    } catch (err) {
      this.setError('signIn', err.message);
      showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg><span>Continue with Google</span>`;
    }
  }

  async handleEmailSignIn(e) {
    e.preventDefault();
    const form = e.target;
    const email = form.signInEmail.value.trim();
    const password = form.signInPassword.value;
    this.setLoading('signIn', true);
    try {
      await authService.signInWithEmail(email, password);
      this.hide();
      showToast('Welcome back!');
    } catch (err) {
      this.setError('signIn', this.#friendlyError(err));
    } finally {
      this.setLoading('signIn', false);
    }
  }

  async handleEmailSignUp(e) {
    e.preventDefault();
    const form = e.target;
    const name = form.signUpName.value.trim();
    const email = form.signUpEmail.value.trim();
    const password = form.signUpPassword.value;
    const confirm = form.signUpConfirm.value;

    if (password !== confirm) return this.setError('signUp', 'Passwords do not match');
    if (password.length < 8) return this.setError('signUp', 'Password must be at least 8 characters');

    this.setLoading('signUp', true);
    try {
      await authService.signUpWithEmail(email, password, name);
      this.hide();
      showToast('Account created!');
    } catch (err) {
      this.setError('signUp', this.#friendlyError(err));
    } finally {
      this.setLoading('signUp', false);
    }
  }

  async handlePasswordReset(e) {
    e.preventDefault();
    const email = this.overlay.querySelector('#resetEmail').value.trim();
    this.setLoading('reset', true);
    try {
      await authService.resetPassword(email);
      this.setSuccess('reset', 'Reset link sent! Check your email.');
      this.overlay.querySelector('#emailResetForm').reset();
    } catch (err) {
      this.setError('reset', this.#friendlyError(err));
    } finally {
      this.setLoading('reset', false);
    }
  }

  #friendlyError(err) {
    const msg = err.message || '';
    if (msg.includes('auth/user-not-found') || msg.includes('auth/wrong-password')) return 'Invalid email or password';
    if (msg.includes('auth/email-already-in-use')) return 'Email already registered';
    if (msg.includes('auth/weak-password')) return 'Password too weak';
    if (msg.includes('auth/invalid-email')) return 'Invalid email address';
    if (msg.includes('auth/popup-closed-by-user')) return 'Sign-in popup was closed';
    if (msg.includes('auth/network-request-failed')) return 'Network error. Check connection.';
    return 'Authentication failed. Please try again.';
  }

  updateUserMenu(user, profile) {
    const menu = document.getElementById('userMenu');
    const trigger = document.getElementById('userMenuTrigger');
    if (!menu || !trigger) return;

    if (user) {
      trigger.classList.remove('hidden');
      menu.classList.add('hidden'); // hidden by default, shown on click
      if (profile) {
        document.getElementById('userName').textContent = profile.displayName || user.email;
        document.getElementById('userTier').textContent = profile.tier === 'pro' ? 'Pro' : profile.tier === 'team' ? 'Team' : 'Free';
        document.getElementById('userAvatar').src = profile.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.displayName || user.email)}&background=3b82f6&color=fff`;
      }
      this.bindUserMenu();
    } else {
      trigger.classList.add('hidden');
      menu.classList.add('hidden');
    }
  }

  bindUserMenu() {
    const trigger = document.getElementById('userMenuTrigger');
    const menu = document.getElementById('userMenu');
    if (!trigger || !menu) return;

    // Clean up old listeners
    trigger.onclick = null;
    menu.querySelectorAll('button').forEach(b => b.onclick = null);

    trigger.onclick = (e) => {
      e.stopPropagation();
      menu.classList.toggle('hidden');
    };

    document.addEventListener('click', (e) => {
      if (!menu.contains(e.target) && e.target !== trigger) menu.classList.add('hidden');
    });

    menu.querySelector('#menuSignOut').onclick = async () => {
      await authService.signOut();
      showToast('Signed out');
      menu.classList.add('hidden');
    };

    menu.querySelector('#menuProfile').onclick = () => {
      menu.classList.add('hidden');
      this.showProfilePanel();
    };

    menu.querySelector('#menuPlaces').onclick = () => {
      menu.classList.add('hidden');
      this.showPlacesPanel();
    };

    menu.querySelector('#menuAlerts').onclick = () => {
      menu.classList.add('hidden');
      this.showAlertsPanel();
    };

    menu.querySelector('#menuSettings').onclick = () => {
      menu.classList.add('hidden');
      this.showSettingsPanel();
    };
  }

  showProfilePanel() { /* TODO: implement */ }
  showPlacesPanel() { /* TODO: implement */ }
  showAlertsPanel() { /* TODO: implement */ }
  showSettingsPanel() { /* TODO: implement */ }
}