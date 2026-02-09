/**
 * auth.js - Authentication Module
 *
 * Handles user authentication with Supabase Auth.
 * Email + Password authentication for now, with SAML SSO support planned.
 */

import { scheduleLucideRefresh } from './icons.js';
import { getSupabase, SUPABASE_URL } from './supabase.js';

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
 * Check if we're in password recovery or invite mode
 * (user clicked reset link or invite link in email)
 */
export function isPasswordRecoveryMode() {
    // Supabase adds #access_token=...&type=recovery (or type=invite) to URL
    const hash = window.location.hash;
    return hash.includes('type=recovery') || hash.includes('type=invite');
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

    // Password reset link — open the forgot password modal
    const resetLink = document.getElementById(resetLinkId);
    if (resetLink) {
        resetLink.addEventListener('click', (e) => {
            e.preventDefault();
            // Pre-fill email if already entered
            const email = form.querySelector('input[name="email"]').value;
            if (isModal) hideLoginModal();
            showForgotPasswordModal(email);
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
        const hintEl = document.getElementById('pw-match-hint');
        if (errorEl) errorEl.style.display = 'none';
        if (hintEl) { hintEl.textContent = ''; hintEl.className = 'pw-match-hint'; }
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
    const passwordInput = document.getElementById('pw-reset-password');
    const confirmInput = document.getElementById('pw-reset-confirm');
    const hintEl = document.getElementById('pw-match-hint');
    const cancelBtn = document.getElementById('pw-reset-cancel');
    const submitBtn = document.getElementById('pw-reset-submit');

    // Live match feedback
    function updateMatchHint() {
        if (!hintEl) return;
        const pw = passwordInput.value;
        const confirm = confirmInput.value;

        if (!confirm) {
            hintEl.textContent = '';
            hintEl.className = 'pw-match-hint';
            return;
        }

        if (pw === confirm) {
            hintEl.textContent = 'Passwörter stimmen überein';
            hintEl.className = 'pw-match-hint pw-match-ok';
        } else {
            hintEl.textContent = 'Passwörter stimmen nicht überein';
            hintEl.className = 'pw-match-hint pw-match-error';
        }
    }

    if (passwordInput) passwordInput.addEventListener('input', updateMatchHint);
    if (confirmInput) confirmInput.addEventListener('input', updateMatchHint);

    // Cancel button
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            hidePasswordResetModal();
        });
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const password = passwordInput.value;
        const passwordConfirm = confirmInput.value;

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
// FORGOT PASSWORD MODAL
// =============================================================================

/**
 * Show the forgot password modal, optionally pre-filling the email
 */
export function showForgotPasswordModal(email = '') {
    const modal = document.getElementById('forgot-password-modal');
    if (!modal) return;

    // Reset to form step
    const formStep = document.getElementById('forgot-password-form-step');
    const confirmStep = document.getElementById('forgot-password-confirm-step');
    if (formStep) formStep.style.display = '';
    if (confirmStep) confirmStep.style.display = 'none';

    // Pre-fill email if provided
    const emailInput = modal.querySelector('input[name="email"]');
    if (emailInput && email) emailInput.value = email;

    // Clear error
    const errorEl = document.getElementById('forgot-password-error');
    if (errorEl) errorEl.style.display = 'none';

    modal.classList.add('visible');
    scheduleLucideRefresh();
}

/**
 * Hide the forgot password modal
 */
export function hideForgotPasswordModal() {
    const modal = document.getElementById('forgot-password-modal');
    if (!modal) return;
    modal.classList.remove('visible');
    // Clear form
    const form = modal.querySelector('form');
    if (form) form.reset();
}

/**
 * Setup forgot password form handler
 */
export function setupForgotPasswordForm() {
    const form = document.getElementById('forgot-password-form');
    if (!form) return;

    const errorEl = document.getElementById('forgot-password-error');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = form.querySelector('input[name="email"]').value;
        const submitBtn = form.querySelector('button[type="submit"]');

        // Hide previous error
        if (errorEl) errorEl.style.display = 'none';

        submitBtn.disabled = true;
        submitBtn.textContent = 'Senden...';

        try {
            await resetPassword(email);
            // Switch to confirmation step
            const formStep = document.getElementById('forgot-password-form-step');
            const confirmStep = document.getElementById('forgot-password-confirm-step');
            if (formStep) formStep.style.display = 'none';
            if (confirmStep) confirmStep.style.display = '';
            scheduleLucideRefresh();
        } catch (error) {
            console.error('Password reset error:', error);
            if (errorEl) {
                errorEl.textContent = 'Fehler beim Senden der E-Mail. Bitte versuchen Sie es erneut.';
                errorEl.style.display = 'block';
            }
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Link senden';
        }
    });
}

// =============================================================================
// INVITE USER
// =============================================================================

/**
 * Show the invite user modal
 */
export function showInviteModal() {
    const modal = document.getElementById('modal-invite-user');
    if (!modal) return;

    // Reset to form step
    const formStep = document.getElementById('invite-form-step');
    const confirmStep = document.getElementById('invite-confirm-step');
    if (formStep) formStep.style.display = '';
    if (confirmStep) confirmStep.style.display = 'none';

    // Clear form and error
    const form = document.getElementById('invite-user-form');
    if (form) form.reset();
    const errorEl = document.getElementById('invite-error');
    if (errorEl) errorEl.style.display = 'none';

    modal.classList.add('active');
}

/**
 * Hide the invite user modal
 */
export function hideInviteModal() {
    const modal = document.getElementById('modal-invite-user');
    if (!modal) return;
    modal.classList.remove('active');
}

/**
 * Invite a user via Supabase Edge Function
 */
async function inviteUserByEmail(email, role) {
    const supabase = getSupabase();
    const { data: { session } } = await supabase.auth.getSession();

    const response = await fetch(`${SUPABASE_URL}/functions/v1/invite-user`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ email, role })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Einladung fehlgeschlagen');
    }

    return response.json();
}

/**
 * Setup invite user form handler
 */
export function setupInviteForm() {
    const form = document.getElementById('invite-user-form');
    if (!form) return;

    const errorEl = document.getElementById('invite-error');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = form.querySelector('input[name="email"]').value;
        const role = form.querySelector('select[name="role"]').value;
        const submitBtn = form.querySelector('button[type="submit"]');

        // Hide previous error
        if (errorEl) errorEl.style.display = 'none';

        submitBtn.disabled = true;
        submitBtn.textContent = 'Senden...';

        try {
            await inviteUserByEmail(email, role);

            // Switch to confirmation step
            const formStep = document.getElementById('invite-form-step');
            const confirmStep = document.getElementById('invite-confirm-step');
            const confirmEmail = document.getElementById('invite-confirm-email');
            if (formStep) formStep.style.display = 'none';
            if (confirmStep) confirmStep.style.display = '';
            if (confirmEmail) confirmEmail.textContent = `${email} erhält eine E-Mail mit einem Link zur Registrierung.`;
            scheduleLucideRefresh();
        } catch (error) {
            console.error('Invite error:', error);
            if (errorEl) {
                errorEl.textContent = error.message || 'Einladung konnte nicht gesendet werden.';
                errorEl.style.display = 'block';
            }
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Einladung senden';
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
        showForgotPasswordModal,
        hideForgotPasswordModal,
        signOut: async () => {
            try {
                await signOut();
                window.location.reload();
            } catch (error) {
                console.error('Sign out error:', error);
                alert('Fehler beim Abmelden. Bitte versuchen Sie es erneut.');
            }
        }
    };

    window.inviteUser = {
        show: showInviteModal,
        hide: hideInviteModal
    };
}
