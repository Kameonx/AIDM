/**
 * Utils Module
 * Contains common utility functions used across the application
 */
const Utils = (function() {
    // Debug setup
    const DEBUG = true;
    function debugLog(...args) {
        if (DEBUG) console.log(...args);
    }

    /**
     * Process formatted text with spell tags, emphasis, etc.
     */    function processFormattedText(text) {
        if (!text) return '';
        
        // Check if the text already contains proper HTML formatting
        if (/<span class="(red|green|blue|yellow|purple|orange|pink|cyan|lime|teal)">/.test(text)) {
            return text; // Already formatted with HTML, return as is
        }

        // Preserve non-color brackets before processing
        text = preserveNonColorBrackets(text);

        // Convert <font color="...">...</font> to <span class="...">...</span>
        text = text.replace(/<font\s+color=["']?(red|green|blue|yellow|purple|orange|pink|cyan|lime|teal)["']?>((?:.|\n)*?)<\/font>/gi, function(_, color, inner) {
            return `<span class="${color}">${inner}</span>`;
        });

        // Escape HTML first to prevent XSS, but preserve intentional formatting
        let processedText = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        // Unescape our color spans (so they render as HTML)
        processedText = processedText.replace(/&lt;span class="(red|green|blue|yellow|purple|orange|pink|cyan|lime|teal)"&gt;([\s\S]*?)&lt;\/span&gt;/g, '<span class="$1">$2</span>');

        // Handle reasoning text from AI models FIRST (before other processing)
        processedText = processReasoningText(processedText);

        // Process emphasis tags FIRST (before color tags to avoid conflicts)
        processedText = processedText
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')  // Bold
            .replace(/\*(.*?)\*/g, '<em>$1</em>');             // Italic

        // Process new color tags [color:text] - Handle nested and malformed tags
        const colorTypes = ['red', 'green', 'blue', 'yellow', 'purple', 'orange', 'pink', 'cyan', 'lime', 'teal', 'brown', 'silver', 'wood'];
        
        // First, clean up nested color tags like [purple:[purple:text]] -> [purple:text]
        for (const color of colorTypes) {
            // Remove nested color tags of the same type
            const nestedRegex = new RegExp(`\\[${color}:\\[${color}:(.*?)\\]\\]`, 'gi');
            processedText = processedText.replace(nestedRegex, `[${color}:$1]`);
            
            // Remove any remaining nested brackets within color tags
            const malformedRegex = new RegExp(`\\[${color}:\\[([^\\]]*?):(.*?)\\]\\]`, 'gi');
            processedText = processedText.replace(malformedRegex, `[${color}:$2]`);
        }
        
        // Now process clean color tags [color:text]
        for (const color of colorTypes) {
            const regex = new RegExp(`\\[${color}:(.*?)\\]`, 'gi');
            processedText = processedText.replace(regex, `<span class="${color}">$1</span>`);
        }
          // IMPORTANT: Don't remove unmatched [color:text] tags - preserve them as regular text
        // This was causing brackets to disappear from the text
        // processedText = processedText.replace(/\[(red|green|blue|yellow|purple|orange|pink|cyan|lime|teal|brown|silver|wood):(.*?)\]/gi, '');
        
        // Handle line breaks and spacing (preserve existing line breaks and paragraphs)
        // Only process if the text doesn't already have HTML formatting AND doesn't look like it was already processed
        const hasExistingFormatting = /<br\s*\/?>|<p\s*>|<\/p>/.test(processedText);
        const appearsToBeRawText = !hasExistingFormatting && /\n/.test(processedText);
        
        if (appearsToBeRawText) {
            // Convert double newlines to paragraph breaks
            processedText = processedText.replace(/\n\s*\n/g, '</p><p>');
            
            // Convert single newlines to line breaks
            processedText = processedText.replace(/\n/g, '<br>');
            
            // Wrap in paragraph tags if we have content and it's not already wrapped
            if (processedText.trim() && !processedText.includes('<p>') && !processedText.includes('</p>')) {
                processedText = '<p>' + processedText + '</p>';
            }
        } else if (!hasExistingFormatting) {
            // If no line breaks but also no existing formatting, still preserve multiple spaces
            //and add minimal paragraph structure for better display
            if (processedText.trim() && !processedText.includes('<p>')) {
                processedText = '<p>' + processedText + '</p>';
            }
        }
        
        // Preserve multiple spaces (but not if already converted to &nbsp;)
        if (!processedText.includes('&nbsp;')) {
            processedText = processedText.replace(/  +/g, function(match) {
                return '&nbsp;'.repeat(match.length);
            });
        }

        return processedText;
    }

    /**
     * Process reasoning text from AI models
     * Converts <think>...</think> tags into collapsible reasoning sections
     */
    function processReasoningText(text) {
        // Check for reasoning tags from different models
        const reasoningPatterns = [
            { start: '&lt;think&gt;', end: '&lt;/think&gt;', name: 'Reasoning' },
            { start: '&lt;thinking&gt;', end: '&lt;/thinking&gt;', name: 'Thinking' },
            { start: '&lt;analysis&gt;', end: '&lt;/analysis&gt;', name: 'Analysis' }
        ];
        
        let hasReasoning = false;
        let cleanedText = text;
        let reasoningContent = '';
        
        for (const pattern of reasoningPatterns) {
            const regex = new RegExp(`${pattern.start}([\\s\\S]*?)${pattern.end}`, 'gi');
            
            // Check if we have complete reasoning tags
            const completeMatch = cleanedText.match(regex);
            if (completeMatch) {
                hasReasoning = true;
                // Extract the reasoning content for later use
                const reasoningMatch = regex.exec(text);
                if (reasoningMatch && reasoningMatch[1]) {
                    reasoningContent = reasoningMatch[1].trim();
                }
                
                // Remove the complete reasoning tags and content from the main text
                cleanedText = cleanedText.replace(regex, '');
            } else {
                // Also check for incomplete reasoning tags (still being generated)
                const incompleteStartRegex = new RegExp(`${pattern.start}([\\s\\S]*)$`, 'i');
                const incompleteMatch = cleanedText.match(incompleteStartRegex);
                if (incompleteMatch) {
                    // Found incomplete reasoning - remove everything from the start tag onwards
                    cleanedText = cleanedText.replace(incompleteStartRegex, '');
                    hasReasoning = true;
                    // Don't set reasoningContent for incomplete reasoning
                }
            }
        }
        
        // Only add the reasoning toggle if we have complete reasoning content
        if (hasReasoning && reasoningContent) {
            const reasoningId = 'reasoning-' + Math.random().toString(36).substr(2, 9);
            
            // Tighten the HTML structure - remove all unnecessary whitespace and line breaks
            cleanedText = `<span class="reasoning-toggle-inline" onclick="toggleReasoning('${reasoningId}')" title="Click to view AI reasoning"><span class="reasoning-caret">▶</span></span><div class="reasoning-content-inline" id="${reasoningId}" style="display: none;"><div class="reasoning-text-inline">${reasoningContent}</div></div>${cleanedText}`;
        }
        
        return cleanedText;
    }

    /**
     * Extract a name from message text
     */
    function extractName(message) {
        if (!message || typeof message !== 'string') return null;
        
        // Accept multi-word names (with spaces, apostrophes, hyphens)
        const namePatterns = [
            /my name is ([A-Za-z][\w\s'-]{1,50})/i,
            /i am ([A-Za-z][\w\s'-]{1,50})/i,
            /call me ([A-Za-z][\w\s'-]{1,50})/i, 
            /name's ([A-Za-z][\w\s'-]{1,50})/i,
            /i'm ([A-Za-z][\w\s'-]{1,50})/i,
            /^([A-Za-z][\w\s'-]{1,50}) is my name/i,
            /^([A-Za-z][\w\s'-]{1,50})$/i // Just a name with nothing else
        ];
        
        for (const pattern of namePatterns) {
            const match = message.match(pattern);
            if (match && match[1]) {
                const name = match[1].trim().replace(/\s+/g, ' ');
                // Only accept names with at least 2 non-space characters
                if (name.replace(/\s/g, '').length > 1) {
                    debugLog(`Extracted name from user message: ${name}`);
                    return name;
                }
            }
        }
        return null;
    }

    /**
     * Check if a string is likely a proper name
     */
    function isLikelyName(str) {
        if (!str || typeof str !== 'string') return false;
        
        // Common words that aren't names
        const commonWords = [
            "adventurer", "friend", "traveler", "player", "everyone", "there", "you", "all", "guys", 
            "welcome", "hello", "hi", "hey", "greetings", "and", "the", "this", "that", "what", 
            "your", "their", "our", "his", "her", "its", "new", "game", "continue", "tell", "let",
            "know", "want", "need", "like", "now", "then", "here", "well", "good", "great", "first",
            "name", "quest", "journey", "adventure", "your", "you", "yourself", "my"
        ];
        
        // Clean up and normalize the string
        const cleanStr = str.toLowerCase().trim().replace(/[.,!?:;'"()]/g, '');
        
        // Reject if empty, too short, or a common word
        if (cleanStr.replace(/\s/g, '').length < 2 || commonWords.includes(cleanStr)) {
            return false;
        }
        
        // Accept multi-word names if each word starts with a capital letter
        const words = str.trim().split(/\s+/);
        if (words.length > 1) {
            if (words.every(w => w.length > 0 && w[0] === w[0].toUpperCase())) {
                return true;
            }
        }
        // Or single word, starts with capital
        if (/^[A-Z]/.test(str.trim())) {
            return true;
        }
        
        return false;
    }

    /**
     * Save player names to localStorage
     */
    function savePlayerNames(playerNames) {
        try {
            // Double check that playerNames is valid before saving
            if (playerNames && typeof playerNames === 'object') {
                localStorage.setItem('playerNames', JSON.stringify(playerNames));
                debugLog("Player names saved to localStorage:", playerNames);
            } else {
                debugLog("Warning: Attempted to save invalid playerNames", playerNames);
            }
        } catch (e) {
            debugLog("Error saving player names:", e);
        }
    }
    
    /**
     * Load player names from localStorage
     */
    function loadPlayerNames() {
        try {
            const saved = localStorage.getItem('playerNames');
            if (saved) {
                const loaded = JSON.parse(saved);
                debugLog("Successfully loaded player names from localStorage:", loaded);
                
                // Ensure it's an object, not null or undefined
                if (typeof loaded === 'object' && loaded !== null) {
                    // Make sure player 1 is always defined
                    if (!loaded.hasOwnProperty('1')) {
                        loaded['1'] = null;
                    }
                    return loaded;
                }
            } else {
                debugLog("No playerNames found in localStorage");
            }
        } catch (e) {
            debugLog("Error loading player names:", e);
        }
        return { 1: null }; // Default for Player 1
    }
    
    /**
     * Save entire player state to localStorage
     */
    function savePlayerState(state) {
        try {
            // Add validation to ensure proper state structure 
            if (state && typeof state === 'object') {
                // Make sure the names object exists
                if (!state.names || typeof state.names !== 'object') {
                    state.names = { 1: null };
                }
                localStorage.setItem('playerState', JSON.stringify(state));
                debugLog("Player state saved to localStorage:", state);
            } else {
                debugLog("Warning: Attempted to save invalid player state", state);
            }
        } catch (e) { 
            debugLog("Error saving player state:", e);
        }
    }
    
    /**
     * Load player state from localStorage
     */
    function loadPlayerState() {
        try {
            const saved = localStorage.getItem('playerState');
            if (saved) {
                const state = JSON.parse(saved);
                debugLog("Successfully loaded player state from localStorage:", state);
                return state;
            } else {
                debugLog("No playerState found in localStorage");
            }
        } catch (e) { 
            debugLog("Error loading player state:", e); 
        }
        return { names: { 1: null }, nextPlayerNumber: 2, isMultiplayerActive: false, dmName: "DM" };
    }

    /**
     * Check if a message hash exists to avoid duplicates
     */
    function messageExists(processedMessageIds, role, content) {
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

    /**
     * Preserve brackets that aren't color formatting tags
     */
    function preserveNonColorBrackets(text) {
        if (!text) return text;
        
        // Find all bracket patterns that are NOT color tags
        const colorTypes = ['red', 'green', 'blue', 'yellow', 'purple', 'orange', 'pink', 'cyan', 'lime', 'teal', 'brown', 'silver', 'wood'];
        const colorPattern = new RegExp(`\\[(${colorTypes.join('|')}):[^\\]]*\\]`, 'gi');
        
        // Temporarily replace color tags with placeholders
        const colorTags = [];
        let tempText = text.replace(colorPattern, (match) => {
            const placeholder = `__COLOR_TAG_${colorTags.length}__`;
            colorTags.push(match);
            return placeholder;
        });
        
        // Now tempText has all non-color brackets preserved and color tags as placeholders
        // Restore color tag placeholders
        tempText = tempText.replace(/__COLOR_TAG_(\d+)__/g, (match, index) => {
            return colorTags[parseInt(index)];
        });
        
        return tempText;
    }

    // Expose public methods
    return {
        processFormattedText,
        extractName,
        isLikelyName,
        savePlayerNames,
        loadPlayerNames,
        savePlayerState,
        loadPlayerState,
        messageExists,
        debugLog,
        // Add new chat history functions
        saveChatHistory,
        loadChatHistory,
        clearChatHistory,
        saveGameData,
        loadGameData
    };
})();

/**
 * Save chat history to localStorage
 */
function saveChatHistory(gameId, chatHistory) {
    try {
        const key = `chatHistory_${gameId}`;
        console.log("Utils.saveChatHistory - key:", key, "messages:", chatHistory.length);
        
        // Add extra validation
        if (!gameId) {
            console.error("Utils.saveChatHistory - ERROR: No gameId provided");
            return;
        }
        
        if (!Array.isArray(chatHistory)) {
            console.error("Utils.saveChatHistory - ERROR: chatHistory is not an array:", typeof chatHistory);
            return;
        }
        
        // Read existing for safety checks and backup
        const existingRaw = localStorage.getItem(key);
        let existingLen = 0;
        if (existingRaw) {
            try {
                const existingArr = JSON.parse(existingRaw);
                if (Array.isArray(existingArr)) existingLen = existingArr.length;
            } catch (_) { /* ignore parse issues */ }
        }
        
        // Safety: don't overwrite a non-empty history with an empty array unintentionally
        if (existingLen > 0 && chatHistory.length === 0) {
            console.warn("Utils.saveChatHistory - Refusing to overwrite non-empty history with empty array. Keeping existing.");
            return;
        }
        
        // Backup current value before writing new data
        if (existingRaw) {
            const backupKey = `chatHistoryBackup_${gameId}`;
            try {
                localStorage.setItem(backupKey, existingRaw);
                console.log("Utils.saveChatHistory - Backup saved to", backupKey);
            } catch (e) {
                console.warn("Utils.saveChatHistory - Failed to save backup:", e);
            }
        }
        
        const serialized = JSON.stringify(chatHistory);
        localStorage.setItem(key, serialized);
        console.log("Utils.saveChatHistory - SUCCESS, stored", serialized.length, "characters");
        Utils.debugLog("Chat history saved to localStorage:", key, chatHistory.length, "messages");
    } catch (e) {
        console.log("Utils.saveChatHistory - ERROR:", e);
        Utils.debugLog("Error saving chat history:", e);
        throw e; // Re-throw so calling code can handle
    }
}

/**
 * Load chat history from localStorage
 */
function loadChatHistory(gameId) {
    try {
        const key = `chatHistory_${gameId}`;
        console.log("Utils.loadChatHistory - loading key:", key);
        const saved = localStorage.getItem(key);
        if (saved) {
            const history = JSON.parse(saved);
            console.log("Utils.loadChatHistory - SUCCESS: loaded", history.length, "messages");
            Utils.debugLog("Chat history loaded from localStorage:", key, history.length, "messages");
            return history;
        } else {
            console.log("Utils.loadChatHistory - No data found for key:", key);
        }
        // Attempt recovery from backup if main key missing or empty
        const backupKey = `chatHistoryBackup_${gameId}`;
        const backup = localStorage.getItem(backupKey);
        if (backup) {
            try {
                const hist = JSON.parse(backup);
                if (Array.isArray(hist) && hist.length > 0) {
                    console.warn("Utils.loadChatHistory - Restoring from backup:", backupKey, "messages:", hist.length);
                    return hist;
                }
            } catch (_) { /* ignore */ }
        }
    } catch (e) {
        console.log("Utils.loadChatHistory - ERROR:", e);
        Utils.debugLog("Error loading chat history:", e);
        // On parse error, attempt backup restore
        try {
            const backupKey = `chatHistoryBackup_${gameId}`;
            const backup = localStorage.getItem(backupKey);
            if (backup) {
                const hist = JSON.parse(backup);
                if (Array.isArray(hist) && hist.length > 0) {
                    console.warn("Utils.loadChatHistory - Error on main, restored from backup:", hist.length, "messages");
                    return hist;
                }
            }
        } catch (_) { /* ignore */ }
    }
    return [];
}

/**
 * Clear chat history for a specific game
 */
function clearChatHistory(gameId) {
    try {
        const key = `chatHistory_${gameId}`;
        localStorage.removeItem(key);
        Utils.debugLog("Chat history cleared for game:", gameId);
    } catch (e) {
        Utils.debugLog("Error clearing chat history:", e);
    }
}

/**
 * Save game data (metadata like current model, etc.)
 */
function saveGameData(gameId, gameData) {
    try {
        const key = `gameData_${gameId}`;
        localStorage.setItem(key, JSON.stringify(gameData));
        Utils.debugLog("Game data saved:", key, gameData);
    } catch (e) {
        Utils.debugLog("Error saving game data:", e);
    }
}

/**
 * Load game data from localStorage
 */
function loadGameData(gameId) {
    try {
        const key = `gameData_${gameId}`;
        const saved = localStorage.getItem(key);
        if (saved) {
            const data = JSON.parse(saved);
            Utils.debugLog("Game data loaded:", key, data);
            return data;
        }
    } catch (e) {
        Utils.debugLog("Error loading game data:", e);
    }
    return {};
}

// Add new functions to Utils object
Utils.saveChatHistory = saveChatHistory;
Utils.loadChatHistory = loadChatHistory;
Utils.clearChatHistory = clearChatHistory;
Utils.saveGameData = saveGameData;
Utils.loadGameData = loadGameData;
