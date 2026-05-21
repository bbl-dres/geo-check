/**
 * auth.js - Demo Authentication Module
 *
 * In demo mode, the user is always "logged in" as a demo admin user.
 * All auth UI (login modal, password reset, invite) is kept as no-ops
 * so existing code doesn't break.
 */

import { scheduleLucideRefresh } from './icons.js';

// =============================================================================
// STATE — Demo user is always active
// =============================================================================

const DEMO_USER = {
    id: 1,
    name: 'Demo Benutzer',
    initials: 'DB',
    email: 'demo@bbl.admin.ch',
    role: 'Admin',
    avatarUrl: null,
    authUserId: 'demo-auth-001'
};

let currentAppUser = { ...DEMO_USER };
let onAuthStateChangeCallback = null;

// =============================================================================
// INITIALIZATION
// =============================================================================

export async function initAuth() {
    // In demo mode, user is always authenticated
    return currentAppUser;
}

// =============================================================================
// SESSION & USER GETTERS
// =============================================================================

export function isAuthenticated() {
    return true;
}

export function getCurrentUser() {
    return currentAppUser;
}

export function getCurrentUserName() {
    return currentAppUser.name;
}

export function getCurrentUserId() {
    return currentAppUser.id;
}

export function getCurrentUserRole() {
    return currentAppUser.role;
}

export function hasRole(requiredRole) {
    const roleHierarchy = ['Leser', 'Bearbeiter', 'Admin'];
    const currentRoleIndex = roleHierarchy.indexOf(getCurrentUserRole());
    const requiredRoleIndex = roleHierarchy.indexOf(requiredRole);
    return currentRoleIndex >= requiredRoleIndex;
}

export function canEdit() {
    return hasRole('Bearbeiter');
}

export function isAdmin() {
    return hasRole('Admin');
}

// =============================================================================
// AUTH ACTIONS (No-ops in demo mode)
// =============================================================================

export async function signIn(email, password) {
    return { user: currentAppUser };
}

export async function signOut() {
    // No-op in demo mode
}

export async function resetPassword(email) {
    // No-op
}

export function isPasswordRecoveryMode() {
    return false;
}

export async function updatePassword(newPassword) {
    // No-op
}

// =============================================================================
// CALLBACKS
// =============================================================================

export function onAuthStateChange(callback) {
    onAuthStateChangeCallback = callback;
}

// =============================================================================
// UI HELPERS (simplified for demo)
// =============================================================================

export function showLoginModal() {}
export function hideLoginModal() {}

export function updateUIForAuthState() {
    const user = getCurrentUser();

    // Hide login button, show user trigger
    const loginBtn = document.getElementById('login-btn');
    const userTrigger = document.getElementById('user-trigger');
    const userInitials = document.getElementById('user-initials');
    const userDropdownName = document.getElementById('user-dropdown-name');
    const userDropdownRole = document.getElementById('user-dropdown-role');

    if (loginBtn) loginBtn.style.display = 'none';
    if (userTrigger) userTrigger.style.display = 'flex';
    if (userInitials) userInitials.textContent = user.initials;
    if (userDropdownName) userDropdownName.textContent = user.name;
    if (userDropdownRole) userDropdownRole.textContent = `${user.role} (Demo)`;

    // Show edit buttons
    const editButtons = document.querySelectorAll('[data-requires-edit]');
    editButtons.forEach(btn => { btn.style.display = ''; });

    // Show admin elements
    const adminElements = document.querySelectorAll('[data-requires-admin]');
    adminElements.forEach(el => { el.style.display = ''; });
}

export function setupLoginForm() {}
export function setupPasswordResetForm() {}
export function setupForgotPasswordForm() {}
export function setupInviteForm() {}

export function setupUserDropdown() {
    const userMenu = document.getElementById('user-menu');
    const userTrigger = document.getElementById('user-trigger');

    if (!userMenu || !userTrigger) return;

    userTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        userMenu.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
        if (!userMenu.contains(e.target)) {
            userMenu.classList.remove('open');
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            userMenu.classList.remove('open');
        }
    });
}

export function showPasswordResetModal() {}
export function hidePasswordResetModal() {}
export function showForgotPasswordModal() {}
export function hideForgotPasswordModal() {}
export function showInviteModal() {}
export function hideInviteModal() {}

// =============================================================================
// EXPOSE TO WINDOW FOR INLINE HANDLERS
// =============================================================================

if (typeof window !== 'undefined') {
    window.auth = {
        showLoginModal,
        hideLoginModal,
        hidePasswordResetModal,
        showForgotPasswordModal,
        hideForgotPasswordModal,
        signOut: () => {
            alert('Demo-Modus: Abmelden ist nicht verfügbar.');
        }
    };

    window.inviteUser = {
        show: showInviteModal,
        hide: hideInviteModal
    };
}
