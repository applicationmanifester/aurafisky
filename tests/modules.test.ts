// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";

// Set up global window before importing modules
if (typeof window !== "undefined") {
  document.body.innerHTML = `<div id="toastContainer"></div>`;
}

import "../modules/dom-utils.js";
import "../modules/toast.js";

const { domUtils } = window as any;
const { toastModule } = window as any;

describe("domUtils", () => {
  it("creates HTML element safely with attributes and text", () => {
    const el = domUtils.createElement(
      "button",
      { id: "testBtn", className: "btn-primary", "data-action": "click" },
      "Click me"
    );
    expect(el.tagName).toBe("BUTTON");
    expect(el.id).toBe("testBtn");
    expect(el.className).toBe("btn-primary");
    expect(el.getAttribute("data-action")).toBe("click");
    expect(el.textContent).toBe("Click me");
  });

  it("clears element children cleanly", () => {
    const parent = document.createElement("div");
    parent.appendChild(document.createElement("span"));
    parent.appendChild(document.createElement("p"));
    expect(parent.children.length).toBe(2);

    domUtils.clearElement(parent);
    expect(parent.children.length).toBe(0);
  });

  it("toggles hidden class on element", () => {
    const div = document.createElement("div");
    domUtils.hide(div);
    expect(div.classList.contains("hidden")).toBe(true);

    domUtils.show(div);
    expect(div.classList.contains("hidden")).toBe(false);

    domUtils.toggle(div);
    expect(div.classList.contains("hidden")).toBe(true);
  });
});

describe("toastModule", () => {
  beforeEach(() => {
    document.body.innerHTML = `<div id="toastContainer"></div>`;
  });

  it("renders toast element inside container", () => {
    toastModule.show("Weather alert test", "warning", 5000);
    const container = document.getElementById("toastContainer");
    expect(container?.children.length).toBe(1);

    const toast = container?.children[0] as HTMLElement;
    expect(toast.textContent).toContain("Weather alert test");
  });

  it("deduplicates identical toast messages", () => {
    toastModule.show("Duplicate message", "info");
    toastModule.show("Duplicate message", "info");

    const container = document.getElementById("toastContainer");
    expect(container?.children.length).toBe(1);
  });
});
