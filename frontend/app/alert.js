// frontend/app/alert.js - Enhanced alert system with icons and better UX
export function showAlert(type, message, options = {}) {
  // type: "info" | "success" | "warn" | "error"
  // options: { timeout: number, icon: boolean, progress: boolean, action: { label, callback } }
  const {
    timeout = 5000,
    icon = true,
    progress = false,
    action = null
  } = typeof options === 'number' ? { timeout: options } : options;

  const container = document.getElementById("alertContainer") || document.body;

  const mapped = (() => {
    const t = (type || "info").toLowerCase();
    if (t === "success") return "success";
    if (t === "warn" || t === "warning") return "warning";
    if (t === "error") return "error";
    return "info";
  })();

  const el = document.createElement("div");
  el.className = `alert alert-${mapped}`;
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");
  el.style.pointerEvents = "auto";
  el.tabIndex = -1;

  // Create icon if enabled
  let iconHTML = '';
  if (icon) {
    const icons = {
      info: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
      success: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
      warning: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
      error: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`
    };
    iconHTML = `<span class="alert-icon">${icons[mapped]}</span>`;
  }

  // Create content container
  const content = document.createElement("div");
  content.className = "alert-content";
  content.innerHTML = iconHTML;

  const messageSpan = document.createElement("span");
  messageSpan.className = "alert-message";
  messageSpan.textContent = message;
  content.appendChild(messageSpan);

  // Create action button if provided
  let actionButton = null;
  if (action && action.label && action.callback) {
    actionButton = document.createElement("button");
    actionButton.className = "alert-action";
    actionButton.textContent = action.label;
    actionButton.style.marginLeft = "12px";
    actionButton.style.padding = "4px 12px";
    actionButton.style.borderRadius = "6px";
    actionButton.style.border = "1px solid rgba(255, 255, 255, 0.2)";
    actionButton.style.background = "rgba(255, 255, 255, 0.1)";
    actionButton.style.color = "inherit";
    actionButton.style.fontSize = "12px";
    actionButton.style.cursor = "pointer";
    actionButton.style.transition = "all 0.15s ease";
    
    actionButton.addEventListener("click", (e) => {
      e.stopPropagation();
      action.callback();
      removeAlert(el);
    });
    
    actionButton.addEventListener("mouseenter", () => {
      actionButton.style.background = "rgba(255, 255, 255, 0.2)";
      actionButton.style.borderColor = "rgba(255, 255, 255, 0.3)";
    });
    
    actionButton.addEventListener("mouseleave", () => {
      actionButton.style.background = "rgba(255, 255, 255, 0.1)";
      actionButton.style.borderColor = "rgba(255, 255, 255, 0.2)";
    });
    
    content.appendChild(actionButton);
  }

  // Create close button
  const close = document.createElement("button");
  close.className = "alert-close";
  close.setAttribute("role", "button");
  close.setAttribute("aria-label", "Close alert");
  close.innerHTML = "&times;";

  close.addEventListener("click", () => {
    removeAlert(el);
  });

  // Create progress bar if enabled
  let progressBar = null;
  let progressFill = null;
  if (progress && timeout > 0) {
    progressBar = document.createElement("div");
    progressBar.className = "progress-bar";
    
    progressFill = document.createElement("div");
    progressFill.className = "progress-fill";
    progressFill.style.width = "100%";
    
    progressBar.appendChild(progressFill);
  }

  // Assemble the alert
  el.appendChild(content);
  el.appendChild(close);
  if (progressBar) {
    el.appendChild(progressBar);
  }
  
  container.appendChild(el);

  // Auto-remove after timeout
  let timeoutId;
  if (timeout > 0) {
    if (progressFill) {
      // Animate progress bar
      progressFill.style.transition = `width ${timeout}ms linear`;
      setTimeout(() => {
        if (progressFill) progressFill.style.width = "0%";
      }, 10);
    }
    
    timeoutId = setTimeout(() => {
      removeAlert(el);
    }, timeout);
  }

  // Function to remove alert
  function removeAlert(alertEl) {
    if (timeoutId) clearTimeout(timeoutId);
    alertEl.style.transition = "opacity 0.2s ease, transform 0.2s ease";
    alertEl.style.opacity = "0";
    alertEl.style.transform = "translateX(20px)";
    setTimeout(() => {
      if (alertEl.parentNode) {
        alertEl.parentNode.removeChild(alertEl);
      }
    }, 200);
  }

  // Make alert focusable and allow keyboard dismissal
  el.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      removeAlert(el);
    }
  });

  // Return the alert element for external control
  return {
    element: el,
    dismiss: () => removeAlert(el),
    updateMessage: (newMessage) => {
      messageSpan.textContent = newMessage;
    }
  };
}

// Toast notification function
export function showToast(type, message, timeout = 3000) {
  const container = document.getElementById("toastContainer") || (() => {
    const div = document.createElement("div");
    div.className = "toast-container";
    document.body.appendChild(div);
    return div;
  })();

  const mapped = (() => {
    const t = (type || "info").toLowerCase();
    if (t === "success") return "success";
    if (t === "warn" || t === "warning") return "warning";
    if (t === "error") return "error";
    return "info";
  })();

  const toast = document.createElement("div");
  toast.className = `toast toast-${mapped}`;
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");

  const icons = {
    info: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
    success: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
    warning: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    error: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`
  };

  toast.innerHTML = `
    <div class="toast-content">
      <span class="toast-icon">${icons[mapped]}</span>
      <span class="toast-message">${message}</span>
    </div>
    <button class="toast-close" aria-label="Close toast">&times;</button>
  `;

  const closeBtn = toast.querySelector(".toast-close");
  closeBtn.addEventListener("click", () => {
    removeToast(toast);
  });

  container.appendChild(toast);

  // Auto-remove
  const timeoutId = setTimeout(() => {
    removeToast(toast);
  }, timeout);

  function removeToast(toastEl) {
    clearTimeout(timeoutId);
    toastEl.style.animation = "toastFadeOut 0.2s forwards";
    setTimeout(() => {
      if (toastEl.parentNode) {
        toastEl.parentNode.removeChild(toastEl);
      }
    }, 200);
  }

  return toast;
}

// Loading spinner utility
export function showLoading(message = "Loading...") {
  const container = document.getElementById("alertContainer") || document.body;
  
  const loading = document.createElement("div");
  loading.className = "alert alert-info";
  loading.setAttribute("role", "status");
  loading.setAttribute("aria-live", "polite");
  
  loading.innerHTML = `
    <div class="alert-content">
      <span class="alert-icon">
        <div class="loading-spinner"></div>
      </span>
      <span class="alert-message">${message}</span>
    </div>
  `;
  
  container.appendChild(loading);
  
  return {
    element: loading,
    dismiss: () => {
      loading.style.transition = "opacity 0.2s ease";
      loading.style.opacity = "0";
      setTimeout(() => {
        if (loading.parentNode) {
          loading.parentNode.removeChild(loading);
        }
      }, 200);
    },
    updateMessage: (newMessage) => {
      const messageSpan = loading.querySelector(".alert-message");
      if (messageSpan) messageSpan.textContent = newMessage;
    }
  };
}
