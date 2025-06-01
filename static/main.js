document.addEventListener('DOMContentLoaded', function() {
    // Debug setup
    const DEBUG = true;
    function debugLog(...args) {
        if (DEBUG) console.log(...args);
    }
    
    debugLog("=== CLEAN INITIALIZATION STARTED ===");
    
    // Core variables
    let isGenerating = false;
    let awaitingName = true;
    let playerName = null;
    let seenMessages = new Set();
    
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
    const copyChatBtn = document.getElementById('copy-chat-btn');
    const addPlayerBtn = document.getElementById('add-player-btn');
    // ADD the following line to define the container for additional players:
    const additionalPlayersContainer = document.getElementById('additional-players');
    
    // Add variables for update polling
    let lastMessageCount = 0;
    let updateCheckInterval = null;
    let isCheckingForUpdates = false;
    let lastSentMessage = "";
    
    // Flag to control automatic polling
    let enableAutomaticPolling = false;
    
    // Functions for saving/loading player names from localStorage
    function savePlayerNames() {
        localStorage.setItem('playerNames', JSON.stringify(playerNames));
        debugLog("Player names saved:", playerNames);
    }
    
    function loadPlayerNames() {
        try {
            const saved = localStorage.getItem('playerNames');
            if (saved) {
                return JSON.parse(saved);
            }
        } catch (e) {
            debugLog("Error loading player names:", e);
        }
        return { 1: null };
    }
    
    // Update updatePlayerLabel to save to localStorage
    function updatePlayerLabel(playerNumber, name) {
        debugLog(`Updating Player ${playerNumber} label to ${name}`);
        
        const labelElement = document.getElementById(`player${playerNumber}-label`);
        if (labelElement) {
            labelElement.textContent = `${name}:`;
            playerNames[playerNumber] = name;
            
            // Save to localStorage whenever a name is updated
            savePlayerNames();
        }
    }

    function createLoadingDivForDM(id, textId) {
        debugLog("Creating loading div:", id, textId);
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'message dm-message';
        loadingDiv.id = id;
        
        const nameSpan = document.createElement('span');
        nameSpan.textContent = 'DM: ';
        nameSpan.style.fontWeight = 'bold';
        
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
        debugLog("Starting stream request for message ID:", messageId);
        
        // Create EventSource URL with all parameters - simplified
        const eventSourceUrl = new URL('/stream', window.location.href);
        eventSourceUrl.searchParams.append('t', Date.now());
        eventSourceUrl.searchParams.append('game_id', currentGameId || '');
        eventSourceUrl.searchParams.append('message_id', messageId || '');
        
        debugLog("Stream URL:", eventSourceUrl.toString());
        
        // Create error recovery timeout
        let responseTimeout = setTimeout(() => {
            debugLog("Response timeout - closing connection");
            eventSource.close();
            const responseTextElem = loadingDiv.querySelector('[id^="response-text"]');
            if (responseTextElem) {
                responseTextElem.classList.remove('typing');
                const oldCursor = responseTextElem.querySelector('.cursor');
                if (oldCursor) oldCursor.remove();
                
                if (!responseTextElem.textContent) {
                    responseTextElem.textContent = "Response timeout. Please try again.";
                    loadingDiv.classList.add('error-message');
                }
            }
            
            isGenerating = false;
        }, 30000);
        
        // Create EventSource for streaming
        const eventSource = new EventSource(eventSourceUrl.toString());
        
        eventSource.onopen = function(e) {
            debugLog("EventSource connection opened");
        };
        
        // Handle incoming messages
        eventSource.onmessage = function(event) {
            try {
                debugLog("Received message chunk:", event.data.substring(0, 50) + "...");
                const data = JSON.parse(event.data);
                const responseTextElem = loadingDiv.querySelector('[id^="response-text"]');
                
                if (responseTextElem) {
                    // Handle content
                    const formattedContent = data.content.replace(/\\n/g, '\n');
                    
                    if (data.error === true) {
                        loadingDiv.classList.add('error-message');
                    }
                    
                    responseTextElem.classList.remove('typing');
                    
                    const oldCursor = responseTextElem.querySelector('.cursor');
                    if (oldCursor) oldCursor.remove();
                    
                    responseTextElem.textContent += formattedContent;
                    
                    const cursor = document.createElement('span');
                    cursor.className = 'cursor';
                    responseTextElem.appendChild(cursor);
                    
                    chatWindow.scrollTop = chatWindow.scrollHeight;
                    
                    if (data.full) {
                        checkForPlayerNames(data.full);
                    }
                }
            } catch (e) {
                debugLog("Error parsing event data:", e);
            }
        };
        
        // Handle stream completion
        eventSource.addEventListener('done', function() {
            debugLog("Stream complete");
            clearTimeout(responseTimeout);
            
            const responseTextElem = loadingDiv.querySelector('[id^="response-text"]');
            if (responseTextElem) {
                const oldCursor = responseTextElem.querySelector('.cursor');
                if (oldCursor) oldCursor.remove();
            }
            
            eventSource.close();
            isGenerating = false;
        });
        
        // Handle errors
        eventSource.onerror = function(e) {
            debugLog("EventSource error:", e);
            clearTimeout(responseTimeout);
            
            try {
                const responseTextElem = loadingDiv.querySelector('[id^="response-text"]');
                if (responseTextElem) {
                    const oldCursor = responseTextElem.querySelector('.cursor');
                    if (oldCursor) oldCursor.remove();
                    responseTextElem.classList.remove('typing');
                    
                    if (!responseTextElem.textContent) {
                        loadingDiv.classList.add('error-message');
                        responseTextElem.textContent = "Connection error. Please try again.";
                    }
                }
                
                eventSource.close();
            } catch (err) {
                debugLog("Error handling EventSource error:", err);
            } finally {
                isGenerating = false;
            }
        };
    }
    
    // Improved message tracking to prevent duplicates
    function messageExists(role, content) {
        // Create a simple hash for the message
        const msgHash = `${role}-${content.substring(0, 50)}`;
        
        // Check if we've seen this message before
        if (processedMessageIds.has(msgHash)) {
            return true;
        }
        
        // Add to our set of processed messages
        processedMessageIds.add(msgHash);
        
        // Keep the set from growing too large
        if (processedMessageIds.size > 100) {
            // Convert to array, keep only the most recent 50
            const msgArray = Array.from(processedMessageIds);
            processedMessageIds.clear();
            for (let i = msgArray.length - 50; i < msgArray.length; i++) {
                if (i >= 0) processedMessageIds.add(msgArray[i]);
            }
        }
        
        return false;
    }
    
    // Improved addMessage with duplicate detection
    function addMessage(sender, text, isTypewriter = false, fromUpdate = false) {
        // Skip if this appears to be the current user's message that we already displayed
        if (fromUpdate && sender.toLowerCase() === (playerNames[1] || 'player 1').toLowerCase() && 
            text === lastSentMessage) {
            debugLog("Skipping duplicate recent message");
            return false;
        }
        
        // Check if this is a duplicate message
        const role = sender.toLowerCase() === 'dm' ? 'assistant' : 'user';
        if (messageExists(role, text)) {
            debugLog("Skipping duplicate message:", text.substring(0, 20) + "...");
            return false;
        }
        
        // Track the last message from this sender
        lastPlayerMessages[sender] = text;
        
        debugLog("Adding message from", sender, ":", text.substring(0, 30) + (text.length > 30 ? "..." : ""));
        
        // Create message element
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${sender.toLowerCase() === 'dm' ? 'dm-message' : 'player-message'}`;
        
        const nameSpan = document.createElement('span');
        nameSpan.textContent = `${sender.toUpperCase()}: `;
        nameSpan.style.fontWeight = 'bold';
        msgDiv.appendChild(nameSpan);
        
        // Add content span
        const contentSpan = document.createElement('span');
        contentSpan.className = 'message-content';
        contentSpan.textContent = text;
        msgDiv.appendChild(contentSpan);
        
        chatWindow.appendChild(msgDiv);
        chatWindow.scrollTop = chatWindow.scrollHeight;
        return true;
    }
    
    // Modified addSystemMessage with duplicate detection
    function addSystemMessage(text, fromUpdate = false) {
        // Check for duplicates
        if (messageExists('system', text)) {
            debugLog("Skipping duplicate system message");
            return;
        }
        
        debugLog("Adding system message:", text);
        const msgDiv = document.createElement('div');
        msgDiv.className = 'message system-message';
        msgDiv.style.color = '#6272a4';
        msgDiv.style.fontStyle = 'italic';
        
        const nameSpan = document.createElement('span');
        nameSpan.textContent = "SYSTEM: ";
        nameSpan.style.fontWeight = 'bold';
        msgDiv.appendChild(nameSpan);
        
        const contentSpan = document.createElement('span');
        contentSpan.className = 'message-content';
        contentSpan.textContent = text;
        msgDiv.appendChild(contentSpan);
        
        chatWindow.appendChild(msgDiv);
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }
    
    // Modified sendMessage function
    function sendMessage(inputElement, playerNumber) {
        const userMessage = inputElement.value.trim();
        if (!userMessage) return;
        
        // Store this message to avoid duplicates when polling
        lastSentMessage = userMessage;
        
        if (isGenerating) {
            debugLog("Already generating, ignoring send");
            return;
        }
        
        // Validate game session
        if (!currentGameId) {
            debugLog("No game ID, creating new game");
            addSystemMessage("No active game session. Creating a new one...");
            createNewGame();
            setTimeout(() => {
                sendMessage(inputElement, playerNumber);
            }, 1500);
            return;
        }
        
        debugLog(`Sending message for Player ${playerNumber}:`, userMessage.substring(0, 30));
        
        // Set generating state
        isGenerating = true;
        
        // Extract name if first message or if player name not set
        const extractedName = extractName(userMessage);
        if (extractedName && !playerNames[playerNumber]) {
            updatePlayerLabel(playerNumber, extractedName);
            if (playerNumber === 1) {
                playerName = extractedName;
                awaitingName = false;
            }
        }
        
        // Get sender name
        const sender = playerNames[playerNumber] || `Player ${playerNumber}`;
        
        // Add user message to chat
        addMessage(sender, userMessage);
        
        // Clear input field
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
        
        // Send to server - simplified
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
            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            debugLog("Message sent successfully, response:", data);
            if (data && data.message_id) {
                sendStreamRequest(data.message_id, loadingDiv);
            } else {
                throw new Error("Invalid response data");
            }
        })
        .catch(error => {
            debugLog('Error sending message:', error);
            
            if (loadingDiv && loadingDiv.parentNode) {
                const responseTextElem = loadingDiv.querySelector('[id^="response-text"]');
                if (responseTextElem) {
                    responseTextElem.textContent = "Error: " + error.message;
                    loadingDiv.classList.add('error-message');
                } else {
                    loadingDiv.remove();
                    addSystemMessage("Error: " + error.message);
                }
            } else {
                addSystemMessage("Error: Failed to send message. " + error.message);
            }
            
            isGenerating = false;
        });
        
        // Focus input field
        inputElement.focus();
    }
    
    function checkForPlayerNames(text) {
        // Look for "Player X is named Y" patterns for all players
        const nameRegex = /Player (\d+) is (?:now |)named ([A-Za-z]+)/gi;
        let match;
        
        while ((match = nameRegex.exec(text)) !== null) {
            const playerNum = parseInt(match[1]);
            const playerName = match[2];
            
            if (playerNum && playerName) {
                debugLog(`Found name for Player ${playerNum}: ${playerName}`);
                updatePlayerLabel(playerNum, playerName);
            }
        }
    }
    
    function extractName(input) {
        const namePatterns = [
            /my name is ([A-Za-z]+)/i,
            /i am ([A-Za-z]+)/i,
            /call me ([A-Za-z]+)/i,
            /name's ([A-Za-z]+)/i,
            /name is ([A-Za-z]+)/i,
            /^([A-Za-z]+)$/i  // Just a name by itself
        ];
        
        for (const pattern of namePatterns) {
            const match = input.match(pattern);
            if (match && match[1]) {
                return match[1];
            }
        }
        
        return null;
    }
    
    function extractNameFromDMResponse(response) {
        const namePatterns = [
            /so your name is ([A-Za-z]+)/i,
            /welcome, ([A-Za-z]+)/i,
            /hello, ([A-Za-z]+)/i
        ];
        
        for (const pattern of namePatterns) {
            const match = response.match(pattern);
            if (match && match[1]) {
                return match[1];
            }
        }
        
        return null;
    }
    
    // New game button
    newGameBtn.addEventListener('click', function() {
        debugLog("New game button clicked - starting new game without confirmation");
        
        try {
            // Clear existing state
            currentGameId = null;
            localStorage.removeItem('currentGameId');
            
            // Reset UI and state
            chatWindow.innerHTML = '';
            isGenerating = false;
            awaitingName = true;
            playerName = null;
            seenMessages = new Set();
            
            // Reset player names
            playerNames = { 1: null };
            localStorage.removeItem('playerState');
            localStorage.removeItem('playerNames');
            
            // Reset UI elements
            isMultiplayerActive = false;
            
            // Reset labels
            const player1Label = document.getElementById('player1-label');
            if (player1Label) {
                player1Label.textContent = "Player 1:";
            }
            
            // Clear all additional players
            additionalPlayersContainer.innerHTML = '';
            
            // Reset next player number
            nextPlayerNumber = 2;
            
            // Clear processed message tracking
            processedMessageIds.clear();
            
            // Start completely fresh game
            createNewGame();
            
            // Clear selected player state
            selectedPlayerNum = null;
            selectedPlayerElement = null;
            removePlayerBtn.classList.add('hidden');
        } catch (err) {
            debugLog("Error creating new game:", err);
            addSystemMessage("Error: " + err.message);
        }
    });
    
    // Improved displayMessages function to handle player names better
    function displayMessages(messages) {
        debugLog("Displaying messages from history:", messages.length);
        
        // Skip if we already have messages in the chat window
        if (chatWindow.querySelectorAll('.message').length > 0) {
            debugLog("Chat window already has messages, skipping redisplay");
            return;
        }
        
        messages.forEach(msg => {
            if (msg.role === 'assistant') {
                // DM messages
                addMessage('DM', msg.content);
                
                // Check for player names in DM response
                checkForPlayerNames(msg.content);
                const extractedName = extractNameFromDMResponse(msg.content);
                if (extractedName) {
                    // Try to match this with a pending player name
                    if (!playerNames[1]) {
                        updatePlayerLabel(1, extractedName);
                    }
                }
            }
            else if (msg.role === 'user') {
                // Player messages - determine which player
                let playerNum = 1;
                if (msg.player && msg.player.startsWith('player')) {
                    playerNum = parseInt(msg.player.substring(6));
                }
                
                // Use the name if we have it
                const sender = playerNames[playerNum] || `Player ${playerNum}`;
                addMessage(sender, msg.content);
                
                // Extract name if present and not already set
                const extractedName = extractName(msg.content);
                if (extractedName && !playerNames[playerNum]) {
                    updatePlayerLabel(playerNum, extractedName);
                }
            }
            else if (msg.role === 'system') {
                // System messages
                addSystemMessage(msg.content);
            }
        });
        
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }

    // Enhanced initialize function to restore player names
    function initialize() {
        debugLog("Initializing game");
        
        seenMessages.clear();
        isGenerating = false;
        
        // Debug output all player names
        debugLog("Player names to restore:", playerNames);
        
        // First pass - restore labels
        Object.entries(playerNames).forEach(([numStr, name]) => {
            if (name) {
                const playerNum = parseInt(numStr);
                debugLog(`Restoring player ${playerNum} name: ${name}`);
                
                const labelElement = document.getElementById(`player${playerNum}-label`);
                if (labelElement) {
                    labelElement.textContent = `${name}:`;
                }
            }
        });
        
        // Second pass - restore UI containers for all players
        Object.entries(playerNames).forEach(([numStr, name]) => {
            if (name) {
                const playerNum = parseInt(numStr);
                
                // Restore player 2
                if (playerNum === 2) {
                    debugLog("Showing Player 2 container");
                    isMultiplayerActive = true;
                } 
                // Restore players 3 and higher
                else if (playerNum >= 3) {
                    debugLog(`Checking container for Player ${playerNum}`);
                    const containerExists = document.getElementById(`player${playerNum}-container`);
                    if (!containerExists) {
                        debugLog(`Creating container for Player ${playerNum}`);
                        const newPlayerContainer = createPlayerInput(playerNum);
                        additionalPlayersContainer.appendChild(newPlayerContainer);
                        isMultiplayerActive = true;
                    } else {
                        debugLog(`Container for Player ${playerNum} already exists`);
                    }
                }
            }
        });
        
        // Update next player number based on existing player names
        let maxPlayerNumber = 2; // Start with 2 since Player 1 is default
        Object.keys(playerNames).forEach(numStr => {
            const playerNum = parseInt(numStr);
            if (playerNum > maxPlayerNumber) {
                maxPlayerNumber = playerNum;
            }
        });
        nextPlayerNumber = maxPlayerNumber + 1;
        debugLog("Next player number set to:", nextPlayerNumber);
        
        // Rest of the function remains unchanged
        if (!currentGameId) {
            debugLog("No game ID, creating new game");
            createNewGame();
            return;
        }
        
        // Load chat history
        fetch('/load_history', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ 
                game_id: currentGameId
            })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            debugLog("Loaded history:", data);
            
            if (!data.history || !Array.isArray(data.history)) {
                throw new Error("Invalid history data");
            }
            
            // Process history data
            displayMessages(data.history);
            
            // Ensure welcome message is displayed
            ensureWelcomeMessage();
            
            // Store session info
            localStorage.setItem('currentGameId', currentGameId);
            
            // Set the initial message count for update checking
            lastMessageCount = data.history.length;
            
            // Focus input
            userInput.focus();
        })
        .catch(error => {
            debugLog('Error loading history:', error);
            
            // Create default welcome message
            chatWindow.innerHTML = '';
            addMessage('DM', "Hello adventurer! Let's begin your quest. What is your name?", false);
            
            // Focus input
            userInput.focus();
        });
    }

    function createNewGame() {
        debugLog("Creating new game");
        
        // Reset UI state
        chatWindow.innerHTML = '';
        isGenerating = false;
        
        // Reset player name
        playerNames[1] = null;
        
        // Create loading message
        addMessage('DM', 'Creating a new adventure for you...', false);
        
        // Request new game from server
        fetch('/new_game', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({})
        })
        .then(response => response.json())
        .then(data => {
            debugLog("New game created:", data);
            
            if (data.success && data.game_id) {
                currentGameId = data.game_id;
                
                // Store in local storage
                localStorage.setItem('currentGameId', currentGameId);
                
                // Add welcome message
                addMessage('DM', "Hello adventurer! Let's begin your quest. What is your name?", false);
                debugLog("Added welcome message for new game");
                
                // Reset message count
                lastMessageCount = 1; // Start with 1 for the welcome message
                
                // Focus input field
                userInput.focus();
            } else {
                throw new Error("Failed to create new game");
            }
        })
        .catch(error => {
            debugLog("Error creating new game:", error);
            addSystemMessage("Error: " + error.message);
            
            // Add welcome message anyway so user can interact
            ensureWelcomeMessage();
        });
    }

    // Set up event handlers
    sendBtn.addEventListener('click', function() {
        sendMessage(userInput, 1);
    });
    
    userInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && !isGenerating) {
            sendMessage(userInput, 1);
        }
    });
    
    // Set up copy button functionality
    copyChatBtn.addEventListener('click', function() {
        const messages = Array.from(chatWindow.querySelectorAll('.message')).map(msg => {
            const sender = msg.querySelector('span').textContent;
            const content = msg.querySelector('.message-content').textContent;
            return `${sender} ${content}`;
        }).join('\n\n');
        
        navigator.clipboard.writeText(messages).then(() => {
            alert('Chat copied to clipboard!');
        }).catch(err => {
            console.error('Failed to copy chat: ', err);
            alert('Failed to copy chat');
        });
    });
    
    // Add these variables back
    let isMultiplayerActive = false;

    // Add function to create dynamic player input for players 3+
    function createPlayerInput(playerNumber) {
        debugLog(`Creating input for Player ${playerNumber}`);
        const playerInputDiv = document.createElement('div');
        playerInputDiv.className = 'player-input';
        playerInputDiv.id = `player${playerNumber}-container`;
        
        // Add click handler to make this player selectable
        playerInputDiv.addEventListener('click', function(e) {
            // Don't trigger when clicking input or button
            if (!e.target.matches('input') && !e.target.matches('button')) {
                selectPlayer(playerInputDiv, playerNumber);
            }
        });
        
        const playerLabelDiv = document.createElement('div');
        playerLabelDiv.className = 'player-label';
        playerLabelDiv.id = `player${playerNumber}-label`;
        playerLabelDiv.textContent = `Player ${playerNumber}:`;
        
        const playerInput = document.createElement('input');
        playerInput.type = 'text';
        playerInput.id = `player${playerNumber}-input`;
        playerInput.placeholder = 'Type your message...';
        playerInput.autocomplete = 'off';
        playerInput.className = `player${playerNumber}-input`;
        
        // Add Enter key functionality
        playerInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && !isGenerating) {
                sendMessage(playerInput, playerNumber);
            }
        });
        
        const sendButton = document.createElement('button');
        sendButton.className = 'action-btn send-btn';
        sendButton.id = `send-player${playerNumber}-btn`;
        sendButton.textContent = '📤 Send';
        sendButton.title = 'Send message';
        
        // Add click handler to the button
        sendButton.addEventListener('click', function() {
            sendMessage(playerInput, playerNumber);
        });
        
        playerInputDiv.appendChild(playerLabelDiv);
        playerInputDiv.appendChild(playerInput);
        playerInputDiv.appendChild(sendButton);
        
        return playerInputDiv;
    }

    // Create function for adding players - handles all players consistently
    function addPlayer(suggestedPlayerNum) {
        debugLog(`Add player requested with suggested number: ${suggestedPlayerNum}`);
        
        // Don't allow adding more players while generating
        if (isGenerating) {
            debugLog("Cannot add player while generating response");
            return;
        }
        
        // Find the lowest available player number (first gap)
        let playerNum = 2; // Start checking from Player 2
        const existingPlayerNumbers = Object.keys(playerNames)
            .map(num => parseInt(num))
            .filter(num => num > 1); // Only consider players beyond Player 1
        
        // Sort player numbers numerically
        existingPlayerNumbers.sort((a, b) => a - b);
        
        // Find the first gap in player numbers or use the next number after the highest
        for (let i = 0; i <= existingPlayerNumbers.length; i++) {
            if (i === existingPlayerNumbers.length || existingPlayerNumbers[i] > playerNum) {
                // We found a gap or reached the end
                debugLog(`Found available player number: ${playerNum}`);
                break;
            }
            if (existingPlayerNumbers[i] === playerNum) {
                // This number is taken, try next number
                playerNum++;
            }
        }
        
        debugLog(`Using player number: ${playerNum} (instead of ${suggestedPlayerNum})`);
        
        // Check if this player already exists (redundant check but keeping for safety)
        const existingContainer = document.getElementById(`player${playerNum}-container`);
        if (existingContainer) {
            debugLog(`Player ${playerNum} container already exists, this shouldn't happen`);
            return;
        }
        
        // Create UI for the new player
        const newPlayerContainer = createPlayerInput(playerNum);
        additionalPlayersContainer.appendChild(newPlayerContainer);
        
        // Initialize this player's name
        playerNames[playerNum] = null;
        isMultiplayerActive = true;
        
        // Save state right away to avoid losing players on refresh
        savePlayerState();
        
        // Only notify DM if we have a game
        if (currentGameId) {
            // Notify the DM about the new player
            const joinMessage = `Player ${playerNum} has joined the game. Please enter your name.`;
            addSystemMessage(joinMessage);
            
            // Create loading div for DM's response
            const loadingDiv = createLoadingDivForDM(
                `dm-welcome-player${playerNum}`, 
                `response-text-welcome-player${playerNum}`
            );
            
            // Notify DM - using the specific player number
            isGenerating = true;
            fetch('/chat', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    message: `A new player (Player ${playerNum}) has joined the game. Please welcome Player ${playerNum} specifically and ask for their name.`,
                    game_id: currentGameId,
                    player_number: 'system',
                    is_system: true
                })
            })
            .then(response => {
                if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
                return response.json();
            })
            .then(data => {
                debugLog(`Player ${playerNum} welcome response:`, data);
                if (data && data.message_id) {
                    sendStreamRequest(data.message_id, loadingDiv);
                    
                    // Focus the new player's input field
                    setTimeout(() => {
                        const inputField = document.getElementById(`player${playerNum}-input`);
                        if (inputField) inputField.focus();
                    }, 100);
                    
                    // Update next player number - set it to one higher than the highest existing player number
                    const maxPlayerNumber = Math.max(...Object.keys(playerNames).map(num => parseInt(num)));
                    nextPlayerNumber = maxPlayerNumber + 1;
                    debugLog("Updated nextPlayerNumber to:", nextPlayerNumber);
                    savePlayerState(); // Save again with updated player number
                } else {
                    throw new Error("Invalid response data");
                }
            })
            .catch(error => {
                debugLog(`Error adding Player ${playerNum}:`, error);
                if (loadingDiv && loadingDiv.parentNode) loadingDiv.remove();
                addSystemMessage(`Error adding Player ${playerNum}: ${error.message}`);
                isGenerating = false;
            });
        } else {
            // Focus on the new input field even if we don't notify the DM
            setTimeout(() => {
                const inputField = document.getElementById(`player${playerNum}-input`);
                if (inputField) inputField.focus();
            }, 100);
            
            // Update next player number in a consistent way
            const maxPlayerNumber = Math.max(...Object.keys(playerNames).map(num => parseInt(num)));
            nextPlayerNumber = maxPlayerNumber + 1;
            debugLog("Updated nextPlayerNumber to:", nextPlayerNumber);
        }
    }

    // Update Add Player button to add the next player, with more debug info
    addPlayerBtn.addEventListener('click', function() {
        debugLog("Add Player button clicked. Finding first available player number...");
        if (isGenerating) {
            debugLog("Not adding player: AI is generating");
            return;
        }
        // Pass the current nextPlayerNumber, but addPlayer will find the first available number
        addPlayer(nextPlayerNumber);
    });
    
    // Add a function to check for updates
    function checkForUpdates() {
        if (!currentGameId || isCheckingForUpdates || isGenerating) {
            return; // Don't check if no game is active or already checking or AI is generating
        }
        
        isCheckingForUpdates = true;
        
        fetch('/get_updates', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                game_id: currentGameId,
                last_message_count: lastMessageCount
            })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Server returned ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.success && data.has_updates) {
                // Process new messages
                let newMessages = data.updates;
                let addedMessages = 0;
                
                // Append new messages to the chat window
                newMessages.forEach(msg => {
                    let wasAdded = false;
                    
                    if (msg.role === 'assistant') {
                        wasAdded = addMessage('DM', msg.content, false, true);
                        if (wasAdded) checkForPlayerNames(msg.content);
                    }
                    else if (msg.role === 'user') {
                        let playerNum = 1;
                        if (msg.player && msg.player.startsWith('player')) {
                            playerNum = parseInt(msg.player.substring(6));
                        }
                        
                        const sender = playerNames[playerNum] || `Player ${playerNum}`;
                        wasAdded = addMessage(sender, msg.content, false, true);
                    }
                    else if (msg.role === 'system') {
                        addSystemMessage(msg.content, true);
                        wasAdded = true;
                    }
                    
                    if (wasAdded) addedMessages++;
                });
                
                // Update the message count
                lastMessageCount = data.message_count;
                
                // Check if we need to show other players' inputs
                if (addedMessages > 0) {
                    checkForMissingPlayers(newMessages);
                }
            } else if (data.success) {
                // Update our message count if server has a different count
                if (data.message_count !== lastMessageCount) {
                    lastMessageCount = data.message_count;
                }
            }
        })
        .catch(error => {
            debugLog("Error checking for updates:", error);
        })
        .finally(() => {
            isCheckingForUpdates = false;
        });
    }

    // Add this function to check for missing player inputs
    function checkForMissingPlayers(messages) {
        // Find unique player numbers from messages
        const playerNumbers = new Set();
        
        messages.forEach(msg => {
            if (msg.player && msg.player.startsWith('player')) {
                const playerNum = parseInt(msg.player.substring(6));
                if (!isNaN(playerNum) && playerNum > 1) {  // Ignore player 1 (self)
                    playerNumbers.add(playerNum);
                }
            }
        });
        
        // For each player number, make sure their input is visible
        playerNumbers.forEach(playerNum => {
            // Check if player input exists
            const containerExists = document.getElementById(`player${playerNum}-container`);
            if (!containerExists) {
                const newPlayerContainer = createPlayerInput(playerNum);
                additionalPlayersContainer.appendChild(newPlayerContainer);
                
                // Update nextPlayerNumber if needed
                if (playerNum >= nextPlayerNumber) {
                    nextPlayerNumber = playerNum + 1;
                }
                
                isMultiplayerActive = true;
            }
        });
    }

    // FIXED: Completely disable update polling
    function startUpdatePolling() {
        // Clear any existing interval
        if (updateCheckInterval) {
            clearInterval(updateCheckInterval);
            updateCheckInterval = null;
        }
        
        // REMOVED: Do NOT even check once - completely disable polling
        debugLog("Automatic polling is disabled");
    }

    // Add this missing function that's referenced elsewhere
    function ensureWelcomeMessage() {
        debugLog("Ensuring welcome message exists");
        
        // Check if the chat window is empty
        if (chatWindow.children.length === 0) {
            addMessage('DM', "Hello adventurer! Let's begin your quest. What is your name?", false);
            debugLog("Added default welcome message");
        }
    }

    // Add this safety check function to ensure all player inputs exist
    function ensurePlayersExist() {
        debugLog("Ensuring all player inputs exist");
        let playerRestorationNeeded = false;
        
        Object.entries(playerNames).forEach(([numStr, name]) => {
            if (!name) return; // Skip players without names
            
            const playerNum = parseInt(numStr);
            if (playerNum === 1) return; // Player 1 always exists
            
            // Check if container exists for players 2+
            const containerExists = document.getElementById(`player${playerNum}-container`);
            if (!containerExists) {
                debugLog(`Restoring missing Player ${playerNum} container`);
                const newPlayerContainer = createPlayerInput(playerNum);
                additionalPlayersContainer.appendChild(newPlayerContainer);
                isMultiplayerActive = true;
                playerRestorationNeeded = true;
            }
        });
        
        return playerRestorationNeeded;
    }
    
    // Initialize
    try {
        if (currentGameId) {
            debugLog("Restoring session:", currentGameId);
            initialize();
        } else {
            debugLog("No previous session, creating new game");
            createNewGame();
        }
        
        // Add a final check after delay to ensure welcome message is displayed
        // and all player inputs are restored
        setTimeout(() => {
            ensureWelcomeMessage();
            ensurePlayersExist();
        }, 500);
    } catch (error) {
        debugLog("Error during initialization:", error);
        // Add welcome message anyway as fallback
        ensureWelcomeMessage();
    }
    
    // Enhance player state management with UI state tracking
    function savePlayerState() {
        const playerState = {
            names: playerNames,
            active: {},
            nextPlayerNumber: nextPlayerNumber,
            isMultiplayerActive: isMultiplayerActive
        };
        
        // Save which players are active (have UI)
        Object.keys(playerNames).forEach(numStr => {
            const playerNum = parseInt(numStr);
            
            // Player 1 is always active
            if (playerNum === 1) {
                playerState.active[playerNum] = true;
                return;
            }
            
            // Check Players 2+
            if (playerNum >= 2) {
                const container = document.getElementById(`player${playerNum}-container`);
                playerState.active[playerNum] = !!container;
            }
        });
        
        localStorage.setItem('playerState', JSON.stringify(playerState));
        debugLog("Saved full player state:", playerState);
    }
    
    function loadPlayerState() {
        try {
            const saved = localStorage.getItem('playerState');
            if (saved) {
                const state = JSON.parse(saved);
                debugLog("Loaded player state:", state);
                
                // Load player names
                playerNames = state.names || { 1: null, 2: null };
                
                // Load nextPlayerNumber
                if (state.nextPlayerNumber && state.nextPlayerNumber > nextPlayerNumber) {
                    nextPlayerNumber = state.nextPlayerNumber;
                }
                
                // Load multiplayer status
                isMultiplayerActive = state.isMultiplayerActive || false;
                
                return state;
            }
        } catch (e) {
            debugLog("Error loading player state:", e);
        }
        
        return { names: { 1: null, 2: null }, active: {}, nextPlayerNumber: 3, isMultiplayerActive: false };
    }
    
    // Update savePlayerNames to use savePlayerState
    function savePlayerNames() {
        savePlayerState();
    }
    
    // Update updatePlayerLabel function to save full state
    function updatePlayerLabel(playerNumber, name) {
        debugLog(`Updating Player ${playerNumber} label to ${name}`);
        
        const labelElement = document.getElementById(`player${playerNumber}-label`);
        if (labelElement) {
            labelElement.textContent = `${name}:`;
            playerNames[playerNumber] = name;
            
            // Save to localStorage whenever a name is updated
            savePlayerState();
        }
    }
    
    // Add beforeunload handler to ensure state is saved before page refresh
    window.addEventListener('beforeunload', function() {
        debugLog("Page is being unloaded, saving state...");
        savePlayerState();
    });
    
    // Enhanced restore players function with retry logic
    function restorePlayerInputs() {
        debugLog("Restoring player inputs");
        const playerState = loadPlayerState();
        
        // First make sure the player objects are visible
        if (playerState.active) {
            // Restore Players 2+ if active
            Object.entries(playerState.active).forEach(([numStr, isActive]) => {
                const playerNum = parseInt(numStr);
                if (playerNum >= 2 && isActive) {
                    debugLog(`Restoring Player ${playerNum} (active)`);
                    const containerExists = document.getElementById(`player${playerNum}-container`);
                    if (!containerExists) {
                        const newPlayerContainer = createPlayerInput(playerNum);
                        additionalPlayersContainer.appendChild(newPlayerContainer);
                        isMultiplayerActive = true;
                    }
                }
            });
        }
        
        // Then restore player names and labels
        Object.entries(playerNames).forEach(([numStr, name]) => {
            if (name) {
                const playerNum = parseInt(numStr);
                const labelElement = document.getElementById(`player${playerNum}-label`);
                if (labelElement) {
                    labelElement.textContent = `${name}:`;
                }
            }
        });
        
        // Set next player number correctly
        let maxPlayerNumber = 1; // Start with 1 since Player 1 is default
        Object.keys(playerNames).forEach(numStr => {
            const playerNum = parseInt(numStr);
            if (playerNum > maxPlayerNumber) {
                maxPlayerNumber = playerNum;
            }
        });
        nextPlayerNumber = Math.max(maxPlayerNumber + 1, playerState.nextPlayerNumber || 2);
        debugLog("Next player number set to:", nextPlayerNumber);
    }
    
    // Improve game ID handling to prevent chat history loss
    function saveGameId(gameId) {
        if (!gameId) {
            debugLog("ERROR: Attempted to save empty game ID");
            return false;
        }
        
        try {
            localStorage.setItem('currentGameId', gameId);
            debugLog("Game ID saved to localStorage:", gameId);
            
            // Verify the save was successful
            const savedId = localStorage.getItem('currentGameId');
            if (savedId !== gameId) {
                debugLog("ERROR: Game ID verification failed. Expected:", gameId, "Got:", savedId);
                return false;
            }
            
            return true;
        } catch (e) {
            debugLog("ERROR: Failed to save game ID to localStorage:", e);
            return false;
        }
    }
    
    function loadGameId() {
        try {
            const gameId = localStorage.getItem('currentGameId');
            debugLog("Loaded game ID from localStorage:", gameId);
            return gameId;
        } catch (e) {
            debugLog("ERROR: Failed to load game ID from localStorage:", e);
            return null;
        }
    }
    
    // Improved chat history loading with retries
    function loadChatHistory(retryCount = 3) {
        debugLog(`Loading chat history (attempt ${4-retryCount}/3)...`);
        
        if (!currentGameId) {
            debugLog("Cannot load chat history - no game ID");
            return Promise.reject(new Error("No game ID available"));
        }
        
        return fetch('/load_history', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ 
                game_id: currentGameId
            })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            debugLog(`Loaded history with ${data.history ? data.history.length : 0} messages`);
            
            if (!data.history || !Array.isArray(data.history)) {
                throw new Error("Invalid history data");
            }
            
            if (data.history.length === 0 && retryCount > 0) {
                debugLog("Empty history received, retrying...");
                // Retry after a short delay
                return new Promise(resolve => {
                    setTimeout(() => {
                        loadChatHistory(retryCount - 1)
                            .then(resolve)
                            .catch(e => {
                                debugLog("Retry failed:", e);
                                resolve({ history: [] });
                            });
                    }, 300);
                });
            }
            
            return data;
        });
    }
    
    // Add DOM elements for player removal
    const removePlayerBtn = document.getElementById('remove-player-btn');
    let selectedPlayerNum = null;
    let selectedPlayerElement = null;
    
    // Function to handle player selection
    function selectPlayer(playerElement, playerNum) {
        // Deselect previously selected player if any
        if (selectedPlayerElement) {
            selectedPlayerElement.classList.remove('selected');
        }
        
        // If clicking the same player, toggle selection off
        if (selectedPlayerElement === playerElement) {
            selectedPlayerElement = null;
            selectedPlayerNum = null;
            removePlayerBtn.classList.add('hidden');
            return;
        }
        
        // Select new player
        selectedPlayerElement = playerElement;
        selectedPlayerNum = playerNum;
        selectedPlayerElement.classList.add('selected');
        
        // Only show remove button if not Player 1 (can't remove Player 1)
        if (playerNum > 1) {
            removePlayerBtn.classList.remove('hidden');
        } else {
            removePlayerBtn.classList.add('hidden');
        }
    }
    
    // Make Player 1 selectable
    const player1Container = document.querySelector('.player-input');
    player1Container.addEventListener('click', function(e) {
        // Don't trigger when clicking input or button
        if (!e.target.matches('input') && !e.target.matches('button')) {
            selectPlayer(player1Container, 1);
        }
    });
    
    // Function to remove a player
    function removePlayer(playerNum) {
        if (playerNum <= 1) {
            debugLog("Cannot remove Player 1");
            return; // Can't remove Player 1
        }
        
        if (isGenerating) {
            debugLog("Cannot remove player while generating a response");
            return;
        }
        
        debugLog(`Removing Player ${playerNum}`);
        
        // Get player name for notification
        const playerName = playerNames[playerNum] || `Player ${playerNum}`;
        
        // Remove the player container
        const containerToRemove = document.getElementById(`player${playerNum}-container`);
        if (containerToRemove) {
            containerToRemove.remove();
        }
        
        // Remove from player names
        delete playerNames[playerNum];
        
        // Check if there are still other players (besides 1)
        let otherPlayersExist = false;
        Object.keys(playerNames).forEach(num => {
            if (parseInt(num) >= 2 && playerNames[num]) {
                otherPlayersExist = true;
            }
        });
        
        // Update multiplayer flag
        isMultiplayerActive = otherPlayersExist;
        
        // Hide remove button
        removePlayerBtn.classList.add('hidden');
        selectedPlayerNum = null;
        selectedPlayerElement = null;
        
        // Save the updated player state
        savePlayerState();
        
        // Notify the DM about the player leaving
        if (currentGameId) {
            // Add system message
            addSystemMessage(`${playerName} has left the game.`);
            
            // Create loading div for DM's response
            const loadingDiv = createLoadingDivForDM(
                `dm-goodbye-player${playerNum}`,
                `response-text-goodbye-player${playerNum}`
            );
            
            // Notify DM
            isGenerating = true;
            fetch('/chat', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    message: `${playerName} has left the adventure. Please acknowledge their departure.`,
                    game_id: currentGameId,
                    player_number: 'system',
                    is_system: true
                })
            })
            .then(response => {
                if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
                return response.json();
            })
            .then(data => {
                debugLog(`Player ${playerNum} departure response:`, data);
                if (data && data.message_id) {
                    sendStreamRequest(data.message_id, loadingDiv);
                } else {
                    throw new Error("Invalid response data");
                }
            })
            .catch(error => {
                debugLog(`Error handling Player ${playerNum} departure:`, error);
                if (loadingDiv && loadingDiv.parentNode) loadingDiv.remove();
                addSystemMessage(`Error: ${error.message}`);
                isGenerating = false;
            });
        }
    }
    
    // Add click handler for Remove Player button
    removePlayerBtn.addEventListener('click', function() {
        if (selectedPlayerNum && selectedPlayerNum > 1) {
            removePlayer(selectedPlayerNum);
        }
    });

    // Update the load game ID at startup
    currentGameId = loadGameId();
    
    // Initialize with delayed retries on startup
    try {
        if (currentGameId) {
            debugLog("Restoring session:", currentGameId);
            initialize();
            
            // Add a second attempt after a delay to ensure history loads
            setTimeout(() => {
                if (chatWindow.children.length === 0) {
                    debugLog("Chat still empty after init, trying again");
                    loadChatHistory()
                        .then(data => {
                            displayMessages(data.history);
                            ensureWelcomeMessage();
                        })
                        .catch(() => ensureWelcomeMessage());
                }
            }, 1000);
        } else {
            debugLog("No previous session, creating new game");
            createNewGame();
        }
        
        // Add final checks
        setTimeout(() => {
            ensureWelcomeMessage();
            ensurePlayersExist();
            
            // Extra verification that we have content
            if (chatWindow.children.length === 0 && currentGameId) {
                debugLog("WARNING: Chat still empty after all attempts");
                addMessage('DM', "Hello adventurer! Let's begin your quest. What is your name?", false);
            }
        }, 2000);
    } catch (error) {
        debugLog("Error during initialization:", error);
        ensureWelcomeMessage();
    }
});
