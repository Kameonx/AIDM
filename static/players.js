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
                debugLog("Hiding remove button for Player 1");
                removePlayerBtn.classList.add('hidden');
            }
        }
        
        // Update global selection variables in main.js
        if (window.updatePlayerSelection) {
            window.updatePlayerSelection(selectedPlayerElement, selectedPlayerNum);
        }
        
        debugLog(`Selection complete. selectedPlayerNum: ${selectedPlayerNum}, selectedPlayerElement:`, selectedPlayerElement);
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
        input.autocomplete = 'new-password';
        input.autocorrect = 'off';
        input.autocapitalize = 'off';
        input.spellcheck = false;
        input.setAttribute('data-form-type', 'chat');
        input.setAttribute('data-lpignore', 'true');
        input.setAttribute('data-1p-ignore', 'true');
        input.setAttribute('name', `chat-message-${playerNum}`);
        input.setAttribute('role', 'textbox');
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
        // Find the lowest available player number > 1
        let usedNumbers = Object.keys(playerNames).map(Number).filter(n => n > 1);
        let newPlayerNum = 2;
        while (usedNumbers.includes(newPlayerNum)) {
            newPlayerNum++;
        }
        debugLog("Adding new player UI for player number:", newPlayerNum);
        const newPlayerInput = addPlayerUI(newPlayerNum, null, onSendMessage);
        playerNames[newPlayerNum] = null; // Add to playerNames map, initially unnamed
        savePlayerNames();
        savePlayerState(); // Save state including new player

        // Store the player number we're adding to reference in the system message
        const joiningPlayerNumber = newPlayerNum;

        addSystemMessage(`Player ${joiningPlayerNumber} has joined the game! What is your name, adventurer?`, false, false, true);

        // Notify DM about new player - but don't show this message in chat
        if (currentGameId) {
            // Send invisible system message to DM
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
                    is_system: true,
                    invisible_to_players: true // Add this flag to mark as invisible
                })
            })
            .then(response => response.json())
            .then(data => {
                if (data && data.message_id) {
                    // Don't create loading div for invisible messages
                    // Just let the DM respond normally without showing system message
                    debugLog("Invisible system message sent to DM for player join");
                }
            })
            .catch(error => {
                debugLog(`Error notifying DM about Player ${joiningPlayerNumber} joining:`, error);
            });
        }

        // No need to increment nextPlayerNumber anymore
        if (newPlayerInput) newPlayerInput.focus();

        return joiningPlayerNumber;
    }

    /**
     * Remove a player from the game
     */
    function removePlayer(playerNumber) {
        if (playerNumber <= 1) {
            debugLog("Cannot remove Player 1");
            return null; // Can't remove Player 1
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
        savePlayerNames(playerNames);
        savePlayerState();
        
        // Remove player UI
        const playerContainer = document.getElementById(`player${playerNumber}-container`);
        if (playerContainer) {
            playerContainer.remove();
        }
        
        // Add system message about player leaving
        addSystemMessage(`${oldName} has left the game.`, false, false, true);
        
        // Get list of remaining players for context
        const remainingPlayers = Object.entries(playerNames)
            .filter(([num, name]) => name && name !== null)
            .map(([num, name]) => `${name} (Player ${num})`)
            .join(', ') || 'Only Player 1 remains';
        
        // Notify DM with invisible system message
        if (currentGameId) {
            fetch('/chat', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    message: `[CRITICAL SYSTEM UPDATE] ${oldName} (Player ${playerNumber}) has LEFT THE GAME PERMANENTLY.
                    
                    🚨 IMPORTANT: ${oldName} is NO LONGER part of this adventure. Do NOT address them anymore.
                    
                    CURRENT ACTIVE PLAYERS: ${remainingPlayers}
                    
                    Please briefly acknowledge ${oldName}'s departure in the story (maybe they "vanished in a flash of light" or "decided to part ways") and then ONLY continue the adventure with the remaining active players listed above.
                    
                    Do NOT wait for or expect any response from ${oldName}. They are completely gone from this game.`,
                    game_id: currentGameId,
                    player_number: 'system',
                    is_system: true,
                    invisible_to_players: true // Add this flag to mark as invisible
                })
            })
            .then(response => response.json())
            .then(data => {
                if (data && data.message_id) {
                    debugLog("Invisible system message sent to DM for player departure");
                }
            }).catch(error => {
                debugLog(`Error notifying DM about player ${playerNumber} leaving:`, error);
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
        if (!name || name.trim().length < 2) {
            debugLog(`Rejecting invalid name: "${name}" for Player ${playerNumber} - too short`);
            return false;
        }
        // Accept multi-word names, trim and collapse spaces
        const cleanName = name.trim().replace(/\s+/g, ' ');
        const labelElement = document.getElementById(`player${playerNumber}-label`);
        if (labelElement) {
            labelElement.textContent = `${cleanName}:`;
            playerNames[playerNumber] = cleanName;
            
            // Always save immediately when updating a name
            savePlayerNames(playerNames);
            savePlayerState();
            
            debugLog(`Successfully updated Player ${playerNumber} to ${cleanName} and saved to storage`);
            
            // Add system message about name change
            addSystemMessage(`Player ${playerNumber} is now named ${cleanName}.`, false, true, true);
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

        // No longer update nextPlayerNumber here
        // Instead, always find the lowest available number when adding

        debugLog("Finished ensurePlayersExist.");
        // Return nothing or optionally the next available number
        return null;
    }
    
    /**
     * Check if text from DM contains player name information
     */
    function checkForPlayerNames(text) {
        const chatWindow = document.querySelector('#chat-window');
        debugLog("Checking for player names in: " + text.substring(0, 50) + "...");
        
        // First look for exact pattern: "Player X is now named Y"
        if (/Player \d+ is now named/.test(text)) {
            // Accept multi-word names (with spaces) and require 'is now named'
            const exactNameRegex = /Player (\d+) is now named\s+([A-Za-z][\w\s'-]{1,50})/gi;
            let match;
            
            debugLog("Found 'Player X is now named' pattern, checking for specific matches...");
            
            while ((match = exactNameRegex.exec(text)) !== null) {
                const playerNum = parseInt(match[1]);
                let pName = match[2];
                
                // Simple validation for name
                if (!pName || pName.trim().length < 2) {
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
            // If no valid exact-name match, stop further parsing to avoid mis-captures
            debugLog("Exact 'is now named' pattern found but no valid captures; skipping direct-address regex");
            return false;
        }
        
        // Check for DM rename request
        if (/what (?:would|should) you like to call (me|the dungeon master|your dungeon master)/i.test(text)) {
            window.awaitingDMRename = true;
            addSystemMessage("The DM wants a new name! Type the new name for the DM and press Enter.", false, false, true);
            debugLog("DM rename mode activated");
            return true;
        }

        // Look for directly addressed players - try to find "Player X" followed by a name
        // Accept multi-word names
        const directAddressRegex = /(?:Player|player) (\d+).*?(?:is named|is called|called|name is)\s+([A-Za-z][\w\s'-]{1,50})/i;
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
            // Accept multi-word names
            const nameAfterWelcomeRegex = new RegExp(`(?:welcome|hello|greetings|hi),?\\s+(?:Player|player)\\s+${playerNum}[^.!?]*?\\b([A-Za-z][\\w\\s'-]{1,50})\\b`, 'i');
            const nameMatch = text.match(nameAfterWelcomeRegex);
            
            if (nameMatch && nameMatch[1] && Utils.isLikelyName(nameMatch[1])) {
                const possibleName = nameMatch[1];
                debugLog(`Found possible name ${possibleName} for Player ${playerNum} from welcome message`);
                
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
            // Accept multi-word names
            const nameStatementRegex = /(?:so your name is|you are called|you're|welcome|hello|hi) ([A-Za-z][\w\s'-]{1,50})[.!?]/i;
            match = text.match(nameStatementRegex);
            if (match && match[1] && Utils.isLikelyName(match[1])) {
                const possibleName = match[1];
                debugLog(`Single player mode: Found possible name ${possibleName}`);
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
