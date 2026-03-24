// ============================================================
// AstroVault — script.js
// Firebase Cloud Integration | Upload | Gallery | Filter
// ============================================================

// ============================================================
// 1. FIREBASE CONFIGURATION
//    → Replace the values below with YOUR Firebase project config.
//    → Get these from: Firebase Console → Project Settings → Your Apps → SDK setup
// ============================================================
// ── ENVIRONMENT VARIABLES (moved to config.js) ────────
// Loading configuration from separate, gitignored file
const firebaseConfig = APP_CONFIG.FIREBASE;

// ── Initialize Firebase App ──────────────────────────────────
firebase.initializeApp(firebaseConfig);

// ── Firebase service references ──────────────────────────────
const db = firebase.firestore();   // Firestore database (metadata)
// NOTE: Firebase Storage replaced with ImgBB (free, no Blaze plan needed)

// ============================================================
// IMGBB CONFIGURATION
//   → Free image hosting API — no Firebase upgrade required
//   → Get your free API key at: https://api.imgbb.com
//   → Sign up at imgbb.com → click your username → API
// ============================================================
const IMGBB_API_KEY = APP_CONFIG.IMGBB_API_KEY; // ← Load from config.js

// ── Firestore collection name ────────────────────────────────
const COLLECTION = "astronomy_images";

// ============================================================
// 2. DOM REFERENCES
// ============================================================
const imageInput = document.getElementById("image-input");
const dropZone = document.getElementById("drop-zone");
const previewWrap = document.getElementById("preview-wrap");
const previewImg = document.getElementById("preview-img");
const removePreview = document.getElementById("remove-preview");
const uploadForm = document.getElementById("upload-form");
const imgTitle = document.getElementById("img-title");
const imgCategory = document.getElementById("img-category");
const titleError = document.getElementById("title-error");
const categoryError = document.getElementById("category-error");
const progressWrap = document.getElementById("progress-wrap");
const progressBar = document.getElementById("progress-bar");
const progressText = document.getElementById("progress-text");
const uploadStatus = document.getElementById("upload-status");
const uploadBtn = document.getElementById("upload-btn");
const galleryGrid = document.getElementById("gallery-grid");
const emptyState = document.getElementById("empty-state");
const loadingState = document.getElementById("loading-state");
const filterBar = document.getElementById("filter-bar");
const totalCount = document.getElementById("total-count");
const lightbox = document.getElementById("lightbox");
const lbOverlay = document.getElementById("lightbox-overlay");
const lbClose = document.getElementById("lightbox-close");
const lbImg = document.getElementById("lightbox-img");
const lbTitle = document.getElementById("lightbox-title");
const lbCategory = document.getElementById("lightbox-category");
const lbDate = document.getElementById("lightbox-date");
const lbDownload = document.getElementById("lightbox-download");
const toastEl = document.getElementById("toast");
const toastMsg = document.getElementById("toast-msg");
const toastIcon = document.getElementById("toast-icon");

// ============================================================
// 3. STATE
// ============================================================
let selectedFile = null;    // Currently selected file for upload
let allImages = [];      // All images fetched from Firestore
let activeFilter = "All";   // Current category filter

// ============================================================
// 4. STARFIELD CANVAS ANIMATION
// ============================================================
(function initStarfield() {
  const canvas = document.getElementById("starfield");
  const ctx = canvas.getContext("2d");
  let stars = [];

  // Resize canvas to fill window
  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  // Create star objects
  function createStars(count) {
    stars = [];
    for (let i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 1.5 + 0.2,
        alpha: Math.random(),
        speed: Math.random() * 0.004 + 0.002,
        dir: Math.random() > 0.5 ? 1 : -1
      });
    }
  }

  // Draw and animate stars
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    stars.forEach(s => {
      s.alpha += s.speed * s.dir;
      if (s.alpha >= 1 || s.alpha <= 0.1) s.dir *= -1;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${s.alpha})`;
      ctx.fill();
    });
    requestAnimationFrame(draw);
  }

  resize();
  createStars(160);
  draw();
  window.addEventListener("resize", () => { resize(); createStars(160); });
})();

// ============================================================
// 5. UTILITY FUNCTIONS
// ============================================================

/** Show a toast notification */
function showToast(message, type = "success") {
  toastEl.className = `toast ${type} show`;
  toastIcon.textContent = type === "success" ? "✅" : "❌";
  toastMsg.textContent = message;
  setTimeout(() => toastEl.classList.remove("show"), 3500);
}

/** Format a Firestore Timestamp → readable date string */
function formatDate(timestamp) {
  if (!timestamp) return "—";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric"
  });
}

/** Validate upload form fields; returns true if valid */
function validateForm() {
  let valid = true;

  if (!imgTitle.value.trim()) {
    titleError.classList.add("show");
    valid = false;
  } else {
    titleError.classList.remove("show");
  }

  if (!imgCategory.value) {
    categoryError.classList.add("show");
    valid = false;
  } else {
    categoryError.classList.remove("show");
  }

  if (!selectedFile) {
    showToast("Please select an image first.", "error");
    valid = false;
  }

  return valid;
}

/** Set upload button to loading or normal state */
function setUploading(state) {
  if (state) {
    uploadBtn.disabled = true;
    uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading…';
  } else {
    uploadBtn.disabled = false;
    uploadBtn.innerHTML = '<i class="fas fa-rocket"></i> Launch to Cloud';
  }
}

// ============================================================
// 6. FILE SELECTION & PREVIEW
// ============================================================

/** Handle file selection — validate type & show preview */
function handleFileSelect(file) {
  if (!file) return;

  // Only allow JPG and PNG
  if (!["image/jpeg", "image/png"].includes(file.type)) {
    showToast("Only JPG and PNG files are allowed.", "error");
    return;
  }

  // Max 10 MB size check
  if (file.size > 10 * 1024 * 1024) {
    showToast("File is too large. Max 10 MB.", "error");
    return;
  }

  selectedFile = file;

  // Show thumbnail preview
  const reader = new FileReader();
  reader.onload = e => {
    previewImg.src = e.target.result;
    previewWrap.classList.add("visible");
    dropZone.style.display = "none";
  };
  reader.readAsDataURL(file);
}

// File input change
imageInput.addEventListener("change", e => {
  handleFileSelect(e.target.files[0]);
});

// Remove preview button
removePreview.addEventListener("click", () => {
  selectedFile = null;
  previewImg.src = "";
  previewWrap.classList.remove("visible");
  dropZone.style.display = "block";
  imageInput.value = "";
});

// Drag & Drop
dropZone.addEventListener("dragover", e => {
  e.preventDefault();
  dropZone.classList.add("drag-over");
});
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
dropZone.addEventListener("drop", e => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");
  const file = e.dataTransfer.files[0];
  handleFileSelect(file);
});

// Click anywhere on drop zone → trigger file picker
dropZone.addEventListener("click", e => {
  if (e.target.tagName !== "LABEL" && e.target.tagName !== "INPUT") {
    imageInput.click();
  }
});

// ============================================================
// 7. IMAGE UPLOAD LOGIC
// ============================================================

uploadForm.addEventListener("submit", async e => {
  e.preventDefault();

  // Validate inputs before upload
  if (!validateForm()) return;

  const title = imgTitle.value.trim();
  const category = imgCategory.value;

  // Show progress bar
  progressWrap.classList.add("visible");
  setUploading(true);
  uploadStatus.textContent = "";

  try {
    // ── STEP 1: Upload image to ImgBB ─────────────────────
    // Convert file to Base64 for ImgBB API
    const base64Image = await fileToBase64(selectedFile);

    // Simulate progress while uploading to ImgBB
    animateProgress(10, 60, 800);

    // Build form data for ImgBB API
    const formData = new FormData();
    formData.append("image", base64Image.split(",")[1]); // base64 string only
    formData.append("name", `astrovault_${Date.now()}`);

    // POST to ImgBB API
    const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
      method: "POST",
      body: formData
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error?.message || "ImgBB upload failed");
    }

    // Get the hosted image URL from ImgBB response
    const downloadURL = result.data.url;
    animateProgress(60, 90, 400);

    // ── STEP 2: Save metadata to Firestore ───────────────
    await db.collection(COLLECTION).add({
      title: title,
      category: category,
      imageUrl: downloadURL,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    animateProgress(90, 100, 200);

    // Success feedback
    showToast("Image uploaded successfully! 🚀", "success");
    uploadStatus.textContent = "✅ Uploaded & saved to cloud!";

    // Reset form
    resetUploadForm();

    // Reload gallery
    fetchImages();

  } catch (err) {
    console.error("Upload error:", err);
    showToast("Upload failed: " + (err.message || "Check ImgBB API key."), "error");
    uploadStatus.textContent = "❌ Upload failed.";
    setUploading(false);
    progressWrap.classList.remove("visible");
    progressBar.style.width = "0%";
    progressText.textContent = "0%";
  }
});

/** Convert File object to Base64 data URL */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

/** Smoothly animate the progress bar between two values */
function animateProgress(from, to, duration) {
  const start = performance.now();
  function step(now) {
    const elapsed = now - start;
    const pct = Math.min(from + (to - from) * (elapsed / duration), to);
    progressBar.style.width = pct + "%";
    progressText.textContent = Math.round(pct) + "%";
    if (elapsed < duration) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/** Reset upload form to initial state */
function resetUploadForm() {
  uploadForm.reset();
  selectedFile = null;
  previewImg.src = "";
  previewWrap.classList.remove("visible");
  dropZone.style.display = "block";
  imageInput.value = "";
  setUploading(false);
  progressWrap.classList.remove("visible");
  progressBar.style.width = "0%";
  progressText.textContent = "0%";
  titleError.classList.remove("show");
  categoryError.classList.remove("show");
}

// ============================================================
// 8. FETCH & DISPLAY IMAGES FROM FIRESTORE
// ============================================================

async function fetchImages() {
  // Show skeleton loaders while fetching
  loadingState.style.display = "grid";
  galleryGrid.innerHTML = "";
  emptyState.style.display = "none";

  try {
    // Fetch all docs, newest first
    const snapshot = await db.collection(COLLECTION)
      .orderBy("createdAt", "desc")
      .get();

    allImages = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Update hero counter
    totalCount.textContent = allImages.length;

    // Hide skeleton
    loadingState.style.display = "none";

    renderGallery();

  } catch (err) {
    console.error("Fetch error:", err);
    loadingState.style.display = "none";
    showToast("Could not load images. Check Firebase config.", "error");
  }
}

/** Render cards based on active filter */
function renderGallery() {
  galleryGrid.innerHTML = "";

  const filtered = activeFilter === "All"
    ? allImages
    : allImages.filter(img => img.category === activeFilter);

  if (filtered.length === 0) {
    emptyState.style.display = "block";
    return;
  }

  emptyState.style.display = "none";

  filtered.forEach((img, index) => {
    const card = createCard(img, index);
    galleryGrid.appendChild(card);
  });
}

/** Build an image card element */
function createCard(img, index) {
  const card = document.createElement("article");
  card.className = "img-card";
  card.style.animationDelay = `${index * 0.07}s`;

  card.innerHTML = `
    <div class="card-thumb-wrap">
      <img
        class="card-thumb"
        src="${img.imageUrl}"
        alt="${img.title}"
        loading="lazy"
        onerror="this.src='https://via.placeholder.com/400x260/0d0d1f/7c3aed?text=Image+Error'"
      />
      <div class="card-overlay">
        <span class="card-view-hint">
          <i class="fas fa-expand"></i> Click to view
        </span>
      </div>
    </div>
    <div class="card-info">
      <h3 class="card-title" title="${img.title}">${img.title}</h3>
      <div class="card-meta">
        <span class="card-category">${img.category}</span>
        <span class="card-date">${formatDate(img.createdAt)}</span>
      </div>
    </div>
  `;

  // Open lightbox on click
  card.addEventListener("click", () => openLightbox(img));

  return card;
}

// ============================================================
// 9. CATEGORY FILTER LOGIC
// ============================================================

filterBar.addEventListener("click", e => {
  const btn = e.target.closest(".filter-btn");
  if (!btn) return;

  // Update active button
  document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");

  activeFilter = btn.dataset.filter;
  renderGallery();
});

// ============================================================
// 10. LIGHTBOX (FULL PREVIEW)
// ============================================================

function openLightbox(img) {
  lbImg.src = img.imageUrl;
  lbImg.alt = img.title;
  lbTitle.textContent = img.title;
  lbCategory.textContent = img.category;
  lbDate.textContent = `📅 ${formatDate(img.createdAt)}`;
  lbDownload.href = img.imageUrl;

  lightbox.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeLightbox() {
  lightbox.classList.remove("open");
  document.body.style.overflow = "";
  // Reset img src after animation
  setTimeout(() => { lbImg.src = ""; }, 300);
}

lbClose.addEventListener("click", closeLightbox);
lbOverlay.addEventListener("click", closeLightbox);

// Close with Escape key
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && lightbox.classList.contains("open")) closeLightbox();
});

// ============================================================
// 11. INITIALISE APP
// ============================================================

/**
 * Called once on page load.
 * Checks Firebase connectivity and loads the gallery.
 */
function initApp() {
  try {
    fetchImages();
  } catch (err) {
    console.error("Firebase init error:", err);
    showToast("Firebase not configured. See FIREBASE SETUP GUIDE.", "error");
    loadingState.style.display = "none";
  }
}

// Run on DOM ready
document.addEventListener("DOMContentLoaded", initApp);
