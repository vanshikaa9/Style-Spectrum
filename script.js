// --- Global Variables (Set by index.html's module script) ---
let db;
let auth;
let userId;
let appId;
let uploadedImage = null;
let currentPaletteData = null; // Store the current analyzed palette for saving

// --- DOM Elements ---
const canvas = document.getElementById('color-canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const analyzeButton = document.getElementById('analyzeButton');
const imagePreview = document.getElementById('imagePreview');
const previewText = document.getElementById('previewText');
const resultsArea = document.getElementById('resultsArea');
const dominantSwatch = document.getElementById('dominantSwatch');
const dominantRGBDisplay = document.getElementById('dominantRGB');
const suggestionsContainer = document.getElementById('suggestionsContainer');
const errorMessage = document.getElementById('error-message');
const savedPalettesContainer = document.getElementById('savedPalettesContainer');
const saveButton = document.getElementById('saveButton');

// --- Core Color Utilities (JS Implementation of Color Theory) ---

function rgbToHsv(r, g, b) {
    r /= 255, g /= 255, b /= 255;
    let max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, v = max;

    let d = max - min;
    s = max == 0 ? 0 : d / max;

    if (max == min) { h = 0; } 
    else {
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return [h * 360, s, v];
}

function hsvToRgb(h, s, v) {
    let r, g, b;
    h = h % 360; 
    s = Math.max(0, Math.min(1, s)); 
    v = Math.max(0, Math.min(1, v)); 

    let i = Math.floor(h / 60);
    let f = h / 60 - i;
    let p = v * (1 - s);
    let q = v * (1 - f * s);
    let t = v * (1 - (1 - f) * s);

    switch (i % 6) {
        case 0: r = v, g = t, b = p; break;
        case 1: r = q, g = v, b = p; break;
        case 2: r = p, g = v, b = t; break;
        case 3: r = p, g = q, b = v; break;
            case 4: r = t, g = p, b = v; break;
        case 5: r = v, g = p, b = q; break;
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
}

// --- Image Processing (OpenCV Proxy using Canvas) ---

function findDominantColor(image) {
    const sampleSize = 100;
    canvas.width = sampleSize;
    canvas.height = sampleSize;

    ctx.drawImage(image, 0, 0, sampleSize, sampleSize);
    const imageData = ctx.getImageData(0, 0, sampleSize, sampleSize).data;
    const step = 16;
    let totalR = 0, totalG = 0, totalB = 0, count = 0;

    for (let i = 0; i < imageData.length; i += 4 * step) {
        const r = imageData[i];
        const g = imageData[i + 1];
        const b = imageData[i + 2];
        const a = imageData[i + 3];
        // Ignore near-transparent, white, or black pixels for better color sampling
        if (a < 50 || (r > 240 && g > 240 && b > 240) || (r < 15 && g < 15 && b < 15)) continue; 
        
        totalR += r; totalG += g; totalB += b;
        count++;
    }

    if (count > 0) {
        return [ Math.round(totalR / count), Math.round(totalG / count), Math.round(totalB / count) ];
    }
    return [128, 128, 128];
}

// --- Color Theory Logic ---

function suggestPairingColors(dominantRgb) {
    const [R, G, B] = dominantRgb;
    const [H, S, V] = rgbToHsv(R, G, B);

    const generateVariants = (h, s, v) => {
        const primary = hsvToRgb(h, Math.min(1, s * 1.1), Math.min(1, v * 1.05));
        
        // Lighter Tone (Tint)
        const lighterV = V < 0.8 ? V * 1.4 : 1; 
        const lighter = hsvToRgb(h, Math.min(1, s * 0.8), lighterV);

        // Muted Tone (Tone)
        const muted = hsvToRgb(h, Math.min(1, s * 0.4), Math.min(1, v * 1.1));
        
        return [
            { type: 'Primary Tone', rgb: primary }, 
            { type: 'Lighter Tone (Tint)', rgb: lighter }, 
            { type: 'Muted Tone (Tone)', rgb: muted }
        ];
    };

    const suggestions = {};

    // 1. Complementary Color (180 degrees difference)
    const compH = (H + 180) % 360;
    suggestions['Complementary'] = {
        theory: 'Complementary',
        explanation: 'Provides the highest contrast and most vibrant pairing. Use the tones for varying boldness in secondary pieces.',
        colors: generateVariants(compH, S, V)
    };
    
    // 2. Analogous Colors (30 degrees difference on either side)
    const analogous1H = (H + 30) % 360;
    const analogous2H = (H - 30 + 360) % 360;
    suggestions['Analogous'] = {
        theory: 'Analogous',
        explanation: 'Creates a harmonious, low-contrast, and pleasing look. Mix these tones for a rich, subtle effect.',
        colors: [
            ...generateVariants(analogous1H, S, V).filter((_, i) => i !== 2), 
            ...generateVariants(analogous2H, S, V).filter((_, i) => i !== 1)  
        ]
    };
    
    // 3. Triadic Colors (120 degrees difference)
    const triadic1H = (H + 120) % 360;
    const triadic2H = (H - 120 + 360) % 360;
    suggestions['Triadic'] = {
        theory: 'Triadic',
        explanation: 'Uses three evenly spaced hues for a balanced and colorful outfit. Focus on the Primary or Muted tones for balance.',
        colors: [
            ...generateVariants(triadic1H, S, V).filter((_, i) => i === 0 || i === 2), 
            ...generateVariants(triadic2H, S, V).filter((_, i) => i === 0 || i === 1) 
        ]
    };

    return suggestions;
}

// --- UI & Event Handlers (Explicitly attached to window) ---

// FIX: Ensure all global functions are explicitly defined on the window object
window.handleImageUpload = function() {
    const fileInput = document.getElementById('imageUpload');
    const file = fileInput.files[0];
    
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            imagePreview.src = e.target.result;
            imagePreview.style.display = 'block';
            previewText.style.display = 'none';
            
            uploadedImage = new Image();
            uploadedImage.onload = () => {
                analyzeButton.disabled = false;
                resultsArea.style.display = 'none';
                errorMessage.style.display = 'none';
                saveButton.disabled = true;
            };
            uploadedImage.onerror = () => {
                showError("Could not load image file.");
                analyzeButton.disabled = true;
            };
            uploadedImage.src = e.target.result;
        };
        reader.readAsDataURL(file);
    } else {
        imagePreview.style.display = 'none';
        previewText.style.display = 'block';
        analyzeButton.disabled = true;
        resultsArea.style.display = 'none';
    }
}

function showError(message) {
    errorMessage.textContent = 'Error: ' + message;
    errorMessage.style.display = 'block';
}

function createSwatchElement(colorData) {
    const [r, g, b] = colorData.rgb;
    const hex = rgbToHex(r, g, b);
    const toneType = colorData.type;

    return `
        <div class="color-swatch-card flex flex-col items-center p-3 bg-white rounded-lg shadow-md border border-gray-100 w-32">
            <div class="w-16 h-16 rounded-full border-2 border-gray-200 mb-2 shadow-inner" style="background-color: ${hex};"></div>
            <span class="text-sm font-semibold text-gray-800 text-center mb-1">${toneType.split(' ')[0]}</span>
            <span class="text-xs font-mono text-gray-700">${hex}</span>
            <span class="text-xs text-gray-500">(${r}, ${g}, ${b})</span>
        </div>
    `;
}

function renderSuggestions(suggestions) {
    suggestionsContainer.innerHTML = '';
    
    for (const theory in suggestions) {
        const data = suggestions[theory];
        const swatchHTML = data.colors.map(createSwatchElement).join('');
        
        // Prepare data for saving (convert RGB arrays to string for easier Firestore handling)
        currentPaletteData.suggestions[theory] = {
            explanation: data.explanation,
            colors: data.colors.map(c => ({ type: c.type, rgb: JSON.stringify(c.rgb) }))
        };
        
        const section = `
            <div class="p-5 bg-gray-50 rounded-xl border border-gray-200">
                <h4 class="text-xl font-bold text-gray-700 mb-2">${data.theory} Pairing</h4>
                <p class="text-gray-600 mb-4 text-sm">${data.explanation}</p>
                <div class="flex flex-wrap gap-4 justify-center sm:justify-start">
                    ${swatchHTML}
                </div>
            </div>
        `;
        suggestionsContainer.innerHTML += section;
    }
}

// FIX: Ensure all global functions are explicitly defined on the window object
window.analyzeImage = function() {
    if (!uploadedImage) {
        showError("Please upload an image first.");
        return;
    }

    analyzeButton.disabled = true;
    analyzeButton.textContent = 'Analyzing...';
    errorMessage.style.display = 'none';
    resultsArea.style.display = 'block';
    saveButton.disabled = true;
    
    // Initialize currentPaletteData (Crucial for preventing the "null" error)
    currentPaletteData = {
        dominant: null,
        suggestions: {}
    };
    
    setTimeout(() => { 
        try {
            // 1. Find Dominant Color
            const dominantColor = findDominantColor(uploadedImage);
            const [r, g, b] = dominantColor;
            const hex = rgbToHex(r, g, b);

            // 2. Display Dominant Color
            dominantSwatch.style.backgroundColor = hex;
            dominantRGBDisplay.textContent = `HEX: ${hex} | RGB: (${r}, ${g}, ${b})`;
            currentPaletteData.dominant = JSON.stringify(dominantColor);

            // 3. Generate and Render Suggestions
            const suggestedPairings = suggestPairingColors(dominantColor);
            renderSuggestions(suggestedPairings);

            analyzeButton.textContent = 'Analyze Colors';
            analyzeButton.disabled = false;
            saveButton.disabled = false; // Enable save button after analysis

        } catch (e) {
            console.error("Analysis failed:", e);
            showError("Failed to analyze image. Please try a different file.");
            analyzeButton.textContent = 'Analyze Colors';
            analyzeButton.disabled = false;
        }
    }, 50);
}

// --- Firestore Integration ---

const FIREBASE_COLLECTION_NAME = 'saved_palettes';

/**
 * Saves the currently displayed palette to Firestore.
 */
// FIX: Ensure all global functions are explicitly defined on the window object
window.saveCurrentPalette = async function() {
    if (!db || !userId || !appId || !currentPaletteData || !currentPaletteData.dominant) {
        showError("Database not ready or no palette analyzed yet.");
        return;
    }
    
    saveButton.disabled = true;
    saveButton.textContent = 'Saving...';
    
    try {
        const paletteRef = firebase.doc(db, 
            `artifacts/${appId}/users/${userId}/${FIREBASE_COLLECTION_NAME}`, 
            Date.now().toString()
        );
        
        await firebase.setDoc(paletteRef, {
            ...currentPaletteData,
            timestamp: firebase.serverTimestamp(),
            dominantHex: rgbToHex(...JSON.parse(currentPaletteData.dominant))
        });
        
        saveButton.textContent = 'Palette Saved!';
        setTimeout(() => {
            saveButton.textContent = 'Save Palette';
            saveButton.disabled = false;
        }, 2000);

    } catch (e) {
        console.error("Error saving palette:", e);
        showError(`Failed to save palette: ${e.message}`);
        saveButton.textContent = 'Save Palette';
        saveButton.disabled = false;
    }
}

/**
 * Loads palettes from Firestore in real-time.
 */
// FIX: Ensure all global functions are explicitly defined on the window object
window.loadPalettes = function() {
    if (!db || !userId || !appId) {
        console.warn("Database not ready to load palettes.");
        return;
    }

    // Note: The global `firebase` object is exposed via the module script in index.html
    const palettesQuery = firebase.query(
        firebase.collection(db, `artifacts/${appId}/users/${userId}/${FIREBASE_COLLECTION_NAME}`)
    );

    // Set up real-time listener
    firebase.onSnapshot(palettesQuery, (snapshot) => {
        const palettes = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            const restoredSuggestions = {};
            for (const theory in data.suggestions) {
                restoredSuggestions[theory] = {
                    explanation: data.suggestions[theory].explanation,
                    colors: data.suggestions[theory].colors.map(c => ({ 
                        type: c.type, 
                        rgb: JSON.parse(c.rgb) 
                    }))
                };
            }

            palettes.push({
                id: doc.id,
                ...data,
                dominant: JSON.parse(data.dominant),
                suggestions: restoredSuggestions
            });
        });

        renderSavedPalettes(palettes);
    }, (error) => {
        console.error("Error loading palettes:", error);
        document.getElementById('loadingPalettes').textContent = "Error loading saved palettes.";
    });
}

function renderSavedPalettes(palettes) {
    savedPalettesContainer.innerHTML = '';

    if (palettes.length === 0) {
        savedPalettesContainer.innerHTML = '<p class="text-gray-500 col-span-full">No palettes saved yet. Analyze an image and click "Save Palette".</p>';
        return;
    }

    // Sort palettes locally by timestamp (if available)
    palettes.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));

    palettes.forEach(palette => {
        const dominantHex = rgbToHex(...palette.dominant);
        
        const suggestedColors = Object.values(palette.suggestions).flatMap(s => s.colors.slice(0, 1));
        
        const colorBlocks = suggestedColors.map(c => 
            `<div class="w-1/4 h-full" style="background-color: ${rgbToHex(...c.rgb)};"></div>`
        ).join('');

        const paletteCard = `
            <div class="bg-white rounded-xl shadow-lg border border-gray-100 p-4">
                <div class="font-semibold text-gray-700 mb-2">Palette from ${new Date(palette.id * 1).toLocaleTimeString()}</div>
                <div class="h-10 w-full flex rounded-lg overflow-hidden mb-3 border border-gray-300">
                    <div class="w-1/4 h-full" style="background-color: ${dominantHex};"></div>
                    ${colorBlocks}
                </div>
                <div class="text-sm text-gray-500">Dominant: <span class="font-mono">${dominantHex}</span></div>
            </div>
        `;
        savedPalettesContainer.innerHTML += paletteCard;
    });
}
