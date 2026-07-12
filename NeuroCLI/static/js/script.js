document.addEventListener('DOMContentLoaded', () => {
    // Firebase Auth & Session ID Management
    let firebaseUser = null;
    let sessionId = localStorage.getItem('neurocli_session_id');
    if (!sessionId) {
        sessionId = 'session_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
        localStorage.setItem('neurocli_session_id', sessionId);
    }
    
    // Dynamic Session ID that prefers Firebase UID
    const getSessionId = () => {
        return firebaseUser ? firebaseUser.uid : sessionId;
    };

    // Note: We use dynamic import so it doesn't block if they haven't configured it
    import("https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js").then((appModule) => {
        import("https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js").then((authModule) => {
            const firebaseConfig = {
                projectId: "neurocliai-11b75",
                appId: "1:178874986630:web:b669a43f063edc77826107",
                storageBucket: "neurocliai-11b75.firebasestorage.app",
                apiKey: "AIzaSyCZZwGyIFmAHZc0sg3hUXjGNURKDFBF_jA",
                authDomain: "neurocliai-11b75.firebaseapp.com",
                messagingSenderId: "178874986630",
                measurementId: "G-KGK91GBR6S"
            };
            try {
                if (!firebaseConfig.apiKey.includes("PASTE_")) {
                    const app = appModule.initializeApp(firebaseConfig);
                    const auth = authModule.getAuth(app);
                    authModule.onAuthStateChanged(auth, (user) => {
                        if (user) {
                            firebaseUser = user;
                            console.log("Logged in as Firebase user:", user.uid);
                            
                                // Sync profile widget if logged in
                                const profileWidget = document.getElementById('user-profile-widget');
                                if (profileWidget) {
                                    const displayName = user.displayName || 'User';
                                    const userEmail = document.getElementById('user-email');
                                    if (userEmail) userEmail.innerText = displayName;
                                    
                                    const userAvatar = document.getElementById('user-avatar');
                                    if (userAvatar && user.photoURL) {
                                        userAvatar.src = user.photoURL;
                                    }
                                    
                                    // Populate dropdown
                                    const dropdownName = document.getElementById('dropdown-name');
                                    if (dropdownName) dropdownName.innerText = displayName;
                                    const dropdownEmail = document.getElementById('dropdown-email');
                                    if (dropdownEmail) dropdownEmail.innerText = user.email || '';
                                    const dropdownAvatar = document.getElementById('dropdown-avatar');
                                    if (dropdownAvatar && user.photoURL) dropdownAvatar.src = user.photoURL;
                                }
                                
                                // Sign out
                                const logoutBtn = document.getElementById('logout-btn');
                                if (logoutBtn) {
                                    logoutBtn.onclick = async (e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        logoutBtn.textContent = 'Signing out...';
                                        try {
                                            await authModule.signOut(auth);
                                            localStorage.removeItem('neurocli_session_id');
                                            window.location.href = '/auth';
                                        } catch (error) {
                                            console.error('Logout error:', error);
                                            logoutBtn.textContent = 'Sign Out';
                                            alert('Failed to sign out.');
                                        }
                                    };
                                }
                            
                            // Close dropdown when clicking outside
                            document.addEventListener('click', (e) => {
                                const profileWidget = document.getElementById('user-profile-widget');
                                const dropdown = document.getElementById('profile-dropdown');
                                if (profileWidget && dropdown) {
                                    if (!profileWidget.contains(e.target) && !dropdown.contains(e.target)) {
                                        dropdown.style.display = 'none';
                                    }
                                }
                            });
                            
                            loadChats().then(() => initializeChatSelection()); // Reload chats now that we have the user UID
                        } else {
                            firebaseUser = null;
                            loadChats().then(() => initializeChatSelection());
                        }
                    });
                }
            } catch(e) {}
        });
    });

    // Make Profile Widget interactive for everyone (Guests & Logged in)
    const profileWidget = document.getElementById('user-profile-widget');
    if (profileWidget) {
        profileWidget.style.display = 'flex'; // Always show it
        profileWidget.onclick = () => {
            if (!firebaseUser) {
                window.location.href = '/auth';
                return;
            }
            const dropdown = document.getElementById('profile-dropdown');
            if (dropdown) {
                dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
            }
        };
    }

    const form = document.getElementById('generate-form');
    const input = document.getElementById('prompt-input');
    const button = document.getElementById('generate-btn');
    const chatContainer = document.getElementById('chat-container');
    const chatList = document.getElementById('chat-list');
    const newChatBtn = document.getElementById('new-chat-btn');
    
    let currentChatId = null;

    // Sidebar Toggle Elements
    const sidebar = document.getElementById('sidebar');
    const hamburgerBtn = document.getElementById('hamburger-menu-btn');
    const sidebarCloseBtn = document.getElementById('sidebar-close-btn');
    const sidebarOverlay = document.getElementById('sidebar-overlay');

    const toggleSidebar = (forceClose = false) => {
        const isMobile = window.innerWidth <= 768;
        if (isMobile) {
            if (forceClose) {
                sidebar.classList.remove('open');
                sidebarOverlay.classList.remove('active');
            } else {
                sidebar.classList.toggle('open');
                sidebarOverlay.classList.toggle('active');
            }
        } else {
            // Desktop behavior
            if (forceClose) {
                sidebar.classList.add('closed');
            } else {
                sidebar.classList.toggle('closed');
            }
        }
    };
    window.toggleSidebar = toggleSidebar;

    if (hamburgerBtn) hamburgerBtn.addEventListener('click', () => toggleSidebar());
    if (sidebarCloseBtn) sidebarCloseBtn.addEventListener('click', () => toggleSidebar(true));
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', () => toggleSidebar(true));

    // Modal elements
    const modal = document.getElementById('image-modal');
    const modalImg = document.getElementById('modal-image');
    const modalClose = document.querySelector('#image-modal .modal-close');

    // Helper to scroll to bottom
    const scrollToBottom = () => {
        chatContainer.scrollTop = chatContainer.scrollHeight;
    };

    // Helper to escape HTML to prevent XSS in prompt text
    const escapeHTML = (str) => str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag]));

    // Helper to create a user message bubble (with Edit/Copy buttons)
    const appendUserMessage = (text) => {
        const safeText = escapeHTML(text);
        const div = document.createElement('div');
        div.className = 'chat-message user-message';
        div.innerHTML = `
            <div class="message-content user-bubble-container">
                <span class="user-bubble-text">${safeText}</span>
                <div class="user-actions">
                    <button class="prompt-action-btn" onclick="editPrompt(this, '${safeText.replace(/'/g, "\\'")}')">
                        <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                        Edit
                    </button>
                    <button class="prompt-action-btn" onclick="copyPrompt('${safeText.replace(/'/g, "\\'")}', this)">
                        <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"></path></svg>
                        Copy
                    </button>
                </div>
            </div>
            <div class="message-avatar">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
            </div>
        `;
        chatContainer.appendChild(div);
        scrollToBottom();
    };

    // Global Edit and Copy functions for prompts
    window.editPrompt = (btnElement, text) => {
        const container = btnElement.closest('.user-bubble-container');
        const textSpan = container.querySelector('.user-bubble-text');
        const actionsDiv = container.querySelector('.user-actions');
        
        // Hide original text and actions
        textSpan.style.display = 'none';
        actionsDiv.style.display = 'none';
        
        // Create edit container
        const editDiv = document.createElement('div');
        editDiv.className = 'edit-container';
        editDiv.innerHTML = `
            <textarea class="edit-textarea">${escapeHTML(text)}</textarea>
            <div class="edit-actions">
                <button class="edit-cancel-btn">Cancel</button>
                <button class="edit-submit-btn">Submit</button>
            </div>
        `;
        
        container.insertBefore(editDiv, textSpan);
        
        const textarea = editDiv.querySelector('textarea');
        textarea.style.height = 'auto';
        textarea.style.height = (textarea.scrollHeight) + 'px';
        textarea.focus();
        
        textarea.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
        });
        
        editDiv.querySelector('.edit-cancel-btn').onclick = () => {
            editDiv.remove();
            textSpan.style.display = '';
            actionsDiv.style.display = 'flex';
        };
        
        editDiv.querySelector('.edit-submit-btn').onclick = () => {
            const newText = textarea.value.trim();
            if(!newText) return;
            
            // Revert UI to original state but with new text (if changed)
            editDiv.remove();
            textSpan.textContent = newText;
            textSpan.style.display = '';
            actionsDiv.style.display = 'flex';
            
            // Update onclick handler with new text
            const editBtn = actionsDiv.querySelector('.prompt-action-btn');
            editBtn.setAttribute('onclick', `editPrompt(this, '${newText.replace(/'/g, "\\'")}')`);
            
            // Trigger generation with new text
            input.value = newText;
            form.dispatchEvent(new Event('submit'));
        };
    };

    window.copyPrompt = async (text, btnElement) => {
        if (!navigator.clipboard || !navigator.clipboard.writeText) {
            alert("Clipboard access is blocked over network IPs. Use localhost.");
            return;
        }
        try {
            await navigator.clipboard.writeText(text);
            const originalHtml = btnElement.innerHTML;
            btnElement.innerHTML = `<svg width="12" height="12" fill="none" stroke="#10a37f" stroke-width="2" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"></path></svg> <span style="color:#10a37f">Copied</span>`;
            setTimeout(() => btnElement.innerHTML = originalHtml, 2000);
        } catch (err) {
            console.error("Failed to copy text", err);
        }
    };

    // Helper to create an AI message with a loaded image
    const appendAILoadedImage = (prompt, base64Data) => {
        const div = document.createElement('div');
        div.className = 'chat-message ai-message';
        
        // Handle both raw base64 and public URLs
        let imgSrc = '';
        if (base64Data.startsWith('http://') || base64Data.startsWith('https://')) {
            imgSrc = base64Data;
        } else {
            imgSrc = `data:image/png;base64,${base64Data}`;
        }
        
        div.innerHTML = `
            <div class="message-avatar">
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <defs>
                    <linearGradient id="neuroGradJS" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stop-color="#4f46e5" />
                      <stop offset="100%" stop-color="#0ea5e9" />
                    </linearGradient>
                  </defs>
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" stroke="url(#neuroGradJS)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></path>
                  <circle cx="12" cy="12" r="3" fill="url(#neuroGradJS)"></circle>
                  <path d="M12 15v7M12 2v3M5 6.5l2.5 1.5M19 17.5l-2.5-1.5M5 17.5l2.5-1.5M19 6.5l-2.5 1.5" stroke="url(#neuroGradJS)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
                </svg>
            </div>
            <div class="message-content">
                <div class="generated-image-box border-style-${typeof currentBorder !== 'undefined' ? currentBorder : 'default'}">
                    <img src="${imgSrc}" alt="${escapeHTML(prompt)}" class="image-reveal" onload="scrollToBottom()" style="cursor: zoom-in;" onclick="openModal(this.src)">
                    <div class="image-actions">
                        <button class="action-btn" onclick="remixPrompt('${escapeHTML(prompt).replace(/'/g, "\\'")}')" title="Create a variation">
                            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 2v6h-6"></path><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 2v6h6"></path><path d="M21 12a9 9 0 1 0-9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"></path></svg>
                            Remix
                        </button>
                        <button class="action-btn" onclick="upscaleImage('${escapeHTML(prompt).replace(/'/g, "\\'")}')" title="Upscale to high resolution">
                            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="17 11 12 6 7 11"></polyline><polyline points="17 18 12 13 7 18"></polyline></svg>
                            Upscale
                        </button>
                        <button class="action-btn" onclick="downloadImage('${base64Data}')">
                            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                            Download
                        </button>
                    </div>
                </div>
            </div>
        `;
        chatContainer.appendChild(div);
        
        // Add to Gallery
        const galleryList = document.getElementById('gallery-list');
        if (galleryList) {
            const thumb = document.createElement('img');
            thumb.className = 'gallery-thumbnail image-reveal';
            thumb.src = imgSrc;
            thumb.onclick = () => openModal(thumb.src);
            galleryList.prepend(thumb);
        }
        
        scrollToBottom();
    };

    window.remixPrompt = (prompt) => {
        const input = document.getElementById('prompt-input');
        const p = prompt.toLowerCase();
        let modifiers = [
            ", in a cyberpunk style, neon lights, 8k",
            ", watercolor painting, ethereal, soft lighting",
            ", cinematic composition, highly detailed, Unreal Engine 5 render",
            ", studio photography, dramatic lighting, sharp focus",
            ", oil painting style, vibrant brush strokes, masterpiece"
        ];
        
        if (p.includes('city') || p.includes('street') || p.includes('car')) {
            modifiers = [", cyberpunk aesthetic, neon lights, rainy streets, cinematic", ", futuristic utopia, flying cars, bright sunlight, 8k"];
        } else if (p.includes('mountain') || p.includes('nature') || p.includes('forest')) {
            modifiers = [", fantasy landscape, glowing flora, ethereal lighting", ", dramatic sunset, highly detailed wilderness, National Geographic style"];
        } else if (p.includes('person') || p.includes('girl') || p.includes('boy') || p.includes('man') || p.includes('woman') || p.includes('portrait')) {
            modifiers = [", studio lighting, sharp focus, 85mm lens, photorealistic portrait", ", cyberpunk fashion, glowing eyes, highly detailed face"];
        }
        
        const randomModifier = modifiers[Math.floor(Math.random() * modifiers.length)];
        input.value = prompt + randomModifier;
        input.focus();
    };

    window.upscaleImage = (prompt) => {
        const input = document.getElementById('prompt-input');
        const p = prompt.toLowerCase();
        let upscales = [
            ", 8k resolution, ultra-high definition, sharp focus, intricate details",
            ", extremely detailed, 4k, photorealistic, masterpiece",
            ", crisp lines, ultra-detailed textures, maximum resolution"
        ];
        
        if (p.includes('portrait') || p.includes('face') || p.includes('eyes')) {
            upscales = [", highly detailed skin texture, micro-details, ultra-sharp focus on eyes, 8k portrait"];
        } else if (p.includes('city') || p.includes('landscape') || p.includes('building')) {
            upscales = [", architectural rendering, ultra-detailed textures, 8k, majestic scale, hyper-sharp"];
        }

        const randomUpscale = upscales[Math.floor(Math.random() * upscales.length)];
        input.value = prompt + randomUpscale;
        input.focus();
    };


    // Helper to create an AI loading bubble
    const appendAILoading = () => {
        const div = document.createElement('div');
        div.className = 'chat-message ai-message';
        div.id = 'current-loading-bubble';
        div.innerHTML = `
            <div class="message-avatar">
                <img src="/static/img/logo.svg" alt="AI" onerror="this.onerror=null; this.src='/static/img/neurocli_logo.png'">
            </div>
            <div class="message-content">
                <div class="nature-loading-container">
                    <div class="landscape-loader">
                        <div class="stars"></div>
                        <div class="orbit-center">
                            <div class="sun-container">
                                <div class="sun-body"></div>
                            </div>
                            <div class="moon-container">
                                <div class="moon-body"></div>
                            </div>
                        </div>
                        <svg viewBox="0 0 200 100" class="landscape-svg" preserveAspectRatio="none">
                            <polygon points="10,100 70,30 140,100" fill="#1a202c" opacity="0.8"/>
                            <polygon points="70,100 140,40 210,100" fill="#2d3748" opacity="0.9"/>
                            <polygon points="-20,100 40,50 100,100" fill="#4a5568"/>
                            <g transform="translate(20, 50)">
                                <polygon points="10,0 20,30 0,30" fill="#276749"/>
                                <polygon points="10,10 22,40 -2,40" fill="#22543d"/>
                            </g>
                            <g transform="translate(150, 40)">
                                <polygon points="10,0 20,30 0,30" fill="#276749"/>
                                <polygon points="10,10 22,40 -2,40" fill="#22543d"/>
                                <polygon points="10,20 24,50 -4,50" fill="#1c4532"/>
                            </g>
                            <g transform="translate(90, 60) scale(0.7)">
                                <polygon points="10,0 20,30 0,30" fill="#276749"/>
                                <polygon points="10,10 22,40 -2,40" fill="#22543d"/>
                            </g>
                        </svg>
                    </div>
                    <span class="loading-text">Generating image...</span>
                </div>
            </div>
        `;
        chatContainer.appendChild(div);
        scrollToBottom();
        return div;
    };

    // Copy function handler for images
    window.copyImage = async (base64Data, btnElement) => {
        if (!navigator.clipboard || !navigator.clipboard.write) {
            alert('Copying is blocked by your browser. Please use localhost (127.0.0.1) instead of a network IP.');
            return;
        }
        try {
            const res = await fetch("data:image/png;base64," + base64Data);
            const blob = await res.blob();
            await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob })
            ]);
            
            const originalHtml = btnElement.innerHTML;
            btnElement.innerHTML = `<svg width="14" height="14" fill="none" stroke="#10a37f" stroke-width="2" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"></path></svg> Copied!`;
            setTimeout(() => btnElement.innerHTML = originalHtml, 2000);
        } catch (err) {
            alert('Failed to copy. Security policy blocked the action.');
            console.error(err);
        }
    };

    // Download function handler for images
    window.downloadImage = (base64Data) => {
        if (base64Data.startsWith('http://') || base64Data.startsWith('https://')) {
            // For URLs, fetch the blob and download
            fetch(base64Data)
                .then(response => response.blob())
                .then(blob => {
                    const url = window.URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `NeuroCLI_${Date.now()}.png`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    window.URL.revokeObjectURL(url);
                })
                .catch(err => console.error('Error downloading image:', err));
        } else {
            const link = document.createElement('a');
            link.href = "data:image/png;base64," + base64Data;
            link.download = `NeuroCLI_${Date.now()}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    // Modal Logic
    window.openModal = (src) => {
        if (modalImg && modal) {
            modalImg.src = src;
            modal.classList.remove('hidden');
        }
    };

    const closeModal = () => {
        if (modal) {
            modal.classList.add('hidden');
            setTimeout(() => { modalImg.src = ''; }, 300); // clear after animation
        }
    };
    
    // Expose globally for inline onclick handlers if needed
    window.closeModal = closeModal;

    if (modalClose) {
        modalClose.addEventListener('click', closeModal);
    }
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
    }

    // Custom UI Modal Logic
    const customModal = document.getElementById('custom-modal');
    const customModalTitle = document.getElementById('custom-modal-title');
    const customModalMessage = document.getElementById('custom-modal-message');
    const customModalInput = document.getElementById('custom-modal-input');
    const customModalCancel = document.getElementById('custom-modal-cancel');
    const customModalConfirm = document.getElementById('custom-modal-confirm');

    const showCustomModal = (options) => {
        return new Promise((resolve) => {
            // Reset state
            customModalTitle.textContent = options.title || 'NeuroCLI';
            
            if (options.message) {
                customModalMessage.textContent = options.message;
                customModalMessage.classList.remove('hidden');
            } else {
                customModalMessage.classList.add('hidden');
            }
            
            if (options.showInput) {
                customModalInput.value = options.inputValue || '';
                customModalInput.classList.remove('hidden');
            } else {
                customModalInput.classList.add('hidden');
            }

            customModalConfirm.className = `modal-btn confirm-btn ${options.danger ? 'danger' : ''}`;
            customModalConfirm.textContent = options.confirmText || 'OK';

            customModal.classList.remove('hidden');
            if (options.showInput) customModalInput.focus();

            const cleanup = () => {
                customModal.classList.add('hidden');
                customModalCancel.removeEventListener('click', onCancel);
                customModalConfirm.removeEventListener('click', onConfirm);
            };

            const onCancel = () => {
                cleanup();
                resolve(null);
            };

            const onConfirm = () => {
                cleanup();
                if (options.showInput) {
                    resolve(customModalInput.value);
                } else {
                    resolve(true);
                }
            };

            customModalCancel.addEventListener('click', onCancel);
            customModalConfirm.addEventListener('click', onConfirm);
        });
    };

    // Load Chat Sidebar
    const loadChats = async () => {
        try {
            const res = await fetch('/chats', { headers: { 'X-Session-Id': getSessionId() } });
            const data = await res.json();
            chatList.innerHTML = '';
            
            if (data.chats) {
                data.chats.forEach(chat => {
                    const div = document.createElement('div');
                    div.className = `chat-item ${currentChatId === chat.id ? 'active' : ''}`;
                    div.onclick = () => selectChat(chat.id);
                    
                    div.innerHTML = `
                        <div class="chat-title">${escapeHTML(chat.title)}</div>
                        <div class="chat-actions">
                            <button class="chat-action-btn" onclick="editChatTitle(event, ${chat.id}, '${escapeHTML(chat.title).replace(/'/g, "\\'")}')">
                                <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                            </button>
                            <button class="chat-action-btn delete" onclick="deleteChat(event, ${chat.id})">
                                <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path></svg>
                            </button>
                        </div>
                    `;
                    chatList.appendChild(div);
                });
            }
        } catch (err) {
            console.error("Failed to load chats", err);
        }
    };

    // Chat Actions
    const selectChat = async (chatId) => {
        if (window.innerWidth <= 768) {
            toggleSidebar(true);
        }
        
        if(currentChatId === chatId) return;
        currentChatId = chatId;
        
        document.querySelectorAll('.chat-item').forEach(item => item.classList.remove('active'));
        loadChats();
        chatContainer.innerHTML = '';
        
        try {
            const res = await fetch(`/history/${chatId}`, { headers: { 'X-Session-Id': getSessionId() } });
            const data = await res.json();
            if (data.history) {
                data.history.forEach(item => {
                    appendUserMessage(item.prompt);
                    appendAILoadedImage(item.prompt, item.image_base64);
                });
            }
        } catch (err) {
            console.error("Failed to load chat history", err);
        }
    };

    newChatBtn.onclick = () => {
        currentChatId = null;
        chatContainer.innerHTML = `
            <div class="chat-message ai-message initial-greeting">
                <div class="message-avatar">
                    <img src="/static/img/logo.svg" alt="AI" onerror="this.onerror=null; this.src='/static/img/neurocli_logo.png'">
                </div>
                <div class="message-content">
                    <p>Hello! I'm NeuroCLI, your image generation assistant.</p>
                    <p>Describe an image you'd like me to design, and I'll generate it in a few moments.</p>
                </div>
            </div>
        `;
        document.querySelectorAll('.chat-item').forEach(item => item.classList.remove('active'));
    };

    window.editChatTitle = async (e, chatId, currentTitle) => {
        e.stopPropagation();
        
        const newTitle = await showCustomModal({
            title: 'Rename Chat',
            showInput: true,
            inputValue: currentTitle,
            confirmText: 'Save'
        });

        if (newTitle && newTitle.trim() !== currentTitle) {
            try {
                await fetch(`/chats/${chatId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'X-Session-Id': getSessionId() },
                    body: JSON.stringify({ title: newTitle.trim() })
                });
                loadChats();
            } catch (err) {
                console.error("Failed to edit chat", err);
            }
        }
    };

    window.deleteChat = async (e, chatId) => {
        e.stopPropagation();
        
        const confirmed = await showCustomModal({
            title: 'Delete Chat',
            message: 'Are you sure you want to delete this chat? This action cannot be undone.',
            confirmText: 'Delete',
            danger: true
        });

        if (confirmed) {
            try {
                await fetch(`/chats/${chatId}`, { method: 'DELETE', headers: { 'X-Session-Id': getSessionId() } });
                if (currentChatId === chatId) {
                    newChatBtn.click();
                }
                loadChats();
            } catch (err) {
                console.error("Failed to delete chat", err);
            }
        }
    };

    // Rate Limiting Logic
    const RATE_LIMIT_MAX = 5;
    const RATE_LIMIT_HOURS = 24;
    
    async function checkRateLimit() {
        const historyStr = localStorage.getItem('neurocli_generations');
        let history = historyStr ? JSON.parse(historyStr) : [];
        const now = Date.now();
        const windowTime = RATE_LIMIT_HOURS * 60 * 60 * 1000;
        
        history = history.filter(time => now - time < windowTime);
        localStorage.setItem('neurocli_generations', JSON.stringify(history));
        
        if (history.length >= RATE_LIMIT_MAX) {
            const oldest = history[0];
            const unlockTime = new Date(oldest + windowTime);
            
            const timeString = unlockTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            const dateString = unlockTime.toLocaleDateString();
            
            const display = document.getElementById('unlock-time-display');
            const modal = document.getElementById('rate-limit-modal');
            const couponsGrid = document.getElementById('coupons-grid');
            
            if (display && modal) {
                display.innerText = `${dateString} at ${timeString}`;
                
                if (couponsGrid) {
                    try {
                        const response = await fetch('/api/coupons');
                        const liveCoupons = await response.json();
                        
                        couponsGrid.innerHTML = liveCoupons.map(c => `
                            <div style="background: rgba(255,255,255,0.05); padding: 0.75rem; border-radius: 8px; border: 1px dashed rgba(255,255,255,0.2); position: relative;">
                                <p style="color: white; font-size: 0.8rem; font-weight: bold; margin: 0 0 0.2rem 0;">${c.store}</p>
                                <p style="color: #a855f7; font-size: 0.75rem; margin: 0 0 0.5rem 0;">${c.discount}</p>
                                <div style="background: rgba(0,0,0,0.4); padding: 0.4rem; border-radius: 4px; display: flex; justify-content: space-between; align-items: center;">
                                    <span style="color: #00ffcc; font-family: monospace; font-size: 0.75rem; font-weight: bold; letter-spacing: 1px;">${c.code}</span>
                                    <button onclick="navigator.clipboard.writeText('${c.code}'); const btn = this; btn.innerText='Copied!'; setTimeout(() => btn.innerText='Copy', 2000);" style="background: rgba(255,255,255,0.1); border: none; color: white; font-size: 0.6rem; padding: 0.2rem 0.4rem; border-radius: 4px; cursor: pointer;">Copy</button>
                                </div>
                            </div>
                        `).join('');
                    } catch (err) {
                        console.error("Failed to fetch live coupons", err);
                    }
                }
                
                modal.classList.remove('hidden');
            }
            return false;
        }
        return true;
    }
    
    function recordGeneration() {
        const historyStr = localStorage.getItem('neurocli_generations');
        let history = historyStr ? JSON.parse(historyStr) : [];
        history.push(Date.now());
        localStorage.setItem('neurocli_generations', JSON.stringify(history));
    }

    // Style Pills Selection
    let currentStyle = 'none';
    const stylePills = document.querySelectorAll('.style-pill');
    stylePills.forEach(pill => {
        pill.addEventListener('click', () => {
            stylePills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            currentStyle = pill.dataset.style;
        });
    });

    // Border Pills Selection
    window.currentBorder = 'default';
    const borderPills = document.querySelectorAll('.border-pill');
    borderPills.forEach(pill => {
        pill.addEventListener('click', () => {
            borderPills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            window.currentBorder = pill.dataset.border;
        });
    });

    // Form Submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const prompt = input.value.trim();
        if (!prompt) return;

        if (!(await checkRateLimit())) return;

        appendUserMessage(prompt);
        input.value = '';
        
        button.disabled = true;
        const loadingBubble = appendAILoading();

        try {
            // Offload generation to client IP to prevent server rate limiting
            let safePrompt = prompt.replace(/[^a-zA-Z0-9\s]/g, ' ');
            let styleMods = {
                'cinematic': ' cinematic lighting volumetric smoke highly detailed 8k unreal engine 5 render photorealistic',
                'hyperreal': ' hyperrealistic 8k resolution highly detailed macro photography sharp focus',
                'anime': ' anime style studio ghibli vibrant colors detailed line art masterpiece 4k',
                '3d': ' 3d render octane render stylized blender smooth lighting vivid colors'
            };
            let enhanced = safePrompt + " " + (styleMods[currentStyle] || " masterpiece best quality highly detailed 4k resolution");
            let encoded = encodeURIComponent(enhanced.trim());
            let seed = Math.floor(Math.random() * 10000000);
            let pollUrl = `https://image.pollinations.ai/prompt/${encoded}?nologo=true&seed=${seed}`;
            
            // Fetch image blob directly from browser
            const imgResponse = await fetch(pollUrl);
            if (!imgResponse.ok) {
                throw new Error("Our servers are currently facing heavy load. Please try after some time.");
            }
            const imgBlob = await imgResponse.blob();
            
            if (!imgBlob.type.startsWith('image/')) {
                throw new Error("The AI server returned an invalid response (possibly blocked or overloaded). Please try again.");
            }
            
            // Convert to base64
            const reader = new FileReader();
            reader.readAsDataURL(imgBlob);
            const b64data = await new Promise(res => { reader.onloadend = () => res(reader.result) });
            
            // Send base64 to backend for watermarking and saving to Supabase history
            const response = await fetch('/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Session-Id': getSessionId() },
                body: JSON.stringify({ prompt, chat_id: currentChatId, style: currentStyle, generated_b64: b64data }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to save generated image');
            }
            
            // If it was a new chat, update ID and reload sidebar
            if (data.is_new_chat) {
                currentChatId = data.chat_id;
                loadChats();
            }

            // Remove loading bubble
            loadingBubble.remove();
            
            // Add the final image
            appendAILoadedImage(prompt, data.image_base64);
            
            // Record successful generation for rate limiting
            recordGeneration();

        } catch (error) {
            // Replace loading with error message
            const contentDiv = loadingBubble.querySelector('.message-content');
            contentDiv.innerHTML = `
                <div class="error-msg">
                    <strong>Error:</strong> ${error.message}
                </div>
            `;
            loadingBubble.id = '';
        } finally {
            button.disabled = false;
            scrollToBottom();
        }
    });

    // Boot execution
    let initialLoadDone = false;
    
    const initializeChatSelection = async () => {
        if (initialLoadDone) return;
        initialLoadDone = true;
        const res = await fetch('/chats', { headers: { 'X-Session-Id': getSessionId() } });
        const data = await res.json();
        if(data.chats && data.chats.length > 0) {
            selectChat(data.chats[0].id);
        } else {
            newChatBtn.click();
        }
    };

    // Fallback if Firebase takes too long or isn't configured
    const initTimer = setTimeout(() => {
        if (!firebaseUser) {
            loadChats().then(() => initializeChatSelection());
        }
    }, 1500);

    // --- Premium UX Features --- //
    
    // Magic Prompt Enhancer
    const magicBtn = document.getElementById('magic-prompt-btn');
    if (magicBtn) {
        magicBtn.addEventListener('click', () => {
            const currentVal = input.value.trim();
            const magics = [
                ", masterpiece, 8k resolution, highly detailed, cinematic lighting, photorealistic, vibrant colors, stunning composition",
                ", trending on ArtStation, intricate details, volumetric lighting, epic scale, hyper-realistic",
                ", digital painting concept art, breathtaking landscapes, vivid imagination, flawless rendering"
            ];
            const randomMagic = magics[Math.floor(Math.random() * magics.length)];
            
            if (currentVal) {
                input.value = currentVal + randomMagic;
                input.focus();
            } else {
                input.value = "A beautiful masterpiece" + randomMagic;
                input.focus();
            }
            // Add a little pop animation class temporarily
            magicBtn.style.transform = 'scale(1.2) rotate(15deg)';
            setTimeout(() => magicBtn.style.transform = '', 200);
        });
    }

    // Surprise Prompt Enhancer
    const surpriseBtn = document.getElementById('surprise-prompt-btn');
    if (surpriseBtn) {
        surpriseBtn.addEventListener('click', () => {
            const surprises = [
                "A futuristic cyberpunk city skyline at sunset, flying cars, neon lights, glowing reflections",
                "A majestic dragon resting on top of a snowy mountain peak, dramatic lighting, highly detailed",
                "An astronaut drinking coffee in a lush alien jungle, vivid colors, photorealistic",
                "A cute fluffy cat wearing steampunk goggles, portrait, studio lighting, sharp focus",
                "An ancient underwater temple glowing with bioluminescent plants, mysterious atmosphere, cinematic",
                "A cozy wooden cabin in a magical autumn forest, sunlight rays, hyperrealistic, 8k",
                "A highly detailed portrait of a cyberpunk samurai, neon katana, rainy city streets, cinematic",
                "A floating island in the sky, cascading waterfalls, mystical ruins, vibrant colors, fantasy",
                "An adorable puppy sleeping on a cloud, pastel colors, dreamy atmosphere, soft lighting",
                "A giant mechanical spider in a post-apocalyptic desert, rusty metal, sun glare, highly detailed",
                "A serene Japanese garden at dawn, cherry blossoms, koi pond, soft mist, peaceful",
                "A futuristic race car speeding through a neon-lit tunnel, motion blur, 8k, photorealistic",
                "A mystical forest with glowing mushrooms, fairies flying, magical light rays, enchanted",
                "A Victorian era vampire standing in a grand library, elegant clothes, dark fantasy, moody lighting",
                "An underwater city built in a coral reef, mermaids swimming, crystal clear water, vibrant",
                "A space station orbiting a ringed planet, sci-fi, detailed metallic textures, cinematic lighting",
                "A majestic white tiger in a snowy forest, piercing blue eyes, hyperrealistic fur, winter",
                "A wizard casting a powerful fire spell, dynamic action, glowing embers, dark background",
                "A steampunk airship flying through cloudy skies, brass and copper details, adventure",
                "A cute little robot offering a flower, rusted metal but friendly eyes, heartwarming, pixar style",
                "A grand castle carved into the side of a massive mountain, fantasy landscape, epic scale",
                "A bustling cyberpunk marketplace, neon signs, diverse characters, crowded, atmospheric",
                "A tranquil beach at sunset, pink and orange sky, gentle waves, relaxing, 4k",
                "A fierce dragon battling a knight in shining armor, epic fantasy, dynamic pose, fire and smoke",
                "A magical library where books are flying, glowing runes, dusty air, mysterious",
                "A beautiful elf archer in a magical forest, intricate armor, glowing bow, fantasy portrait",
                "A post-apocalyptic city overgrown with nature, abandoned buildings, green vines, sunlight",
                "A massive alien mothership hovering over a modern city, sci-fi invasion, cinematic, ominous",
                "A tiny fairy sitting on a mushroom, reading a tiny book, macro photography, magical",
                "A dark and creepy haunted mansion, full moon, fog, bats, gothic horror",
                "A futuristic soldier in heavy power armor, battle-worn, holding a glowing weapon, sci-fi",
                "A peaceful village in the Swiss Alps, snow-capped mountains, green valleys, beautiful landscape",
                "A giant kraken attacking a pirate ship in a stormy sea, epic battle, dark waves, lightning",
                "A beautiful sorceress weaving a spell of ice, glowing blue magic, winter clothes, elegant",
                "A neon-lit diner in a retro-futuristic city, classic cars, vibrant colors, outrun style",
                "A majestic griffin soaring through the clouds, fantasy creature, detailed feathers, epic",
                "A secret garden hidden behind a stone wall, blooming flowers, climbing vines, romantic",
                "A cyberpunk hacker sitting in a dark room with multiple glowing screens, neon light, sci-fi",
                "A massive waterfall pouring into a deep chasm, lush jungle, rainbows, fantasy landscape",
                "A cute little alien exploring earth, big eyes, curious expression, heartwarming",
                "A grand masquerade ball in a Venetian palace, elegant masks, elaborate dresses, opulent",
                "A fierce Viking warrior standing on a snowy cliff, axe in hand, looking at the sea, epic",
                "A magical portal opening in a dark forest, glowing light, mysterious shadows, fantasy",
                "A beautiful mermaid sitting on a rock, ocean waves, glowing scales, enchanting",
                "A futuristic hover-train speeding through a neon city, sci-fi transport, motion blur",
                "A peaceful zen garden, raked sand, smooth stones, bamboo, tranquil atmosphere",
                "A giant tree of life, glowing roots, magical aura, fantasy landscape, majestic",
                "A creepy scarecrow in a cornfield at night, glowing eyes, halloween theme, spooky",
                "A futuristic medic healing a wounded soldier, glowing medical tech, sci-fi battlefield",
                "A beautiful elven city built in the branches of giant trees, fantasy, intricate architecture",
                "A majestic pegasus flying through a starry night sky, glowing mane, fantasy, magical",
                "A dark alleyway in a cyberpunk city, rain puddles reflecting neon lights, gritty",
                "A cute baby dragon playing with a butterfly, fantasy, heartwarming, colorful",
                "A grand cathedral interior, stained glass windows, sunlight streaming in, gothic",
                "A futuristic gladiator arena, cheering crowd, neon lights, epic sci-fi battle",
                "A magical winter wonderland, snow-covered trees, glowing ice crystals, peaceful"
            ];
            const randomSurprise = surprises[Math.floor(Math.random() * surprises.length)];
            
            input.value = randomSurprise;
            input.focus();
            
            // 3D rolling animation
            surpriseBtn.classList.remove('rolling-dice');
            void surpriseBtn.offsetWidth; // trigger reflow
            surpriseBtn.classList.add('rolling-dice');
        });
    }

    // Drag and Drop Logic
    const dropzoneOverlay = document.getElementById('dropzone-overlay');
    const imagePreviewContainer = document.getElementById('image-preview-container');
    const imagePreview = document.getElementById('image-preview');
    const removePreviewBtn = document.getElementById('remove-preview-btn');

    if (chatContainer && dropzoneOverlay) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            chatContainer.addEventListener(eventName, preventDefaults, false);
        });

        function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }

        ['dragenter', 'dragover'].forEach(eventName => {
            chatContainer.addEventListener(eventName, () => {
                dropzoneOverlay.classList.add('active');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            chatContainer.addEventListener(eventName, () => {
                dropzoneOverlay.classList.remove('active');
            }, false);
        });

        chatContainer.addEventListener('drop', handleDrop, false);

        function handleDrop(e) {
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files && files.length > 0 && files[0].type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    imagePreview.src = e.target.result;
                    imagePreviewContainer.classList.remove('hidden');
                }
                reader.readAsDataURL(files[0]);
            }
        }
    }

    if (removePreviewBtn) {
        removePreviewBtn.addEventListener('click', () => {
            imagePreview.src = '';
            imagePreviewContainer.classList.add('hidden');
        });
    }

    // Gallery Modal Logic
    const galleryBtn = document.getElementById('gallery-btn');
    const galleryModal = document.getElementById('gallery-modal');
    const galleryClose = document.getElementById('gallery-close');
    const fullGalleryGrid = document.getElementById('full-gallery-grid');
    const galleryList = document.getElementById('gallery-list');

    if (galleryBtn && galleryModal) {
        galleryBtn.addEventListener('click', () => {
            fullGalleryGrid.innerHTML = '';
            if (!galleryList || galleryList.children.length === 0) {
                fullGalleryGrid.innerHTML = '<p style="color: rgba(255,255,255,0.4); text-align: center; width: 100%; grid-column: 1 / -1; margin-top: 2rem;">No images in gallery yet. Start generating!</p>';
            } else {
                Array.from(galleryList.children).forEach(img => {
                    const clone = img.cloneNode();
                    clone.style.width = '100%';
                    clone.style.height = '100%';
                    clone.style.objectFit = 'cover';
                    clone.style.borderRadius = '12px';
                    clone.style.cursor = 'zoom-in';
                    clone.style.boxShadow = '0 4px 15px rgba(0,0,0,0.5)';
                    clone.onclick = () => {
                        galleryModal.classList.add('hidden');
                        openModal(clone.src);
                    };
                    fullGalleryGrid.appendChild(clone);
                });
            }
            galleryModal.style.display = 'flex';
            galleryModal.classList.remove('hidden');
        });
    }

    if (galleryClose) {
        galleryClose.addEventListener('click', () => {
            galleryModal.classList.add('hidden');
            setTimeout(() => {
                if(galleryModal.classList.contains('hidden')) {
                    galleryModal.style.display = 'none';
                }
            }, 300);
        });
    }

    // Auto-fill and generate if ?prompt= is in URL
    const urlParams = new URLSearchParams(window.location.search);
    const initialPrompt = urlParams.get('prompt');
    if (initialPrompt && input && form) {
        input.value = initialPrompt;
        // Clean URL without refreshing
        window.history.replaceState({}, document.title, window.location.pathname);
        // Automatically submit the form to start generating
        setTimeout(() => {
            form.dispatchEvent(new Event('submit', { cancelable: true }));
        }, 500);
    }
});
