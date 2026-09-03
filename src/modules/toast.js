// src/modules/toast.js
export function showToast(message, options = {}) {
  if (typeof toast === 'function') {
    toast(message, options);
  } else {
    console.log('Toast:', message, options);
  }
}
