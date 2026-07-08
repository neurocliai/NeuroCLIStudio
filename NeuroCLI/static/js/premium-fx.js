document.addEventListener("DOMContentLoaded", () => {
    // 1. Cursor Spotlight
    const spotlight = document.createElement("div");
    spotlight.id = "cursor-spotlight";
    document.body.appendChild(spotlight);
    
    // 5. Liquid Blob
    const blob = document.createElement("div");
    blob.className = "liquid-blob";
    document.body.appendChild(blob);

    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let spotX = mouseX;
    let spotY = mouseY;

    document.addEventListener("mousemove", (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
    });

    // Smooth cursor interpolation
    function animateCursor() {
        spotX += (mouseX - spotX) * 0.15;
        spotY += (mouseY - spotY) * 0.15;
        spotlight.style.transform = `translate(${spotX}px, ${spotY}px) translate(-50%, -50%)`;
        requestAnimationFrame(animateCursor);
    }
    animateCursor();

    // 2. Glassmorphism Glare & 6. 3D Tilt
    const updateGlare = (e, el) => {
        const rect = el.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        el.style.setProperty('--x', `${x}px`);
        el.style.setProperty('--y', `${y}px`);
        
        // 3D Tilt calculation
        if (el.classList.contains('tiltable') || el.classList.contains('gallery-thumbnail')) {
            el.classList.add('tiltable');
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            const tiltX = ((y - centerY) / centerY) * -15; // Max 15 deg
            const tiltY = ((x - centerX) / centerX) * 15;
            el.style.transform = `perspective(1000px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale3d(1.05, 1.05, 1.05)`;
            el.style.zIndex = 10;
        }
    };
    
    const resetTilt = (el) => {
        if (el.classList.contains('tiltable')) {
            el.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
            el.style.zIndex = '';
        }
    };

    let lastGlareTarget = null;
    let isGlareTicking = false;
    let currentGlareEvent = null;

    const processGlare = () => {
        if (currentGlareEvent && lastGlareTarget) {
            updateGlare(currentGlareEvent, lastGlareTarget);
        }
        isGlareTicking = false;
    };

    // Apply to existing and dynamically added elements using event delegation
    document.addEventListener("mousemove", (e) => {
        const glareTarget = e.target.closest('.input-wrapper, .chat-message, .gallery-thumbnail');
        
        if (glareTarget) {
            if(!glareTarget.classList.contains('glass-glare')) {
                glareTarget.classList.add('glass-glare');
            }
            lastGlareTarget = glareTarget;
            currentGlareEvent = e;
            
            if (!isGlareTicking) {
                requestAnimationFrame(processGlare);
                isGlareTicking = true;
            }
        }
    }, { passive: true });

    document.addEventListener("mouseout", (e) => {
        const target = e.target.closest('.input-wrapper, .chat-message, .gallery-thumbnail');
        if (target) {
            resetTilt(target);
            if (lastGlareTarget === target) lastGlareTarget = null;
        }
    });

    // 1. Magnetic Buttons (Event Delegation instead of MutationObserver)
    document.addEventListener("mousemove", (e) => {
        const btn = e.target.closest('button');
        if (btn && !btn.classList.contains('prompt-action-btn') && !btn.classList.contains('action-btn')) {
            if (!btn.classList.contains('magnetic')) btn.classList.add('magnetic');
            const rect = btn.getBoundingClientRect();
            const x = e.clientX - rect.left - rect.width / 2;
            const y = e.clientY - rect.top - rect.height / 2;
            btn.style.transform = `translate(${x * 0.25}px, ${y * 0.25}px)`;
        }
    }, { passive: true });

    document.addEventListener("mouseout", (e) => {
        const btn = e.target.closest('button');
        if (btn) {
            btn.style.transform = `translate(0px, 0px)`;
        }
    });

    // 4. Text Scramble Decode
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*";
    const scrambleText = (element) => {
        if(element.dataset.scrambling === "true") return;
        element.dataset.scrambling = "true";
        
        const originalText = element.dataset.original || element.innerText;
        element.dataset.original = originalText;
        
        let iteration = 0;
        const maxIterations = originalText.length;
        
        const interval = setInterval(() => {
            element.innerText = originalText
                .split("")
                .map((letter, index) => {
                    if (index < iteration) {
                        return originalText[index];
                    }
                    if (letter === " ") return " ";
                    return letters[Math.floor(Math.random() * letters.length)];
                })
                .join("");
            
            if (iteration >= maxIterations) {
                clearInterval(interval);
                element.innerText = originalText;
                element.dataset.scrambling = "false";
            }
            iteration += 1/3;
        }, 30);
    };

    document.querySelectorAll('h1').forEach(h1 => {
        h1.addEventListener('mouseover', () => scrambleText(h1));
        // Trigger once on load
        setTimeout(() => scrambleText(h1), 500);
    });
});

// 7. AI Thinking Glow (Intercepting the actual generation)
const originalFetch = window.fetch;
window.fetch = async function(...args) {
    const inputWrapper = document.getElementById('input-wrapper');
    const generateBtn = document.getElementById('generate-btn');
    
    let isGenerationCall = false;
    if (typeof args[0] === 'string' && args[0].includes('/api/generate')) {
        isGenerationCall = true;
        if (inputWrapper) inputWrapper.classList.add('ai-thinking');
        if (generateBtn) generateBtn.classList.add('ai-thinking');
    }
    
    try {
        return await originalFetch.apply(this, args);
    } finally {
        if (isGenerationCall) {
            if (inputWrapper) inputWrapper.classList.remove('ai-thinking');
            if (generateBtn) generateBtn.classList.remove('ai-thinking');
        }
    }
};
