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
const GOOGLE_VISION_API_KEY = APP_CONFIG.GOOGLE_VISION_API_KEY; // ← Cloud Vision
const HF_TOKEN = APP_CONFIG.HF_TOKEN;           // ← Hugging Face BLIP captioning
const GEMINI_API_KEY = APP_CONFIG.GEMINI_API_KEY; // ← Google Gemini image description

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
const lbDescription = document.getElementById("lightbox-description");
const toastEl = document.getElementById("toast");
const toastMsg = document.getElementById("toast-msg");
const toastIcon = document.getElementById("toast-icon");

// ============================================================
// 3. STATE
// ============================================================
let selectedFile = null;        // Currently selected file for upload
let allImages = [];             // All images fetched from Firestore
let activeFilter = "All";       // Current category filter
let unsubscribeSnapshot = null; // Real-time listener handle
let animationFrameId = null;    // Tracks current progress animation (so we can cancel it)

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

  // Category is now optional — Gemini auto-detects if left blank
  categoryError.classList.remove("show");

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
// (but NOT when clicking the label/button — it already opens the picker natively)
dropZone.addEventListener("click", e => {
  if (e.target.closest("label") || e.target.tagName === "INPUT") return;
  imageInput.click();
});


// ============================================================
// 7. IMAGE UPLOAD LOGIC
// ============================================================

uploadForm.addEventListener("submit", async e => {
  e.preventDefault();

  // Validate inputs before upload
  if (!validateForm()) return;

  const title = imgTitle.value.trim();
  const userCategory = imgCategory.value; // may be "" → Gemini auto-detects

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
    animateProgress(60, 75, 300);

    // ── STEP 2 + 3: Analyse image with Gemini (category + tags + description) ─
    uploadStatus.textContent = "🤖 Analysing image with Gemini AI...";
    const { tags, description, detectedCategory } = await analyseImageWithGemini(base64Image, title, userCategory);
    // Respect user's choice if they picked one; otherwise use Gemini's detection
    const finalCategory = userCategory || detectedCategory;
    animateProgress(75, 95, 400);

    await db.collection(COLLECTION).add({
      title: title,
      category: finalCategory,
      autoCategorized: !userCategory,
      description: description,
      imageUrl: downloadURL,
      tags: tags,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    if (!userCategory) {
      uploadStatus.textContent = `✨ Gemini auto-categorized as: ${finalCategory}`;
    }

    animateProgress(90, 100, 200);

    // Success feedback
    showToast("Image uploaded successfully! 🚀", "success");
    uploadStatus.textContent = "✅ Uploaded & saved to cloud!";

    // Reset form (real-time listener auto-updates gallery — no need to fetchImages)
    setTimeout(() => resetUploadForm(), 1500);

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

/** Smoothly animate the progress bar between two values (cancellable) */
function animateProgress(from, to, duration) {
  // Cancel any ongoing animation before starting a new one
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  const start = performance.now();
  function step(now) {
    const elapsed = now - start;
    const pct = Math.min(from + (to - from) * (elapsed / duration), to);
    progressBar.style.width = pct + "%";
    progressText.textContent = Math.round(pct) + "%";
    if (elapsed < duration) {
      animationFrameId = requestAnimationFrame(step);
    } else {
      animationFrameId = null;
    }
  }
  animationFrameId = requestAnimationFrame(step);
}

/** Reset upload form to initial state */
function resetUploadForm() {
  // Cancel any running progress animation first
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
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
  uploadStatus.textContent = "";
  titleError.classList.remove("show");
  categoryError.classList.remove("show");
}

// ============================================================
// 8. AI AUTO-TAGGING — Cloud Vision + TensorFlow.js fallback
// ============================================================

let mobilenetModel = null; // cached TF model

/** Try Google Cloud Vision first; fall back to TensorFlow.js MobileNet */
async function getVisionTags(imageUrl) {
  // ── Attempt 1: Google Cloud Vision API ──────────────────
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          requests: [{
            image: { source: { imageUri: imageUrl } },
            features: [{ type: "LABEL_DETECTION", maxResults: 6 }]
          }]
        })
      }
    );
    clearTimeout(timeout);

    const data = await response.json();
    if (data.responses && data.responses[0] && data.responses[0].labelAnnotations) {
      console.log("✅ Cloud Vision tags received");
      return data.responses[0].labelAnnotations.map(l => l.description);
    }
    throw new Error("No labels in Vision response");

  } catch (err) {
    console.warn("⚠️ Cloud Vision unavailable — switching to TensorFlow.js:", err.message);
  }

  // ── Attempt 2: TensorFlow.js MobileNet (runs in browser) ─
  try {
    uploadStatus.textContent = "🧠 Running on-device AI (TensorFlow.js)...";

    // Load model once and cache it
    if (!mobilenetModel) {
      mobilenetModel = await mobilenet.load();
    }

    // Load the image into an HTMLImageElement for TF
    const img = await loadImageElement(imageUrl);
    const predictions = await mobilenetModel.classify(img, 6);

    console.log("✅ TensorFlow.js tags received");
    return predictions.map(p => p.className.split(",")[0].trim());

  } catch (tfErr) {
    console.warn("⚠️ TensorFlow.js also failed:", tfErr.message);
    return [];
  }
}

/** Compress image to small base64 for fast API calls */
function compressImageForAI(base64Image, maxSize = 512) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ratio = Math.min(maxSize / img.width, maxSize / img.height, 1);
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.7));
    };
    img.onerror = () => resolve(base64Image);
    img.src = base64Image;
  });
}

/** Analyse image with Gemini 2.5 Flash — returns both description AND accurate astronomy tags */
async function analyseImageWithGemini(base64Image, title, category) {
  try {
    uploadStatus.textContent = "✨ Gemini is analysing your image...";
    const compressed = await compressImageForAI(base64Image, 768);
    const b64Only = compressed.split(",")[1];

    const prompt = `You are an astronomy expert analysing an image (user title: "${title}").
Look carefully at the actual image and return STRICT JSON with this exact shape:
{
  "category": "pick EXACTLY ONE from: Galaxy, Nebula, Planet, Star Cluster, Moon, Black Hole, Comet, Supernova, Other — based on what the image actually shows",
  "description": "2-3 sentence vivid description of what you actually see — colors, structures, celestial objects, notable features. Do not invent details.",
  "tags": ["5-6 short lowercase tags describing real visual features in the image, e.g. 'spiral galaxy', 'nebula', 'star cluster', 'earth', 'milky way', 'deep space'"]
}
Return ONLY the JSON object, no markdown, no code fences.`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: "image/jpeg", data: b64Only } }
            ]
          }],
          generationConfig: { responseMimeType: "application/json" }
        })
      }
    );
    clearTimeout(timeout);

    const data = await response.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) throw new Error(data?.error?.message || "Empty Gemini response");

    const parsed = JSON.parse(raw);
    const tags = Array.isArray(parsed.tags) ? parsed.tags.slice(0, 6).map(t => String(t).toLowerCase()) : [];
    const description = typeof parsed.description === "string" ? parsed.description.trim() : "";
    const ALLOWED = ["Galaxy","Nebula","Planet","Star Cluster","Moon","Black Hole","Comet","Supernova","Other"];
    const detectedCategory = ALLOWED.includes(parsed.category) ? parsed.category : "Other";
    if (!description) throw new Error("No description in JSON");

    console.log("✅ Gemini analysis complete", { tags, detectedCategory });
    return { tags, description, detectedCategory };

  } catch (err) {
    console.warn("Gemini analysis failed, using fallback:", err.message);
    return {
      tags: [],
      description: `A ${(category || "astronomy").toLowerCase()} image titled "${title}", captured and stored in the AstroVault cloud gallery.`,
      detectedCategory: category || "Other"
    };
  }
}

/** Legacy single-purpose description (kept for compat) */
async function generateDescription(base64Image, title, category, tags) {
  try {
    uploadStatus.textContent = "✍️ Generating description with Gemini AI...";

    // Compress and strip the "data:image/jpeg;base64," prefix for Gemini inline_data
    const compressed = await compressImageForAI(base64Image, 768);
    const b64Only = compressed.split(",")[1];

    const prompt = `You are an astronomy expert. Look at this image (titled "${title}", category: ${category}) and write a vivid, accurate 2-3 sentence description of what you actually see in the image — the colors, structures, celestial objects, and notable visual features. Do not invent details that aren't visible. Write in a natural, engaging tone.`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: "image/jpeg", data: b64Only } }
            ]
          }]
        })
      }
    );
    clearTimeout(timeout);

    const data = await response.json();
    const caption = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (caption && caption.trim()) {
      console.log("✅ Gemini description generated");
      return caption.trim();
    }
    throw new Error(data?.error?.message || "No description returned");

  } catch (err) {
    console.warn("Gemini description failed, using fallback:", err.message);
    const tagLine = tags && tags.length > 0
      ? ` AI-detected visual features: ${tags.slice(0, 4).join(", ")}.`
      : "";
    return `A ${category.toLowerCase()} image titled "${title}", captured and stored in the AstroVault cloud gallery.${tagLine}`;
  }
}

/** Load an image URL into an HTMLImageElement (needed by TF) */
function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image load failed for TF"));
    img.src = src;
  });
}

// ============================================================
// 9. REAL-TIME SYNC — FIRESTORE onSnapshot
// ============================================================

function initRealTimeSync() {
  // Show skeleton loaders while connecting
  loadingState.style.display = "grid";
  galleryGrid.innerHTML = "";
  emptyState.style.display = "none";

  // Unsubscribe previous listener if any
  if (unsubscribeSnapshot) unsubscribeSnapshot();

  // Listen for live Firestore updates — gallery updates instantly across all tabs/devices
  unsubscribeSnapshot = db.collection(COLLECTION)
    .orderBy("createdAt", "desc")
    .onSnapshot(snapshot => {
      allImages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Update hero counter live
      totalCount.textContent = allImages.length;

      // Hide skeleton
      loadingState.style.display = "none";

      renderGallery();
      updateStats();

    }, err => {
      console.error("Snapshot error:", err);
      loadingState.style.display = "none";
      showToast("Could not load images. Check Firebase config.", "error");
    });
}

// Keep fetchImages as an alias for compatibility
function fetchImages() { initRealTimeSync(); }

// ============================================================
// 10. STATS DASHBOARD
// ============================================================

function updateStats() {
  const statsGrid = document.getElementById("stats-grid");
  if (!statsGrid) return;

  // Count images per category
  const counts = {};
  allImages.forEach(img => {
    counts[img.category] = (counts[img.category] || 0) + 1;
  });

  const total = allImages.length || 1; // avoid divide by zero

  // Category emoji map
  const emoji = {
    "Galaxy": "🌌", "Nebula": "🌫️", "Planet": "🪐",
    "Star Cluster": "⭐", "Moon": "🌙", "Black Hole": "🕳️",
    "Comet": "☄️", "Supernova": "💥", "Other": "🔭"
  };

  if (Object.keys(counts).length === 0) {
    statsGrid.innerHTML = `<p class="stats-empty">No data yet — upload your first image!</p>`;
    return;
  }

  // Sort by count descending
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  statsGrid.innerHTML = sorted.map(([cat, count]) => `
    <div class="stat-row">
      <span class="stat-cat-label">${emoji[cat] || "🔭"} ${cat}</span>
      <div class="stat-bar-wrap">
        <div class="stat-bar-fill" style="width: ${Math.round((count / total) * 100)}%"></div>
      </div>
      <span class="stat-count">${count}</span>
    </div>
  `).join("");
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

  const tagsHtml = img.tags && img.tags.length
    ? `<div class="card-tags">${img.tags.slice(0, 3).map(t => `<span class="tag-chip">${t}</span>`).join("")}</div>`
    : "";

  card.innerHTML = `
    <div class="card-thumb-wrap">
      <img
        class="card-thumb"
        src="${img.imageUrl}"
        alt="${img.title}"
        loading="lazy"
        onerror="this.src='https://via.placeholder.com/400x260/0d0d1f/7c3aed?text=Image+Error'"
      />
      <button class="card-delete-btn" title="Delete image" aria-label="Delete image">
        <i class="fas fa-trash"></i>
      </button>
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
      ${tagsHtml}
    </div>
  `;

  // Delete button — stop propagation so lightbox doesn't open
  const delBtn = card.querySelector(".card-delete-btn");
  delBtn.addEventListener("click", e => {
    e.stopPropagation();
    deleteImage(img);
  });

  // Open lightbox on click
  card.addEventListener("click", () => openLightbox(img));

  return card;
}

/** Delete an image from Firestore (real-time listener auto-removes card) */
async function deleteImage(img) {
  const ok = confirm(`Delete "${img.title}"?\n\nThis will permanently remove it from your gallery.`);
  if (!ok) return;

  try {
    await db.collection(COLLECTION).doc(img.id).delete();
    showToast("Image deleted 🗑️", "success");
  } catch (err) {
    console.error("Delete failed:", err);
    showToast("Could not delete image: " + err.message, "error");
  }
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

  // Show description in lightbox
  if (lbDescription) {
    lbDescription.textContent = img.description || "";
    lbDescription.style.display = img.description ? "block" : "none";
  }

  // Show Vision tags in lightbox
  const lbTags = document.getElementById("lightbox-tags");
  if (lbTags) {
    lbTags.innerHTML = img.tags && img.tags.length
      ? img.tags.map(t => `<span class="tag-chip">${t}</span>`).join("")
      : "";
  }

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
