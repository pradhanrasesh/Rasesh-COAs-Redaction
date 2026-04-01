// AITraining.js - Adapted from Redection-studio's TrainingView component
// Provides enhanced AI training functionality with visual diff and interactive editing

import { showAlert } from './alert.js';
import { showToast } from './Utils.js';

const BACKEND_URL = "";

// Training session state
let trainingSession = {
    id: generateId(),
    status: 'idle', // 'idle', 'analyzing', 'preview', 'completed', 'error'
    originalFile: null,
    redactedFile: null,
    originalUrl: null,
    learnedData: null,
    progress: 0,
    zoom: 1.0
};

// Generate a simple ID
function generateId() {
    return Math.random().toString(36).substring(7);
}

// Initialize the AI training module
export function initAITraining() {
    console.log('AI Training module initialized');
    return {
        getSession: () => trainingSession,
        setSession: (updates) => {
            trainingSession = { ...trainingSession, ...updates };
            return trainingSession;
        },
        handleFileUpload,
        runTraining,
        saveLearnedRule,
        findRedactedBoxes
    };
}

// Handle file upload for training
function handleFileUpload(file, type) {
    if (!file || !file.type.includes('pdf')) {
        showAlert('error', 'Please upload a PDF file');
        return false;
    }

    if (type === 'original') {
        trainingSession.originalFile = file;
        trainingSession.originalUrl = URL.createObjectURL(file);
    } else if (type === 'redacted') {
        trainingSession.redactedFile = file;
    }

    // Update UI state
    updateTrainingUI();
    return true;
}

// Update UI based on session state
function updateTrainingUI() {
    // This function should be called by the UI to update visual elements
    // Implementation depends on the specific HTML structure
    console.log('Training session updated:', trainingSession);
    
    // Dispatch custom event for UI updates
    const event = new CustomEvent('trainingSessionUpdate', { 
        detail: { session: trainingSession } 
    });
    document.dispatchEvent(event);
}

// Run the training process
async function runTraining() {
    if (!trainingSession.originalFile) {
        showAlert('error', 'Please upload at least the original file.');
        return;
    }

    trainingSession.status = 'analyzing';
    trainingSession.progress = 0;
    updateTrainingUI();

    try {
        // 1. Extract text from original PDF
        const originalText = await extractTextFromPDF(trainingSession.originalFile);
        trainingSession.progress = 30;
        updateTrainingUI();

        let redactedText = '';
        if (trainingSession.redactedFile) {
            redactedText = await extractTextFromPDF(trainingSession.redactedFile);
            trainingSession.progress = 50;
            updateTrainingUI();
        }

        // 2. Call backend AI training
        trainingSession.progress = 60;
        updateTrainingUI();
        
        const aiResult = await callBackendTraining(
            trainingSession.originalFile, 
            trainingSession.redactedFile
        );

        // 3. If we have a redacted file, do visual comparison
        let learnedCoordinates = [];
        if (trainingSession.redactedFile && trainingSession.originalUrl) {
            learnedCoordinates = await performVisualComparison(
                trainingSession.originalFile,
                trainingSession.redactedFile
            );
        }

        trainingSession.progress = 90;
        updateTrainingUI();

        // 4. Prepare learned data
        const suggestedRule = {
            id: generateId(),
            name: aiResult.companyName || 'Unknown Company',
            patterns: aiResult.suggestedRules?.patterns || [],
            sensitiveTerms: aiResult.suggestedRules?.sensitiveTerms || [],
            learnedCoordinates: learnedCoordinates,
            identifiers: [aiResult.companyName || 'Unknown Company'],
            description: aiResult.suggestedRules?.description || 'Automatically generated from training'
        };

        trainingSession.learnedData = {
            companyName: aiResult.companyName || 'Unknown Company',
            suggestedRules: suggestedRule,
            detectedRedactions: aiResult.detectedRedactions?.map(r => ({
                id: generateId(),
                pageIndex: 0,
                x: 0, y: 0, width: 0, height: 0,
                text: r.text,
                label: r.label,
                type: 'auto',
                isSelected: true
            })) || []
        };

        trainingSession.status = 'preview';
        trainingSession.progress = 100;
        updateTrainingUI();

        showAlert('success', `Analysis complete for ${trainingSession.learnedData.companyName}. Please review the preview.`);

    } catch (error) {
        console.error('Training failed:', error);
        trainingSession.status = 'error';
        updateTrainingUI();
        showAlert('error', `Training failed: ${error.message}`);
    }
}

// Extract text from PDF using PDF.js
async function extractTextFromPDF(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                const typedarray = new Uint8Array(e.target.result);
                const pdf = await pdfjsLib.getDocument({ data: typedarray }).promise;
                let fullText = '';
                
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    const pageText = textContent.items.map(item => item.str).join(' ');
                    fullText += `--- Page ${i} ---\n${pageText}\n\n`;
                }
                
                resolve(fullText);
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

// Call backend training endpoint
async function callBackendTraining(originalFile, redactedFile) {
    const formData = new FormData();
    formData.append('unredacted', originalFile);
    if (redactedFile) {
        formData.append('redacted', redactedFile);
    }

    try {
        const response = await fetch(`${BACKEND_URL}/api/ai/train-pair`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`Backend error: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Backend training call failed:', error);
        // Fallback to local AI logic
        return fallbackLocalTraining(originalFile, redactedFile);
    }
}

// Fallback local training (simplified version of Redection-studio's logic)
async function fallbackLocalTraining(originalFile, redactedFile) {
    // This is a simplified version - in production, you'd want to implement
    // the full trainModelFromFiles logic from Redection-studio
    const originalText = await extractTextFromPDF(originalFile);
    
    // Simple company name extraction (first line)
    const lines = originalText.split('\n').filter(l => l.trim());
    const companyName = lines[0] ? lines[0].substring(0, 50).trim() : 'Unknown Company';
    
    const suggestedRules = {
        name: `${companyName} Rules`,
        patterns: ['[A-Z]{2,}-\\d{4,}', '\\d{3}-\\d{2}-\\d{4}'],
        sensitiveTerms: ['Confidential', 'Internal', 'Proprietary'],
        description: `Automatically generated rules for ${companyName}`
    };

    const detectedRedactions = [];
    
    // Simple PII detection
    const piiPatterns = {
        EMAIL: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
        PHONE: /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
        SSN: /\b\d{3}-\d{2}-\d{4}\b/g
    };

    for (const [label, pattern] of Object.entries(piiPatterns)) {
        let match;
        pattern.lastIndex = 0;
        while ((match = pattern.exec(originalText)) !== null) {
            detectedRedactions.push({
                text: match[0],
                label: label,
                reason: `Detected ${label} in training sample`
            });
        }
    }

    return {
        companyName,
        suggestedRules,
        detectedRedactions: detectedRedactions.slice(0, 10) // Limit results
    };
}

// Perform visual comparison between original and redacted PDFs
async function performVisualComparison(originalFile, redactedFile) {
    // This is a simplified version - in production, implement the full
    // findRedactedBoxes algorithm from Redection-studio
    console.log('Visual comparison would run here');
    return [];
}

// Find redacted boxes by comparing image data (adapted from Redection-studio)
export function findRedactedBoxes(origImageData, redImageData, width, height) {
    const diff = new Array(width * height).fill(false);
    let hasDiff = false;

    for (let i = 0; i < origImageData.data.length; i += 4) {
        const r1 = origImageData.data[i], g1 = origImageData.data[i+1], b1 = origImageData.data[i+2];
        const r2 = redImageData.data[i], g2 = redImageData.data[i+1], b2 = redImageData.data[i+2];
        const isBlack = r2 < 30 && g2 < 30 && b2 < 30;
        const wasNotBlack = r1 > 50 || g1 > 50 || b1 > 50;
        if (isBlack && wasNotBlack) {
            diff[i / 4] = true;
            hasDiff = true;
        }
    }

    if (!hasDiff) return [];

    const boxes = [];
    const visited = new Set();
    const step = 5;

    for (let y = 0; y < height; y += step) {
        for (let x = 0; x < width; x += step) {
            const idx = y * width + x;
            if (diff[idx] && !visited.has(idx)) {
                let minX = x, maxX = x, minY = y, maxY = y;
                const stack = [[x, y]];
                visited.add(idx);

                while (stack.length > 0) {
                    const [cx, cy] = stack.pop();
                    minX = Math.min(minX, cx);
                    maxX = Math.max(maxX, cx);
                    minY = Math.min(minY, cy);
                    maxY = Math.max(maxY, cy);

                    const neighbors = [[cx+step, cy], [cx-step, cy], [cx, cy+step], [cx, cy-step]];
                    for (const [nx, ny] of neighbors) {
                        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                            const nIdx = ny * width + nx;
                            if (diff[nIdx] && !visited.has(nIdx)) {
                                visited.add(nIdx);
                                stack.push([nx, ny]);
                            }
                        }
                    }
                }
                
                if ((maxX - minX) > 10 && (maxY - minY) > 10) {
                    boxes.push({
                        x: (minX / width) * 100,
                        y: (minY / height) * 100,
                        width: ((maxX - minX) / width) * 100,
                        height: ((maxY - minY) / height) * 100
                    });
                }
            }
        }
    }
    return boxes;
}

// Save learned rule to backend
async function saveLearnedRule() {
    if (!trainingSession.learnedData) {
        showAlert('error', 'No learned data to save');
        return;
    }

    try {
        const response = await fetch(`${BACKEND_URL}/api/ai/save-rule`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                companyName: trainingSession.learnedData.companyName,
                rule: trainingSession.learnedData.suggestedRules
            })
        });

        if (!response.ok) {
            throw new Error('Failed to save rule');
        }

        trainingSession.status = 'completed';
        updateTrainingUI();
        showAlert('success', `Rule saved for ${trainingSession.learnedData.companyName}`);
        
    } catch (error) {
        console.error('Save failed:', error);
        showAlert('error', `Failed to save rule: ${error.message}`);
    }
}

// Reset training session
export function resetTraining() {
    trainingSession = {
        id: generateId(),
        status: 'idle',
        originalFile: null,
        redactedFile: null,
        originalUrl: null,
        learnedData: null,
        progress: 0,
        zoom: 1.0
    };
    updateTrainingUI();
}

// Export utility functions
export default {
    initAITraining,
    findRedactedBoxes,
    resetTraining
};