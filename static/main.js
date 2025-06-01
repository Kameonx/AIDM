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
    
    // Add message history tracking for undo/redo
    let messageHistory = [];
    let historyIndex = -1;
    const MAX_HISTORY_SIZE = 50;
    
    // Session data - ensure we get from localStorage first
    let currentGameId = localStorage.getItem('currentGameId');
    debugLog("Initial gameId from localStorage:", currentGameId);
    
    // Player tracking - IMPORTANT: Use let instead of const to allow reassignment
    let playerNames = loadPlayerNames();
    debugLog("Loaded player names from localStorage:", playerNames);
    
    // Add nextPlayerNumber variable here (important!)
    let nextPlayerNumber = 2;
    
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

    // Initialize nextPlayerNumber based on loaded player names
    nextPlayerNumber = Object.keys(playerNames).length > 0 ? Math.max(...Object.keys(playerNames).map(Number)) + 1 : 2;


    // --- START: Placeholder/Basic Implementations for Missing Functions ---
    function extractName(message) {
        // Basic implementation: look for "My name is X" or "I am X"
        const namePatterns = [
            /my name is (\w+)/i,
            /i am (\w+)/i,
            /call me (\w+)/i
        ];
        for (const pattern of namePatterns) {
            const match = message.match(pattern);
            if (match && match[1]) {
                debugLog(`Extracted name: ${match[1]}`);
                return match[1];
            }
        }
        return null;
    }

    function savePlayerState() {
        // Saves current player names and next player number to localStorage
        const state = {
            names: playerNames,
            nextPlayerNumber: nextPlayerNumber,
            isMultiplayerActive: isMultiplayerActive, // Now uses global variable
            dmName: dmName // Now uses global variable
        };
        localStorage.setItem('playerState', JSON.stringify(state));
        debugLog("Player state saved:", state);
    }
    
    function initializeHistory() {
        // Placeholder: Load history from localStorage or start fresh
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
        const loadedState = loadPlayerState(); // Ensure this also loads playerNames
        
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
                ensureWelcomeMessage(); // Ensure welcome message if history is empty
            }
            initializeHistory(); // Initialize undo/redo history AFTER messages are loaded
            updateUndoRedoButtons();
        })
        .catch(error => {
            debugLog("Error loading chat history:", error);
            ensureWelcomeMessage();
            initializeHistory();
            updateUndoRedoButtons();
        });

        ensurePlayersExist(); // Recreate player inputs based on playerNames
        updateUndoRedoButtons();
    }

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

    function ensurePlayersExist() {
        debugLog("Ensuring players exist. Current names:", playerNames);
        // Clear existing dynamic player inputs first to avoid duplication
        additionalPlayersContainer.innerHTML = '';
        
        Object.keys(playerNames).sort((a,b) => parseInt(a) - parseInt(b)).forEach(numStr => {
            const num = parseInt(numStr);
            const name = playerNames[num];
            if (num === 1) { // Player 1
                const p1Label = document.getElementById('player1-label');
                if (p1Label) {
                    p1Label.textContent = name ? `${name}:` : `Player 1:`;
                }
            } else { // Additional players
                // Check if element already exists (it shouldn't due to clearing container)
                if (!document.getElementById(`player${num}-container`)) {
                    addPlayerUI(num, name);
                }
            }
        });
        // Update nextPlayerNumber based on loaded names
        const playerNumbers = Object.keys(playerNames).map(Number);
        if (playerNumbers.length > 0) {
            nextPlayerNumber = Math.max(...playerNumbers) + 1;
        } else {
            nextPlayerNumber = 2;
        }
    }
    
    function addPlayerUI(playerNum, playerName = null) {
        const playerContainer = document.createElement('div');
        playerContainer.className = 'player-input';
        playerContainer.id = `player${playerNum}-container`;
        playerContainer.addEventListener('click', () => selectPlayer(playerContainer, playerNum));

        const label = document.createElement('div');
        label.className = 'player-label';
        label.id = `player${playerNum}-label`;
        label.textContent = playerName ? `${playerName}:` : `Player ${playerNum}:`;
        playerContainer.appendChild(label);

        const input = document.createElement('input');
        input.type = 'text';
        input.id = `player${playerNum}-input`;
        input.placeholder = `Player ${playerNum}, type your message...`;
        input.className = 'player-input-field';
        input.autocomplete = 'off';
        input.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && !isGenerating) {
                e.preventDefault();
                sendMessage(input, playerNum);
            }
        });
        playerContainer.appendChild(input);

        const buttonsContainer = document.createElement('div');
        buttonsContainer.className = 'player-buttons-container';

        const sendPlayerBtn = document.createElement('button');
        sendPlayerBtn.id = `send-player${playerNum}-btn`;
        sendPlayerBtn.className = 'action-btn send-btn';
        sendPlayerBtn.title = 'Send message';
        sendPlayerBtn.innerHTML = '📤';
        sendPlayerBtn.type = 'button';
        sendPlayerBtn.addEventListener('click', function(e) {
            e.preventDefault();
            sendMessage(input, playerNum);
        });
        buttonsContainer.appendChild(sendPlayerBtn);

        const dicePlayerBtn = document.createElement('button');
        dicePlayerBtn.id = `dice-player${playerNum}-btn`;
        dicePlayerBtn.className = 'action-btn dice-btn';
        dicePlayerBtn.title = 'Roll a die';
        dicePlayerBtn.innerHTML = '🎲';
        dicePlayerBtn.type = 'button';
        // Add dice roll functionality here if needed for other players
        // dicePlayerBtn.addEventListener('click', () => rollDiceForPlayer(playerNum));
        buttonsContainer.appendChild(dicePlayerBtn);
        
        playerContainer.appendChild(buttonsContainer);
        additionalPlayersContainer.appendChild(playerContainer);
        return input; // Return the input element
    }

    function addPlayer() {
        debugLog("Adding new player UI for player number:", nextPlayerNumber);
        const newPlayerInput = addPlayerUI(nextPlayerNumber);
        playerNames[nextPlayerNumber] = null; // Add to playerNames map, initially unnamed
        savePlayerNames();
        savePlayerState(); // Save state including new nextPlayerNumber
        
        addSystemMessage(`Player ${nextPlayerNumber} has joined the game! What is your name, adventurer?`, false, false, true);
        
        // Notify DM about new player
        if (currentGameId) {
            const loadingId = `dm-player-join-${Date.now()}`;
            const textId = `response-text-player-join-${Date.now()}`;
            const loadingDiv = createLoadingDivForDM(loadingId, textId);
            debugLog("Setting isGenerating = true (addPlayer)");
            isGenerating = true;
            
            fetch('/chat', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    message: `Player ${nextPlayerNumber} has joined the game. Please welcome them.`,
                    game_id: currentGameId,
                    player_number: 'system', // System message
                    is_system: true
                })
            })
            .then(response => response.json())
            .then(data => {
                if (data && data.message_id) {
                    sendStreamRequest(data.message_id, loadingDiv); // isGenerating will be reset by sendStreamRequest
                } else {
                    debugLog("Setting isGenerating = false (addPlayer - no message_id)");
                    isGenerating = false; 
                }
            })
            .catch(error => {
                debugLog(`Error notifying DM about Player ${nextPlayerNumber} joining:`, error);
                if (loadingDiv && loadingDiv.parentNode) loadingDiv.remove();
                debugLog("Setting isGenerating = false (addPlayer - catch)");
                isGenerating = false;
            });
        }
        nextPlayerNumber++; // Increment for the next player
        if (newPlayerInput) newPlayerInput.focus();
    }
    // --- END: Placeholder/Basic Implementations ---

    // Functions for saving/loading player names from localStorage
    function savePlayerNames() {
        localStorage.setItem('playerNames', JSON.stringify(playerNames));
        debugLog("Player names saved:", playerNames);
    }
    
    function loadPlayerNames() {
        try {
            const saved = localStorage.getItem('playerNames');
            if (saved) {
                const loaded = JSON.parse(saved);
                // Ensure it's an object, not null or undefined
                return typeof loaded === 'object' && loaded !== null ? loaded : { 1: null };
            }
        } catch (e) {
            debugLog("Error loading player names:", e);
        }
        return { 1: null }; // Default for Player 1
    }
    
    // ADD MISSING FUNCTIONS
    function displayMessages(messages) {
        if (!Array.isArray(messages)) {
            debugLog("Invalid messages array:", messages);
            return;
        }
        chatWindow.innerHTML = ''; // Clear existing messages
        messages.forEach(msg => {
            if (msg.role === "assistant" || msg.type === "dm") {
                // Process the content with formatting tags
                addMessage(dmName, msg.content, false, true, true, true); // isHTML=true to preserve formatting
            } else if (msg.role === "user" || msg.type === "player") {
                // Extract player number or use sender name directly
                let senderName = msg.sender;
                if (!senderName && msg.player) {
                    senderName = playerNames[msg.player.replace('player','')] || msg.player;
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
            const formattedText = processFormattedText(text);
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

    // Enhanced processFormattedText function that handles all formatting cases
    function processFormattedText(text) {
        if (!text) return '';
        
        // Check if the text already contains proper HTML formatting
        if (/<span class="(fire|ice|lightning|poison|acid|radiant|necrotic|psychic|thunder|force)">/.test(text)) {
            return text; // Already formatted with HTML, return as is
        }
        
        // Escape HTML first to prevent XSS
        let processedText = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        
        // Process spell tags [type]...[/type]
        const spellTypes = ['fire', 'ice', 'lightning', 'poison', 'acid', 'radiant', 
                            'necrotic', 'psychic', 'thunder', 'force'];
        
        for (const type of spellTypes) {
            const regex = new RegExp(`\\[${type}\\](.*?)\\[\\/${type}\\]`, 'gi');
            processedText = processedText.replace(regex, `<span class="${type}">$1</span>`);
        }
        
        // Process emphasis tags from markdown format
        processedText = processedText
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')  // Bold
            .replace(/\*(.*?)\*/g, '<em>$1</em>');             // Italic
    
        return processedText;
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
    
    function loadPlayerState() {
        try {
            const saved = localStorage.getItem('playerState');
            if (saved) {
                const state = JSON.parse(saved);
                if (state.names) playerNames = state.names; 
                else playerNames = {1: null};
                nextPlayerNumber = state.nextPlayerNumber || Math.max(...Object.keys(playerNames).map(Number)) + 1 || 2;
                isMultiplayerActive = state.isMultiplayerActive || false;
                if (state.dmName) dmName = state.dmName;
                return state;
            }
        } catch (e) { 
            debugLog("Error loading player state:", e); 
        }
        playerNames = {1: null};
        nextPlayerNumber = 2;
        return { names: { 1: null }, nextPlayerNumber: 2, isMultiplayerActive: false, dmName: "DM" };
    }
    
    // Fixed sendMessage function with proper DM rename support
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
        
        // Only update THIS player's name if not set
        const extractedPlayerName = extractName(userMessage);
        if (extractedPlayerName && (!playerNames[playerNumber] || playerNames[playerNumber] === `Player ${playerNumber}`)) {
            updatePlayerLabel(playerNumber, extractedPlayerName);
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
    
    // Improved updatePlayerLabel function
    function updatePlayerLabel(playerNumber, name) {
        debugLog(`Updating Player ${playerNumber} label to ${name}`);
        
        const labelElement = document.getElementById(`player${playerNumber}-label`);
        if (labelElement) {
            labelElement.textContent = `${name}:`;
            playerNames[playerNumber] = name;
            savePlayerNames();
            savePlayerState(); // Save state including updated playerNames
            
            // Add system message about name change, but don't save to history again if called from addMessage
            addSystemMessage(`Player ${playerNumber} is now named ${name}.`, false, true, true); // skipHistory = true
        }
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
            if (responseTextElem) { // Fixed syntax error here
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
                    const processedContent = processFormattedText(formattedContent);
                    
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
                    checkForPlayerNames(fullResponseText);
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
    
    function messageExists(role, content) {
        const msgHash = `${role}-${content.substring(0, 50)}`;
        if (processedMessageIds.has(msgHash)) {
            return true;
        }
        processedMessageIds.add(msgHash);
        if (processedMessageIds.size > 100) {
            const msgArray = Array.from(processedMessageIds);
            processedMessageIds.clear();
            for (let i = Math.max(0, msgArray.length - 50); i < msgArray.length; i++) {
                processedMessageIds.add(msgArray[i]);
            }
        }
        return false;
    }
    
    function updateUndoRedoButtons() {
        if (undoBtn && redoBtn) {
            undoBtn.disabled = historyIndex <= 0;
            redoBtn.disabled = historyIndex >= messageHistory.length - 1;
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
        debugLog(`Redo requested. historyIndex: ${historyIndex}, messageHistory.length: ${messageHistory.length}, isGenerating: ${isGenerating}`);
        if (historyIndex >= messageHistory.length - 1 || isGenerating) {
            if(isGenerating) addSystemMessage("Please wait for the current action to complete before redoing.",false,true,true);
            return;
        }
        historyIndex++;
        debugLog(`Redo: historyIndex changed to ${historyIndex}`);
        restoreChatState(historyIndex);
        updateUndoRedoButtons();
        
        if (currentGameId) {
            const loadingId = `dm-redo-${Date.now()}`;
            const textId = `response-text-redo-${Date.now()}`;
            const loadingDiv = createLoadingDivForDM(loadingId, textId);
            debugLog("Setting isGenerating = true (redoChat)");
            isGenerating = true;
            fetch('/chat', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    message: "A previously undone action was restored. Please update the story accordingly.",
                    game_id: currentGameId,
                    player_number: 'system',
                    is_system: true
                })
            })
            .then(response => response.json())
            .then(data => {
                if (data && data.message_id) sendStreamRequest(data.message_id, loadingDiv); // isGenerating reset by sendStreamRequest
                else {
                    debugLog("Setting isGenerating = false (redoChat - no message_id)");
                    isGenerating = false; 
                }
            }).catch(() => {
                if (loadingDiv && loadingDiv.parentNode) loadingDiv.remove();
                debugLog("Setting isGenerating = false (redoChat - catch)");
                isGenerating = false;
            });
        }
    }
    
    function checkForPlayerNames(text) {
        const nameRegex = /Player (\d+) is (?:now |)named (\w+)/gi;
        let match;
        while ((match = nameRegex.exec(text)) !== null) {
            const playerNum = parseInt(match[1]);
            const pName = match[2];
            if (playerNum && pName && playerNames[playerNum] !== pName) { // Only update if different
                updatePlayerLabel(playerNum, pName);
            }
        }
        
        const simpleName = extractNameFromDMResponse(text);
        if (simpleName) {
            const unnamedPlayer = Object.entries(playerNames).find(([num, name]) => !name || name === `Player ${num}`);
            if (unnamedPlayer) {
                updatePlayerLabel(parseInt(unnamedPlayer[0]), simpleName);
            }
        }
        
        if (/what (?:would|should) you like to call (me|the dungeon master|your dungeon master)/i.test(text)) {
            window.awaitingDMRename = true;
            addSystemMessage("The DM wants a new name! Type the new name for the DM and press Enter.", false, false, true);
            debugLog("DM rename mode activated");
        }
    }
    
    function extractNameFromDMResponse(response) {
        const namePatterns = [
            /so your name is (\w+)/i,
            /welcome, (\w+)/i,
            /hello, (\w+)/i
        ];
        for (const pattern of namePatterns) {
            const match = response.match(pattern);
            if (match && match[1]) return match[1];
        }
        return null;
    }
    
    function removePlayer(playerNumber) {
        if (playerNumber <= 1) return; // Can't remove Player 1
        debugLog(`Removing Player ${playerNumber}`);
        const oldName = playerNames[playerNumber] || `Player ${playerNumber}`;
        
        // Deselect if the removed player was selected
        if (selectedPlayerNum === playerNumber) {
            if(selectedPlayerElement) selectedPlayerElement.classList.remove('selected');
            selectedPlayerNum = null;
            selectedPlayerElement = null;
            removePlayerBtn.classList.add('hidden');
        }

        delete playerNames[playerNumber];
        savePlayerNames();
        savePlayerState();
        
        const playerContainer = document.getElementById(`player${playerNumber}-container`);
        if (playerContainer) playerContainer.remove();
        
        if (selectedPlayerNum === playerNumber) {
            selectedPlayerNum = null;
            selectedPlayerElement = null;
            removePlayerBtn.classList.add('hidden');
        }
        
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

    function selectPlayer(playerElement, playerNum) {
        debugLog(`selectPlayer called for playerNum: ${playerNum}, element:`, playerElement);
        if (selectedPlayerElement) {
            selectedPlayerElement.classList.remove('selected');
            debugLog("Deselected old:", selectedPlayerElement);
        }
        // If clicking the same player, toggle selection off
        if (selectedPlayerElement === playerElement) {
            selectedPlayerElement = null;
            selectedPlayerNum = null;
            removePlayerBtn.classList.add('hidden'); // Hide remove button when deselected
            debugLog("Toggled off selection.");
        } else {
            // Select new player
            selectedPlayerElement = playerElement;
            selectedPlayerNum = playerNum;
            selectedPlayerElement.classList.add('selected');
            // Only show remove button if not Player 1 (can't remove Player 1)
            removePlayerBtn.classList.toggle('hidden', playerNum <= 1);
            debugLog("Selected new:", selectedPlayerElement, "Remove button hidden:", removePlayerBtn.classList.contains('hidden'));
        }
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

    // Add click listener for Player 1's container for selection
    if (player1Container) {
        player1Container.addEventListener('click', () => selectPlayer(player1Container, 1));
    }

    if (newGameBtn) newGameBtn.addEventListener('click', createNewGame);
    if (addPlayerBtn) addPlayerBtn.addEventListener('click', addPlayer);
    if (removePlayerBtn) {
        removePlayerBtn.addEventListener('click', function() {
            if (selectedPlayerNum && selectedPlayerNum > 1) {
                removePlayer(selectedPlayerNum);
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
        
        // Close menu when clicking outside of it
        document.addEventListener('click', function(e) {
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

    // Initial setup - clean and clear flow
    if (currentGameId) {
        debugLog("Restoring session:", currentGameId);
        initialize();
    } else {
        debugLog("No previous gameId. Setting up for a new game implicitly.");
        messageHistory = [];
        historyIndex = -1;
        localStorage.removeItem('chatHistory');
        chatWindow.innerHTML = '';
        addMessage("DM", "Hello adventurer! Let's begin your quest. What is your name?", false, false, false);
        updateUndoRedoButtons();
    }

    window.sendMessage = sendMessage;

    debugLog("=== TOP-LEVEL DOMCONTENTLOADED FINISHED ===");
});
