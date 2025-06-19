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
    
    // Session data - ensure we get from localStorage first
    let currentGameId = localStorage.getItem('currentGameId');
    debugLog("Initial gameId from localStorage:", currentGameId);
    
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
    let selectedImageModel = localStorage.getItem('selectedImageModel') || 'hidream';

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

            // Remove 'default' trait for llama-3.3-70b only
            let traits = model.traits;
            if (model.id === 'llama-3.3-70b') {
                traits = traits.filter(trait => trait !== 'default');
            }
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
        })        .catch(error => {
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
            
            const traits = model.traits && model.traits.length > 0 
                ? model.traits.map(trait => `<span class="trait-tag">${trait}</span>`).join(' ')
                : '';
            
            modelItem.innerHTML = `
                <div class="model-name">${model.name}</div>
                <div class="model-description">${model.description}</div>
                <div class="model-traits">${traits}</div>
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
    }

    function generateImage(prompt) {
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
                // The image message is already saved to history by the server
                // Just add it to the current chat display
                const message = data.message;
                displayImageMessage(message);
                debugLog("Image generated successfully:", data.image_url);
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
        messageDiv.innerHTML = `
            <span class="message-sender">${dmName}: </span>
            <span class="message-content">${message.content}</span>
        `;
        
        console.log("Created image message div:", messageDiv);
        chatWindow.appendChild(messageDiv);
        chatWindow.scrollTop = chatWindow.scrollHeight;
        
        console.log("Image message added to chat window");
        console.log("=== END DISPLAYING IMAGE MESSAGE ===");
    }// Function to check for new messages (including images) from the server
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
        
        // Generate new game ID locally instead of fetching from server
        const newGameId = 'game_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        currentGameId = newGameId;
        localStorage.setItem('currentGameId', currentGameId);
        
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
                saveMessageToLocalStorage(welcomeMessage);
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
            setTimeout(saveChatState, 100); // Allow DOM to settle        } else {
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
            
            const localHistory = Utils.loadChatHistory(currentGameId);
            
            // DEBUG: Check what's in localStorage
            console.log("=== DEBUG CHAT HISTORY ===");
            console.log("localHistory raw:", localHistory);
            console.log("localHistory length:", localHistory ? localHistory.length : 0);
            
            // ALSO CHECK WHAT'S ACTUALLY IN LOCALSTORAGE
            const storageKey = `chatHistory_${currentGameId}`;
            const rawData = localStorage.getItem(storageKey);
            console.log("Raw localStorage data for key", storageKey, ":", rawData);
              if (localHistory && localHistory.length > 0) {
                localHistory.forEach((msg, index) => {
                    console.log(`Message ${index}:`, {
                        role: msg.role,
                        type: msg.type,
                        sender: msg.sender,
                        content: msg.content ? msg.content.substring(0, 50) + "..." : "No content",
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
                });
                  console.log("About to call displayMessages with", localHistory.length, "messages");
                displayMessages(localHistory);
                debugLog("Loaded chat history from localStorage:", localHistory.length, "messages");
                console.log("=== END DEBUG ===");
                
                // Also check for any image messages that might have been generated on the server
                // but not yet captured in localStorage (in case of previous session inconsistencies)
                setTimeout(() => {
                    console.log("Checking for additional server messages after initialization...");
                    checkForImageMessages();
                }, 500);
            } else {
                console.log("No messages in localStorage");
                console.log("=== END DEBUG ===");
                ensureWelcomeMessage();
                debugLog("No localStorage history found, showing welcome message");
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
    }

    // --- Functions for localStorage chat management ---
    
    /**
     * Save a single message to localStorage chat history
     */    function saveMessageToLocalStorage(messageEntry) {
        console.log("=== saveMessageToLocalStorage CALLED ===");
        console.log("messageEntry:", messageEntry);
        console.log("currentGameId:", currentGameId);
        
        if (!currentGameId) {
            console.log("ERROR: No currentGameId when trying to save message");
            debugLog("Warning: No currentGameId when trying to save message");
            return;
        }
        
        try {
            const existingHistory = Utils.loadChatHistory(currentGameId);
            console.log("Existing history length:", existingHistory.length);
            
            existingHistory.push(messageEntry);
            Utils.saveChatHistory(currentGameId, existingHistory);
            
            console.log("Message saved! New history length:", existingHistory.length);
            debugLog("Message saved to localStorage:", messageEntry);
        } catch (e) {
            console.log("ERROR saving message:", e);
            debugLog("Error saving message to localStorage:", e);
        }
        console.log("=== saveMessageToLocalStorage END ===");
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
            }
            
            // Handle image messages specifically
            if (msg.message_type === "image") {
                displayImageMessage(msg);
                return;
            }            if (msg.role === "assistant" || msg.type === "dm") {
                // This is a DM message - always display it
                debugLog("Displaying DM message:", msg.content.substring(0, 50) + "...");
                
                // Check if content is already HTML formatted from server OR has color tags that need processing
                const hasHTMLFormatting = /<span class="(red|green|blue|yellow|purple|orange|pink|cyan|lime|teal|brown|silver|wood)">|<br\s*\/?>|<p\s*>/.test(msg.content);
                const hasColorTags = /\[(red|green|blue|yellow|purple|orange|pink|cyan|lime|teal|brown|silver|wood):[^\]]*\]/.test(msg.content);
                
                if (hasHTMLFormatting && !hasColorTags) {
                    // Content is already fully formatted as HTML, use it directly
                    addMessage(dmName, msg.content, false, true, true, true);
                } else {
                    // Process content through formatting to ensure proper display (handles color tags and text formatting)
                    const processedContent = Utils.processFormattedText(msg.content);
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
                const hasHTMLFormatting = /<span class="(red|green|blue|yellow|purple|orange|pink|cyan|lime|teal|brown|silver|wood)">|<br\s*\/?>|<p\s*>/.test(msg.content);
                const hasColorTags = /\[(red|green|blue|yellow|purple|orange|pink|cyan|lime|teal|brown|silver|wood):[^\]]*\]/.test(msg.content);
                
                if (hasHTMLFormatting && !hasColorTags) {
                    // Content is already fully formatted as HTML, use it directly  
                    addMessage(senderName || `Player ${msg.player_number || 1}`, msg.content, false, true, true, true);
                } else {
                    // Process player messages through formatting as well (handles color tags and text formatting)
                    const processedContent = Utils.processFormattedText(msg.content);
                    addMessage(senderName || `Player ${msg.player_number || 1}`, processedContent, false, true, true, true);
                }
            } else if (msg.role === "system" || msg.type === "system") {
                // Only show system messages that aren't marked as invisible
                if (!msg.invisible) {
                    addSystemMessage(msg.content, true, true);
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
            if (msg.type === 'system') {
                addSystemMessage(msg.content, true, true); // fromUpdate = true, skipHistory = true
            } else if (msg.type === 'dm') {
                // Use the HTML content if available, otherwise fall back to plain text
                const content = msg.contentHTML || msg.content;
                addMessage(dmName, content, false, true, true, true); // Added parameter to indicate HTML content
            } else { // player message
                // Use the HTML content if available, otherwise fall back to plain text
                const content = msg.contentHTML || msg.content;
                addMessage(msg.sender, content, false, true, true, true); // Added parameter to indicate HTML content
            }
        });
        
        chatWindow.scrollTop = chatWindow.scrollHeight;
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
        chatWindow.scrollTop = chatWindow.scrollHeight;
        
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
        chatWindow.scrollTop = chatWindow.scrollHeight;
        
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
        
        fetch('/chat', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                message: userMessage,
                game_id: currentGameId,
                player_number: playerNumber,
                player_names: playerContext
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
        chatWindow.scrollTop = chatWindow.scrollHeight;
        
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
                const oldCursor = responseTextElem.querySelector('.cursor');
                if (oldCursor) oldCursor.remove();
                
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
                }, 30000);

                debugLog("Received message chunk for messageId:", messageId, "Data:", event.data.substring(0, 50) + "...");
                const data = JSON.parse(event.data);
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
                    
                    chatWindow.scrollTop = chatWindow.scrollHeight;
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
                    // when the DM includes [IMAGE: description] tags in responses                    // Save the completed DM response to localStorage
                    const processedResponse = Utils.processFormattedText(fullResponseText);
                    
                    // Remove [IMAGE: ...] tags from the displayed/saved content
                    const cleanedContent = processedResponse.replace(/\[IMAGE:\s*[^\]]+\]/gi, '').replace(/\s+/g, ' ').trim();
                    
                    // Save DM message directly to localStorage
                    const dmMessage = {
                        role: "assistant",
                        type: "dm", 
                        content: cleanedContent,
                        timestamp: Date.now(),
                        sender: dmName
                    };
                      console.log("About to save DM message:", dmMessage);
                    saveMessageToLocalStorage(dmMessage);
                    console.log("DM message save completed");
                    
                    // Check if this response contains image generation requests
                    const hasImageRequest = /\[IMAGE:\s*([^\]]+)\]/i.test(fullResponseText);
                    if (hasImageRequest) {
                        console.log("DM response contains image request, will check for images after longer delay");
                        // Wait longer for image generation to complete
                        setTimeout(() => {
                            console.log("Checking for image messages after DM with image request...");
                            checkForImageMessages();
                        }, 3000); // 3 seconds for image generation
                    } else {
                        // Check for new image messages after the response is complete
                        // Images are generated asynchronously on the server
                        setTimeout(() => {
                            checkForImageMessages();
                        }, 1000); // Give server time to generate images
                    }
                    
                    console.log("=== END SAVING DM MESSAGE ===");
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
                
                // Skip empty messages
                if (!contentText && !contentHTML) {
                    debugLog("Skipping empty message:", msg.outerHTML.substring(0, 100));
                    return null;
                }
                
                // Skip pure loading indicators (typing with no actual content)
                if (msg.querySelector('.typing') && contentEl.querySelector('.cursor') && !contentText.replace(/\s/g, '')) {
                    debugLog("Skipping pure loading indicator:", msg.outerHTML.substring(0, 100));
                    return null;
                }

                const isSystem = msg.classList.contains('system-message');
                // Determine if DM by checking sender text against current dmName or if it's a DM loading message
                const isDM = senderText === dmName || (msg.classList.contains('dm-message') && senderText === "DM");

                // Store the timestamp to help with identifying message sequences
                const timestamp = new Date().getTime();

                return {
                    sender: senderText,
                    content: contentText,
                    contentHTML: contentHTML,
                    type: isSystem ? 'system' : (isDM ? 'dm' : 'player'),
                    timestamp: timestamp
                };
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
        debugLog(`Chat state saved. Messages in this state: ${messages.length}. Last saved messages:`, messages.map(m => `${m.sender}: ${m.content.substring(0,20)}`));
    } catch (e) {
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
                lastUndoneMessage = lastUserMessage.content;
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
            selectPlayer(player1Container, 1);
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
    }    // Initial setup - clean and clear flow
    if (currentGameId) {
        debugLog("Restoring session:", currentGameId);
        initialize();
        loadAvailableModels(); // Load models after initialization
        loadAvailableImageModels(); // Load image models after initialization
    } else {
        debugLog("No previous gameId. Setting up for a new game implicitly.");
        
        // CRITICAL: Load player names even for new games
        const loadedState = Utils.loadPlayerState();
        if (loadedState && loadedState.names) {
            playerNames = loadedState.names;
            debugLog("Restored player names for new game:", playerNames);
        }
        
        messageHistory = [];
        historyIndex = -1;
        localStorage.removeItem('chatHistory');
        chatWindow.innerHTML = '';
        addMessage("DM", "Hello adventurer! Let's begin your quest. What is your name?", false, false, false);
        
        // Set up PlayerManager with loaded names
        PlayerManager.setup({
            playerNames: playerNames,
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
          nextPlayerNumber = PlayerManager.ensurePlayersExist(player1Container, sendMessage);
        updatePlayerLabels(); // Apply saved names to UI
        updateUndoRedoButtons();
        loadAvailableModels(); // Load models for new games too
        loadAvailableImageModels(); // Load image models for new games too
    }    window.sendMessage = sendMessage;

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

    // Initialize mobile fixes
    initMobileFixes();

    // Initialize the application
    initialize();
    
    // Load available models on page load
    loadAvailableModels();
    loadAvailableImageModels();

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
