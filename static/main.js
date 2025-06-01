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
    }
    
    // Fix the removePlayerBtn click handler
    if (removePlayerBtn) {
        removePlayerBtn.addEventListener('click', function() {
            debugLog("Remove player button clicked, currentSelection=", selectedPlayerNum);
            
            if (selectedPlayerNum && selectedPlayerNum > 1) {
                // Use the local removePlayer function
                removePlayer(selectedPlayerNum);
            } else {
                debugLog("No player selected or attempting to remove Player 1");
                addSystemMessage("Please select a player other than Player 1 to remove", false, false, true);
            }
        });
    }

    function removePlayer(playerNumber) {
        if (!playerNumber || playerNumber <= 1) {
            debugLog("Cannot remove Player 1");
            return; // Can't remove Player 1
        }
        
        debugLog(`Removing Player ${playerNumber}`);
        const oldName = playerNames[playerNumber] || `Player ${playerNumber}`;
        
        // Deselect if the removed player was selected
        if (selectedPlayerNum === playerNumber) {
            if (selectedPlayerElement) {
                selectedPlayerElement.classList.remove('selected');
            }
            selectedPlayerNum = null;
            selectedPlayerElement = null;
            removePlayerBtn.classList.add('hidden');
        }

        // Remove player from data structures
        delete playerNames[playerNumber];
        savePlayerNames();
        savePlayerState();
        
        // Remove player UI
        const playerContainer = document.getElementById(`player${playerNumber}-container`);
        if (playerContainer) {
            playerContainer.remove();
        }
        
        // Add system message about player leaving
        addSystemMessage(`${oldName} (Player ${playerNumber}) has left the game.`, false, false, true);
        
        // Notify DM
        if (currentGameId) {
            const loadingId = `dm-player-left-${Date.now()}`;
            const textId = `response-text-player-left-${Date.now()}`;
            const loadingDiv = createLoadingDivForDM(loadingId, textId);
            isGenerating = true;
            fetch('/chat', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    message: `${oldName} (Player ${playerNumber}) has left the game. Please continue the story without them.`,
                    game_id: currentGameId,
                    player_number: 'system',
                    is_system: true
                })
            })
            .then(response => response.json())
            .then(data => {
                if (data && data.message_id) sendStreamRequest(data.message_id, loadingDiv);
                else isGenerating = false;
            }).catch(error => {
                debugLog(`Error notifying DM about player ${playerNumber} leaving:`, error);
                if (loadingDiv && loadingDiv.parentNode) loadingDiv.remove();
                isGenerating = false;
            });
        }
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

        // Load chat history for the current game
        fetch('/load_history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ game_id: currentGameId })
        })
        .then(response => response.json())
        .then(data => {
            if (data.history && data.history.length > 0) {
                displayMessages(data.history);
            } else {
                ensureWelcomeMessage();
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
            
            syncPlayerNamesWithServer();
        })
        .catch(error => {
            debugLog("Error loading chat history:", error);
            ensureWelcomeMessage();
            initializeHistory();
            
            // Even on error, set up PlayerManager with our loaded names
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
            updatePlayerLabels();
            updateUndoRedoButtons();
            syncPlayerNamesWithServer();
        });
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

    // --- Chat message handling functions ---
    function displayMessages(messages) {
        if (!Array.isArray(messages)) {
            debugLog("Invalid messages array:", messages);
            return;
        }
        chatWindow.innerHTML = '';
        messages.forEach(msg => {
            if (msg.role === "assistant" || msg.type === "dm") {
                addMessage(dmName, msg.content, false, true, true, true);
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
                addMessage(senderName || `Player ${msg.player_number || 1}`, msg.content, false, true, true);
            } else if (msg.role === "system" || msg.type === "system") {
                addSystemMessage(msg.content, true, true);
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
            // Process formatted content with spell tags
            const formattedText = Utils.processFormattedText(text);
            contentSpan.innerHTML = formattedText; // Use innerHTML to render HTML tags
        }
        
        msgDiv.appendChild(contentSpan);
        
        chatWindow.appendChild(msgDiv);
        chatWindow.scrollTop = chatWindow.scrollHeight;
        
        if (!skipHistory) {
            setTimeout(saveChatState, 0);
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
        eventSourceUrl.searchParams.append('t', Date.now()); // Cache buster
        eventSourceUrl.searchParams.append('game_id', currentGameId || '');
        eventSourceUrl.searchParams.append('message_id', messageId || '');
        
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
                    
                    // Append text content
                    const currentHTML = responseTextElem.innerHTML || '';
                    const cursorHTML = '<span class="cursor"></span>';
                    const cursorRemoved = currentHTML.replace(cursorHTML, '');
                    
                    // Process the new content chunk with formatting
                    const processedContent = Utils.processFormattedText(formattedContent);
                    
                    // Update with formatted content and add cursor back
                    responseTextElem.innerHTML = cursorRemoved + processedContent + cursorHTML;
                    
                    fullResponseText += formattedContent;
                    
                    chatWindow.scrollTop = chatWindow.scrollHeight;
                }
            } catch (e) {
                debugLog("Error parsing event data:", e);
            }
        };
        
        eventSource.addEventListener('done', function(event) {
            debugLog("Stream complete for messageId:", messageId, "Event data:", event.data);
            clearTimeout(responseTimeout);
            
            const responseTextElem = loadingDiv.querySelector('[id^="response-text"]');
            if (responseTextElem) {
                const oldCursor = responseTextElem.querySelector('.cursor');
                if (oldCursor) oldCursor.remove();
                
                if (fullResponseText) {
                    PlayerManager.checkForPlayerNames(fullResponseText);
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
                if (!senderEl || !contentEl) return null;

                const senderText = senderEl.textContent.replace(':', '').trim();
                // Use innerHTML to preserve HTML formatting instead of textContent
                const contentHTML = contentEl.innerHTML.trim();
                const contentText = contentEl.textContent.trim();
                
                // Skip empty messages or malformed ones
                if (!contentText && !(msg.classList.contains('dm-message') && msg.querySelector('.typing'))) return null;

                const isSystem = msg.classList.contains('system-message');
                // Determine if DM by checking sender text against current dmName or if it's a DM loading message
                const isDM = senderText === dmName || (msg.classList.contains('dm-message') && senderText === "DM");


                return {
                    sender: senderText,
                    content: contentText,
                    contentHTML: contentHTML,
                    type: isSystem ? 'system' : (isDM ? 'dm' : 'player')
                };
            }).filter(msg => msg !== null); 

        if (messages.length === 0 && chatWindow.children.length > 0 && !Array.from(chatWindow.children).every(child => child.classList.contains('temporary-message') || child.querySelector('.typing'))) {
            debugLog("No valid messages to save, but chat window has non-transient children. This might be an issue. Current children:", chatWindow.innerHTML.substring(0,100));
            // return; // Potentially skip saving if it seems like an invalid state
        }
        
        // If historyIndex is behind the end of messageHistory, it means we undid and then performed a new action.
        // Truncate the "future" states that were undone.
        if (historyIndex < messageHistory.length - 1) {
            debugLog(`History divergence: historyIndex (${historyIndex}) < messageHistory.length - 1 (${messageHistory.length - 1}). Slicing history.`);
            messageHistory = messageHistory.slice(0, historyIndex + 1);
        }
        
        messageHistory.push(messages);
        historyIndex = messageHistory.length - 1; // Point to the newly added state
        
        if (messageHistory.length > MAX_HISTORY_SIZE) {
            messageHistory.shift();
            historyIndex--; // Adjust index because an element was removed from the beginning
        }
        
        try {
            localStorage.setItem('chatHistory', JSON.stringify(messageHistory)); 
        } catch (e) {
            debugLog("Error saving chatHistory to localStorage:", e);
        }
        updateUndoRedoButtons();
        debugLog(`Chat state saved. New history size: ${messageHistory.length}, New Index: ${historyIndex}. Last saved state:`, messages.map(m => m.content.substring(0,20)).join(" | "));
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
            const loadingId = `dm-undo-${Date.now()}`;
            const textId = `response-text-undo-${Date.now()}`;
            const loadingDiv = createLoadingDivForDM(loadingId, textId);
            debugLog("Setting isGenerating = true (undoChat)");
            isGenerating = true;
            fetch('/chat', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    message: "A previous action was undone. Please update the story accordingly.",
                    game_id: currentGameId,
                    player_number: 'system',
                    is_system: true
                })
            })
            .then(response => response.json())
            .then(data => {
                if (data && data.message_id) sendStreamRequest(data.message_id, loadingDiv); // isGenerating reset by sendStreamRequest
                else {
                    debugLog("Setting isGenerating = false (undoChat - no message_id)");
                    isGenerating = false; 
                }
            }).catch(() => {
                if (loadingDiv && loadingDiv.parentNode) loadingDiv.remove();
                debugLog("Setting isGenerating = false (undoChat - catch)");
                isGenerating = false;
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
            PlayerManager.addPlayer(sendMessage);
        });
    }
    
    // Fix the removePlayerBtn click handler
    if (removePlayerBtn) {
        removePlayerBtn.addEventListener('click', function() {
            debugLog("Remove player button clicked, currentSelection=", selectedPlayerNum);
            
            if (selectedPlayerNum && selectedPlayerNum > 1) {
                // Use the local removePlayer function
                removePlayer(selectedPlayerNum);
            } else {
                debugLog("No player selected or attempting to remove Player 1");
                addSystemMessage("Please select a player other than Player 1 to remove", false, false, true);
            }
        });
    }
    
    if (undoBtn) undoBtn.addEventListener('click', undoChat);
    if (redoBtn) redoBtn.addEventListener('click', redoChat);
    
    if (diceBtn) {
        diceBtn.addEventListener('click', function() {
            const p1Name = playerNames[1] || "Player 1";
            const diceCommandInput = { value: "/roll 1d20" };
            addMessage(p1Name, "rolls 1d20...");
            sendMessage(diceCommandInput, 1);
        });
    }
    
    if (copyChatBtn) {
        copyChatBtn.addEventListener('click', function() {
            let chatText = "";
            chatWindow.querySelectorAll('.message').forEach(msgDiv => {
                const sender = msgDiv.querySelector('.message-sender').textContent;
                const content = msgDiv.querySelector('.message-content').textContent;
                chatText += `${sender} ${content}\n`;
            });
            navigator.clipboard.writeText(chatText.trim())
                .then(() => addSystemMessage("Chat copied to clipboard!", false, true, true))
                .catch(err => addSystemMessage("Failed to copy chat.", false, true, true));
        });
    }
    
    if (menuToggleBtn && sideMenu) {
        menuToggleBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            sideMenu.classList.toggle('open');
            // Add/remove menu-open class to the toggle button itself
            menuToggleBtn.classList.toggle('menu-open', sideMenu.classList.contains('open'));
            const icon = menuToggleBtn.querySelector('i');
            if (icon) {
                if (sideMenu.classList.contains('open')) {
                    icon.classList.remove('fa-bars');
                    icon.classList.add('fa-times');
                } else {
                    icon.classList.remove('fa-times');
                    icon.classList.add('fa-bars');
                }
            }
        });
        
        // Only close menu when clicking outside of it AND not when selecting a player
        document.addEventListener('click', function(e) {
            // Skip closing the sidebar if the click was for player selection
            if (e.target.closest('.player-input')) {
                return;
            }
            
            // Skip closing the sidebar if the click was for a sidebar button
            if (e.target.closest('.side-menu-btn')) {
                return;
            }
            
            // Otherwise, close the sidebar when clicking outside
            if (sideMenu.classList.contains('open') && 
                !sideMenu.contains(e.target) && 
                e.target !== menuToggleBtn &&
                !menuToggleBtn.contains(e.target)) {
                sideMenu.classList.remove('open');
                menuToggleBtn.classList.remove('menu-open');
                const icon = menuToggleBtn.querySelector('i');
                if (icon) {
                    icon.classList.remove('fa-times');
                    icon.classList.add('fa-bars');
                }
            }
        });
    }

    // Add the missing updatePlayerLabels function
    function updatePlayerLabels() {
        debugLog("updatePlayerLabels called with playerNames:", playerNames);
        
        // Update Player 1 label
        const p1Label = document.getElementById('player1-label');
        if (p1Label) {
            if (playerNames[1]) {
                p1Label.textContent = `${playerNames[1]}:`;
                debugLog(`Set Player 1 label to: ${playerNames[1]}:`);
            } else {
                p1Label.textContent = 'Player 1:';
                debugLog("Set Player 1 label to default: Player 1:");
            }
        }
        
        // Update additional player labels
        Object.entries(playerNames).forEach(([num, name]) => {
            if (num !== '1' && name) {
                const playerLabel = document.getElementById(`player${num}-label`);
                if (playerLabel) {
                    playerLabel.textContent = `${name}:`;
                    debugLog(`Set Player ${num} label to: ${name}:`);
                }
            }
        });
    }

    // Initial setup - clean and clear flow
    if (currentGameId) {
        debugLog("Restoring session:", currentGameId);
        initialize();
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
    }

    window.sendMessage = sendMessage;

    debugLog("=== TOP-LEVEL DOMCONTENTLOADED FINISHED ===");
});

// IMPORTANT: REMOVE ANY FUNCTIONS DEFINED OUTSIDE THE DOM CONTENT LOADED EVENT
// The selectPlayer and removePlayer functions were incorrectly defined here earlier
