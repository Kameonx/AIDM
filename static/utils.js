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
     */
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

    /**
     * Extract a name from message text
     */
    function extractName(message) {
        if (!message || typeof message !== 'string') return null;
        
        // Look for common ways people introduce themselves
        const namePatterns = [
            /my name is (\w+)/i,
            /i am (\w+)/i,
            /call me (\w+)/i, 
            /name's (\w+)/i,
            /i'm (\w+)/i,
            /^(\w+) is my name/i,
            /^(\w+)$/i // Just a name with nothing else
        ];
        
        for (const pattern of namePatterns) {
            const match = message.match(pattern);
            if (match && match[1]) {
                const name = match[1];
                // Only accept properly capitalized words as names
                if (name.charAt(0) === name.charAt(0).toUpperCase() && name.length > 1) {
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
        const cleanStr = str.toLowerCase().trim().replace(/[.,!?:;'"()]/, '');
        
        // Reject if empty, too short, or a common word
        if (cleanStr.length < 2 || commonWords.includes(cleanStr)) {
            return false;
        }
        
        // Check if it starts with a capital letter in the original
        // This is important for names!
        if (!/^[A-Z]/.test(str)) {
            return false;
        }
        
        return true;
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
        debugLog
    };
})();

// Make Utils available globally
window.Utils = Utils;
