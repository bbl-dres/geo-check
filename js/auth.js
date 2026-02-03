/**
 * auth.js - Authentication Module
 *
 * Handles user authentication with Supabase Auth.
 * Email + Password authentication for now, with SAML SSO support planned.
 */

import { getSupabase } from './supabase.js';

// =============================================================================
// STATE
// =============================================================================

let currentSession = null;
let currentUser = null;
let currentAppUser = null;  // User from our users table (with role, etc.)

// Callbacks for auth state changes
let onAuthStateChangeCallback = null;

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Initialize authentication and set up listeners
 */
export async function initAuth() {
    const supabase = getSupabase();
    if (!supabase) {
        console.error('Supabase client not available');
        return null;
    }

    // Get current session
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error) {
        console.error('Error getting session:', error);
        return null;
    }

    if (session) {
        currentSession = session;
        currentUser = session.user;
        await loadAppUser(session.user.id);
    }

    // Listen for auth changes
    supabase.auth.onAuthStateChange(async (event, session) => {
        console.log('Auth state changed:', event);

        currentSession = session;
        currentUser = session?.user || null;

        if (session?.user) {
            await loadAppUser(session.user.id);
        } else {
            currentAppUser = null;
        }

        // Notify callback
        if (onAuthStateChangeCallback) {
            onAuthStateChangeCallback(event, session, currentAppUser);
        }
    });

    return currentAppUser;
}

/**
 * Load the app user from our users table (includes role, initials, etc.)
 */
async function loadAppUser(authUserId) {
    const supabase = getSupabase();

    const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('auth_user_id', authUserId)
        .single();

    if (error) {
        console.error('Error loading app user:', error);
        // User might be authenticated but not in our users table yet
        currentAppUser = null;
        return null;
    }

    currentAppUser = {
        id: data.id,
        name: data.name,
        initials: data.initials,
        email: data.email,
        role: data.role,
        avatarUrl: data.avatar_url,
        authUserId: data.auth_user_id
    };

    return currentAppUser;
}

// =============================================================================
// AUTHENTICATION METHODS
// =============================================================================

/**
 * Sign in with email and password
 */
export async function signIn(email, password) {
    const supabase = getSupabase();

    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
    });

    if (error) {
        throw error;
    }

    return data;
}

/**
 * Sign out the current user
 */
export async function signOut() {
    const supabase = getSupabase();

    const { error } = await supabase.auth.signOut();

    if (error) {
        throw error;
    }

    currentSession = null;
    currentUser = null;
    currentAppUser = null;
}

/**
 * Request password reset email
 */
export async function resetPassword(email) {
    const supabase = getSupabase();

    // Redirect back to main app - Supabase adds recovery token to URL hash
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin
    });

    if (error) {
        throw error;
    }
}

/**
 * Check if we're in password recovery mode (user clicked reset link in email)
 */
export function isPasswordRecoveryMode() {
    // Supabase adds #access_token=...&type=recovery to URL after clicking reset link
    const hash = window.location.hash;
    return hash.includes('type=recovery');
}

/**
 * Update password (after reset or for logged-in user)
 */
export async function updatePassword(newPassword) {
    const supabase = getSupabase();

    const { error } = await supabase.auth.updateUser({
        password: newPassword
    });

    if (error) {
        throw error;
    }
}

// =============================================================================
// SESSION & USER GETTERS
// =============================================================================

/**
 * Check if user is currently authenticated
 */
export function isAuthenticated() {
    return currentSession !== null && currentUser !== null;
}

/**
 * Get current session
 */
export function getSession() {
    return currentSession;
}

/**
 * Get current Supabase auth user
 */
export function getAuthUser() {
    return currentUser;
}

/**
 * Get current app user (from our users table)
 */
export function getCurrentUser() {
    return currentAppUser;
}

/**
 * Get current user's name (for display)
 */
export function getCurrentUserName() {
    return currentAppUser?.name || currentUser?.email || 'Unbekannt';
}

/**
 * Get current user's ID (from our users table)
 */
export function getCurrentUserId() {
    return currentAppUser?.id || null;
}

/**
 * Get current user's role
 */
export function getCurrentUserRole() {
    return currentAppUser?.role || 'Leser';
}

/**
 * Check if current user has at least the specified role
 */
export function hasRole(requiredRole) {
    const roleHierarchy = ['Leser', 'Bearbeiter', 'Admin'];
    const currentRoleIndex = roleHierarchy.indexOf(getCurrentUserRole());
    const requiredRoleIndex = roleHierarchy.indexOf(requiredRole);
    return currentRoleIndex >= requiredRoleIndex;
}

/**
 * Check if current user can edit (Bearbeiter or Admin)
 */
export function canEdit() {
    return hasRole('Bearbeiter');
}

/**
 * Check if current user is admin
 */
export function isAdmin() {
    return hasRole('Admin');
}

// =============================================================================
// CALLBACKS
// =============================================================================

/**
 * Set callback for auth state changes
 */
export function onAuthStateChange(callback) {
    onAuthStateChangeCallback = callback;
}

// =============================================================================
// UI HELPERS
// =============================================================================

/**
 * Show the login modal
 */
export function showLoginModal() {
    const modal = document.getElementById('login-modal');
    if (modal) {
        modal.classList.add('visible');
        // Focus email input
        const emailInput = modal.querySelector('input[type="email"]');
        if (emailInput) {
            emailInput.focus();
        }
    }
}

/**
 * Hide the login modal
 */
export function hideLoginModal() {
    const modal = document.getElementById('login-modal');
    if (modal) {
        modal.classList.remove('visible');
        // Clear form
        const form = modal.querySelector('form');
        if (form) {
            form.reset();
        }
        // Clear errors
        const errorEl = modal.querySelector('.login-error');
        if (errorEl) {
            errorEl.textContent = '';
            errorEl.style.display = 'none';
        }
    }
}

/**
 * Show login error message
 */
export function showLoginError(message) {
    const modal = document.getElementById('login-modal');
    if (modal) {
        const errorEl = modal.querySelector('.login-error');
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.style.display = 'block';
        }
    }
}

/**
 * Update UI to reflect logged-in state
 */
export function updateUIForAuthState() {
    const user = getCurrentUser();
    const isLoggedIn = isAuthenticated();

    // Get user menu elements
    const loginBtn = document.getElementById('login-btn');
    const userTrigger = document.getElementById('user-trigger');
    const userInitials = document.getElementById('user-initials');
    const userDropdownName = document.getElementById('user-dropdown-name');
    const userDropdownRole = document.getElementById('user-dropdown-role');

    if (isLoggedIn && user) {
        // Hide login button, show user trigger
        if (loginBtn) loginBtn.style.display = 'none';
        if (userTrigger) userTrigger.style.display = 'flex';

        // Populate user info
        if (userInitials) userInitials.textContent = user.initials || '??';
        if (userDropdownName) userDropdownName.textContent = user.name;
        if (userDropdownRole) userDropdownRole.textContent = user.role;
    } else {
        // Show login button, hide user trigger
        if (loginBtn) loginBtn.style.display = '';
        if (userTrigger) userTrigger.style.display = 'none';
    }

    // Update edit buttons based on permissions
    const editButtons = document.querySelectorAll('[data-requires-edit]');
    editButtons.forEach(btn => {
        btn.style.display = canEdit() ? '' : 'none';
    });

    // Update admin-only elements
    const adminElements = document.querySelectorAll('[data-requires-admin]');
    adminElements.forEach(el => {
        el.style.display = isAdmin() ? '' : 'none';
    });
}

/**
 * Setup login form handlers (both modal and landing page)
 */
export function setupLoginForm() {
    // Setup modal login form
    setupFormHandler('login-form', 'login-error', 'forgot-password-link', true);

    // Setup landing page login form
    setupFormHandler('landing-login-form', 'landing-login-error', 'landing-forgot-password', false);

    // Close modal on backdrop click
    const modal = document.getElementById('login-modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                hideLoginModal();
            }
        });
    }

    // Close modal on escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideLoginModal();
        }
    });
}

/**
 * Setup a login form handler
 */
function setupFormHandler(formId, errorId, resetLinkId, isModal) {
    const form = document.getElementById(formId);
    if (!form) return;

    const errorEl = document.getElementById(errorId);

    const showError = (message) => {
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.classList.add('visible');
            errorEl.style.display = 'block';
        }
    };

    const hideError = () => {
        if (errorEl) {
            errorEl.classList.remove('visible');
            errorEl.style.display = 'none';
        }
    };

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideError();

        const email = form.querySelector('input[name="email"]').value;
        const password = form.querySelector('input[name="password"]').value;
        const submitBtn = form.querySelector('button[type="submit"]');

        // Disable button during login
        submitBtn.disabled = true;
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Anmelden...';

        try {
            await signIn(email, password);
            if (isModal) {
                hideLoginModal();
            }
            // App will show via auth state change callback
        } catch (error) {
            console.error('Login error:', error);
            let message = 'Anmeldung fehlgeschlagen';
            if (error.message.includes('Invalid login credentials')) {
                message = 'E-Mail oder Passwort falsch';
            } else if (error.message.includes('Email not confirmed')) {
                message = 'E-Mail-Adresse nicht bestätigt';
            }
            showError(message);
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    });

    // Password reset link
    const resetLink = document.getElementById(resetLinkId);
    if (resetLink) {
        resetLink.addEventListener('click', async (e) => {
            e.preventDefault();
            const email = form.querySelector('input[name="email"]').value;
            if (!email) {
                showError('Bitte E-Mail-Adresse eingeben');
                return;
            }
            try {
                await resetPassword(email);
                showError('Passwort-Reset E-Mail gesendet');
            } catch (error) {
                showError('Fehler beim Senden der E-Mail');
            }
        });
    }
}

// =============================================================================
// PASSWORD RESET MODAL
// =============================================================================

/**
 * Show the password reset modal
 */
export function showPasswordResetModal() {
    const modal = document.getElementById('password-reset-modal');
    if (modal) {
        modal.classList.add('visible');
    }
}

/**
 * Hide the password reset modal
 */
export function hidePasswordResetModal() {
    const modal = document.getElementById('password-reset-modal');
    if (modal) {
        modal.classList.remove('visible');
        // Clear form
        const form = modal.querySelector('form');
        if (form) form.reset();
        // Clear messages
        const errorEl = document.getElementById('password-reset-error');
        const successEl = document.getElementById('password-reset-success');
        if (errorEl) errorEl.style.display = 'none';
        if (successEl) successEl.style.display = 'none';
    }
    // Clear the hash from URL
    if (window.location.hash) {
        history.replaceState(null, '', window.location.pathname + window.location.search);
    }
}

/**
 * Setup password reset form handler
 */
export function setupPasswordResetForm() {
    const form = document.getElementById('password-reset-form');
    if (!form) return;

    const errorEl = document.getElementById('password-reset-error');
    const successEl = document.getElementById('password-reset-success');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const password = form.querySelector('input[name="password"]').value;
        const passwordConfirm = form.querySelector('input[name="password-confirm"]').value;
        const submitBtn = form.querySelector('button[type="submit"]');

        // Hide previous messages
        if (errorEl) errorEl.style.display = 'none';
        if (successEl) successEl.style.display = 'none';

        // Validate passwords match
        if (password !== passwordConfirm) {
            if (errorEl) {
                errorEl.textContent = 'Passwörter stimmen nicht überein';
                errorEl.style.display = 'block';
            }
            return;
        }

        // Validate minimum length
        if (password.length < 6) {
            if (errorEl) {
                errorEl.textContent = 'Passwort muss mindestens 6 Zeichen lang sein';
                errorEl.style.display = 'block';
            }
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Speichern...';

        try {
            await updatePassword(password);
            if (successEl) {
                successEl.textContent = 'Passwort erfolgreich geändert!';
                successEl.style.display = 'block';
            }
            // Hide modal after short delay
            setTimeout(() => {
                hidePasswordResetModal();
                window.location.reload();
            }, 1500);
        } catch (error) {
            console.error('Password update error:', error);
            if (errorEl) {
                errorEl.textContent = 'Fehler beim Speichern des Passworts';
                errorEl.style.display = 'block';
            }
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Passwort speichern';
        }
    });
}

// =============================================================================
// USER DROPDOWN
// =============================================================================

/**
 * Setup user dropdown toggle behavior
 */
export function setupUserDropdown() {
    const userMenu = document.getElementById('user-menu');
    const userTrigger = document.getElementById('user-trigger');

    if (!userMenu || !userTrigger) return;

    // Toggle dropdown on trigger click
    userTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        userMenu.classList.toggle('open');
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!userMenu.contains(e.target)) {
            userMenu.classList.remove('open');
        }
    });

    // Close dropdown on escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            userMenu.classList.remove('open');
        }
    });
}

// =============================================================================
// EXPOSE TO WINDOW FOR INLINE HANDLERS
// =============================================================================

// Make auth functions available globally for onclick handlers
if (typeof window !== 'undefined') {
    window.auth = {
        showLoginModal,
        hideLoginModal,
        hidePasswordResetModal,
        signOut: async () => {
            await signOut();
            window.location.reload();
        }
    };
}
