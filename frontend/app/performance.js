// frontend/app/performance.js - Performance optimizations for the frontend

/**
 * Performance optimization utilities
 */

// Debounce function to limit how often a function can be called
export function debounce(func, wait, immediate = false) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      timeout = null;
      if (!immediate) func(...args);
    };
    const callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func(...args);
  };
}

// Throttle function to ensure a function is called at most once per interval
export function throttle(func, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

// Lazy load images and iframes
export function lazyLoadMedia() {
  if ('IntersectionObserver' in window) {
    const lazyMedia = document.querySelectorAll('[data-src], [data-srcset]');
    
    const lazyMediaObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const media = entry.target;
          
          if (media.dataset.src) {
            media.src = media.dataset.src;
          }
          
          if (media.dataset.srcset) {
            media.srcset = media.dataset.srcset;
          }
          
          media.classList.remove('lazy');
          lazyMediaObserver.unobserve(media);
        }
      });
    });
    
    lazyMedia.forEach((media) => lazyMediaObserver.observe(media));
  } else {
    // Fallback for older browsers
    const lazyMedia = document.querySelectorAll('[data-src]');
    lazyMedia.forEach((media) => {
      media.src = media.dataset.src;
    });
  }
}

// Optimize CSS delivery by marking non-critical CSS
export function optimizeCSSDelivery() {
  // Mark non-critical CSS for lazy loading
  const stylesheets = document.querySelectorAll('link[rel="stylesheet"]:not([data-critical])');
  
  stylesheets.forEach((sheet) => {
    sheet.setAttribute('media', 'print');
    sheet.setAttribute('onload', "this.media='all'");
    
    // Add a noscript fallback
    const noscript = document.createElement('noscript');
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = sheet.href;
    noscript.appendChild(link);
    sheet.parentNode.insertBefore(noscript, sheet.nextSibling);
  });
}

// Defer non-critical JavaScript
export function deferNonCriticalJS() {
  const scripts = document.querySelectorAll('script[type="text/lazy"]');
  
  scripts.forEach((script) => {
    const newScript = document.createElement('script');
    
    // Copy all attributes
    Array.from(script.attributes).forEach((attr) => {
      if (attr.name !== 'type') {
        newScript.setAttribute(attr.name, attr.value);
      }
    });
    
    // Copy content if any
    if (script.innerHTML) {
      newScript.innerHTML = script.innerHTML;
    }
    
    // Replace the lazy script with the real one
    script.parentNode.replaceChild(newScript, script);
  });
}

// Optimize animations for performance
export function optimizeAnimations() {
  // Use will-change sparingly for elements that will animate
  const animatedElements = document.querySelectorAll('.home-card, .btn, .nav-item');
  
  animatedElements.forEach((el) => {
    // Only apply will-change when the element is about to animate
    el.addEventListener('mouseenter', () => {
      el.style.willChange = 'transform, opacity';
    });
    
    el.addEventListener('mouseleave', () => {
      // Remove will-change after animation completes
      setTimeout(() => {
        el.style.willChange = 'auto';
      }, 300);
    });
  });
}

// Monitor performance metrics
export function monitorPerformance() {
  if ('performance' in window && 'getEntriesByType' in performance) {
    // Log Largest Contentful Paint
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        console.log(`LCP: ${entry.startTime}ms`, entry);
      }
    });
    
    observer.observe({ entryTypes: ['largest-contentful-paint'] });
    
    // Log First Input Delay
    const fidObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        console.log(`FID: ${entry.startTime}ms`, entry);
      }
    });
    
    fidObserver.observe({ entryTypes: ['first-input'] });
    
    // Log Cumulative Layout Shift
    const clsObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        console.log(`CLS: ${entry.value}`, entry);
      }
    });
    
    clsObserver.observe({ entryTypes: ['layout-shift'] });
  }
}

// Optimize scroll performance
export function optimizeScroll() {
  // Use passive event listeners for scroll events
  const supportsPassive = (() => {
    let supports = false;
    try {
      const opts = Object.defineProperty({}, 'passive', {
        get: () => {
          supports = true;
          return true;
        }
      });
      window.addEventListener('test', null, opts);
      window.removeEventListener('test', null, opts);
    } catch (e) {}
    return supports;
  })();
  
  const options = supportsPassive ? { passive: true } : false;
  
  // Apply to all scroll event listeners
  const originalAddEventListener = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function(type, listener, optionsOrCapture) {
    if (type === 'scroll' || type === 'touchstart' || type === 'touchmove') {
      const options = supportsPassive ? { passive: true } : false;
      originalAddEventListener.call(this, type, listener, options);
    } else {
      originalAddEventListener.call(this, type, listener, optionsOrCapture);
    }
  };
}

// Memory management - clean up unused event listeners and objects
export function setupMemoryManagement() {
  // Clean up event listeners on page navigation
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  
  history.pushState = function(...args) {
    const result = originalPushState.apply(this, args);
    window.dispatchEvent(new Event('pushstate'));
    return result;
  };
  
  history.replaceState = function(...args) {
    const result = originalReplaceState.apply(this, args);
    window.dispatchEvent(new Event('replacestate'));
    return result;
  };
  
  // Listen for navigation events to clean up
  window.addEventListener('pushstate', cleanupBeforeNavigation);
  window.addEventListener('replacestate', cleanupBeforeNavigation);
  window.addEventListener('popstate', cleanupBeforeNavigation);
}

function cleanupBeforeNavigation() {
  // Clean up any large objects or event listeners
  // This would be implemented based on the app's specific needs
  console.log('Cleaning up before navigation');
}

// Initialize all performance optimizations
export function initPerformanceOptimizations() {
  console.log('Initializing performance optimizations');
  
  // Optimize CSS delivery
  optimizeCSSDelivery();
  
  // Lazy load media
  lazyLoadMedia();
  
  // Defer non-critical JS
  deferNonCriticalJS();
  
  // Optimize animations
  optimizeAnimations();
  
  // Optimize scroll performance
  optimizeScroll();
  
  // Setup memory management
  setupMemoryManagement();
  
  // Monitor performance (development only)
  if (process.env.NODE_ENV === 'development') {
    monitorPerformance();
  }
  
  // Add performance budget warning
  if ('performance' in window) {
    const navTiming = performance.getEntriesByType('navigation')[0];
    if (navTiming) {
      const loadTime = navTiming.loadEventEnd - navTiming.startTime;
      if (loadTime > 3000) {
        console.warn(`Page load time ${loadTime}ms exceeds 3s performance budget`);
      }
    }
  }
}

// Export for use in main app
export default {
  debounce,
  throttle,
  lazyLoadMedia,
  optimizeCSSDelivery,
  deferNonCriticalJS,
  optimizeAnimations,
  monitorPerformance,
  optimizeScroll,
  setupMemoryManagement,
  initPerformanceOptimizations
};