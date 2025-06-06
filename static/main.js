document.addEventListener('DOMContentLoaded', function() {
    // Debug setup
    const DEBUG = true;
    function debugLog(...args) {
        if (DEBUG) console.log(...args);
    }
    
    debugLog("=== TOP-LEVEL DOMCONTENTLOADED STARTED ===");
    
    // Core variables
    let isGenerating = false;
    let seenMessages = new Set();
    let dmName = "DM";
    window.dmName = dmName; // Make dmName globally accessible 
    let isMultiplayerActive = false;
    let lastSentMessage = "";
    let selectedPlayerElement = null;
    let selectedPlayerNum = null;
    
    // Add tracking for last undone message
    let lastUndoneMessage = null;
    let lastUndonePlayerNumber = 1;
    
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

    // AI Models functionality - Fix model persistence
    let availableModels = [];
    // Load selected model from localStorage first, then fall back to default
    let selectedModel = localStorage.getItem('selectedModel') || 'venice-uncensored';

    function loadAvailableModels() {
        fetch('/get_models')
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.models && Array.isArray(data.models)) {
                availableModels = data.models;
                populateModelList();
                updateCurrentModelDisplay();
                
                // IMPORTANT: Set the model on the server after loading models
                // This ensures the server knows which model to use on page refresh
                setServerModel(selectedModel);
            } else {
                throw new Error('Invalid models data received');
            }
        })
        .catch(error => {
            debugLog("Error loading models:", error);
            // Fallback to default model
            availableModels = [{
                id: 'venice-uncensored',
                name: 'Venice Uncensored (Default)',
                description: 'Default fallback model',
                traits: [],
                supportsFunctionCalling: false,
                supportsParallelToolCalls: false
            }];
            populateModelList();
            updateCurrentModelDisplay();
            addSystemMessage("Using default AI model (models list unavailable).", false, false, true);
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
        if (!modelList) {
            debugLog("Model list element not found");
            return;
        }
        
        modelList.innerHTML = '';
        
        if (!availableModels || availableModels.length === 0) {
            modelList.innerHTML = '<div class="model-item">No models available</div>';
            return;
        }
        
        availableModels.forEach(model => {
            const modelItem = document.createElement('div');
            modelItem.className = 'model-item';
            if (model.id === selectedModel) {
                modelItem.classList.add('selected');
            }
            
            const traits = (model.traits || []).map(trait => {
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
                <div class="model-name">${model.name || 'Unknown Model'}</div>
                <div class="model-description">${model.description || 'No description available'}</div>
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

    // Initialize the PlayerManager module
    const playerResult = PlayerManager.setup({
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
    
    // Set the nextPlayerNumber from the PlayerManager result
    let nextPlayerNumber = playerResult.nextPlayerNumber;
    playerNames = playerResult.playerNames;

    // Listen for player events
    window.addEventListener('player-generation-started', function() {
        isGenerating = true;
    });
    
    window.addEventListener('player-generation-complete', function() {
        isGenerating = false;
    });
    
    window.addEventListener('player-roll-dice', function(e) {
        const { playerNumber, playerName } = e.detail;
        addMessage(playerName, "rolls 1d20...");
        const diceCommandInput = { value: "/roll 1d20" };
        sendMessage(diceCommandInput, playerNumber);
    });

    // ==============================================
    // PLAYER SELECTION AND REMOVAL FUNCTIONS 
    // ==============================================
    
    function selectPlayer(playerElement, playerNum) {
        debugLog(`selectPlayer called for playerNum: ${playerNum}, element:`, playerElement);
        
        if (!playerElement) {
            debugLog("ERROR: playerElement is null or undefined");
            return;
        }
        
        // Add visual feedback immediately
        playerElement.style.outline = "2px solid #ff79c6";
        setTimeout(() => {
            playerElement.style.outline = "";
        }, 150);
        
        // First, remove selection from previously selected player
        if (selectedPlayerElement) {
            selectedPlayerElement.classList.remove('selected');
        }
        
        // If clicking the same player that's already selected, toggle it off
        if (selectedPlayerElement === playerElement) {
            debugLog(`Deselecting player ${playerNum}`);
            selectedPlayerElement = null;
            selectedPlayerNum = null;
            removePlayerBtn.classList.add('hidden');
        } else {
            // Select new player
            debugLog(`Selecting player ${playerNum}`);
            selectedPlayerElement = playerElement;
            selectedPlayerNum = playerNum;
            selectedPlayerElement.classList.add('selected');
            
            // Only show remove button for players other than Player 1
            if (playerNum > 1) {
                removePlayerBtn.classList.remove('hidden');
            } else {
                removePlayerBtn.classList.add('hidden');
            }
        }
        
        debugLog(`Selection complete. selectedPlayerNum: ${selectedPlayerNum}, selectedPlayerElement:`, selectedPlayerElement);
    }
    
    // Expose the selectPlayer function globally for PlayerManager
    window.updatePlayerSelection = function(element, num) {
        selectedPlayerElement = element;
        selectedPlayerNum = num;
    };
    
    // Fix the removePlayerBtn click handler
    if (removePlayerBtn) {
        removePlayerBtn.addEventListener('click', function() {
            debugLog("Remove player button clicked");
            debugLog("Current selectedPlayerNum:", selectedPlayerNum);
            debugLog("Current selectedPlayerElement:", selectedPlayerElement);
            debugLog("PlayerNames:", playerNames);
            
            if (selectedPlayerNum && selectedPlayerNum > 1) {
                debugLog(`Attempting to remove Player ${selectedPlayerNum}`);
                // Use PlayerManager.removePlayer instead of local function
                const removedName = PlayerManager.removePlayer(selectedPlayerNum);
                
                // Update local playerNames object after removal
                delete playerNames[selectedPlayerNum];
                savePlayerNames();
                savePlayerState();
                
                // Reset local selection state after removal
                selectedPlayerElement = null;
                selectedPlayerNum = null;
                removePlayerBtn.classList.add('hidden');
                
                // Update nextPlayerNumber - don't increment, just find next available
                const playerNumbers = Object.keys(playerNames).map(Number);
                nextPlayerNumber = playerNumbers.length > 0 ? Math.max(...playerNumbers) + 1 : 2;
                
                debugLog(`Successfully removed player. Remaining players:`, playerNames);
                debugLog(`Next available player number: ${nextPlayerNumber}`);
            } else {
                debugLog("Invalid removal attempt - selectedPlayerNum:", selectedPlayerNum);
                addSystemMessage("Please select a player other than Player 1 to remove", false, false, true);
            }
        });
    }

    // --- Functions for initializing and saving state ---
    
    function createNewGame() {
        debugLog("Creating new game...");
        fetch('/new_game', { method: 'POST' })
        .then(response => response.json())
        .then(data => {
            if (data.success && data.game_id) {
                currentGameId = data.game_id;
                localStorage.setItem('currentGameId', currentGameId);
                chatWindow.innerHTML = ''; // Clear chat window
                playerNames = { 1: null }; // Reset player names
                nextPlayerNumber = 2;
                dmName = "DM"; // Reset DM name
                window.dmName = dmName; // Keep global reference in sync
                savePlayerNames();
                savePlayerState(); // Save reset state
                
                // Clear and reset history for the new game
                messageHistory = [];
                historyIndex = -1;
                localStorage.removeItem('chatHistory'); // Remove old history from storage

                // Directly add the welcome message for a new game
                // skipHistory = false so it becomes the first state in the new history
                addMessage("DM", "Hello adventurer! Let's begin your quest. What is your name?", false, false, false); 
                
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
            } else {
                addSystemMessage("Error starting new game.", false, false, true);
            }
        })
        .catch(error => {
            debugLog("Error creating new game:", error);
            addSystemMessage("Error connecting to server to start new game.", false, false, true);
        });
    }

    function ensureWelcomeMessage() {
        if (chatWindow.children.length === 0) {
            addMessage("DM", "Hello adventurer! Let's begin your quest. What is your name?", false, false, true);
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

    // Add a debug function to inspect localStorage data - MOVE THIS OUTSIDE initialize()
    function debugLocalStorage() {
        debugLog("=== LOCALSTORAGE DEBUG ===");
        const gameId = currentGameId;
        if (!gameId) {
            debugLog("No current game ID");
            return;
        }
        
        const localHistory = Utils.loadChatHistoryFromLocal(gameId);
        if (!localHistory) {
            debugLog("No chat history found in localStorage");
            return;
        }
        
        debugLog("Chat history from localStorage:", localHistory.length, "messages");
        localHistory.forEach((msg, i) => {
            debugLog(`Message ${i}:`, {
                role: msg.role,
                type: msg.type,
                sender: msg.sender,
                contentLength: msg.content ? msg.content.length : 0,
                hasContentHTML: !!(msg.contentHTML && msg.contentHTML.trim()),
                invisible: msg.invisible
            });
        });    }

    /**
     * Send context refresh to server after page refresh
     * This ensures the DM gets the full conversation context
     */    function sendContextRefreshToServer(chatHistory) {
        debugLog("🔄 === SENDING CONTEXT REFRESH TO SERVER ===");
        debugLog("🔄 Chat history length:", chatHistory.length);
        debugLog("🔄 Current game ID:", currentGameId);
        debugLog("🔄 Selected model:", selectedModel);
        
        if (!currentGameId || !chatHistory || chatHistory.length === 0) {
            debugLog("❌ No context to refresh - skipping");
            return;
        }
        
        // Log first few messages for debugging
        debugLog("🔄 First few messages in chat history:");
        chatHistory.slice(0, 3).forEach((msg, i) => {
            debugLog(`  ${i}: role=${msg.role}, type=${msg.type}, sender=${msg.sender}, content=${msg.content?.substring(0, 50)}...`);
        });
          // Create a hidden system message to the DM with context
        const contextMessage = `[Context Refresh] The conversation history has been restored. There are ${chatHistory.length} messages in the conversation. Please continue the story naturally based on the previous context.`;
        
        debugLog("🔄 Context refresh message:", contextMessage);
        debugLog("🔄 Will send refresh message with chat history length:", chatHistory.length);
        
        fetch('/chat', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                message: contextMessage,
                game_id: currentGameId,
                player_number: 'system',
                is_system: true,
                invisible_to_players: true // This message is invisible to players
            })
        })        .then(response => response.json())
        .then(data => {
            if (data && data.message_id) {
                debugLog("🔄 Context refresh sent to server successfully, message_id:", data.message_id);
                // Store the context refresh message for the next stream request
                const contextRefreshMsg = {
                    role: 'system',
                    type: 'system',
                    sender: 'SYSTEM',
                    content: contextMessage,
                    player_number: 'system',
                    timestamp: Date.now(),
                    invisible: true,
                    is_system: true
                };
                window.__contextRefreshMessage = contextRefreshMsg;
                
                // Don't create a separate EventSource here - let the normal flow handle it
                debugLog("🔄 Context refresh message stored for next stream request");
            } else {
                debugLog("❌ Context refresh failed - no message_id in response:", data);
            }
        })
        .catch(error => {
            debugLog("❌ Error sending context refresh:", error);
        });
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
        
        // Restore DM name if saved - CRITICAL: Do this BEFORE loading chat history
        if (loadedState && loadedState.dmName) {
            dmName = loadedState.dmName;
            window.dmName = dmName; // Keep global reference in sync
            debugLog("Restored DM name:", dmName);
        }
        
        // CRITICAL: Set up PlayerManager BEFORE loading chat history
        const playerResult = PlayerManager.setup({
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
        
        // Update our variables with PlayerManager results but preserve our loaded names
        nextPlayerNumber = playerResult.nextPlayerNumber;
        
        // Create UI for all existing players using our loaded names
        nextPlayerNumber = PlayerManager.ensurePlayersExist(player1Container, sendMessage);
        
        // ALWAYS update labels after everything is set up
        updatePlayerLabels();
          // Load chat history from localStorage AFTER PlayerManager is set up
        debugLog("Loading chat history from localStorage for game:", currentGameId);
        const localHistory = Utils.loadChatHistoryFromLocal(currentGameId);
        if (localHistory && localHistory.length > 0) {
            debugLog("Restored chat history from localStorage:", localHistory.length, "messages");
            
            // ADD DEBUG CALL HERE - NOW IT'S ACCESSIBLE
            debugLocalStorage();
            
            // Use setTimeout to ensure DOM is fully ready before displaying messages
            setTimeout(() => {
                debugLog("=== ABOUT TO CALL displayMessages ===");
                displayMessages(localHistory);
                debugLog("=== displayMessages COMPLETED ===");
                // Initialize history after displaying messages
                initializeHistory();
                updateUndoRedoButtons();
                  // CRITICAL: Send context refresh to server after page refresh
                // This ensures the DM gets the full conversation context
                if (localHistory.length > 0) { // Changed from > 1 to > 0 to catch single message cases
                    debugLog("🔄 Sending context refresh - history length:", localHistory.length);
                    sendContextRefreshToServer(localHistory);
                } else {
                    debugLog("❌ No context refresh needed - empty history");
                }
            }, 100);
        } else {
            debugLog("No history found in localStorage, showing welcome message");
            ensureWelcomeMessage();
            initializeHistory();
            updateUndoRedoButtons();
        }
        
        syncPlayerNamesWithServer();
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
    }    // --- Chat message handling functions ---
    function displayMessages(messages) {
        if (!Array.isArray(messages)) {
            debugLog("Invalid messages array:", messages);
            return;
        }
        
        debugLog("=== DISPLAY MESSAGES DEBUG ===");
        debugLog("Total messages to display:", messages.length);
        debugLog("Current dmName:", dmName);
        chatWindow.innerHTML = '';
        
        messages.forEach((msg, index) => {
            debugLog(`\n--- Message ${index} ---`);
            debugLog("Full message object:", msg);
            debugLog("msg.role:", msg.role);
            debugLog("msg.type:", msg.type);
            debugLog("msg.sender:", msg.sender);
            debugLog("msg.content:", msg.content ? msg.content.substring(0, 100) + "..." : "NO CONTENT");
            debugLog("msg.contentHTML:", msg.contentHTML ? msg.contentHTML.substring(0, 100) + "..." : "NO HTML CONTENT");
            
            // Skip invisible messages - don't show them in chat
            if (msg.invisible) {
                debugLog("SKIPPING: Message is invisible");
                return;
            }
            
            // SIMPLIFIED LOGIC: Just check if it's a DM message by ANY means
            const isDMMessage = (
                msg.role === "assistant" || 
                msg.type === "dm" || 
                (msg.sender && (
                    msg.sender.toLowerCase() === "dm" ||
                    msg.sender.toLowerCase() === dmName.toLowerCase() ||
                    msg.sender === dmName
                ))
            );
            
            const isPlayerMessage = (
                msg.role === "user" || 
                msg.type === "player" ||
                (msg.sender && !isDMMessage && msg.sender !== "SYSTEM")
            );
            
            const isSystemMessage = (
                msg.role === "system" || 
                msg.type === "system" ||
                (msg.sender && msg.sender.toUpperCase() === "SYSTEM")
            );
            
            debugLog("Classification:", { isDMMessage, isPlayerMessage, isSystemMessage });
            
            if (isDMMessage) {
                const senderName = msg.sender || dmName || "DM";
                const content = (msg.contentHTML && msg.contentHTML.trim()) ? msg.contentHTML : (msg.content || '');
                
                debugLog("PROCESSING DM MESSAGE:");
                debugLog("- Sender name:", senderName);
                debugLog("- Content length:", content.length);
                debugLog("- Has contentHTML:", !!(msg.contentHTML && msg.contentHTML.trim()));
                
                if (content.trim()) {
                    const isHTML = !!(msg.contentHTML && msg.contentHTML.trim());
                    debugLog("- Adding DM message with isHTML:", isHTML);
                    addMessage(senderName, content, false, true, true, isHTML);
                } else {
                    debugLog("- SKIPPING DM MESSAGE: No content");
                }
            } else if (isPlayerMessage) {
                let senderName = msg.sender;
                
                // Try multiple ways to get the sender name
                if (!senderName) {
                    if (msg.player_number && playerNames[msg.player_number]) {
                        senderName = playerNames[msg.player_number];
                    } else if (msg.player_number) {
                        senderName = `Player ${msg.player_number}`;
                    } else if (msg.player) {
                        const playerNum = msg.player.replace('player','');
                        if (playerNames[playerNum]) {
                            senderName = playerNames[playerNum];
                        } else {
                            senderName = `Player ${playerNum}`;
                        }
                    }
                }
                
                const content = (msg.contentHTML && msg.contentHTML.trim()) ? msg.contentHTML : (msg.content || '');
                
                debugLog("PROCESSING PLAYER MESSAGE:");
                debugLog("- Sender name:", senderName);
                debugLog("- Content length:", content.length);
                
                if (content.trim() && senderName) {
                    const isHTML = !!(msg.contentHTML && msg.contentHTML.trim());
                    debugLog("- Adding player message");
                    addMessage(senderName, content, false, true, true, isHTML);
                } else {
                    debugLog("- SKIPPING PLAYER MESSAGE: No content or sender");
                }
            } else if (isSystemMessage) {
                if (!msg.invisible && msg.content && msg.content.trim()) {
                    debugLog("PROCESSING SYSTEM MESSAGE");
                    addSystemMessage(msg.content, true, true);
                } else {
                    debugLog("SKIPPING SYSTEM MESSAGE: Invisible or no content");
                }
            } else {
                debugLog("UNKNOWN MESSAGE TYPE - SKIPPING");
            }
        });
        
        chatWindow.scrollTop = chatWindow.scrollHeight;
        debugLog("=== DISPLAY MESSAGES COMPLETE ===");
        debugLog("Final chat window children count:", chatWindow.children.length);
        
        // DEBUG: Log what's actually in the chat window now
        const chatMessages = Array.from(chatWindow.children);
        debugLog("Messages now in chat window:");
        chatMessages.forEach((el, i) => {
            const sender = el.querySelector('.message-sender')?.textContent || 'NO SENDER';
            const content = el.querySelector('.message-content')?.textContent || 'NO CONTENT';
            debugLog(`  ${i}: ${sender} - ${content.substring(0, 50)}...`);
        });
    }
    
    function restoreChatState(index) {
        if (index < 0 || index >= messageHistory.length) {
            debugLog(`Invalid history index for restore: ${index}. History length: ${messageHistory.length}`);
            return;
        }
        const state = messageHistory[index];
        debugLog(`Restoring chat state from history index ${index}. State contains ${state.length} messages.`);
        chatWindow.innerHTML = '';
        state.forEach(msg => {
            if (msg.type === 'system') {
                addSystemMessage(msg.content, true, true); // fromUpdate=true, skipHistory=true
            } else if (msg.type === 'dm') {
                // COPY USER MESSAGE RESTORATION LOGIC - Handle DM messages same as player messages
                let content;
                let isHTML = false;
                
                if (msg.contentHTML && msg.contentHTML.trim()) {
                    content = msg.contentHTML;
                    isHTML = true;
                } else {
                    content = Utils.processFormattedText(msg.content);
                    isHTML = true; // processFormattedText returns HTML
                }
                
                // Use sender name if available, otherwise use dmName
                const senderName = msg.sender || dmName || "DM";
                addMessage(senderName, content, false, true, true, isHTML);
            } else {
                // Handle player messages
                let content;
                let isHTML = false;
                
                if (msg.contentHTML && msg.contentHTML.trim()) {
                    content = msg.contentHTML;
                    isHTML = true;
                } else {
                    content = Utils.processFormattedText(msg.content);
                    isHTML = true; // processFormattedText returns HTML
                }
                
                addMessage(msg.sender, content, false, true, true, isHTML);
            }
        });
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }

    function addMessage(sender, text, isTypewriter = false, fromUpdate = false, skipHistory = false, isHTML = false, saveImmediately = false) {
        // Ensure sender is valid
        if (!sender || sender.trim() === '') {
            sender = "Unknown";
            debugLog("Warning: Empty sender name, using 'Unknown'");
        }
        
        const role = (sender.toLowerCase() === dmName.toLowerCase() || sender.toLowerCase() === 'dm') ? 'assistant' : 'user';
        if (!fromUpdate && messageExists(role, text)) {
            debugLog("Skipping duplicate message:", text.substring(0, 20) + "...");
            return false;
        }
        
        lastPlayerMessages[sender] = text;
        debugLog("=== ADDMESSAGE DEBUG ===");
        debugLog("Adding message from", sender, ":", text.substring(0, 30) + (text.length > 30 ? "..." : ""));
        debugLog("fromUpdate:", fromUpdate, "skipHistory:", skipHistory, "isHTML:", isHTML);
        debugLog("dmName:", dmName);
        debugLog("isDMMessage will be:", (sender.toLowerCase() === dmName.toLowerCase() || sender.toLowerCase() === 'dm'));
        
        const msgDiv = document.createElement('div');
        const isDMMessage = (sender.toLowerCase() === dmName.toLowerCase() || sender.toLowerCase() === 'dm');
        msgDiv.className = `message ${isDMMessage ? 'dm-message' : 'player-message'}`;
        
        debugLog("Created msgDiv with className:", msgDiv.className);
        
        const nameSpan = document.createElement('span');
        nameSpan.textContent = `${sender}: `;
        nameSpan.className = 'message-sender';
        msgDiv.appendChild(nameSpan);
        
        const contentSpan = document.createElement('span');
        contentSpan.className = 'message-content';
        
        if (isHTML) {
            // If content is already HTML, use it directly
            contentSpan.innerHTML = text;
            debugLog("Set content as HTML:", text.substring(0, 50) + "...");
        } else {
            // Always process content through formatting - even if it appears to be plain text
            const formattedText = Utils.processFormattedText(text);
            contentSpan.innerHTML = formattedText; // Use innerHTML to render HTML tags
            debugLog("Processed and set content:", formattedText.substring(0, 50) + "...");
        }
        
        msgDiv.appendChild(contentSpan);
        
        // Ensure the message is actually added to the DOM
        if (chatWindow) {
            debugLog("About to append msgDiv to chatWindow");
            chatWindow.appendChild(msgDiv);
            chatWindow.scrollTop = chatWindow.scrollHeight;
            debugLog(`Message successfully added to DOM. Chat window now has ${chatWindow.children.length} children.`);
            debugLog("Message div HTML:", msgDiv.outerHTML.substring(0, 100) + "...");        } else {
            debugLog("ERROR: chatWindow not found when trying to add message!");
        }
        
        if (!skipHistory) {
            if (saveImmediately) {
                saveChatState();
            } else {
                setTimeout(saveChatState, 0);
            }
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
        }
        
        if (!skipHistory) {
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
            window.dmName = dmName; // Keep global reference in sync
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
        }        const sender = playerNames[playerNumber] || `Player ${playerNumber}`;
        addMessage(sender, userMessage, false, false, false, false, true); // saveImmediately = true
        
        // Note: saveChatState is now called immediately by addMessage, so no need to call it again here
        
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
        
        // ALWAYS attach chat history from localStorage (client-side) - CRITICAL FIX
        let chatHistory = Utils.loadChatHistoryFromLocal(currentGameId) || [];
        debugLog("=== CHAT HISTORY DEBUG (sendStreamRequest) ===");
        debugLog("Chat history length:", chatHistory.length);
        debugLog("Current game ID:", currentGameId);
        
        // If a context refresh message was just sent, include it in the history
        if (window.__contextRefreshMessage) {
            chatHistory = [...chatHistory, window.__contextRefreshMessage];
            window.__contextRefreshMessage = null;
            debugLog("Added context refresh message to history for this request");
        }
        
        // ALWAYS try to attach chat history, even if empty
        try {
            const chatHistoryJson = JSON.stringify(chatHistory);
            const chatHistoryB64 = btoa(chatHistoryJson);
            eventSourceUrl.searchParams.append('chat_history', chatHistoryB64);
            debugLog("Successfully encoded and attached chat history to request - length:", chatHistory.length);
            
            if (chatHistory.length > 0) {
                debugLog("Last 3 messages in chat history:");
                chatHistory.slice(-3).forEach((msg, i) => {
                    debugLog(`  ${chatHistory.length - 3 + i}: role=${msg.role}, type=${msg.type}, sender=${msg.sender}, content=${msg.content?.substring(0, 50)}...`);
                });
            }
        } catch (error) {
            debugLog("Error encoding chat history:", error);
            // Still attach empty history parameter so server knows we tried
            eventSourceUrl.searchParams.append('chat_history', btoa('[]'));
        }

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
                    
                    // If we're generating reasoning but it's not complete, show "Thinking..." with caret
                    if (isGeneratingReasoning && !hasCompleteReasoning && !processedFullContent.trim()) {
                        const cursorHTML = '<span class="cursor"></span>';
                        responseTextElem.innerHTML = '<em style="color: #6272a4; font-style: italic;">🤔 Thinking...</em>' + cursorHTML;
                    } else {
                        // Update with fully formatted content and add cursor back
                        const cursorHTML = '<span class="cursor"></span>';
                        responseTextElem.innerHTML = processedFullContent + cursorHTML;
                    }
                    
                    chatWindow.scrollTop = chatWindow.scrollHeight;
                }
            } catch (e) {
                debugLog("Error parsing event data:", e);
            }
        };
        
        eventSource.addEventListener('done', function(event) {
            debugLog("=== STREAM DONE EVENT ===");
            debugLog("Stream complete for messageId:", messageId, "Event data:", event.data);
            debugLog("Full response text accumulated:", fullResponseText.substring(0, 100) + "...");
            clearTimeout(responseTimeout);
            
            const responseTextElem = loadingDiv.querySelector('[id^="response-text"]');
            if (responseTextElem) {
                const oldCursor = responseTextElem.querySelector('.cursor');
                if (oldCursor) oldCursor.remove();
                
                // DEBUG: Check final content
                debugLog("Final responseTextElem content:", responseTextElem.textContent.substring(0, 100) + "...");
                debugLog("Final responseTextElem innerHTML:", responseTextElem.innerHTML.substring(0, 100) + "...");
                
                if (fullResponseText) {
                    PlayerManager.checkForPlayerNames(fullResponseText);
                }
            }
            
            eventSource.close();
            debugLog("Setting isGenerating = false (sendStreamRequest - done)");
            isGenerating = false;
            
            // DEBUG: Check chat window state before saving
            debugLog("=== BEFORE SAVING CHAT STATE ===");
            debugLog("Chat window children count:", chatWindow.children.length);
            const lastMessage = chatWindow.lastElementChild;
            if (lastMessage) {
                const sender = lastMessage.querySelector('.message-sender')?.textContent || 'NO SENDER';
                const content = lastMessage.querySelector('.message-content')?.textContent || 'NO CONTENT';
                debugLog("Last message in chat:", sender, "-", content.substring(0, 50) + "...");
                debugLog("Last message classes:", lastMessage.className);
            }
            
            saveChatState(); // Save chat state after DM response is fully received
            
            // DEBUG: Verify what was saved
            setTimeout(() => {
                debugLog("=== AFTER SAVING CHAT STATE ===");
                const savedHistory = Utils.loadChatHistoryFromLocal(currentGameId);
                if (savedHistory) {
                    debugLog("Saved history length:", savedHistory.length);
                    if (savedHistory.length > 0) {
                        const lastSaved = savedHistory[savedHistory.length - 1];
                        debugLog("Last saved message:", lastSaved.type, lastSaved.sender, lastSaved.content?.substring(0, 50) + "...");
                    }
                }
            }, 100);
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

    // --- Chat state management functions ---
    
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
        debugLog(`Saving chat state. Current historyIndex: ${historyIndex}, History length: ${messageHistory.length}`);
        const messages = Array.from(chatWindow.querySelectorAll('.message:not(.temporary-message)')) 
            .map(msgElement => {
                const senderEl = msgElement.querySelector('.message-sender');
                const contentEl = msgElement.querySelector('.message-content');
                
                if (!senderEl || !contentEl) return null;

                // Skip messages that are just cursors or empty
                const textContent = contentEl.textContent.trim();
                if (!textContent || textContent === '🤔 Thinking...') return null;

                const senderText = senderEl.textContent.replace(':', '').trim();
                const isSystem = msgElement.classList.contains('system-message');
                
                // FIX: More robust DM message detection for saving
                const isDM = msgElement.classList.contains('dm-message') || 
                             senderText.toLowerCase() === dmName.toLowerCase() || 
                             senderText.toLowerCase() === 'dm';

                // DEBUG: Log what we're detecting for each message
                debugLog(`Saving message: sender="${senderText}", isSystem=${isSystem}, isDM=${isDM}, classes="${msgElement.className}"`);

                return {
                    sender: senderText,
                    content: textContent,
                    contentHTML: contentEl.innerHTML.trim(),
                    type: isSystem ? 'system' : (isDM ? 'dm' : 'player')
                };
            }).filter(msg => msg !== null); 

        // DEBUG: Log what we're about to save
        debugLog("Messages being saved to localStorage:", messages);

        // Clear future history if we're at a point before the end
        if (historyIndex < messageHistory.length - 1) {
            messageHistory = messageHistory.slice(0, historyIndex + 1);
        }
        
        messageHistory.push(messages);
        historyIndex = messageHistory.length - 1;
        
        if (messageHistory.length > MAX_HISTORY_SIZE) {
            messageHistory.shift();
            historyIndex--;
        }

        try {
            localStorage.setItem('chatHistory', JSON.stringify(messageHistory)); 
        } catch (e) {
            debugLog("Error saving chatHistory to localStorage:", e);
        }
        
        // Save to game-specific localStorage backup with proper format
        if (currentGameId && messages.length > 0) {
            const chatMessages = messages.map(msg => {
                // Determine player number for user messages
                let playerNumber = null;
                if (msg.type === 'player') {
                    // Try to extract player number from sender name
                    const playerMatch = msg.sender.match(/Player (\d+)/);
                    if (playerMatch) {
                        playerNumber = parseInt(playerMatch[1]);
                    } else {
                        // Look up by name in playerNames
                        for (const [num, name] of Object.entries(playerNames)) {
                            if (name === msg.sender) {
                                playerNumber = parseInt(num);
                                break;
                            }
                        }
                    }
                }
                
                // FIX: Ensure DM messages get the correct role
                const messageData = {
                    role: msg.type === 'dm' ? 'assistant' : (msg.type === 'system' ? 'system' : 'user'),
                    type: msg.type,
                    sender: msg.sender,
                    content: msg.content,
                    contentHTML: msg.contentHTML,
                    player_number: playerNumber,
                    timestamp: Date.now()
                };
                
                // DEBUG: Log each message being saved to game-specific storage
                debugLog(`Saving to game storage: type=${messageData.type}, role=${messageData.role}, sender=${messageData.sender}`);
                
                return messageData;
            });
            
            Utils.saveChatHistoryToLocal(currentGameId, chatMessages);
            debugLog("Saved chat messages to localStorage:", chatMessages.length, "messages");
        }
        
        updateUndoRedoButtons();
    }
    
    function undoChat() {
        debugLog(`Undo requested. historyIndex: ${historyIndex}, isGenerating: ${isGenerating}`);
        if (historyIndex <= 0 || isGenerating) {
            if(isGenerating) addSystemMessage("Please wait for the current action to complete before undoing.",false,true,true);
            return;
        }
        
        // Store the last message from the current state before undoing
        // This will be used for the redo operation
        const currentState = messageHistory[historyIndex];
        if (currentState && currentState.length > 0) {
            // Find the last player message in the current state
            // We need to iterate backwards to find the most recent player message
            for (let i = currentState.length - 1; i >= 0; i--) {
                if (currentState[i].type === 'player') {
                    // Found a player message, save it
                    lastUndoneMessage = currentState[i].content;
                    
                    // Try to determine which player sent this message
                    const sender = currentState[i].sender;
                    // Look for player number in the name, e.g., "Player 2"
                    const playerMatch = sender.match(/Player (\d+)/i);
                    if (playerMatch && playerMatch[1]) {
                        lastUndonePlayerNumber = parseInt(playerMatch[1]);
                    } else {
                        // If no player number found, check our player names
                        for (const [num, name] of Object.entries(playerNames)) {
                            if (name === sender) {
                                lastUndonePlayerNumber = parseInt(num);
                                break;
                            }
                        }
                    }
                    
                    debugLog(`Stored last player message for redo: "${lastUndoneMessage}" from player ${lastUndonePlayerNumber}`);
                    break;
                }
            }
        }
        
        // Continue with regular undo operation
        historyIndex--;
        debugLog(`Undo: historyIndex changed to ${historyIndex}`);
        restoreChatState(historyIndex);
        updateUndoRedoButtons();
        
        if (currentGameId) {
            // Send invisible system message to DM about undo
            fetch('/chat', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    message: "A previous action was undone. Please update the story accordingly.",
                    game_id: currentGameId,
                    player_number: 'system',
                    is_system: true,
                    invisible_to_players: true // Make undo notifications invisible too
                })
            })
            .then(response => response.json())
            .then(data => {
                if (data && data.message_id) {
                    debugLog("Invisible undo notification sent to DM");
                }
            }).catch(() => {
                debugLog("Error sending invisible undo notification");
            });
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
        
        // Send the message
        sendMessage(tempInput, lastUndonePlayerNumber);
        
        // Clear the lastUndoneMessage since we've used it
        lastUndoneMessage = null;
        
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
            const addedPlayerNumber = PlayerManager.addPlayer(sendMessage);
            // Update our local nextPlayerNumber tracking
            const playerNumbers = Object.keys(playerNames).map(Number);
            nextPlayerNumber = Math.max(...playerNumbers) + 1;
            debugLog(`Player ${addedPlayerNumber} added. Next available number will be: ${nextPlayerNumber}`);
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
    }

    // Add missing updatePlayerLabels function
    function updatePlayerLabels() {
        debugLog("Updating player labels with current names:", playerNames);
        
        // Update Player 1 label
        const p1Label = document.getElementById('player1-label');
        if (p1Label && playerNames[1]) {
            p1Label.textContent = `${playerNames[1]}:`;
            debugLog(`Updated Player 1 label to: ${playerNames[1]}:`);
        } else if (p1Label) {
            p1Label.textContent = 'Player 1:';
        }
        
        // Update other player labels
        Object.entries(playerNames).forEach(([num, name]) => {
            if (num > 1 && name) {
                const label = document.getElementById(`player${num}-label`);
                if (label) {
                    label.textContent = `${name}:`;
                    debugLog(`Updated Player ${num} label to: ${name}:`);
                }
            }
        });
    }

    // Initial setup - clean and clear flow
    if (currentGameId) {
        debugLog("Restoring session:", currentGameId);
        // Add a small delay to ensure DOM is fully ready
        setTimeout(() => {
            initialize();
            loadAvailableModels(); // Load models after initialization
        }, 50);
    } else {
        debugLog("No previous gameId. Setting up for a new game implicitly.");
        
        // CRITICAL: Load player names even for new games
        const loadedState = Utils.loadPlayerState();
        if (loadedState && loadedState.names) {
            playerNames = loadedState.names;
            debugLog("Restored player names for new game:", playerNames);
        }
        
        // Restore DM name even for new games
        if (loadedState && loadedState.dmName) {
            dmName = loadedState.dmName;
            window.dmName = dmName;
            debugLog("Restored DM name for new game:", dmName);
        }
        
        // Clear any existing history
        messageHistory = [];
        historyIndex = -1;
        localStorage.removeItem('chatHistory');
        chatWindow.innerHTML = '';
        
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
        
        // Add welcome message and initialize history with delay to ensure DOM is ready
        setTimeout(() => {
            addMessage(dmName || "DM", "Hello adventurer! Let's begin your quest. What is your name?", false, false, false);
            initializeHistory();
            updateUndoRedoButtons();
        }, 50);
        
        loadAvailableModels(); // Load models for new games too
    }

    window.sendMessage = sendMessage;

    debugLog("=== TOP-LEVEL DOMCONTENTLOADED FINISHED ===");
});

// IMPORTANT: REMOVE ANY FUNCTIONS DEFINED OUTSIDE THE DOM CONTENT LOADED EVENT
// The selectPlayer and removePlayer functions were incorrectly defined here earlier

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
