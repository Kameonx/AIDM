/**
 * Player Management Module
 * Handles player creation, selection, and removal functionality
 */

// Player management functions
const PlayerManager = (function() {
    // Private variables - these will be initialized by the setup function
    let playerNames = {};
    let nextPlayerNumber = 2;
    let selectedPlayerElement = null;
    let selectedPlayerNum = null;
    let additionalPlayersContainer;
    let removePlayerBtn;
    let currentGameId;
    let debugLog;
    let addSystemMessage;
    let createLoadingDivForDM;
    let sendStreamRequest;
    let savePlayerNames;
    let savePlayerState;

    /**
     * Initialize the player manager with required dependencies
     */
    function setup(config) {
        playerNames = config.playerNames || {};
        nextPlayerNumber = config.nextPlayerNumber || 2;
        additionalPlayersContainer = config.additionalPlayersContainer;
        removePlayerBtn = config.removePlayerBtn;
        currentGameId = config.currentGameId;
        debugLog = config.debugLog || console.log;
        addSystemMessage = config.addSystemMessage;
        createLoadingDivForDM = config.createLoadingDivForDM;
        sendStreamRequest = config.sendStreamRequest;
        savePlayerNames = config.savePlayerNames;
        savePlayerState = config.savePlayerState;

        // Initialize nextPlayerNumber based on loaded player names
        if (Object.keys(playerNames).length > 0) {
            nextPlayerNumber = Math.max(...Object.keys(playerNames).map(Number)) + 1;
        }

        debugLog("PlayerManager initialized with players:", playerNames);
        
        // CRITICAL: Don't return a new object, just return the current state
        return {
            nextPlayerNumber,
            playerNames: playerNames // Return reference to the same object
        };
    }

    /**
     * Select a player by clicking their input container
     */
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
                debugLog("Showing remove button for player", playerNum);
                removePlayerBtn.classList.remove('hidden');
            } else {
                removePlayerBtn.classList.add('hidden');
            }
        }
    }
    
    /**
     * Add a UI element for a player
     */
    function addPlayerUI(playerNum, playerName = null, onSendMessage) {
        const playerContainer = document.createElement('div');
        playerContainer.className = 'player-input';
        playerContainer.id = `player${playerNum}-container`;
        
        // Add click handler for player selection
        playerContainer.addEventListener('click', function() {
            selectPlayer(playerContainer, playerNum);
        });

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
            if (e.key === 'Enter' && onSendMessage) {
                e.preventDefault();
                onSendMessage(input, playerNum);
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
            if (onSendMessage) onSendMessage(input, playerNum);
        });
        buttonsContainer.appendChild(sendPlayerBtn);

        const dicePlayerBtn = document.createElement('button');
        dicePlayerBtn.id = `dice-player${playerNum}-btn`;
        dicePlayerBtn.className = 'action-btn dice-btn';
        dicePlayerBtn.title = 'Roll a die';
        dicePlayerBtn.innerHTML = '🎲';
        dicePlayerBtn.type = 'button';
        dicePlayerBtn.addEventListener('click', function() {
            if (onSendMessage) {
                const diceCommandInput = { value: "/roll 1d20" };
                const pName = playerNames[playerNum] || `Player ${playerNum}`;
                // We need a way to add a message without sending - this is handled in main.js
                window.dispatchEvent(new CustomEvent('player-roll-dice', { 
                    detail: { playerNumber: playerNum, playerName: pName }
                }));
            }
        });
        buttonsContainer.appendChild(dicePlayerBtn);
        
        playerContainer.appendChild(buttonsContainer);
        additionalPlayersContainer.appendChild(playerContainer);
        return input; // Return the input element
    }

    /**
     * Add a new player to the game
     */
    function addPlayer(onSendMessage) {
        debugLog("Adding new player UI for player number:", nextPlayerNumber);
        const newPlayerInput = addPlayerUI(nextPlayerNumber, null, onSendMessage);
        playerNames[nextPlayerNumber] = null; // Add to playerNames map, initially unnamed
        savePlayerNames();
        savePlayerState(); // Save state including new nextPlayerNumber
        
        // Store the player number we're adding to reference in the system message
        const joiningPlayerNumber = nextPlayerNumber;
        
        addSystemMessage(`Player ${joiningPlayerNumber} has joined the game! What is your name, adventurer?`, false, false, true);
        
        // Notify DM about new player
        if (currentGameId) {
            const loadingId = `dm-player-join-${Date.now()}`;
            const textId = `response-text-player-join-${Date.now()}`;
            const loadingDiv = createLoadingDivForDM(loadingId, textId);
            debugLog("Setting isGenerating = true (addPlayer)");
            let isGenerating = true; // local variable
            
            fetch('/chat', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    // Much more forceful system message with explicit instructions
                    message: `[URGENT SYSTEM OVERRIDE] NEW PLAYER JOINING: Player ${joiningPlayerNumber} has just joined the game.
                    
                    ⚠️ STOP ALL ONGOING CONVERSATIONS IMMEDIATELY
                    
                    MANDATORY INSTRUCTIONS (DO THIS NOW):
                    1. STOP talking to any other players
                    2. ONLY address Player ${joiningPlayerNumber} directly
                    3. Your next message MUST be a direct greeting to Player ${joiningPlayerNumber}
                    4. You MUST ask "What is your name?" explicitly
                    5. Do NOT continue any previous conversations until Player ${joiningPlayerNumber} responds
                    
                    Example response:
                    "👋 **Welcome, Player ${joiningPlayerNumber}!** *A new adventurer joins our party.* What is your name?"
                    
                    After they tell you their name, respond with "Player ${joiningPlayerNumber} is now named [their actual name]".`,
                    game_id: currentGameId,
                    player_number: 'system',
                    is_system: true
                })
            })
            .then(response => response.json())
            .then(data => {
                if (data && data.message_id) {
                    sendStreamRequest(data.message_id, loadingDiv); // isGenerating will be reset by sendStreamRequest
                } else {
                    debugLog("Setting isGenerating = false (addPlayer - no message_id)");
                    window.dispatchEvent(new CustomEvent('player-generation-complete'));
                }
            })
            .catch(error => {
                debugLog(`Error notifying DM about Player ${joiningPlayerNumber} joining:`, error);
                if (loadingDiv && loadingDiv.parentNode) loadingDiv.remove();
                debugLog("Setting isGenerating = false (addPlayer - catch)");
                window.dispatchEvent(new CustomEvent('player-generation-complete'));
            });
        }
        
        nextPlayerNumber++; // Increment for the next player
        if (newPlayerInput) newPlayerInput.focus();
        
        return joiningPlayerNumber;
    }

    /**
     * Remove a player from the game
     */
    function removePlayer(playerNumber) {
        if (playerNumber <= 1) {
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
            let isGenerating = true; // local variable
            window.dispatchEvent(new CustomEvent('player-generation-started'));
            
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
                if (data && data.message_id) {
                    sendStreamRequest(data.message_id, loadingDiv);
                } else {
                    window.dispatchEvent(new CustomEvent('player-generation-complete'));
                }
            }).catch(error => {
                debugLog(`Error notifying DM about player ${playerNumber} leaving:`, error);
                if (loadingDiv && loadingDiv.parentNode) loadingDiv.remove();
                window.dispatchEvent(new CustomEvent('player-generation-complete'));
            });
        }
        
        return oldName;
    }

    /**
     * Update a player's name/label
     */
    function updatePlayerLabel(playerNumber, name) {
        debugLog(`Updating Player ${playerNumber} label to ${name}`);
        
        // Reject names that are too short
        if (!name || name.length < 2) {
            debugLog(`Rejecting invalid name: "${name}" for Player ${playerNumber} - too short`);
            return false;
        }
        
        const labelElement = document.getElementById(`player${playerNumber}-label`);
        if (labelElement) {
            labelElement.textContent = `${name}:`;
            playerNames[playerNumber] = name;
            
            // Always save immediately when updating a name
            savePlayerNames(playerNames);
            savePlayerState();
            
            debugLog(`Successfully updated Player ${playerNumber} to ${name} and saved to storage`);
            
            // Add system message about name change
            addSystemMessage(`Player ${playerNumber} is now named ${name}.`, false, true, true);
            return true;
        }
        return false;
    }

    /**
     * Ensure all players from storage are represented in the UI
     */
    function ensurePlayersExist(player1Container, onSendMessage) {
        debugLog("Ensuring players exist. Current names:", playerNames);
        // Clear existing dynamic player inputs first to avoid duplication
        additionalPlayersContainer.innerHTML = '';
        
        // Sort player numbers to process them in order
        Object.keys(playerNames)
            .sort((a,b) => parseInt(a) - parseInt(b))
            .forEach(numStr => {
                const num = parseInt(numStr);
                const name = playerNames[num];
                
                if (num === 1) { // Player 1
                    const p1Label = document.getElementById('player1-label');
                    if (p1Label && name) {
                        p1Label.textContent = `${name}:`;
                        debugLog(`Set Player 1 label to "${name}:"`);
                    } else if (p1Label) {
                        p1Label.textContent = 'Player 1:';
                    }
                    
                    // Fix Player 1 click handler
                    if (player1Container) {
                        player1Container.onclick = function() {
                            selectPlayer(player1Container, 1);
                        };
                    }
                } else if (num > 1) { // Additional players
                    debugLog(`Creating UI for existing player ${num}: ${name || 'unnamed'}`);
                    addPlayerUI(num, name, onSendMessage);
                }
            });
    
        // Update nextPlayerNumber based on loaded names
        const playerNumbers = Object.keys(playerNames).map(Number);
        if (playerNumbers.length > 0) {
            nextPlayerNumber = Math.max(...playerNumbers) + 1;
        } else {
            nextPlayerNumber = 2;
        }
        
        debugLog("Finished ensurePlayersExist. nextPlayerNumber =", nextPlayerNumber);
        return nextPlayerNumber;
    }
    
    /**
     * Check if text from DM contains player name information
     */
    function checkForPlayerNames(text) {
        const chatWindow = document.querySelector('#chat-window');
        debugLog("Checking for player names in: " + text.substring(0, 50) + "...");
        
        // First look for exact pattern: "Player X is now named Y"
        if (/Player \d+ is now named/.test(text)) {
            const exactNameRegex = /Player (\d+) is (?:now |)named (\w+)/gi;
            let match;
            
            debugLog("Found 'Player X is now named' pattern, checking for specific matches...");
            
            while ((match = exactNameRegex.exec(text)) !== null) {
                const playerNum = parseInt(match[1]);
                let pName = match[2];
                
                // Simple validation for name
                if (!pName || pName.length < 2) {
                    debugLog(`Rejecting invalid name: "${pName}" for Player ${playerNum} - too short`);
                    continue;
                }
                
                // CRITICAL: Only update player name if they have sent at least one message
                // This ensures players name themselves, not the DM
                const hasPlayerSentMessage = hasPlayerMessageInHistory(playerNum);
                
                if (hasPlayerSentMessage) {
                    debugLog(`Player ${playerNum} has sent messages. Updating name to ${pName}`);
                    updatePlayerLabel(playerNum, pName);
                    return true;
                } else {
                    debugLog(`Player ${playerNum} hasn't sent any messages yet. Not updating name to ${pName}`);
                }
            }
        }
        
        // Check for DM rename request
        if (/what (?:would|should) you like to call (me|the dungeon master|your dungeon master)/i.test(text)) {
            window.awaitingDMRename = true;
            addSystemMessage("The DM wants a new name! Type the new name for the DM and press Enter.", false, false, true);
            debugLog("DM rename mode activated");
            return true;
        }

        // Look for directly addressed players - try to find "Player X" followed by a name
        const directAddressRegex = /(?:Player|player) (\d+).*?(?:is|called|name is) (\w+)/i;
        let match = text.match(directAddressRegex);
        if (match && match[1] && match[2]) {
            const playerNum = parseInt(match[1]);
            const possibleName = match[2];
            debugLog(`Found direct address: Player ${playerNum} is called ${possibleName}`);
            updatePlayerLabel(playerNum, possibleName);
            return true;
        }

        // Handle welcome messages to specific players
        const welcomeRegex = /(?:welcome|hello|greetings|hi),?\s+(?:Player|player)\s+(\d+)/i;
        match = text.match(welcomeRegex);
        if (match && match[1]) {
            const playerNum = parseInt(match[1]);
            debugLog(`Found welcome to Player ${playerNum}`);
            
            // Now look for a name after this welcome message
            const nameAfterWelcomeRegex = new RegExp(`(?:welcome|hello|greetings|hi),?\\s+(?:Player|player)\\s+${playerNum}[^.!?]*?\\b([A-Z]\\w+)\\b`, 'i');
            const nameMatch = text.match(nameAfterWelcomeRegex);
            
            if (nameMatch && nameMatch[1] && Utils.isLikelyName(nameMatch[1])) {
                const possibleName = nameMatch[1];
                debugLog(`Found potential name ${possibleName} for Player ${playerNum} from welcome message`);
                
                // Only update if player doesn't have a name yet
                if (!playerNames[playerNum] || playerNames[playerNum] === `Player ${playerNum}`) {
                    updatePlayerLabel(playerNum, possibleName);
                    debugLog(`Auto-assigned name ${possibleName} to Player ${playerNum} from welcome message`);
                    return true;
                }
            }
        }
        
        // If no other rules matched, try the most basic approach for single-player scenarios
        // This only applies when we have exactly ONE unnamed player
        const unnamedPlayers = Object.entries(playerNames).filter(([num, name]) => !name || name === `Player ${num}`);
        if (unnamedPlayers.length === 1) {
            const playerNum = parseInt(unnamedPlayers[0][0]);
            
            // Look for direct statement of name
            const nameStatementRegex = /(?:so your name is|you are called|you're|welcome|hello|hi) (\w+)[.!?]/i;
            match = text.match(nameStatementRegex);
            if (match && match[1] && Utils.isLikelyName(match[1])) {
                const possibleName = match[1];
                debugLog(`Single player mode: Found potential name ${possibleName}`);
                updatePlayerLabel(playerNum, possibleName);
                return true;
            }
        }
        
        return false;
    }

    /**
     * Check if a player has sent any messages in the chat history
     * @param {number} playerNum - The player number to check
     * @returns {boolean} - Whether the player has sent any messages
     */
    function hasPlayerMessageInHistory(playerNum) {
        const chatWindow = document.querySelector('#chat-window');
        if (!chatWindow) return false;
        
        // Get all player messages
        const playerMessages = Array.from(chatWindow.querySelectorAll('.player-message'));
        
        // Check if any messages come from this specific player
        for (const msg of playerMessages) {
            const sender = msg.querySelector('.message-sender')?.textContent.trim();
            
            if (sender) {
                // Check both cases:
                // 1. Generic "Player X:" (where X is the player number)
                // 2. If player already has a name but sends more messages
                if (sender.startsWith(`Player ${playerNum}:`) || 
                    (playerNames[playerNum] && sender.startsWith(`${playerNames[playerNum]}:`))) {
                    return true;
                }
            }
        }
        
        return false;
    }

    // Expose public methods
    return {
        setup,
        selectPlayer,
        addPlayerUI,
        addPlayer,
        removePlayer,
        updatePlayerLabel,
        ensurePlayersExist,
        checkForPlayerNames,
        getPlayerName: (num) => playerNames[num],
        getPlayerNames: () => playerNames,
        getNextPlayerNumber: () => nextPlayerNumber,
        getSelectedPlayerNumber: () => selectedPlayerNum,
        // Add a way to access the internal playerNames object
        get playerNames() { return playerNames; },
        set playerNames(newNames) { playerNames = newNames; }
    };
})();

// Export the PlayerManager for use in other files
window.PlayerManager = PlayerManager;
