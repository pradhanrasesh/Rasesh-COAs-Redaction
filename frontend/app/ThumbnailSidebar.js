// ------------------------------------------------------------
// ThumbnailSidebar.js — Thumbnail sidebar for PDF page navigation
// ------------------------------------------------------------

import { pdfDoc, numPages, pageViews, setCurrentPageVisible } from "./Utils.js";

// Thumbnail scale factor (smaller than main view)
const THUMBNAIL_SCALE = 0.15;
const THUMBNAIL_MAX_WIDTH = 180;
const THUMBNAIL_MAX_HEIGHT = 240;

// DOM elements
let thumbnailContainer = null;
let thumbnailPageCount = null;
let btnToggleThumbnails = null;
let thumbnailSidebar = null;

// State
let thumbnails = [];
let isThumbnailSidebarVisible = true;
let activeThumbnailIndex = -1;

// ------------------------------------------------------------
// Initialize
// ------------------------------------------------------------
export function initThumbnailSidebar() {
    thumbnailContainer = document.getElementById("thumbnailContainer");
    thumbnailPageCount = document.getElementById("thumbnailPageCount");
    btnToggleThumbnails = document.getElementById("btnToggleThumbnails");
    thumbnailSidebar = document.getElementById("thumbnailSidebar");

    if (!thumbnailContainer || !thumbnailSidebar) {
        console.warn("Thumbnail sidebar elements not found");
        return;
    }

    // Set up toggle button
    if (btnToggleThumbnails) {
        btnToggleThumbnails.addEventListener("click", toggleThumbnailSidebar);
        updateToggleButtonIcon();
    }

    // Listen for PDF loaded event
    document.addEventListener("pdf-loaded", onPDFLoaded);
    document.addEventListener("pages-rendered", onPagesRendered);

    // Listen for scroll events to update active thumbnail
    const pdfPagesColumn = document.getElementById("pdfPagesColumn");
    if (pdfPagesColumn) {
        pdfPagesColumn.addEventListener("scroll", updateActiveThumbnailFromScroll);
    }

    console.log("Thumbnail sidebar initialized");
}

// ------------------------------------------------------------
// Handle PDF loaded
// ------------------------------------------------------------
function onPDFLoaded() {
    if (!pdfDoc) return;
    
    // Update page count
    if (thumbnailPageCount) {
        thumbnailPageCount.textContent = numPages;
    }
    
    // Clear previous thumbnails
    clearThumbnails();
    
    // Generate thumbnails
    generateThumbnails();
}

// ------------------------------------------------------------
// Handle pages rendered
// ------------------------------------------------------------
function onPagesRendered() {
    // Update active thumbnail based on current scroll position
    updateActiveThumbnailFromScroll();
}

// ------------------------------------------------------------
// Generate thumbnails for all pages
// ------------------------------------------------------------
async function generateThumbnails() {
    if (!pdfDoc || numPages === 0) return;
    
    thumbnails = [];
    
    // Show loading state
    thumbnailContainer.innerHTML = `
        <div class="thumbnail-loading">
            <i data-lucide="loader-2" class="spin"></i>
            <p>Generating thumbnails...</p>
        </div>
    `;
    
    // Create thumbnails for each page
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        try {
            const thumbnail = await createThumbnailForPage(pageNum);
            thumbnails.push(thumbnail);
        } catch (error) {
            console.error(`Failed to create thumbnail for page ${pageNum}:`, error);
            // Create a placeholder for failed thumbnails
            thumbnails.push(createPlaceholderThumbnail(pageNum));
        }
    }
    
    // Render thumbnails
    renderThumbnails();
}

// ------------------------------------------------------------
// Create thumbnail for a single page
// ------------------------------------------------------------
async function createThumbnailForPage(pageNum) {
    const page = await pdfDoc.getPage(pageNum);
    
    // Calculate thumbnail scale to fit within max dimensions
    const viewport = page.getViewport({ scale: 1.0 });
    const scale = Math.min(
        THUMBNAIL_SCALE,
        THUMBNAIL_MAX_WIDTH / viewport.width,
        THUMBNAIL_MAX_HEIGHT / viewport.height
    );
    
    const thumbnailViewport = page.getViewport({ scale });
    
    // Create canvas for thumbnail
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    
    canvas.width = thumbnailViewport.width;
    canvas.height = thumbnailViewport.height;
    canvas.className = "thumbnail-canvas";
    canvas.dataset.pageNumber = pageNum;
    
    // Render page to thumbnail canvas
    await page.render({
        canvasContext: ctx,
        viewport: thumbnailViewport
    }).promise;
    
    // Apply thumbnail styling (grayscale, border, etc.)
    ctx.filter = "grayscale(20%) brightness(0.98)";
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(canvas, 0, 0);
    
    return {
        pageNum,
        canvas,
        width: thumbnailViewport.width,
        height: thumbnailViewport.height,
        element: null // Will be set in render
    };
}

// ------------------------------------------------------------
// Create placeholder thumbnail
// ------------------------------------------------------------
function createPlaceholderThumbnail(pageNum) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    
    canvas.width = 120;
    canvas.height = 160;
    canvas.className = "thumbnail-canvas placeholder";
    canvas.dataset.pageNumber = pageNum;
    
    // Draw placeholder background
    ctx.fillStyle = "var(--color-neutral-100, #f5f5f5)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw border
    ctx.strokeStyle = "var(--color-neutral-300, #d4d4d4)";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);
    
    // Draw page number
    ctx.fillStyle = "var(--color-neutral-500, #737373)";
    ctx.font = "bold 16px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`Page ${pageNum}`, canvas.width / 2, canvas.height / 2);
    
    return {
        pageNum,
        canvas,
        width: canvas.width,
        height: canvas.height,
        element: null,
        isPlaceholder: true
    };
}

// ------------------------------------------------------------
// Render thumbnails to DOM
// ------------------------------------------------------------
function renderThumbnails() {
    if (!thumbnailContainer) return;
    
    thumbnailContainer.innerHTML = "";
    
    thumbnails.forEach((thumb, index) => {
        const thumbElement = document.createElement("div");
        thumbElement.className = "thumbnail-item";
        thumbElement.dataset.pageNumber = thumb.pageNum;
        thumbElement.dataset.index = index;
        
        // Create wrapper for canvas
        const canvasWrapper = document.createElement("div");
        canvasWrapper.className = "thumbnail-canvas-wrapper";
        canvasWrapper.appendChild(thumb.canvas);
        
        // Create page number label
        const pageLabel = document.createElement("div");
        pageLabel.className = "thumbnail-page-label";
        pageLabel.textContent = `Page ${thumb.pageNum}`;
        
        thumbElement.appendChild(canvasWrapper);
        thumbElement.appendChild(pageLabel);
        
        // Add click event
        thumbElement.addEventListener("click", () => navigateToPage(thumb.pageNum));
        
        // Store reference
        thumb.element = thumbElement;
        thumbnailContainer.appendChild(thumbElement);
    });
    
    // Update active thumbnail
    updateActiveThumbnail(1); // Start with page 1
}

// ------------------------------------------------------------
// Clear thumbnails
// ------------------------------------------------------------
function clearThumbnails() {
    thumbnails = [];
    if (thumbnailContainer) {
        thumbnailContainer.innerHTML = `
            <div class="thumbnail-placeholder">
                <i data-lucide="file-image"></i>
                <p>Upload a PDF to see thumbnails</p>
            </div>
        `;
    }
}

// ------------------------------------------------------------
// Navigate to specific page
// ------------------------------------------------------------
function navigateToPage(pageNum) {
    const pdfPagesColumn = document.getElementById("pdfPagesColumn");
    if (!pdfPagesColumn) return;
    
    const pageElement = document.querySelector(`.page-container[data-page-number="${pageNum}"]`);
    if (pageElement) {
        // Scroll to the page
        pageElement.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
        
        // Update active thumbnail
        updateActiveThumbnail(pageNum);
        
        // Update current page in state
        setCurrentPageVisible(pageNum);
        
        // Dispatch event
        document.dispatchEvent(new CustomEvent("page-navigated", {
            detail: { pageNum }
        }));
    }
}

// ------------------------------------------------------------
// Update active thumbnail
// ------------------------------------------------------------
function updateActiveThumbnail(pageNum) {
    // Remove active class from all thumbnails
    document.querySelectorAll(".thumbnail-item").forEach(item => {
        item.classList.remove("active");
    });
    
    // Add active class to target thumbnail
    const targetThumb = document.querySelector(`.thumbnail-item[data-page-number="${pageNum}"]`);
    if (targetThumb) {
        targetThumb.classList.add("active");
        activeThumbnailIndex = parseInt(targetThumb.dataset.index);
        
        // Ensure thumbnail is visible in container (scroll if needed)
        if (thumbnailContainer) {
            const thumbTop = targetThumb.offsetTop;
            const thumbHeight = targetThumb.offsetHeight;
            const containerHeight = thumbnailContainer.clientHeight;
            const containerScrollTop = thumbnailContainer.scrollTop;
            
            if (thumbTop < containerScrollTop) {
                // Thumbnail is above visible area
                thumbnailContainer.scrollTop = thumbTop;
            } else if (thumbTop + thumbHeight > containerScrollTop + containerHeight) {
                // Thumbnail is below visible area
                thumbnailContainer.scrollTop = thumbTop + thumbHeight - containerHeight;
            }
        }
    }
}

// ------------------------------------------------------------
// Update active thumbnail based on scroll position
// ------------------------------------------------------------
function updateActiveThumbnailFromScroll() {
    const pdfPagesColumn = document.getElementById("pdfPagesColumn");
    if (!pdfPagesColumn || thumbnails.length === 0) return;
    
    const scrollTop = pdfPagesColumn.scrollTop;
    const containerHeight = pdfPagesColumn.clientHeight;
    
    // Find which page is most visible
    let mostVisiblePage = 1;
    let maxVisibility = 0;
    
    for (let i = 0; i < pageViews.length; i++) {
        const view = pageViews[i];
        if (!view || !view.wrapper) continue;
        
        const wrapper = view.wrapper;
        const wrapperTop = wrapper.offsetTop;
        const wrapperHeight = wrapper.offsetHeight;
        
        // Calculate visible portion
        const visibleTop = Math.max(0, scrollTop - wrapperTop);
        const visibleBottom = Math.min(wrapperHeight, scrollTop + containerHeight - wrapperTop);
        const visibleHeight = Math.max(0, visibleBottom - visibleTop);
        const visibility = visibleHeight / Math.min(wrapperHeight, containerHeight);
        
        if (visibility > maxVisibility) {
            maxVisibility = visibility;
            mostVisiblePage = view.pageNumber;
        }
    }
    
    // Update active thumbnail if changed
    if (mostVisiblePage !== activeThumbnailIndex + 1) {
        updateActiveThumbnail(mostVisiblePage);
        setCurrentPageVisible(mostVisiblePage);
    }
}

// ------------------------------------------------------------
// Toggle thumbnail sidebar visibility
// ------------------------------------------------------------
function toggleThumbnailSidebar() {
    isThumbnailSidebarVisible = !isThumbnailSidebarVisible;
    
    if (thumbnailSidebar) {
        if (isThumbnailSidebarVisible) {
            thumbnailSidebar.style.display = "flex";
        } else {
            thumbnailSidebar.style.display = "none";
        }
    }
    
    updateToggleButtonIcon();
    
    // Update workspace grid
    updateWorkspaceGrid();
}

// ------------------------------------------------------------
// Update toggle button icon
// ------------------------------------------------------------
function updateToggleButtonIcon() {
    if (!btnToggleThumbnails) return;
    
    const icon = btnToggleThumbnails.querySelector("i");
    if (icon) {
        if (isThumbnailSidebarVisible) {
            icon.setAttribute("data-lucide", "panel-left-close");
        } else {
            icon.setAttribute("data-lucide", "panel-left-open");
        }
        
        // Update Lucide icon
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }
}

// ------------------------------------------------------------
// Update workspace grid based on thumbnail visibility
// ------------------------------------------------------------
function updateWorkspaceGrid() {
    const workspace = document.querySelector(".workspace");
    if (!workspace) return;
    
    if (isThumbnailSidebarVisible) {
        // 4-column layout: sidebar | thumbnails | viewer | tools
        workspace.style.gridTemplateColumns = "250px 240px 1fr 200px";
    } else {
        // 3-column layout: sidebar | viewer | tools (hide thumbnails)
        workspace.style.gridTemplateColumns = "250px 1fr 200px";
    }
}

// ------------------------------------------------------------
// Public API
// ------------------------------------------------------------
export function refreshThumbnails() {
    if (pdfDoc && numPages > 0) {
        generateThumbnails();
    }
}

export function getThumbnailSidebarVisible() {
    return isThumbnailSidebarVisible;
}

export function setThumbnailSidebarVisible(visible) {
    isThumbnailSidebarVisible = visible;
    if (thumbnailSidebar) {
        thumbnailSidebar.style.display = visible ? "flex" : "none";
    }
    updateToggleButtonIcon();
    updateWorkspaceGrid();
}