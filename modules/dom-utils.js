/**
 * DOM utility helpers — safe element creation without innerHTML.
 */
window.domUtils = {
  createElement(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    if (attrs && typeof attrs === "object") {
      for (const [key, val] of Object.entries(attrs)) {
        if (key === "className") el.className = val;
        else if (key === "textContent") el.textContent = val;
        else if (key === "innerHTML")
          el.textContent = val; // fallback to safe textContent
        else if (key.startsWith("data-")) el.setAttribute(key, val);
        else el.setAttribute(key, val);
      }
    }
    children.forEach((child) => {
      if (typeof child === "string")
        el.appendChild(document.createTextNode(child));
      else if (child instanceof Node) el.appendChild(child);
    });
    return el;
  },

  clearElement(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  },

  show(el) {
    el?.classList.remove("hidden");
  },
  hide(el) {
    el?.classList.add("hidden");
  },
  toggle(el) {
    el?.classList.toggle("hidden");
  },
};
