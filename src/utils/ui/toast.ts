// src/utils/ui/toast.ts
// Simple toast notification system

interface ToastOptions {
  type?: 'info' | 'success' | 'error' | 'warning';
  duration?: number;
}

export function showToast(message: string, options: ToastOptions = {}) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  
  const { type = 'info', duration = 3000 } = options;
  
  const toast = document.createElement('div');
  toast.className = `glass rounded-xl px-4 py-3 shadow-lg animate-slide-in flex items-center gap-3 ${
    type === 'error' ? 'border-l-4 border-red-500' :
    type === 'success' ? 'border-l-4 border-green-500' :
    type === 'warning' ? 'border-l-4 border-yellow-500' :
    'border-l-4 border-blue-500'
  }`;
  
  const icon = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warning' ? '⚠️' : 'ℹ️';
  const iconSpan = document.createElement('span');
  iconSpan.textContent = icon;
  const msgSpan = document.createElement('span');
  msgSpan.className = 'text-sm text-slate-700 dark:text-slate-200';
  msgSpan.textContent = message;
  toast.appendChild(iconSpan);
  toast.appendChild(msgSpan);
  
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.classList.add('animate-fade-out');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}