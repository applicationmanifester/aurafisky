// src/utils/ui/toast.js
/**
 * Simple toast notification utility.
 * Usage: toast.show('Message', 'info');
 */
export const toast = {
  show(msg, type = 'info') {
    const div = document.createElement('div');
    div.className = `toast ${type}`;
    div.textContent = msg;
    document.body.appendChild(div);
    // Auto‑remove after 4 seconds
    setTimeout(() => div.remove(), 4000);
  },
};
