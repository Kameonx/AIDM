document.addEventListener('DOMContentLoaded', function() {
    // Debug setup
    const DEBUG = true;
    function debugLog(...args) {
        if (DEBUG) console.log(...args);
    }
    
    debugLog("=== TOP-LEVEL DOMCONTENTLOADED STARTED ===");
    
    // IMMEDIATE TEST OF LOCALSTORAGE
    console.log("=== TESTING LOCALSTORAGE ===");
    try {
        localStorage.setItem('test_key', 'test_value');
        const testValue = localStorage.getItem('test_key');
        console.log("localStorage test - stored and retrieved:", testValue);
        localStorage.removeItem('test_key');
        console.log("localStorage is working correctly");
    } catch (e) {
        console.log("localStorage ERROR:", e);
    }
    
    // Core variables
    let isGenerating = false;
    let seenMessages = new Set();
    let dmName = "DM"; 
    let isMultiplayerActive = false;
    let lastSentMessage = "";
    let selectedPlayerElement = null;
    let selectedPlayerNum = null;
      // Add tracking for last undone message - restore from localStorage
    let lastUndoneMessage = localStorage.getItem('lastUndoneMessage') || null;
    let lastUndonePlayerNumber = parseInt(localStorage.getItem('lastUndonePlayerNumber')) || 1;
    
    // Add message history tracking for undo/redo
    let messageHistory = [];
    let historyIndex = -1;
    const MAX_HISTORY_SIZE = 50;
    // Flag to prevent welcome message while loading history
    let isLoadingHistory = false;
    
    // Helper function to get cookie value
    function getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
        return null;
    }
    
    // Global scroll to bottom function
    function scrollToBottom() {
        const chatWindow = document.getElementById('chat-window');
        if (chatWindow) {
            chatWindow.scrollTop = chatWindow.scrollHeight;
        }
    }
    
    // Make it globally available
    window.scrollToBottom = scrollToBottom;
    
    // Session data - check cookie first, then localStorage
    let currentGameId = getCookie('game_id') || localStorage.getItem('currentGameId');
    debugLog("Initial gameId from cookie:", getCookie('game_id'));
    debugLog("Initial gameId from localStorage:", localStorage.getItem('currentGameId'));
    debugLog("Final currentGameId:", currentGameId);
    
    // If we got a game ID from cookie but it's different from localStorage, update localStorage
    if (getCookie('game_id') && getCookie('game_id') !== localStorage.getItem('currentGameId')) {
        debugLog("Updating localStorage with game ID from cookie:", getCookie('game_id'));
        currentGameId = getCookie('game_id');
        localStorage.setItem('currentGameId', currentGameId);
    }

    // If there's still no game ID, try to adopt the most recent local chatHistory_* key
    if (!currentGameId) {
        const keys = Object.keys(localStorage).filter(k => k.startsWith('chatHistory_game_'));
        if (keys.length > 0) {
            // Choose the most recent by embedded timestamp: chatHistory_game_<ms>_<rand>
            keys.sort((a,b) => {
                const ta = parseInt((a.split('chatHistory_game_')[1] || '').split('_')[0]) || 0;
                const tb = parseInt((b.split('chatHistory_game_')[1] || '').split('_')[0]) || 0;
                return tb - ta;
            });
            const adoptedKey = keys[0];
            const adoptedId = adoptedKey.replace('chatHistory_', '');
            currentGameId = adoptedId;
            localStorage.setItem('currentGameId', currentGameId);
            document.cookie = `game_id=${currentGameId}; path=/; max-age=${60*60*24*365}`;
            debugLog('Adopted existing local game session:', currentGameId);
        }
    }
    
    // Player tracking - IMPORTANT: Use let instead of const to allow reassignment
    let playerNames = Utils.loadPlayerNames();
    debugLog("Loaded player names from localStorage:", playerNames);
    
    // Track processed messages to avoid duplicates
    const processedMessageIds = new Set();
      // Keep track of last message from each player to avoid duplicates
    const lastPlayerMessages = {};
    
    /**
     * Update global player selection variables
     * Called by PlayerManager when player selection changes
     */
    function updatePlayerSelection(playerElement, playerNum) {
        debugLog(`updatePlayerSelection called: playerNum=${playerNum}, element=`, playerElement);
        selectedPlayerElement = playerElement;
        selectedPlayerNum = playerNum;
    }
    
    // Make updatePlayerSelection available to PlayerManager
    window.updatePlayerSelection = updatePlayerSelection;
    
    // Get DOM elements once
    const chatWindow = document.getElementById('chat-window');
    const userInput = document.getElementById('user-input');
    const newGameBtn = document.getElementById('new-game-btn');
    const sendBtn = document.getElementById('send-btn');
    const diceBtn = document.getElementById('dice-player1-btn');
    const copyChatBtn = document.getElementById('copy-chat-btn');
    const addPlayerBtn = document.getElementById('add-player-btn');
    const removePlayerBtn = document.getElementById('remove-player-btn');
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');
    const additionalPlayersContainer = document.getElementById('additional-players');
    const menuToggleBtn = document.getElementById('menu-toggle');
    const sideMenu = document.getElementById('side-menu');
    const player1Container = document.getElementById('player1-container');
    const aiModelsBtn = document.getElementById('ai-models-btn');
    const aiModelsModal = document.getElementById('ai-models-modal');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const modelList = document.getElementById('model-list');
    const currentModelName = document.getElementById('current-model-name');

    // Image Models functionality
    let availableImageModels = [];
    let selectedImageModel = localStorage.getItem('selectedImageModel') || 'lustify-sdxl';

    // Get DOM elements for image models
    const imageModelsBtn = document.getElementById('image-models-btn');
    const imageModelsModal = document.getElementById('image-models-modal');
    const closeImageModalBtn = document.getElementById('close-image-modal-btn');
    const imageModelList = document.getElementById('image-model-list');
    const currentImageModelName = document.getElementById('current-image-model-name');

    // AI Models functionality - Fix model persistence
    let availableModels = [];
    // Load selected model from localStorage first, then fall back to default
    let selectedModel = localStorage.getItem('selectedModel') || 'venice-uncensored';

    function loadAvailableModels() {
        fetch('/get_models')
        .then(response => response.json())
        .then(data => {
            if (data.models) {
                availableModels = data.models;
                populateModelList();
                updateCurrentModelDisplay();
                
                // IMPORTANT: Set the model on the server after loading models
                // This ensures the server knows which model to use on page refresh
                setServerModel(selectedModel);
            }
        })
        .catch(error => {
            debugLog("Error loading models:", error);
            addSystemMessage("Error loading AI models.", false, false, true);
        });
    }

    function setServerModel(modelId) {
        // Set the model on the server without showing UI feedback
        fetch('/set_model', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({model_id: modelId})
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                debugLog("Server model set to:", modelId);
            } else {
                debugLog("Error setting server model:", data.error);
            }
        })
        .catch(error => {
            debugLog("Error setting server model:", error);
        });
    }

    function populateModelList() {
        modelList.innerHTML = '';
        
        availableModels.forEach(model => {
            const modelItem = document.createElement('div');
            modelItem.className = 'model-item';
            if (model.id === selectedModel) {
                modelItem.classList.add('selected');
            }

            // Use original traits without modification
            let traits = model.traits;
            traits = traits.map(trait => {
                const traitNames = {
                    'default': 'Default',
                    'most_intelligent': 'Most Intelligent',
                    'most_uncensored': 'Uncensored',
                    'fastest': 'Fastest',
                    'default_reasoning': 'Reasoning',
                    'default_code': 'Code Expert',
                    'default_vision': 'Vision',
                    'function_calling_default': 'Function Calling'
                };
                return traitNames[trait] || trait;
            });

            modelItem.innerHTML = `
                <div class="model-name">${model.name}</div>
                <div class="model-description">${model.description}</div>
                ${traits.length > 0 ? `<div class="model-traits">${traits.map(trait => `<span class="trait-tag">${trait}</span>`).join('')}</div>` : ''}
            `;
            
            modelItem.addEventListener('click', () => selectModel(model.id));
            modelList.appendChild(modelItem);
        });
    }

    function selectModel(modelId) {
        selectedModel = modelId;
        localStorage.setItem('selectedModel', modelId);
        
        // Update server
        fetch('/set_model', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({model_id: modelId})
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                debugLog("Model changed to:", modelId);
                updateCurrentModelDisplay();
                populateModelList(); // Refresh to show new selection
                
                // Add system message about model change
                const modelName = availableModels.find(m => m.id === modelId)?.name || modelId;
                addSystemMessage(`🤖 AI Model changed to: ${modelName}`, false, false, true);
                
                // Close modal
                aiModelsModal.classList.add('hidden');
            } else {
                addSystemMessage("Error changing AI model: " + (data.error || "Unknown error"), false, false, true);
                debugLog("Server error changing model:", data);
            }
        })
        .catch(error => {
            debugLog("Error setting model:", error);
            addSystemMessage("Error changing AI model: " + error.message, false, false, true);
        });
    }

    function updateCurrentModelDisplay() {
        const model = availableModels.find(m => m.id === selectedModel);
        if (model && currentModelName) {
            currentModelName.textContent = model.name;
        }
    }

    // Image Models functionality
    function loadAvailableImageModels() {
        fetch('/get_image_models')
        .then(response => response.json())
        .then(data => {
            if (data.models) {
                availableImageModels = data.models;
                
                // Validate selectedImageModel exists, default to lustify-sdxl
                const modelExists = availableImageModels.some(m => m.id === selectedImageModel);
                if (!modelExists) {
                    // Try lustify-sdxl first, then first available model
                    const lustifyModel = availableImageModels.find(m => m.id === 'lustify-sdxl');
                    selectedImageModel = lustifyModel ? 'lustify-sdxl' : availableImageModels[0]?.id || 'lustify-sdxl';
                    localStorage.setItem('selectedImageModel', selectedImageModel);
                }
                
                populateImageModelList();
                updateCurrentImageModelDisplay();
                
                // Set the image model on the server after loading models
                setServerImageModel(selectedImageModel);
            }
        })
        .catch(error => {
            debugLog("Error loading image models:", error);
            addSystemMessage("Error loading image models.", false, false, true);
        });
    }

    function setServerImageModel(modelId) {
        // Set the image model on the server without showing UI feedback
        fetch('/set_image_model', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({model_id: modelId})
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                debugLog("Server image model set to:", modelId);
            } else {
                debugLog("Error setting server image model:", data.error);
            }
        })
        .catch(error => {
            debugLog("Error setting server image model:", error);
        });
    }

    function populateImageModelList() {
        if (!imageModelList) return;
        
        imageModelList.innerHTML = '';
        
        availableImageModels.forEach(model => {
            const modelItem = document.createElement('div');
            modelItem.className = 'model-item';
            if (model.id === selectedImageModel) {
                modelItem.classList.add('selected');
            }
            
            // Move 'default' trait to lustify-sdxl for image models
            let traits = model.traits;
            if (model.id === 'venice-uncensored') {
                traits = traits.filter(trait => trait !== 'default');
            } else if (model.id === 'lustify-sdxl') {
                // Add default trait if not present
                if (!traits.includes('default')) {
                    traits = ['default', ...traits];
                }
            } else if (model.id === 'flux-dev-uncensored-11') {
                // Remove default trait from old model
                traits = traits.filter(trait => trait !== 'default');
            } else if (model.id === 'flux-dev-uncensored') {
                // Remove default trait from old model
                traits = traits.filter(trait => trait !== 'default');
            } else if (model.id === 'llama-3.3-70b') {
                traits = traits.filter(trait => trait !== 'default');
            }
            
            const traitsHtml = traits && traits.length > 0 
                ? traits.map(trait => `<span class="trait-tag">${trait}</span>`).join(' ')
                : '';
            
            modelItem.innerHTML = `
                <div class="model-name">${model.name}</div>
                <div class="model-description">${model.description}</div>
                <div class="model-traits">${traitsHtml}</div>
            `;
            
            modelItem.addEventListener('click', () => selectImageModel(model.id));
            imageModelList.appendChild(modelItem);
        });
    }

    function selectImageModel(modelId) {
        selectedImageModel = modelId;
        localStorage.setItem('selectedImageModel', modelId);
        
        // Update UI
        populateImageModelList();
        updateCurrentImageModelDisplay();
        
        // Set on server
        setServerImageModel(modelId);
        
        // Close modal
        if (imageModelsModal) {
            imageModelsModal.classList.add('hidden');
        }
        
        addSystemMessage(`Image model changed to: ${availableImageModels.find(m => m.id === modelId)?.name}`, false, false, true);
    }

    function updateCurrentImageModelDisplay() {
        const model = availableImageModels.find(m => m.id === selectedImageModel);
        if (model && currentImageModelName) {
            currentImageModelName.textContent = model.name;
        }
    }    function generateImage(prompt) {
        if (!currentGameId) {
            addSystemMessage("Error: No active game session for image generation.", false, false, true);
            return;
        }

        if (!prompt || prompt.trim().length === 0) {
            addSystemMessage("Error: Empty image prompt.", false, false, true);
            return;
        }

        // Add loading message
        const loadingId = 'loading-' + Math.random().toString(36).substr(2, 9);
        addSystemMessage(`🎨 Generating image: "${prompt}"...`, false, false, true);

        fetch('/generate_image', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                prompt: prompt,
                game_id: currentGameId
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Create image message with base64 data URL for localStorage persistence
                const imageMessage = {
                    role: "assistant",
                    content: `Generated image: ${prompt}`,
                    text: `Generated image: ${prompt}`,
                    timestamp: Date.now(),
                    message_type: "image",
                    image_url: data.message.image_url, // This is already a base64 data URL
                    image_prompt: prompt,
                    image_model: data.model,
                    sender: dmName,
                    type: "dm",
                    images: [data.message.image_url] // Store in images array for consistency
                };
                
                console.log("=== ABOUT TO DISPLAY AND SAVE IMAGE ===");
                console.log("Image message object:", imageMessage);
                console.log("Image URL length:", data.message.image_url.length);
                
                // Add to chat display
                displayImageMessage(imageMessage);
                  // Save to localStorage immediately
                saveImageToLocalStorage(imageMessage);
                
                // Add a small delay then verify the image was saved correctly
                setTimeout(() => {
                    console.log("=== VERIFYING IMAGE SAVE ===");
                    const currentHistory = Utils.loadChatHistory(currentGameId) || [];
                    const imageMessages = currentHistory.filter(msg => msg.message_type === 'image' || (msg.images && msg.images.length > 0));
                    console.log(`Found ${imageMessages.length} image messages in localStorage after save`);
                    imageMessages.forEach((msg, index) => {
                        console.log(`Image ${index + 1}: ${msg.image_prompt || 'No prompt'}, URL length: ${msg.image_url ? msg.image_url.length : 0}`);
                    });
                    console.log("=== END VERIFICATION ===");
                }, 500);
                
                debugLog("Image generated and saved to localStorage:", data.message.image_url.substring(0, 50) + "...");
            } else {
                addSystemMessage(`Error generating image: ${data.error}`, false, false, true);
            }
        })
        .catch(error => {
            debugLog("Error generating image:", error);
            addSystemMessage("Error generating image. Please try again.", false, false, true);
        });
    }    function displayImageMessage(message) {
        console.log("=== DISPLAYING IMAGE MESSAGE ===");
        console.log("Image message:", message);
        
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message dm-message image-message-container';
        
        // Create sender span
        const senderSpan = document.createElement('span');
        senderSpan.className = 'message-sender';
        senderSpan.textContent = `${dmName}: `;
        messageDiv.appendChild(senderSpan);

        // Create content span
        const contentSpan = document.createElement('span');
        contentSpan.className = 'message-content';
        
        // Handle image display - check for various image URL sources
        let imageUrl = message.image_url;
        if (!imageUrl && message.images && message.images.length > 0) {
            imageUrl = message.images[0]; // Use first image from array
        }
        
        // Get image prompt from various sources
        let imagePrompt = message.image_prompt || message.alt || 'Generated image';
        if (!imagePrompt || imagePrompt === 'Generated image') {
            // Try to extract from content/text
            if (message.content && message.content.includes('Generated image:')) {
                const match = message.content.match(/Generated image: (.+)/);
                if (match) imagePrompt = match[1];
            } else if (message.text && message.text.includes('Generated image:')) {
                const match = message.text.match(/Generated image: (.+)/);
                if (match) imagePrompt = match[1];
            }
        }        console.log("Image URL found:", imageUrl ? imageUrl.substring(0, 50) + "..." : "none");
        console.log("Image prompt:", imagePrompt);
        console.log("Image URL is valid base64:", imageUrl && imageUrl.startsWith('data:image/'));
        console.log("Image URL length:", imageUrl ? imageUrl.length : 0);
          // Additional validation for base64 data
        if (imageUrl && imageUrl.startsWith('data:image/')) {
            const base64Data = imageUrl.split(',')[1];
            console.log("Base64 data length:", base64Data ? base64Data.length : 0);
            console.log("Base64 data preview:", base64Data ? base64Data.substring(0, 50) + "..." : "none");
            
            // Check if base64 data ends properly
            if (base64Data && base64Data.length > 100) {
                const ending = base64Data.slice(-20);
                console.log("Base64 data ending:", ending);
                console.log("Image should be valid");
            } else {
                console.warn("Base64 data appears to be too short or invalid");
            }
        }        // If we have a base64 image URL, create the image display
        if (imageUrl && imageUrl.length > 50 && imageUrl.startsWith('data:image/')) {
            contentSpan.innerHTML = `
                <div class="image-message">
                    <img src="${imageUrl}" alt="${imagePrompt}" 
                         style="max-width: 100%; border-radius: 8px; margin: 10px 0; display: block; background-color: #f0f0f0;" 
                         onload="console.log('Image loaded successfully:', this.alt); this.style.backgroundColor = 'transparent'; if(this.closest('#chat-window')) this.closest('#chat-window').scrollTop = this.closest('#chat-window').scrollHeight;"
                         onerror="console.error('Image failed to load:', this.alt, this.src.substring(0, 50)); this.style.backgroundColor = '#ffebee'; this.alt = 'Image failed to load';">
                    <div class="image-caption">
                        <em>Generated image: ${imagePrompt}</em>
                    </div>
                </div>
            `;
        } else if (message.content || message.text) {
            // Fallback to content if no direct image_url
            const content = message.content || message.text;
            contentSpan.innerHTML = Utils.processFormattedText(content);
        } else {
            // Last resort fallback
            contentSpan.innerHTML = `<em>Image message (no content available)</em>`;
        }
          messageDiv.appendChild(contentSpan);
        chatWindow.appendChild(messageDiv);
        scrollToBottom();
        
        console.log("Image message displayed successfully");
        console.log("=== END DISPLAYING IMAGE MESSAGE ===");
    }

    // Function to check for new messages (including images) from the server
    // DISABLED: Now using localStorage instead of server polling
    function checkForNewMessages() {
        // No longer needed - using localStorage
        return;
    }

    // DISABLED: No longer polling server every 5 seconds
    // setInterval(checkForNewMessages, 5000);

    // --- Functions for initializing and saving state ---
      function createNewGame() {
        debugLog("Creating new game...");
        
        // Generate new game ID using backend-compatible format
        const newGameId = 'game_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        currentGameId = newGameId;
        localStorage.setItem('currentGameId', currentGameId);
        
        // Also set the cookie to keep frontend and backend in sync
        document.cookie = `game_id=${currentGameId}; path=/; max-age=${60*60*24*365}`;
        
        chatWindow.innerHTML = ''; // Clear chat window
        playerNames = { 1: null }; // Reset player names
        nextPlayerNumber = 2;
        dmName = "DM"; // Reset DM name
        savePlayerNames();
        savePlayerState(); // Save reset state
        
        // Clear and reset history for the new game
        messageHistory = [];
        historyIndex = -1;
        localStorage.removeItem('chatHistory'); // Remove old undo/redo history from storage
        Utils.clearChatHistory(currentGameId); // Clear localStorage chat history for new game
        
        // Clear undo/redo state for new game
        clearUndoRedoState();        // Directly add the welcome message for a new game
        addMessage("DM", "Hello adventurer! Let's begin your quest. What is your name?", false, false, false); 
        
        // Also explicitly save the welcome message to localStorage
        const welcomeMessage = {
            role: "assistant",
            type: "dm",
            content: "Hello adventurer! Let's begin your quest. What is your name?",
            timestamp: Date.now(),
            sender: "DM"
        };
        saveMessageToLocalStorage(welcomeMessage);
        
        // Remove additional player inputs
        additionalPlayersContainer.innerHTML = '';
        // Reset Player 1 label and input
        const p1Label = document.getElementById('player1-label');
        if (p1Label) p1Label.textContent = 'Player 1:';
        if (userInput) userInput.value = '';

        // Reinitialize PlayerManager with new game data
        PlayerManager.setup({
            playerNames: playerNames,
            nextPlayerNumber: nextPlayerNumber,
            additionalPlayersContainer: additionalPlayersContainer,
            removePlayerBtn: removePlayerBtn,
            currentGameId: currentGameId,
            debugLog: debugLog,
            addSystemMessage: addSystemMessage,
            createLoadingDivForDM: createLoadingDivForDM, 
            sendStreamRequest: sendStreamRequest,
            savePlayerNames: savePlayerNames,
            savePlayerState: savePlayerState
        });

        addSystemMessage("✨ New game started! Adventure awaits... ✨", false, false, true); // This will also save state
        updateUndoRedoButtons(); // Explicitly update buttons after history reset
        debugLog("New game created locally:", currentGameId);
    }    function ensureWelcomeMessage() {
        // Do not show welcome while history is loading
        if (isLoadingHistory) {
            debugLog('Skipping welcome message while history is loading');
            return false;
        }
        if (chatWindow.children.length === 0) {
            addMessage("DM", "Hello adventurer! Let's begin your quest. What is your name?", false, false, false);
            // Also save this welcome message to localStorage
            if (currentGameId) {
                const welcomeMessage = {
                    role: "assistant",
                    type: "dm",
                    content: "Hello adventurer! Let's begin your quest. What is your name?",
                    timestamp: Date.now(),
                    sender: "DM"
                };
                // Use a small delay to ensure any other localStorage operations complete first
                setTimeout(() => {
                    saveMessageToLocalStorage(welcomeMessage);
                }, 100);
            }
            return true; // Indicates welcome message was added
        }
        return false; // Indicates messages already existed
    }

    function initializeHistory() {
        // Load history from localStorage or start fresh
        const savedHistory = localStorage.getItem('chatHistory');
        if (savedHistory) {
            try {
                messageHistory = JSON.parse(savedHistory);
                historyIndex = messageHistory.length - 1;
            } catch (e) {
                debugLog("Error parsing chatHistory from localStorage:", e);
                messageHistory = [];
                historyIndex = -1;
                localStorage.removeItem('chatHistory'); // Clear corrupted history
            }
        } else {
            messageHistory = [];
            historyIndex = -1;
        }
        
        debugLog(`initializeHistory: Loaded ${messageHistory.length} states. Current index: ${historyIndex}`);
        
        // Initial save of current (empty or welcome) state if history is empty
        if (messageHistory.length === 0 && chatWindow.children.length > 0) {
            debugLog("initializeHistory: Chat window has children, but history is empty. Saving initial state.");
            setTimeout(saveChatState, 100); // Allow DOM to settle
        } else {
            updateUndoRedoButtons();
        }
    }
    
    function initialize() {
        debugLog("Initializing application state...");
        
        // CRITICAL: Load player names FIRST before anything else
        const loadedState = Utils.loadPlayerState();
        if (loadedState && loadedState.names) {
            playerNames = loadedState.names;
            debugLog("Restored player names from playerState:", playerNames);
        } else {
            // Fallback to just player names if state is corrupted
            playerNames = Utils.loadPlayerNames();
            debugLog("Fallback: loaded player names directly:", playerNames);
        }
          // Restore DM name if saved
        if (loadedState && loadedState.dmName) {
            dmName = loadedState.dmName;
            document.querySelectorAll('.dm-message .message-sender').forEach(span => {
                span.textContent = `${dmName}: `;
            });
        }
                    // Load chat history from localStorage instead of server
        if (currentGameId) {
            console.log("=== INITIALIZE: Loading chat history ===");
            console.log("currentGameId:", currentGameId);
            
                        isLoadingHistory = true;
                        const localHistory = Utils.loadChatHistory(currentGameId);
            
            // DEBUG: Check what's in localStorage
            console.log("=== DEBUG CHAT HISTORY ===");
            console.log("localHistory raw:", localHistory);
            console.log("localHistory length:", localHistory ? localHistory.length : 0);
            
            // ALSO CHECK WHAT'S ACTUALLY IN LOCALSTORAGE
            const storageKey = `chatHistory_${currentGameId}`;
            const rawData = localStorage.getItem(storageKey);
            console.log("Raw localStorage data for key", storageKey, ":", rawData);
            
            // ALSO LIST ALL CHAT HISTORY KEYS IN LOCALSTORAGE
            console.log("All localStorage keys with 'chatHistory':");
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.includes('chatHistory')) {
                    console.log(`  ${key}: ${localStorage.getItem(key) ? localStorage.getItem(key).length + ' chars' : 'null'}`);
                }
            }
              if (localHistory && localHistory.length > 0) {
                localHistory.forEach((msg, index) => {
                    console.log(`Message ${index}:`, {
                        role: msg.role,
                        type: msg.type,
                        sender: msg.sender,
                        content: (msg.content || msg.text) ? (msg.content || msg.text).substring(0, 50) + "..." : "No content",
                        timestamp: msg.timestamp
                    });
                });
                
                // Ensure each message has a proper type for display
                localHistory.forEach(msg => {
                    if (msg.role === 'assistant' && !msg.type) {
                        msg.type = 'dm';
                    } else if (msg.role === 'user' && !msg.type) {
                        msg.type = 'player';
                    }
                });                console.log("About to call displayMessages with", localHistory.length, "messages");
                displayMessages(localHistory);                debugLog("Loaded chat history from localStorage:", localHistory.length, "messages");
                isLoadingHistory = false;
                
                console.log("=== END DEBUG ===");
            } else {
                console.log("No messages in localStorage");
                console.log("=== END DEBUG ===");
                
                // Fallback: try to load history from server if localStorage is empty
                if (currentGameId) {
                    debugLog("Attempting server fallback history load for game:", currentGameId);
                    fetch('/load_history', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ game_id: currentGameId })
                    })
                    .then(res => res.json())
                    .then(data => {
                        const serverHistory = (data && Array.isArray(data.history)) ? data.history : [];
                        if (serverHistory.length > 0) {
                            // Normalize message types
                            serverHistory.forEach(msg => {
                                if (msg.role === 'assistant' && !msg.type) msg.type = 'dm';
                                else if (msg.role === 'user' && !msg.type) msg.type = 'player';
                            });
                            // Persist to localStorage and display
                            try { Utils.saveChatHistory(currentGameId, serverHistory); } catch (e) { debugLog('Error saving server history to localStorage:', e); }
                            displayMessages(serverHistory);
                            debugLog("Loaded chat history from server fallback:", serverHistory.length, "messages");
            isLoadingHistory = false;
                        } else {
                            // Still nothing: show welcome
                            ensureWelcomeMessage();
                            debugLog("Server fallback returned empty, showing welcome message");
            isLoadingHistory = false;
                        }
                    })
                    .catch(err => {
                        debugLog("Error loading server fallback history:", err);
                        isLoadingHistory = false;
                        ensureWelcomeMessage();
                    });
                } else {
                    isLoadingHistory = false;
                    ensureWelcomeMessage();
                    debugLog("No game ID and no localStorage history, showing welcome message");
                }
            }
        } else {
            ensureWelcomeMessage();
            debugLog("No game ID, showing welcome message");
        }
        
        initializeHistory();
        
        // CRITICAL: Pass the loaded playerNames to PlayerManager setup
        const playerResult = PlayerManager.setup({
            playerNames: playerNames, // Use our loaded names
            nextPlayerNumber: 2,
            additionalPlayersContainer: additionalPlayersContainer,
            removePlayerBtn: removePlayerBtn,
            currentGameId: currentGameId,
            debugLog: debugLog,
            addSystemMessage: addSystemMessage,
            createLoadingDivForDM: createLoadingDivForDM,
            sendStreamRequest: sendStreamRequest,
            savePlayerNames: savePlayerNames,
            savePlayerState: savePlayerState
        });
        
        // Update our variables with PlayerManager results but preserve our loaded names
        nextPlayerNumber = playerResult.nextPlayerNumber;
        // Don't overwrite playerNames here - keep our loaded ones
        
        // Create UI for all existing players using our loaded names
        nextPlayerNumber = PlayerManager.ensurePlayersExist(player1Container, sendMessage);
          // ALWAYS update labels after everything is set up
        updatePlayerLabels();
        updateUndoRedoButtons();
        
        // No longer need to sync with server
        debugLog("Initialization complete - using localStorage only");
    }
    
    /**
     * Sync player names between client and server
     * This ensures the server has the correct names after a page refresh
     */
    function syncPlayerNamesWithServer() {
        if (!currentGameId) return;
        
        // Only sync if we have player names stored
        const hasPlayerNames = Object.values(playerNames).some(name => name !== null);
        if (!hasPlayerNames) return;
        
        debugLog("Syncing player names with server:", playerNames);
        
        // For each named player, send a system message to the server
        Object.entries(playerNames).forEach(([num, name]) => {
            if (name) {
                // Let the server know about this player name
                fetch('/set_player_name', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        game_id: currentGameId,
                        player_number: num,
                        new_name: name
                    })
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        debugLog(`Successfully synced Player ${num} name (${name}) with server`);
                    }
                })
                .catch(error => {
                    debugLog(`Error syncing Player ${num} name with server:`, error);
                });
            }
        });
    }

    // --- Storage utility functions ---
    
    // Use Utils for saving/loading player names
    function savePlayerNames() {
        Utils.savePlayerNames(playerNames);
        debugLog("Player names saved:", playerNames);
        // Also update PlayerManager's playerNames reference
        if (window.PlayerManager) {
            window.PlayerManager.playerNames = playerNames;
        }
    }
    
    function savePlayerState() {
        const state = {
            names: playerNames,
            nextPlayerNumber: nextPlayerNumber,
            isMultiplayerActive: isMultiplayerActive,
            dmName: dmName
        };
        Utils.savePlayerState(state);
        debugLog("Player state saved:", state);
        // Also update PlayerManager's playerNames reference
        if (window.PlayerManager) {
            window.PlayerManager.playerNames = playerNames;
        }
    }

    /**
     * Update player labels in the UI to reflect current player names
     */
    function updatePlayerLabels() {
        debugLog("Updating player labels with names:", playerNames);
        
        // Update all existing player labels
        for (let i = 1; i <= 10; i++) { // Check up to 10 players
            const labelElement = document.getElementById(`player${i}-label`);
            if (labelElement) {
                const playerName = playerNames[i.toString()];
                if (playerName) {
                    labelElement.textContent = `${playerName}:`;
                    debugLog(`Updated player ${i} label to: ${playerName}`);
                } else {
                    labelElement.textContent = `Player ${i}:`;
                }
            }
        }
    }

    // Undo/Redo persistence functions
    function saveUndoRedoState() {
        if (lastUndoneMessage) {
            localStorage.setItem('lastUndoneMessage', lastUndoneMessage);
            localStorage.setItem('lastUndonePlayerNumber', lastUndonePlayerNumber.toString());
        } else {
            localStorage.removeItem('lastUndoneMessage');
            localStorage.removeItem('lastUndonePlayerNumber');
        }
        debugLog("Undo/Redo state saved:", { lastUndoneMessage, lastUndonePlayerNumber });
    }

    function clearUndoRedoState() {
        lastUndoneMessage = null;
        lastUndonePlayerNumber = 1;
        localStorage.removeItem('lastUndoneMessage');
        localStorage.removeItem('lastUndonePlayerNumber');
        debugLog("Undo/Redo state cleared");
    }    // --- Functions for localStorage chat management ---
    
    /**
     * Save a single message to localStorage chat history
     */
    function saveMessageToLocalStorage(messageEntry) {
        console.log("=== saveMessageToLocalStorage CALLED ===");
        console.log("messageEntry:", messageEntry);
        console.log("currentGameId:", currentGameId);
        
        if (!currentGameId) {
            console.log("ERROR: No currentGameId when trying to save message");
            debugLog("Warning: No currentGameId when trying to save message");
            return;
        }
        
        try {
            // Load existing messages
            const existingMessages = Utils.loadChatHistory(currentGameId) || [];
            console.log("Existing messages before save:", existingMessages.length);
            
            // Convert the message entry to the localStorage format
            const messageToSave = {
                sender: messageEntry.role === 'user' ? 'user' : 'assistant',
                text: messageEntry.content || messageEntry.text || '',
                images: messageEntry.images || [],
                timestamp: messageEntry.timestamp || Date.now(),
                role: messageEntry.role,
                type: messageEntry.type || (messageEntry.role === 'user' ? 'player' : 'dm'),
                message_type: (messageEntry.images && messageEntry.images.length > 0) ? 'image' : 'text'
            };
            
            console.log("Message to save:", messageToSave);
              // Add the new message (check for duplicates based on timestamp and content)
            const isDuplicate = existingMessages.some(msg => 
                Math.abs(msg.timestamp - messageToSave.timestamp) < 1000 && 
                msg.text === messageToSave.text && 
                msg.role === messageToSave.role
            );
            
            console.log("Is duplicate?", isDuplicate);
            
            if (!isDuplicate) {
                existingMessages.push(messageToSave);
                console.log("Adding message, new total:", existingMessages.length);
                
                // Save back to localStorage with retry mechanism to avoid race conditions
                try {
                    Utils.saveChatHistory(currentGameId, existingMessages);
                    console.log("Message saved to localStorage successfully");
                    
                    // Verify the save worked
                    const verifyMessages = Utils.loadChatHistory(currentGameId) || [];
                    console.log("Verification: localStorage now has", verifyMessages.length, "messages");
                    
                    // EXTRA VERIFICATION: Check raw localStorage
                    const verifyKey = `chatHistory_${currentGameId}`;
                    const verifyRaw = localStorage.getItem(verifyKey);
                    console.log("Raw verification for key", verifyKey, ":", verifyRaw ? verifyRaw.length + " chars" : "null");
                    
                    debugLog("Message saved to localStorage:", messageToSave);
                } catch (error) {
                    console.warn("Race condition detected in saveMessageToLocalStorage, retrying in 100ms...", error);
                    setTimeout(() => {
                        try {
                            const freshMessages = Utils.loadChatHistory(currentGameId) || [];
                            const stillDuplicate = freshMessages.some(msg => 
                                Math.abs(msg.timestamp - messageToSave.timestamp) < 1000 && 
                                msg.text === messageToSave.text && 
                                msg.role === messageToSave.role
                            );
                            if (!stillDuplicate) {
                                freshMessages.push(messageToSave);
                                Utils.saveChatHistory(currentGameId, freshMessages);
                                console.log("Message saved to localStorage on retry");
                            }
                        } catch (retryError) {
                            console.error("Failed to save message even on retry:", retryError);
                        }
                    }, 100);
                }
            } else {
                console.log("Skipping duplicate message save");
            }
        } catch (e) {
            console.log("ERROR saving message:", e);
            debugLog("Error saving message to localStorage:", e);
        }
        console.log("=== saveMessageToLocalStorage END ===");
    }    /**
     * Save an image message to localStorage chat history
     */    function saveImageToLocalStorage(imageMessage) {
        try {
            console.log("=== SAVING IMAGE TO LOCALSTORAGE ===");
            console.log("Image message:", imageMessage);
            
            if (!currentGameId) {
                console.log("No currentGameId, cannot save image");
                return;
            }
            
            // Load existing messages from localStorage
            const existingMessages = Utils.loadChatHistory(currentGameId) || [];
              // Create a message to save (compress if needed) - ensure all required fields are present
            const messageToSave = {
                sender: 'assistant',
                text: imageMessage.image_prompt || imageMessage.text || 'Generated image',
                content: imageMessage.content || `<div class="image-message"><img src="${imageMessage.image_url}" alt="${imageMessage.image_prompt || 'Generated image'}" style="max-width: 100%; border-radius: 8px; margin: 10px 0;"><div class="image-caption"><em>Generated image: ${imageMessage.image_prompt || 'Generated image'}</em></div></div>`,
                images: [imageMessage.image_url], // Store the full image URL first
                timestamp: imageMessage.timestamp || Date.now(),
                role: 'assistant',
                type: 'dm',
                message_type: 'image',
                image_url: imageMessage.image_url,
                image_prompt: imageMessage.image_prompt || imageMessage.text || 'Generated image',
                image_model: imageMessage.image_model || 'pony-realism'
            };
            
            console.log("Formatted message to save:", messageToSave);
            console.log("Image URL length:", messageToSave.image_url ? messageToSave.image_url.length : 0);
            
            // Add the new message
            existingMessages.push(messageToSave);
            
            // Try to save - if localStorage quota exceeded, compress the image
            try {
                Utils.saveChatHistory(currentGameId, existingMessages);
                console.log("Image message saved to localStorage successfully");
                console.log("Total messages in localStorage:", existingMessages.length);
            } catch (quotaError) {
                console.warn("LocalStorage quota exceeded, attempting compression:", quotaError);
                
                // Always try to compress large images (reduced threshold)
                if (imageMessage.image_url && imageMessage.image_url.length > 100000) {
                    console.log("Compressing image for localStorage...");
                    
                    try {
                        // Create a canvas to compress the image synchronously
                        const img = new Image();
                        img.onload = function() {
                            const canvas = document.createElement('canvas');
                            const ctx = canvas.getContext('2d');
                            
                            // Reduce size to max 600px while maintaining aspect ratio (more aggressive)
                            const maxSize = 600;
                            let { width, height } = img;
                            
                            if (width > height) {
                                if (width > maxSize) {
                                    height = (height * maxSize) / width;
                                    width = maxSize;
                                }
                            } else {
                                if (height > maxSize) {
                                    width = (width * maxSize) / height;
                                    height = maxSize;
                                }
                            }
                            
                            canvas.width = width;
                            canvas.height = height;
                            ctx.drawImage(img, 0, 0, width, height);
                            
                            // Compress to JPEG with even lower quality for localStorage
                            const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.3);
                            console.log("Compressed image from", imageMessage.image_url.length, "to", compressedDataUrl.length);
                            
                            // Update the message with compressed image
                            messageToSave.images = [compressedDataUrl];
                            messageToSave.image_url = compressedDataUrl;
                            messageToSave.content = messageToSave.content.replace(imageMessage.image_url, compressedDataUrl);
                            
                            // Reload current history and update the most recent matching image entry
                            let latest = Utils.loadChatHistory(currentGameId) || existingMessages;
                            // Find last message with message_type === 'image' and matching timestamp or content marker
                            let idx = -1;
                            for (let i = latest.length - 1; i >= 0; i--) {
                                const m = latest[i];
                                if (m && (m.message_type === 'image' || (m.images && m.images.length > 0))) {
                                    idx = i;
                                    break;
                                }
                            }
                            if (idx >= 0) {
                                latest[idx] = messageToSave;
                            } else {
                                latest.push(messageToSave);
                            }
                            try {
                                Utils.saveChatHistory(currentGameId, latest);
                                console.log("Compressed image message saved to localStorage successfully");
                            } catch (stillTooLarge) {
                                console.error("Even compressed image is too large, saving without image data");
                                // Fallback: save without the image data but keep the message structure
                                messageToSave.images = [];
                                messageToSave.image_url = null;
                                messageToSave.content = `<div class="image-message"><div class="image-placeholder" style="padding: 20px; background: #f0f0f0; text-align: center; border-radius: 8px;">📷 Image too large for storage (${imageMessage.image_prompt || 'Generated image'})</div></div>`;
                                // Save updated fallback
                                let latestFallback = Utils.loadChatHistory(currentGameId) || [];
                                if (idx >= 0 && idx < latestFallback.length) {
                                    latestFallback[idx] = messageToSave;
                                } else {
                                    latestFallback.push(messageToSave);
                                }
                                Utils.saveChatHistory(currentGameId, latestFallback);
                                console.log("Saved image message without data due to quota limits");
                            }
                        };
                        img.onerror = function() {
                            console.error("Failed to load image for compression");
                            // Fallback: save without the image data
                            messageToSave.images = [];
                            messageToSave.image_url = null;
                            messageToSave.content = `<div class="image-message"><div class="image-placeholder" style="padding: 20px; background: #f0f0f0; text-align: center; border-radius: 8px;">📷 Image failed to load (${imageMessage.image_prompt || 'Generated image'})</div></div>`;
                            existingMessages[existingMessages.length - 1] = messageToSave;
                            Utils.saveChatHistory(currentGameId, existingMessages);
                            console.log("Saved image message without data due to load failure");
                        };
                        img.src = imageMessage.image_url;
                    } catch (compressionError) {
                        console.error("Image compression failed:", compressionError);
                        // Fallback: save without the image data
                        messageToSave.images = [];
                        messageToSave.image_url = null;
                        messageToSave.content = `<div class="image-message"><div class="image-placeholder" style="padding: 20px; background: #f0f0f0; text-align: center; border-radius: 8px;">📷 Image compression failed (${imageMessage.image_prompt || 'Generated image'})</div></div>`;
                        existingMessages[existingMessages.length - 1] = messageToSave;
                        Utils.saveChatHistory(currentGameId, existingMessages);
                        console.log("Saved image message without data due to compression failure");
                    }
                } else {
                    // If image is not that large, still try fallback
                    console.log("Image moderately sized, trying compression anyway");
                    const img = new Image();
                    img.onload = function() {
                        const canvas = document.createElement('canvas');
                        const ctx = canvas.getContext('2d');
                        
                        // Even more aggressive compression for quota issues
                        const maxSize = 400;
                        let { width, height } = img;
                        
                        if (width > height) {
                            if (width > maxSize) {
                                height = (height * maxSize) / width;
                                width = maxSize;
                            }
                        } else {
                            if (height > maxSize) {
                                width = (width * maxSize) / height;
                                height = maxSize;
                            }
                        }
                        
                        canvas.width = width;
                        canvas.height = height;
                        ctx.drawImage(img, 0, 0, width, height);
                        
                        // Very aggressive compression
                        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.2);
                        messageToSave.images = [compressedDataUrl];
                        messageToSave.image_url = compressedDataUrl;
                        messageToSave.content = messageToSave.content.replace(imageMessage.image_url, compressedDataUrl);
                        // Reload and update the latest image message entry
                        let latest2 = Utils.loadChatHistory(currentGameId) || existingMessages;
                        let idx2 = -1;
                        for (let i = latest2.length - 1; i >= 0; i--) {
                            const m = latest2[i];
                            if (m && (m.message_type === 'image' || (m.images && m.images.length > 0))) {
                                idx2 = i;
                                break;
                            }
                        }
                        if (idx2 >= 0) {
                            latest2[idx2] = messageToSave;
                        } else {
                            latest2.push(messageToSave);
                        }
                        try {
                            Utils.saveChatHistory(currentGameId, latest2);
                            console.log("Aggressively compressed image saved to localStorage");
                        } catch (finalError) {
                            console.log("Final fallback: saving without image data");
                            messageToSave.images = [];
                            messageToSave.image_url = null;
                            messageToSave.content = `<div class="image-message"><div class="image-placeholder" style="padding: 20px; background: #f0f0f0; text-align: center; border-radius: 8px;">📷 Image storage failed (${imageMessage.image_prompt || 'Generated image'})</div></div>`;
                            let latest3 = Utils.loadChatHistory(currentGameId) || [];
                            if (idx2 >= 0 && idx2 < latest3.length) {
                                latest3[idx2] = messageToSave;
                            } else {
                                latest3.push(messageToSave);
                            }
                            Utils.saveChatHistory(currentGameId, latest3);
                        }
                    };
                    img.src = imageMessage.image_url;
                }
            }
            
            console.log("=== END SAVING IMAGE ===");
            
        } catch (error) {
            console.error("Error saving image to localStorage:", error);
            debugLog("Error saving image to localStorage:", error);
        }
    }

    /**
     * Save chat history to localStorage (following the pattern from your other app)
     */    function saveChatHistoryToLocalStorage() {
        if (!currentGameId) return;
        
        const messageElements = chatWindow.querySelectorAll('.message:not(.temporary-message)');
        const messages = [];

        messageElements.forEach(msgEl => {
            const senderEl = msgEl.querySelector('.message-sender');
            const textEl = msgEl.querySelector('.message-content');
            const imageEls = msgEl.querySelectorAll('img');
            
            if (!senderEl || !textEl) return;
            
            // Extract image sources (base64 data URLs)
            const images = Array.from(imageEls).map(img => img.src);
            
            const sender = senderEl.textContent.replace(':', '').trim();
            const isUser = !msgEl.classList.contains('dm-message');
            const textContent = textEl.textContent || '';
            
            // Skip empty messages unless they have images
            if (!textContent.trim() && images.length === 0) {
                return;
            }
            
            messages.push({
                sender: isUser ? 'user' : 'assistant',
                text: textContent,
                images: images,  // Store base64 image URLs
                timestamp: Date.now(),
                role: isUser ? 'user' : 'assistant',
                type: isUser ? 'player' : 'dm',
                message_type: images.length > 0 ? 'image' : 'text'
            });
        });

        Utils.saveChatHistory(currentGameId, messages);
        console.log("Chat history saved to localStorage:", messages.length, "messages");
    }

    // --- Chat message handling functions ---
    
    function displayMessages(messages) {
        if (!Array.isArray(messages)) {
            debugLog("Invalid messages array:", messages);
            return;
        }
        chatWindow.innerHTML = '';
        messages.forEach(msg => {
            // Skip invisible messages - don't show them in chat
            if (msg.invisible) {
                return;
            }            // Handle image messages specifically - enhanced detection for better compatibility
            if (msg.message_type === "image" || 
                (msg.images && msg.images.length > 0 && msg.images[0] && msg.images[0].length > 50) || 
                (msg.image_url && msg.image_url.length > 50 && msg.image_url.startsWith('data:image/')) ||
                (msg.content && msg.content.includes('Generated image:')) ||
                (msg.content && msg.content.includes('<img src="data:image/')) ||
                (msg.text && msg.text && typeof msg.text === 'string' && msg.role === 'assistant' && 
                 (msg.image_url || (msg.images && msg.images.length > 0)))) {
                console.log("Found image message in localStorage:", msg);
                console.log("Message type:", msg.message_type, "Images array:", msg.images?.length || 0, "Image URL:", msg.image_url ? msg.image_url.substring(0, 50) + "..." : "none");
                displayImageMessage(msg);
                return;
            }

            if (msg.role === "assistant" || msg.type === "dm") {
                // This is a DM message - always display it
                const messageContent = msg.content || msg.text || '';
                debugLog("Displaying DM message:", messageContent.substring(0, 50) + "...");
                
                // Check if content is already HTML formatted from server OR has color tags that need processing
                const hasHTMLFormatting = /<span class="(red|green|blue|yellow|purple|orange|pink|cyan|lime|teal|brown|silver|wood)">|<br\s*\/?>|<p\s*>/.test(messageContent);
                const hasColorTags = /\[(red|green|blue|yellow|purple|orange|pink|cyan|lime|teal|brown|silver|wood):[^\]]*\]/.test(messageContent);
                
                if (hasHTMLFormatting && !hasColorTags) {
                    // Content is already fully formatted as HTML, use it directly
                    addMessage(dmName, messageContent, false, true, true, true);
                } else {
                    // Process content through formatting to ensure proper display (handles color tags and text formatting)
                    const processedContent = Utils.processFormattedText(messageContent);
                    addMessage(dmName, processedContent, false, true, true, true);
                }
            } else if (msg.role === "user" || msg.type === "player") {
                // Always use playerNames mapping for sender label
                let senderName = msg.sender;
                if (!senderName && msg.player) {
                    // If msg.player is a name (after renaming), use it directly
                    if (playerNames[msg.player.replace('player','')]) {
                        senderName = playerNames[msg.player.replace('player','')];
                    } else if (/^\d+$/.test(msg.player.replace('player',''))) {
                        // If still a number, fallback to Player X
                        senderName = `Player ${msg.player.replace('player','')}`;
                    } else {
                        // If msg.player is a name string, use it
                        senderName = msg.player;
                    }
                }
                // Check if content is already HTML formatted OR has color tags that need processing
                const messageContent = msg.content || msg.text || '';
                const hasHTMLFormatting = /<span class="(red|green|blue|yellow|purple|orange|pink|cyan|lime|teal|brown|silver|wood)">|<br\s*\/?>|<p\s*>/.test(messageContent);
                const hasColorTags = /\[(red|green|blue|yellow|purple|orange|pink|cyan|lime|teal|brown|silver|wood):[^\]]*\]/.test(messageContent);
                
                if (hasHTMLFormatting && !hasColorTags) {
                    // Content is already fully formatted as HTML, use it directly  
                    addMessage(senderName || `Player ${msg.player_number || 1}`, messageContent, false, true, true, true);
                } else {
                    // Process player messages through formatting as well (handles color tags and text formatting)
                    const processedContent = Utils.processFormattedText(messageContent);
                    addMessage(senderName || `Player ${msg.player_number || 1}`, processedContent, false, true, true, true);
                }
            } else if (msg.role === "system" || msg.type === "system") {
                // Only show system messages that aren't marked as invisible
                if (!msg.invisible) {
                    const messageContent = msg.content || msg.text || '';
                    addSystemMessage(messageContent, true, true);
                }
            }
        });
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }
    
    function restoreChatState(index) {
        if (index < 0 || index >= messageHistory.length) {
            debugLog(`Invalid history index for restore: ${index}. History length: ${messageHistory.length}`);
            return;
        }
        
        const state = messageHistory[index];
        debugLog(`Restoring chat state from history index ${index}. State contains ${state.length} messages.`);
        
        chatWindow.innerHTML = ''; // Clear chat window
        state.forEach(msg => {
            if (msg.message_type === "image") {
                // Handle image messages specifically
                displayImageMessage(msg);
            } else if (msg.type === 'system') {
                const messageContent = msg.contentHTML || msg.content || msg.text || '';
                addSystemMessage(messageContent, true, true); // fromUpdate = true, skipHistory = true
            } else if (msg.type === 'dm') {
                // Use the HTML content if available, otherwise fall back to plain text
                const content = msg.contentHTML || msg.content || msg.text || '';
                addMessage(dmName, content, false, true, true, true); // Added parameter to indicate HTML content
            } else { // player message
                // Use the HTML content if available, otherwise fall back to plain text
                const content = msg.contentHTML || msg.content || msg.text || '';
                addMessage(msg.sender, content, false, true, true, true); // Added parameter to indicate HTML content
            }
        });
        
        scrollToBottom();
    }

    function addMessage(sender, text, isTypewriter = false, fromUpdate = false, skipHistory = false, isHTML = false) {
        const role = (sender.toLowerCase() === dmName.toLowerCase() || sender.toLowerCase() === 'dm') ? 'assistant' : 'user';
        if (!fromUpdate && messageExists(role, text)) {
            debugLog("Skipping duplicate message:", text.substring(0, 20) + "...");
            return false;
        }
        
        lastPlayerMessages[sender] = text;
        debugLog("Adding message from", sender, ":", text.substring(0, 30) + (text.length > 30 ? "..." : ""));
        
        const msgDiv = document.createElement('div');
        const isDMMessage = (sender.toLowerCase() === dmName.toLowerCase() || sender.toLowerCase() === 'dm');
        msgDiv.className = `message ${isDMMessage ? 'dm-message' : 'player-message'}`;
        
        const nameSpan = document.createElement('span');
        nameSpan.textContent = `${sender}: `;
        nameSpan.className = 'message-sender';
        msgDiv.appendChild(nameSpan);
        
        const contentSpan = document.createElement('span');
        contentSpan.className = 'message-content';
        
        if (isHTML) {
            // If content is already HTML, use it directly
            contentSpan.innerHTML = text;
        } else {
            // Always process content through formatting - even if it appears to be plain text
            const formattedText = Utils.processFormattedText(text);
            contentSpan.innerHTML = formattedText;
        }
        
        msgDiv.appendChild(contentSpan);
          chatWindow.appendChild(msgDiv);
        scrollToBottom();
        
        // CRITICAL FIX: Always save chat state for user messages immediately
        if (!skipHistory) {
            debugLog(`Triggering saveChatState for message from ${sender}`);
            setTimeout(saveChatState, 100); // Small delay to ensure DOM is updated
        }
        return true;
    }

    function addSystemMessage(text, fromUpdate = false, skipHistory = false, isTemporary = false) {
        if (!fromUpdate && messageExists('system', text)) {
            debugLog("Skipping duplicate system message");
            return;
        }
        
        debugLog("Adding system message:", text);
        const msgDiv = document.createElement('div');
        msgDiv.className = 'message system-message' + (isTemporary ? ' temporary-message' : '');
        
        const nameSpan = document.createElement('span');
        nameSpan.textContent = "SYSTEM: ";
        nameSpan.className = 'message-sender';
        msgDiv.appendChild(nameSpan);
        
        const contentSpan = document.createElement('span');
        contentSpan.className = 'message-content';
        contentSpan.textContent = text;
        msgDiv.appendChild(contentSpan);
        
        chatWindow.appendChild(msgDiv);
        scrollToBottom();
        
        if (isTemporary) {
            setTimeout(() => msgDiv.remove(), 8000);
        }        if (!skipHistory) {
            setTimeout(saveChatState, 0);
        }
    }
    
    function messageExists(role, content) {
        return Utils.messageExists(processedMessageIds, role, content);
    }
    
    function sendMessage(inputElement, playerNumber) {
        const userMessage = inputElement.value.trim();
        debugLog(`Attempting to send message: "${userMessage}" from player ${playerNumber}. isGenerating: ${isGenerating}`);
        
        if (!userMessage) return;
        
        // DM rename flow (secret, only when DM asks)
        if (window.awaitingDMRename) {
            dmName = userMessage;
            window.awaitingDMRename = false;
            inputElement.value = '';
            document.querySelectorAll('.dm-message .message-sender').forEach(span => {
                span.textContent = `${dmName}: `;
            });
            addSystemMessage(`The Dungeon Master will now be called "${dmName}". 🎭`, false, false, true);
            savePlayerState();
            return;
        }
        
        lastSentMessage = userMessage;
        
        if (isGenerating) {
            debugLog("sendMessage blocked: isGenerating is true.");
            return;
        }
        
        // Validate game session
        if (!currentGameId) {
            addSystemMessage("No active game session. Creating a new one...");
            const pendingMessage = userMessage;
            const pendingPlayer = playerNumber;
            inputElement.value = '';
            
            debugLog("Setting isGenerating = true (sendMessage - new game flow)");
            isGenerating = true;
            createNewGame();
            
            const checkGameReadyInterval = setInterval(() => {
                if (currentGameId && !isGenerating) {
                    clearInterval(checkGameReadyInterval);
                    const targetInput = playerNumber === 1 ? userInput : document.getElementById(`player${playerNumber}-input`);
                    if (targetInput) {
                        targetInput.value = pendingMessage;
                        debugLog("Setting isGenerating = false (sendMessage - before recursive call after new game)");
                        isGenerating = false;
                        sendMessage(targetInput, pendingPlayer);
                    }
                }
            }, 300);
            return;
        }
        
        debugLog("Setting isGenerating = true (sendMessage - main flow)");
        isGenerating = true;
        
        // First message from this player: check if it contains a name
        const isFirstMessage = !hasPlayerSentAnyMessage(playerNumber);
        if (isFirstMessage) {
            debugLog(`Processing first message from Player ${playerNumber}`);
            const extractedPlayerName = Utils.extractName(userMessage);
            if (extractedPlayerName && (!playerNames[playerNumber] || playerNames[playerNumber] === `Player ${playerNumber}`)) {
                PlayerManager.updatePlayerLabel(playerNumber, extractedPlayerName);
            }
        }
        
        const sender = playerNames[playerNumber] || `Player ${playerNumber}`;
        addMessage(sender, userMessage);
        
        inputElement.value = '';
        
        // Create loading indicator
        const loadingId = `typing-indicator-${Date.now()}`;
        const textId = `response-text-${Date.now()}`;
        const loadingDiv = createLoadingDivForDM(loadingId, textId);
          // Prepare player context
        const playerContext = {};
        Object.entries(playerNames).forEach(([num, name]) => {
            if (name) playerContext[num] = name;
        });
        
        // Save user message to localStorage immediately
        const userMessageEntry = {
            role: "user",
            content: userMessage,
            player: `player${playerNumber}`,
            timestamp: Date.now(),
            sender: sender
        };
        saveMessageToLocalStorage(userMessageEntry);
        
        // Build recent history for context (limit to last 150 messages to keep payload reasonable)
        const fullLocal = Utils.loadChatHistory(currentGameId) || [];
        const clientHistoryForServer = fullLocal.slice(-150).map(m => ({
            role: m.role || (m.type === 'dm' ? 'assistant' : (m.type === 'system' ? 'system' : 'user')),
            content: m.content || m.text || '',
            player: m.player || (m.role === 'user' ? (m.player || undefined) : undefined)
        }));

        fetch('/chat', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                message: userMessage,
                game_id: currentGameId,
                player_number: playerNumber,
                player_names: playerContext,
                client_history: clientHistoryForServer
            })
        })
        .then(response => {
            if (!response.ok) throw new Error(`Server error: ${response.status}`);
            return response.json();
        })
        .then(data => {
            if (data && data.message_id) {
                sendStreamRequest(data.message_id, loadingDiv);
            } else {
                throw new Error("Invalid response data from /chat");
            }
        })
        .catch(error => {
            debugLog("Error in sendMessage fetch /chat:", error);
            if (loadingDiv && loadingDiv.parentNode) {
                const responseTextElem = loadingDiv.querySelector('[id^="response-text"]');
                if (responseTextElem) {
                    responseTextElem.textContent = "Error: " + error.message;
                    loadingDiv.classList.add('error-message');
                    const cursor = responseTextElem.querySelector('.cursor');
                    if (cursor) cursor.remove();
                } else {
                    loadingDiv.remove();
                    addSystemMessage("Error: " + error.message);
                }
            } else {
                addSystemMessage("Error: Failed to send message. " + error.message);
            }
            debugLog("Setting isGenerating = false (sendMessage - catch)");
            isGenerating = false;
        });
        
        inputElement.focus();
    }
    
    /**
     * Check if a player has sent any messages
     * @param {number} playerNumber - The player number to check
     * @returns {boolean} - Whether the player has sent any messages
     */
    function hasPlayerSentAnyMessage(playerNumber) {
        const messages = Array.from(chatWindow.querySelectorAll('.player-message'));
        const playerPrefix = `Player ${playerNumber}:`;
        const namedPrefix = playerNames[playerNumber] ? `${playerNames[playerNumber]}:` : null;
        
        for (const msg of messages) {
            const senderElement = msg.querySelector('.message-sender');
            if (senderElement) {
                const sender = senderElement.textContent;
                if (sender.startsWith(playerPrefix) || (namedPrefix && sender.startsWith(namedPrefix))) {
                    return true;
                }
            }
        }
        
        return false;
    }

    function createLoadingDivForDM(id, textId) {
        debugLog("Creating loading div:", id, textId);
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'message dm-message';
        loadingDiv.id = id;
        
        const nameSpan = document.createElement('span');
        nameSpan.className = 'message-sender'; 
        nameSpan.textContent = `${dmName}: `;
        
        const responseText = document.createElement('span');
        responseText.id = textId || 'response-text';
        responseText.className = 'typing message-content';
        responseText.textContent = '';
        
        const cursor = document.createElement('span');
        cursor.className = 'cursor';
        responseText.appendChild(cursor);
        
        loadingDiv.appendChild(nameSpan);
        loadingDiv.appendChild(responseText);
        chatWindow.appendChild(loadingDiv);
        scrollToBottom();
        
        return loadingDiv;
    }
    
    function sendStreamRequest(messageId, loadingDiv) {
        debugLog("Starting stream request for message ID:", messageId, ". Current isGenerating:", isGenerating);

        const eventSourceUrl = new URL('/stream', window.location.href);
        eventSourceUrl.searchParams.append('t', Date.now());
        eventSourceUrl.searchParams.append('game_id', currentGameId || '');
        eventSourceUrl.searchParams.append('message_id', messageId || '');
        // Always send the selected model as a query param
        eventSourceUrl.searchParams.append('model_id', selectedModel);

        debugLog("Stream URL:", eventSourceUrl.toString());

        const eventSource = new EventSource(eventSourceUrl.toString());
        
        let responseTimeout = setTimeout(() => {
            debugLog("Response timeout - closing connection for messageId:", messageId);
            if (eventSource) eventSource.close(); 
            const responseTextElem = loadingDiv.querySelector('[id^="response-text"]');
            if (responseTextElem) {
                responseTextElem.classList.remove('typing');
                const cursor = responseTextElem.querySelector('.cursor');
                if (cursor) cursor.remove();
                
                if (!responseTextElem.textContent.trim()) {
                    responseTextElem.textContent = "Response timeout. Please try again.";
                    loadingDiv.classList.add('error-message');
                }
            }
            debugLog("Setting isGenerating = false (sendStreamRequest - timeout)");
            isGenerating = false;
        }, 30000); // 30 seconds timeout
        
        eventSource.onopen = function(e) {
            debugLog("EventSource connection opened for messageId:", messageId);
        };
        
        let fullResponseText = ""; // Accumulate full response for checkForPlayerNames

        eventSource.onmessage = function(event) {
            try {
                clearTimeout(responseTimeout);
                responseTimeout = setTimeout(() => {
                    debugLog("Response timeout during streaming for messageId:", messageId);
                    eventSource.close();
                    const responseTextElem = loadingDiv.querySelector('[id^="response-text"]');
                    if (responseTextElem) {
                        const oldCursor = responseTextElem.querySelector('.cursor');
                        if (oldCursor) oldCursor.remove();
                        responseTextElem.classList.remove('typing');
                        
                        if (!responseTextElem.textContent.trim()) {
                            responseTextElem.textContent = "Response timeout. Please try again.";
                            loadingDiv.classList.add('error-message');
                        }
                    }
                    isGenerating = false;
                }, 30000);                debugLog("Received message chunk for messageId:", messageId, "Data:", event.data.substring(0, 50) + "...");
                const data = JSON.parse(event.data);                // Handle image generation messages
                if (data.image_generated) {
                    console.log("=== RECEIVED IMAGE FROM STREAM ===");
                    console.log("Image message:", data.image_message);
                    
                    // Ensure the image message has the correct format for localStorage
                    const formattedImageMessage = {
                        ...data.image_message,
                        text: data.image_message.image_prompt || 'Generated image',
                        content: data.image_message.image_prompt || 'Generated image',
                        images: [data.image_message.image_url], // Add images array
                        sender: 'assistant',
                        role: 'assistant',
                        type: 'dm',
                        message_type: 'image',
                        timestamp: Date.now()
                    };
                    
                    // Display the image immediately
                    displayImageMessage(formattedImageMessage);
                    
                    // Save to localStorage with proper format - remove the delayed saveChatHistoryToLocalStorage call
                    // as it might overwrite the image data
                    saveImageToLocalStorage(formattedImageMessage);
                    
                    console.log("=== IMAGE PROCESSED FROM STREAM ===");
                    return; // Don't process as text content
                }
                
                const responseTextElem = loadingDiv.querySelector('[id^="response-text"]');
                
                if (responseTextElem) {
                    // Handle line breaks properly
                    const formattedContent = data.content.replace(/\\n/g, '\n');
                    
                    if (data.error === true) {
                        loadingDiv.classList.add('error-message');
                    }
                    
                    if (responseTextElem.classList.contains('typing')) {
                        responseTextElem.classList.remove('typing');
                        const oldCursor = responseTextElem.querySelector('.cursor');
                        if (oldCursor) oldCursor.remove();
                    }
                      // Build the full accumulated text with proper formatting
                    fullResponseText += formattedContent;
                    
                    // DEBUG: Show accumulation progress
                    if (fullResponseText.length % 50 === 0) {  // Log every 50 characters
                        console.log("Streaming progress - fullResponseText length:", fullResponseText.length);
                    }
                    
                    // Check if we're currently generating reasoning content
                    const isGeneratingReasoning = fullResponseText.includes('<think>') || 
                                                  fullResponseText.includes('<thinking>') || 
                                                  fullResponseText.includes('<analysis>');
                    
                    // Check if reasoning is complete (has closing tags)
                    const hasCompleteReasoning = (fullResponseText.includes('<think>') && fullResponseText.includes('</think>')) ||
                                                 (fullResponseText.includes('<thinking>') && fullResponseText.includes('</thinking>')) ||
                                                 (fullResponseText.includes('<analysis>') && fullResponseText.includes('</analysis>'));
                      // Process the FULL accumulated text (not just the chunk) with formatting
                    const processedFullContent = Utils.processFormattedText(fullResponseText);
                    
                    // Remove [IMAGE: ...] tags from the displayed content
                    const cleanedDisplayContent = processedFullContent.replace(/\[IMAGE:\s*[^\]]+\]/gi, '').replace(/\s+/g, ' ').trim();
                    
                    // If we're generating reasoning but it's not complete, show "Thinking..." with caret
                    if (isGeneratingReasoning && !hasCompleteReasoning && !cleanedDisplayContent.trim()) {
                        const cursorHTML = '<span class="cursor"></span>';
                        responseTextElem.innerHTML = '<em style="color: #6272a4; font-style: italic;">🤔 Thinking...</em>' + cursorHTML;
                    } else {
                        // Update with fully formatted content and add cursor back
                        const cursorHTML = '<span class="cursor"></span>';
                        responseTextElem.innerHTML = cleanedDisplayContent + cursorHTML;
                    }
                    
                    scrollToBottom();
                }
            } catch (e) {
                debugLog("Error parsing event data:", e);
            }
        };
        
        eventSource.addEventListener('done', function(event) {
            console.log("=== STREAM DONE EVENT FIRED ===");
            console.log("messageId:", messageId, "Event data:", event.data);
            console.log("fullResponseText length:", fullResponseText.length);
            console.log("fullResponseText preview:", fullResponseText.substring(0, 100) + "...");
            
            debugLog("Stream complete for messageId:", messageId, "Event data:", event.data);
            clearTimeout(responseTimeout);
            
            const responseTextElem = loadingDiv.querySelector('[id^="response-text"]');
            if (responseTextElem) {
                const oldCursor = responseTextElem.querySelector('.cursor');
                if (oldCursor) oldCursor.remove();
                  if (fullResponseText) {
                    console.log("=== SAVING DM MESSAGE ===");
                    console.log("fullResponseText:", fullResponseText.substring(0, 100) + "...");
                    console.log("currentGameId:", currentGameId);
                    
                    PlayerManager.checkForPlayerNames(fullResponseText);
                    // Note: Image generation is now handled automatically on the server side
                    // This ensures the server knows which model to use on page refresh
                    setServerModel(selectedModel);
                    // Save the completed DM response to localStorage
                    const processedResponse = Utils.processFormattedText(fullResponseText);
                      // Remove [IMAGE: ...] tags from the displayed/saved content
                    const cleanedContent = processedResponse.replace(/\[IMAGE:\s*[^\]]+\]/gi, '').replace(/\s+/g, ' ').trim();
                    
                    // Only save the DM message if it has actual content (not just empty after removing image tags)
                    if (cleanedContent) {
                        // Save DM message directly to localStorage
                        const dmMessage = {
                            role: "assistant",
                            type: "dm", 
                            content: cleanedContent,
                            timestamp: Date.now(),
                            sender: dmName
                        };
                        console.log("About to save DM message:", dmMessage);
                        console.log("=== CHECKING FOR EXISTING IMAGES BEFORE DM SAVE ===");
                        const preHistory = Utils.loadChatHistory(currentGameId) || [];
                        const preImageMessages = preHistory.filter(msg => msg.message_type === 'image' || (msg.images && msg.images.length > 0));
                        console.log(`Found ${preImageMessages.length} image messages before DM message save`);
                        
                        saveMessageToLocalStorage(dmMessage);
                        
                        console.log("=== CHECKING FOR EXISTING IMAGES AFTER DM SAVE ===");
                        const postHistory = Utils.loadChatHistory(currentGameId) || [];
                        const postImageMessages = postHistory.filter(msg => msg.message_type === 'image' || (msg.images && msg.images.length > 0));
                        console.log(`Found ${postImageMessages.length} image messages after DM message save`);
                        
                        if (preImageMessages.length > postImageMessages.length) {
                            console.error("⚠️ IMAGES WERE LOST DURING DM MESSAGE SAVE!");
                            console.error("Pre-save images:", preImageMessages.length, "Post-save images:", postImageMessages.length);
                        }
                        
                        console.log("DM message save completed");
                    } else {
                        console.log("Skipping save of empty DM message (only contained image tags)");
                    }
                }
            }
            
            eventSource.close();
            debugLog("Setting isGenerating = false (sendStreamRequest - done)");
            isGenerating = false;
            saveChatState(); // Save chat state after DM response is fully received
        });
        
        eventSource.onerror = function(e) {
            debugLog("EventSource error for messageId:", messageId, e);
            clearTimeout(responseTimeout);
            
            try {
                const responseTextElem = loadingDiv.querySelector('[id^="response-text"]');
                if (responseTextElem) {
                    const oldCursor = responseTextElem.querySelector('.cursor');
                    if (oldCursor) oldCursor.remove();
                    responseTextElem.classList.remove('typing');
                    
                    if (!responseTextElem.textContent.trim()) {
                        loadingDiv.classList.add('error-message');
                        responseTextElem.textContent = "Connection error. Please try again.";
                    }
                }
                eventSource.close();
            } catch (err) {
                debugLog("Error handling EventSource error for messageId:", messageId, err);
            } finally {
                debugLog("Setting isGenerating = false (sendStreamRequest - onerror)");
                isGenerating = false;
            }
        };
    }
    
    function updateUndoRedoButtons() {
        if (undoBtn && redoBtn) {
            // Undo is available if we have history to go back to
            undoBtn.disabled = historyIndex <= 0;
            
            // Redo is available if we have an undone message to resend
            redoBtn.disabled = !lastUndoneMessage;
            
            // Update styles
            undoBtn.style.opacity = undoBtn.disabled ? '0.5' : '1';
            redoBtn.style.opacity = redoBtn.disabled ? '0.5' : '1';
        }
    }
      function saveChatState() {
        debugLog(`Attempting to save chat state. Current historyIndex: ${historyIndex}, History length: ${messageHistory.length}`);
        const messages = Array.from(chatWindow.querySelectorAll('.message:not(.temporary-message)')) 
            .map(msg => {
                const senderEl = msg.querySelector('.message-sender');
                const contentEl = msg.querySelector('.message-content');
                
                // Skip if essential elements are missing (e.g. loading indicators not fully formed)
                if (!senderEl || !contentEl) {
                    debugLog("Skipping message with missing elements:", msg.outerHTML.substring(0, 100));
                    return null;
                }

                const senderText = senderEl.textContent.replace(':', '').trim();
                // Use innerHTML to preserve HTML formatting instead of textContent
                const contentHTML = contentEl.innerHTML.trim();
                const contentText = contentEl.textContent.trim();
                
                // IMPROVED: Extract images from the message more comprehensively
                const imageElements = msg.querySelectorAll('img'); // Search the entire message, not just content
                const images = Array.from(imageElements).map(img => {
                    console.log("Found image in message:", img.src.substring(0, 50) + "...");
                    return img.src;
                }).filter(src => src && src.startsWith('data:image/')); // Only keep base64 data URLs
                
                console.log(`Message from ${senderText}: found ${images.length} images`);
                
                // Skip empty messages unless they have images
                if (!contentText && !contentHTML && images.length === 0) {
                    debugLog("Skipping empty message:", msg.outerHTML.substring(0, 100));
                    return null;
                }
                
                // Skip pure loading indicators (typing with no actual content)
                if (msg.querySelector('.typing') && contentEl.querySelector('.cursor') && !contentText.replace(/\s/g, '') && images.length === 0) {
                    debugLog("Skipping pure loading indicator:", msg.outerHTML.substring(0, 100));
                    return null;
                }

                const isSystem = msg.classList.contains('system-message');
                const isImageMessage = msg.classList.contains('image-message-container') || images.length > 0;
                // Determine if DM by checking sender text against current dmName or if it's a DM loading message
                const isDM = senderText === dmName || (msg.classList.contains('dm-message') && senderText === "DM");

                // Store the timestamp to help with identifying message sequences
                const timestamp = new Date().getTime();

                // Create base message object (following your other app's pattern)
                const messageObj = {
                    sender: senderText,
                    // Store minimal content for undo/redo snapshots to avoid quota issues
                    content: contentText,
                    text: contentText, // Add both for compatibility
                    // Do not store base64 HTML in snapshots (can exceed quota). Keep minimal HTML for non-image.
                    contentHTML: isImageMessage ? '' : contentHTML,
                    // Do NOT store base64 image data in undo history; it explodes storage size
                    images: isImageMessage ? [] : images,
                    type: isSystem ? 'system' : (isDM ? 'dm' : 'player'),
                    role: isSystem ? 'system' : (isDM ? 'assistant' : 'user'),
                    timestamp: timestamp
                };

                // If this is an image message, preserve additional image data
                if (isImageMessage && images.length > 0) {
                    const imgElement = msg.querySelector('img');
                    const captionElement = msg.querySelector('.image-caption');
                    
                    messageObj.message_type = "image";
                    // Do NOT store the actual image in snapshots
                    messageObj.image_url = null;
                    
                    if (imgElement) {
                        messageObj.image_prompt = imgElement.alt || '';
                    }
                    
                    if (captionElement) {
                        // Extract prompt from caption text
                        const captionText = captionElement.textContent;
                        const promptMatch = captionText.match(/Generated image: (.+)/);
                        if (promptMatch) {
                            messageObj.image_prompt = promptMatch[1];
                        }
                    }
                    
                    messageObj.role = "assistant"; // Image messages are from the assistant/DM
                    // Replace content with a lightweight placeholder so restore works without base64
                    const prompt = messageObj.image_prompt || 'Generated image';
                    messageObj.content = `[Image omitted: ${prompt}]`;
                    messageObj.text = messageObj.content;
                    messageObj.contentHTML = '';
                    console.log("Saved lightweight image snapshot with prompt:", messageObj.image_prompt);
                }

                return messageObj;
            }).filter(msg => msg !== null);

    // CRITICAL FIX: Always save if we have ANY valid messages
    if (messages.length === 0) {
        debugLog("No valid messages to save. Chat window children:", chatWindow.children.length);
        // Only return early if chat window is truly empty or only has temporary/loading content
        const hasAnyRealContent = Array.from(chatWindow.children).some(child => 
            !child.classList.contains('temporary-message') && 
            !child.querySelector('.typing') &&
            child.textContent.trim()
        );
        
        if (!hasAnyRealContent) {
            debugLog("No real content in chat window, skipping save");
            return;
        }
    }
    
    // If historyIndex is behind the end of messageHistory, truncate the "future" states that were undone
    if (historyIndex < messageHistory.length - 1) {
        debugLog(`History divergence: historyIndex (${historyIndex}) < messageHistory.length - 1 (${messageHistory.length - 1}). Slicing history.`);
        messageHistory = messageHistory.slice(0, historyIndex + 1);
    }
    
    messageHistory.push(messages);
    historyIndex = messageHistory.length - 1; // Point to the newly added state
    
    if (messageHistory.length > MAX_HISTORY_SIZE) {
        messageHistory.shift();
        historyIndex--;
    }
    try {
        localStorage.setItem('chatHistory', JSON.stringify(messageHistory)); 
        debugLog(`Chat state saved successfully. New history size: ${messageHistory.length}, New Index: ${historyIndex}`);
        debugLog(`Chat state saved. Messages in this state: ${messages.length}. Last saved messages:`, messages.map(m => `${m.sender}: ${(m.content || m.text || '').substring(0,20)}`));
    } catch (e) {
        console.error("Error saving chatHistory to localStorage:", e);
        
        // If quota exceeded, try cleanup and retry
        if (e.name === 'QuotaExceededError') {
            console.log("LocalStorage quota exceeded, attempting cleanup...");
            const cleanedUp = cleanupLocalStorage();
            
            if (cleanedUp) {
                try {
                    // Retry save after cleanup
                    localStorage.setItem('chatHistory', JSON.stringify(messageHistory));
                    console.log("Chat state saved successfully after cleanup");
                } catch (retryError) {
                    console.error("Failed to save even after cleanup:", retryError);
                    // Remove images from current history as last resort
                    const compactHistory = messageHistory.map(state => 
                        state.map(msg => ({
                            ...msg,
                            images: msg.images && msg.images.length > 0 ? ['[Image removed to save space]'] : [],
                            image_url: msg.image_url ? '[Image removed to save space]' : msg.image_url
                        }))
                    );
                    try {
                        localStorage.setItem('chatHistory', JSON.stringify(compactHistory));
                        console.log("Saved compact history without images");
                    } catch (finalError) {
                        console.error("Final save attempt failed:", finalError);
                    }
                }
            }
        }
        debugLog("Error saving chatHistory to localStorage:", e);
    }
    updateUndoRedoButtons();
}
    
    function undoChat() {
        debugLog(`Undo requested. historyIndex: ${historyIndex}, isGenerating: ${isGenerating}`);
        if (isGenerating) {
            addSystemMessage("Please wait for the current action to complete before undoing.", false, true, true);
            return;
        }

        if (!currentGameId) {
            addSystemMessage("No game session found for undo.", false, true, true);
            return;
        }

        // Use localStorage instead of server for undo
        try {
            const existingHistory = Utils.loadChatHistory(currentGameId);
            if (existingHistory.length < 2) {
                addSystemMessage("Nothing to undo.", false, true, true);
                return;
            }
            
            // Find the last user message and subsequent assistant messages to remove
            let messagesToRemove = 0;
            let lastUserMessage = null;
            
            // Look backwards through history to find the last user message and all messages after it
            for (let i = existingHistory.length - 1; i >= 0; i--) {
                const msg = existingHistory[i];
                messagesToRemove++;
                
                if (msg.role === "user") {
                    lastUserMessage = msg;
                    break;
                }
            }
            
            if (lastUserMessage && messagesToRemove > 0) {
                // Store for redo
                lastUndoneMessage = lastUserMessage.content || lastUserMessage.text || '';
                if (lastUserMessage.player) {
                    const playerMatch = lastUserMessage.player.match(/player(\d+)/);
                    if (playerMatch) {
                        lastUndonePlayerNumber = parseInt(playerMatch[1]);
                    } else {
                        lastUndonePlayerNumber = 1; // Default
                    }
                } else {
                    lastUndonePlayerNumber = 1;
                }
                
                // Remove messages from localStorage
                const updatedHistory = existingHistory.slice(0, -messagesToRemove);
                Utils.saveChatHistory(currentGameId, updatedHistory);
                
                // Update display
                displayMessages(updatedHistory);
                
                // Save undo/redo state
                saveUndoRedoState();
                setTimeout(saveChatState, 100);
                updateUndoRedoButtons();
                
                addSystemMessage(`✓ Undid last ${messagesToRemove} message(s)`, false, true, true);
                debugLog(`Removed ${messagesToRemove} messages from localStorage. Can redo: "${lastUndoneMessage}"`);
            } else {
                addSystemMessage("Nothing to undo.", false, true, true);
            }        } catch (error) {
            debugLog("Error in localStorage undo:", error);
            addSystemMessage("Error undoing message", false, true, true);
        }
    }
    
    function redoChat() {
        debugLog(`Redo requested. lastUndoneMessage: ${lastUndoneMessage}, isGenerating: ${isGenerating}`);
        
        // Block if we're already generating or if there's no undone message to resend
        if (isGenerating || !lastUndoneMessage) {
            if (isGenerating) {
                addSystemMessage("Please wait for the current action to complete before redoing.", false, true, true);
            } else if (!lastUndoneMessage) {
                addSystemMessage("Nothing to redo.", false, true, true);
            }
            return;
        }
        
        // Create a temporary input element to hold the last undone message
        const tempInput = { value: lastUndoneMessage };
        
        // Send the last undone message directly
        debugLog(`Redoing by resending message: "${lastUndoneMessage}" from player ${lastUndonePlayerNumber}`);
        
        // Add a system message to explain what's happening
        addSystemMessage(`Redoing your previous action...`, false, false, true);
          // Send the message using the stored player number
        sendMessage(tempInput, lastUndonePlayerNumber || 1);
        
        // Clear the lastUndoneMessage since we've used it
        clearUndoRedoState();
        
        // Update the undo/redo buttons
        updateUndoRedoButtons();
    }
    
    // Event Listeners
    if (userInput && sendBtn) {
        userInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && !isGenerating) {
                e.preventDefault();
                sendMessage(userInput, 1);
            }
        });
        sendBtn.addEventListener('click', function(e) {
            e.preventDefault();
            if (!isGenerating) sendMessage(userInput, 1);
        });
    }

    // Set up click handler for Player 1's container
    if (player1Container) {
        player1Container.addEventListener('click', function() {
            debugLog('Player 1 container clicked');
            PlayerManager.selectPlayer(player1Container, 1);
        });
    }

    // Setup remaining event listeners
    if (newGameBtn) newGameBtn.addEventListener('click', createNewGame);
      if (addPlayerBtn) {
        addPlayerBtn.addEventListener('click', function() {
            PlayerManager.addPlayer(sendMessage);
        });
    }
    
    // Remove player button event listener
    if (removePlayerBtn) {
        removePlayerBtn.addEventListener('click', function() {
            const selectedPlayerNum = PlayerManager.getSelectedPlayerNumber();
            if (selectedPlayerNum && selectedPlayerNum > 1) {
                debugLog(`Removing player ${selectedPlayerNum}`);
                PlayerManager.removePlayer(selectedPlayerNum);
            } else {
                debugLog('No valid player selected for removal or trying to remove Player 1');
                addSystemMessage('Please select a player to remove (Player 1 cannot be removed).', false, false, true);
            }
        });
    }
    
    // AI Models event listeners
    if (aiModelsBtn) {
        aiModelsBtn.addEventListener('click', function() {
            aiModelsModal.classList.remove('hidden');
        });
    }
    
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', function() {
            aiModelsModal.classList.add('hidden');
        });
    }
    
    if (aiModelsModal) {
        aiModelsModal.addEventListener('click', function(e) {
            if (e.target === aiModelsModal) {
                aiModelsModal.classList.add('hidden');
            }
        });
    }

    // Image Models event listeners
    if (imageModelsBtn) {
        imageModelsBtn.addEventListener('click', function() {
            imageModelsModal.classList.remove('hidden');
        });
    }
    
    if (closeImageModalBtn) {
        closeImageModalBtn.addEventListener('click', function() {
            imageModelsModal.classList.add('hidden');
        });
    }
    
    if (imageModelsModal) {
        imageModelsModal.addEventListener('click', function(e) {
            if (e.target === imageModelsModal) {
                imageModelsModal.classList.add('hidden');
            }
        });
    }

    // Sidebar toggle functionality - ONLY use button to toggle
    if (menuToggleBtn && sideMenu) {
        menuToggleBtn.addEventListener('click', function() {
            debugLog('Menu toggle clicked');
            sideMenu.classList.toggle('open');
            menuToggleBtn.classList.toggle('menu-open');
        });
    }

    // REMOVED: Close sidebar when clicking outside - this was causing issues
    // The sidebar will now only open/close via the menu button

    // Copy chat functionality
    if (copyChatBtn) {
        copyChatBtn.addEventListener('click', function() {
            const messages = Array.from(chatWindow.querySelectorAll('.message:not(.temporary-message)'));
            const chatText = messages.map(msg => {
                const sender = msg.querySelector('.message-sender')?.textContent || '';
                const content = msg.querySelector('.message-content')?.textContent || '';
                return `${sender} ${content}`;
            }).join('\n\n');
            
            navigator.clipboard.writeText(chatText).then(() => {
                addSystemMessage('Chat copied to clipboard!', false, false, true);
            }).catch(err => {
                debugLog('Error copying to clipboard:', err);
                addSystemMessage('Error copying chat to clipboard.', false, false, true);
            });
        });
    }

    // Export data functionality
    const exportDataBtn = document.getElementById('export-data-btn');
    const importDataBtn = document.getElementById('import-data-btn');
    const importFileInput = document.getElementById('import-file-input');
    if (exportDataBtn) {
        exportDataBtn.addEventListener('click', function() {
            const key = 'chatHistory_' + currentGameId;
            const data = localStorage.getItem(key) || '[]';
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'chat_history_' + currentGameId + '.json';
            a.click();
            URL.revokeObjectURL(url);
        });
    }
    // Import data functionality
    if (importDataBtn && importFileInput) {
        importDataBtn.addEventListener('click', () => importFileInput.click());
        importFileInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(evt) {
                try {
                    const imported = JSON.parse(evt.target.result);
                    if (Array.isArray(imported)) {
                        const key = 'chatHistory_' + currentGameId;
                        localStorage.setItem(key, JSON.stringify(imported));
                        chatWindow.innerHTML = '';
                        displayMessages(imported);
                        // Persist undo/redo baseline and make sure next send includes imported context
                        messageHistory = [];
                        historyIndex = -1;
                        localStorage.removeItem('chatHistory');
                        setTimeout(saveChatState, 50);
                        addSystemMessage('Data imported successfully.', false, false, true);
                    } else {
                        addSystemMessage('Invalid import format.', false, false, true);
                    }
                } catch (err) {
                    addSystemMessage('Error importing data: ' + err.message, false, false, true);
                }
            };
            reader.readAsText(file);
            importFileInput.value = '';
        });
    }

    // Dice button for Player 1
    if (diceBtn) {
        diceBtn.addEventListener('click', function() {
            if (!isGenerating) {
                const playerName = playerNames[1] || 'Player 1';
                addMessage(playerName, 'rolls 1d20...');
                const diceCommandInput = { value: '/roll 1d20' };
                sendMessage(diceCommandInput, 1);
            }
        });
    }

    // Undo/Redo functionality
    if (undoBtn) {
        undoBtn.addEventListener('click', undoChat);
    }
    
    if (redoBtn) {
        redoBtn.addEventListener('click', redoChat);
    }
    
    // Expose sendMessage globally (used by PlayerManager and others)
    window.sendMessage = sendMessage;

    debugLog("=== TOP-LEVEL DOMCONTENTLOADED FINISHED ===");

    // Add mobile-specific fixes
    function initMobileFixes() {
        // Fix for mobile viewport issues
        function setViewportHeight() {
            const vh = window.innerHeight * 0.01;
            document.documentElement.style.setProperty('--vh', `${vh}px`);
        }
        
        // Set initial viewport height
        setViewportHeight();
        
        // Update on resize (address bar show/hide)
        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(setViewportHeight, 100);
        });
        
        // Fix for iOS Safari address bar
        window.addEventListener('orientationchange', () => {
            setTimeout(setViewportHeight, 500);
        });
        
        // Prevent zoom on input focus for iOS
        const inputs = document.querySelectorAll('input[type="text"]');
        inputs.forEach(input => {
            input.addEventListener('focus', (e) => {
                // Temporarily disable zoom
                const viewport = document.querySelector('meta[name="viewport"]');
                if (viewport) {
                    const originalContent = viewport.content;
                    viewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
                    
                    // Restore after blur
                    input.addEventListener('blur', () => {
                        viewport.content = originalContent;
                    }, { once: true });
                }
            });
        });
        
        // Fix for mobile browser back button
        window.addEventListener('popstate', (e) => {
            // Close sidebar if open when back button is pressed
            if (sideMenu && sideMenu.classList.contains('open')) {
                sideMenu.classList.remove('open');
                menuToggleBtn.classList.remove('menu-open');
                e.preventDefault();
            }
        });
        
        // Improve touch handling for mobile
        let touchStartY = 0;
        let touchEndY = 0;
        
        document.addEventListener('touchstart', (e) => {
            touchStartY = e.changedTouches[0].screenY;
        }, { passive: true });
        
        document.addEventListener('touchend', (e) => {
            touchEndY = e.changedTouches[0].screenY;
            
            // Prevent pull-to-refresh if at top of chat
            if (chatWindow && chatWindow.scrollTop === 0 && touchEndY > touchStartY) {
                e.preventDefault();
            }
        }, { passive: false });
        
        // Fix for virtual keyboard on mobile
        if ('visualViewport' in window) {
            window.visualViewport.addEventListener('resize', () => {
                const keyboardHeight = window.innerHeight - window.visualViewport.height;
                if (keyboardHeight > 0) {
                    // Keyboard is open
                    document.body.style.paddingBottom = `${keyboardHeight}px`;
                } else {
                    // Keyboard is closed
                    document.body.style.paddingBottom = '0px';
                }
            });
        }
          debugLog("Mobile fixes initialized");
    }

    // Initialize mobile image long-press handling
    function initImageLongPress() {
        debugLog("Initializing image long-press handling");
        
        // Use event delegation to handle dynamically added images
        document.addEventListener('contextmenu', function(e) {
            if (e.target.tagName === 'IMG' && e.target.closest('.image-message')) {
                // Allow context menu for images (enables save option)
                debugLog("Context menu allowed for image");
                return true;
            }
        });
        
        // Add touch handling for iOS Safari which doesn't always show context menu
        let touchTimer = null;
        let touchStarted = false;
        
        document.addEventListener('touchstart', function(e) {
            if (e.target.tagName === 'IMG' && e.target.closest('.image-message')) {
                touchStarted = true;
                debugLog("Touch started on image");
                
                // Set a timer for long press
                touchTimer = setTimeout(() => {
                    if (touchStarted) {
                        debugLog("Long press detected on image");
                        // For iOS Safari, we can try to trigger the save dialog
                        showImageSaveOptions(e.target);
                    }
                }, 500); // 500ms for long press
            }
        }, { passive: true });
        
        document.addEventListener('touchend', function(e) {
            if (touchTimer) {
                clearTimeout(touchTimer);
                touchTimer = null;
            }
            touchStarted = false;
        }, { passive: true });
        
        document.addEventListener('touchcancel', function(e) {
            if (touchTimer) {
                clearTimeout(touchTimer);
                touchTimer = null;
            }
            touchStarted = false;
        }, { passive: true });
        
        document.addEventListener('touchmove', function(e) {
            // Cancel long press if user moves finger
            if (touchTimer) {
                clearTimeout(touchTimer);
                touchTimer = null;
            }
            touchStarted = false;
        }, { passive: true });
        
        debugLog("Image long-press handling initialized");
    }
    
    // Show image save options for mobile browsers
    function showImageSaveOptions(imgElement) {
        if (!imgElement || !imgElement.src) return;
        
        debugLog("Showing image save options for:", imgElement.src);
        
        // For browsers that support it, try to trigger a download
        try {
            // Create a temporary link element
            const link = document.createElement('a');
            link.href = imgElement.src;
            link.download = `ai-dungeon-image-${Date.now()}.png`;
            
            // For data URLs (base64 images), we can't use download directly
            if (imgElement.src.startsWith('data:')) {
                // Try to show a custom save dialog or instructions
                showMobileSaveInstructions(imgElement);
            } else {
                // For regular URLs, try the download approach
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
        } catch (error) {
            debugLog("Error with download approach:", error);
            showMobileSaveInstructions(imgElement);
        }
    }
    
    // Show instructions for saving images on mobile
    function showMobileSaveInstructions(imgElement) {
        // Create a simple modal with instructions
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            padding: 20px;
            box-sizing: border-box;
        `;
        
        const content = document.createElement('div');
        content.style.cssText = `
            background: #282a36;
            color: white;
            padding: 20px;
            border-radius: 10px;
            max-width: 350px;
            text-align: center;
            font-family: inherit;
        `;
        
        content.innerHTML = `
            <h3 style="margin-top: 0; color: #50fa7b;">Save Image</h3>
            <p style="margin: 15px 0;">To save this image:</p>
            <ul style="text-align: left; margin: 15px 0;">
                <li>Long press the image again</li>
                <li>Select "Save Image" or "Save to Photos"</li>
                <li>On some devices, tap "Copy Image" then paste into Photos</li>
            </ul>
            <button id="close-save-instructions" style="
                background: #50fa7b;
                color: #282a36;
                border: none;
                padding: 10px 20px;
                border-radius: 5px;
                font-size: 16px;
                cursor: pointer;
                margin-top: 10px;
            ">Got it!</button>
        `;
        
        modal.appendChild(content);
        document.body.appendChild(modal);
        
        // Close the modal
        const closeBtn = content.querySelector('#close-save-instructions');
        const closeModal = () => {
            document.body.removeChild(modal);
        };
        
        closeBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
        
        // Auto-close after 5 seconds
        setTimeout(closeModal, 5000);
    }    // --- localStorage cleanup functions ---
    
    /**
     * Clean up old localStorage data when quota is exceeded
     */
    function cleanupLocalStorage() {
        console.log("=== CLEANING UP LOCALSTORAGE ===");
        
        try {
            // Get all localStorage keys
            const keys = Object.keys(localStorage);
            const gameHistoryKeys = keys.filter(key => key.startsWith('chatHistory_game_'));
            const gameDataKeys = keys.filter(key => key.startsWith('gameData_game_'));
            
            console.log(`Found ${gameHistoryKeys.length} game history entries and ${gameDataKeys.length} game data entries`);
            
            // Sort by embedded timestamp (oldest first)
            // Keys look like: chatHistory_game_<ms>_<rand>
            const sortedHistoryKeys = gameHistoryKeys.sort((a, b) => {
                const parseTs = (key) => {
                    const tail = (key.split('chatHistory_game_')[1] || '');
                    const tsStr = tail.split('_')[0] || '0';
                    const ts = parseInt(tsStr);
                    return isNaN(ts) ? 0 : ts;
                };
                return parseTs(a) - parseTs(b);
            });

            // Never remove the active game's history
            const activeHistoryKey = currentGameId ? `chatHistory_${currentGameId}` : null;

            // Keep the 3 most recent games (besides the active one which is always kept)
            const protectedSet = new Set();
            if (activeHistoryKey) protectedSet.add(activeHistoryKey);
            const recentToKeep = 3;
            for (let i = sortedHistoryKeys.length - 1; i >= 0 && protectedSet.size < recentToKeep + (activeHistoryKey ? 1 : 0); i--) {
                const k = sortedHistoryKeys[i];
                protectedSet.add(k);
            }

            const keysToRemove = sortedHistoryKeys.filter(k => !protectedSet.has(k));
            
            keysToRemove.forEach(key => {
                console.log(`Removing old game data: ${key}`);
                localStorage.removeItem(key);
                
                // Also remove corresponding game data
                const gameId = key.replace('chatHistory_', '');
                const gameDataKey = `gameData_${gameId}`;
                if (localStorage.getItem(gameDataKey)) {
                    localStorage.removeItem(gameDataKey);
                    console.log(`Removed game data: ${gameDataKey}`);
                }
            });
            
            // Also clean up old undo/redo history if it exists
            const chatHistoryKey = 'chatHistory';
            if (localStorage.getItem(chatHistoryKey)) {
                console.log("Removing old undo/redo history");
                localStorage.removeItem(chatHistoryKey);
            }
            
            console.log(`Cleanup complete. Removed ${keysToRemove.length} old game(s).`);
            console.log("=== END CLEANUP ===");
            
            return keysToRemove.length > 0;
        } catch (error) {
            console.error("Error during localStorage cleanup:", error);
            return false;
        }
    }

    // --- Application initialization and setup ---
    // Initialize once at end of DOMContentLoaded
    initMobileFixes();
    initImageLongPress();
    initialize();
    loadAvailableModels();
    loadAvailableImageModels();
    
    // Scroll to bottom functionality
    function initScrollToBottom() {
        const chatWindow = document.getElementById('chat-window');
        const scrollToBottomBtn = document.getElementById('scroll-to-bottom-btn');
        
        if (!chatWindow || !scrollToBottomBtn) return;
        
        // Check if user has scrolled up and show/hide button
        function checkScrollPosition() {
            const isAtBottom = chatWindow.scrollTop >= (chatWindow.scrollHeight - chatWindow.clientHeight - 50);
            
            if (isAtBottom) {
                scrollToBottomBtn.classList.remove('show');
            } else {
                scrollToBottomBtn.classList.add('show');
            }
        }
        
        // Event listeners
        chatWindow.addEventListener('scroll', checkScrollPosition);
        scrollToBottomBtn.addEventListener('click', scrollToBottom);
        
        // Scroll to bottom initially (after a small delay to ensure content is loaded)
        setTimeout(scrollToBottom, 100);
        
        debugLog("Scroll to bottom functionality initialized");
    }
    
    // Initialize scroll to bottom
    initScrollToBottom();
});  // End of DOMContentLoaded event listener

// Global function for reasoning toggle (called from HTML)
function toggleReasoning(reasoningId) {
    const reasoningContent = document.getElementById(reasoningId);
    if (!reasoningContent) return;
    
    // Find the toggle button (should be the previous sibling)
    const toggleButton = reasoningContent.previousElementSibling;
    
    if (reasoningContent.style.display === 'none') {
        reasoningContent.style.display = 'block';
        if (toggleButton) toggleButton.classList.add('expanded');
    } else {
        reasoningContent.style.display = 'none';
        if (toggleButton) toggleButton.classList.remove('expanded');
    }
}

// Make the function globally available
window.toggleReasoning = toggleReasoning;
