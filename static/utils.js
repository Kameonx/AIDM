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

        // Check if the text already contains any <span class="..."> color formatting
        if (/<span class="[\w\-]+">/.test(text)) {
            return text; // Already formatted with HTML, return as is
        }

        // Escape HTML first to prevent XSS, but preserve intentional formatting
        let processedText = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        // Handle reasoning text from AI models FIRST (before other processing)
        processedText = processReasoningText(processedText);

        // Process markdown-like formatting (matching the app.py format)
        processedText = processedText.replace(/`([^`]+)`/g, '<code style="background: #2d2d2d; padding: 2px 4px; border-radius: 3px; font-family: monospace;">$1</code>');
        processedText = processedText.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
        processedText = processedText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        processedText = processedText.replace(/\*(.*?)\*/g, '<em>$1</em>');

        // Replace color tags with proper CSS classes - improved regex to handle spaces
        processedText = processedText.replace(/\[red:(.*?)\]/g, '<span class="color-red">$1</span>');
        processedText = processedText.replace(/\[green:(.*?)\]/g, '<span class="color-green">$1</span>');
        processedText = processedText.replace(/\[blue:(.*?)\]/g, '<span class="color-blue">$1</span>');
        processedText = processedText.replace(/\[yellow:(.*?)\]/g, '<span class="color-yellow">$1</span>');
        processedText = processedText.replace(/\[purple:(.*?)\]/g, '<span class="color-purple">$1</span>');
        processedText = processedText.replace(/\[orange:(.*?)\]/g, '<span class="color-orange">$1</span>');
        processedText = processedText.replace(/\[pink:(.*?)\]/g, '<span class="color-pink">$1</span>');
        processedText = processedText.replace(/\[cyan:(.*?)\]/g, '<span class="color-cyan">$1</span>');
        processedText = processedText.replace(/\[lime:(.*?)\]/g, '<span class="color-lime">$1</span>');
        processedText = processedText.replace(/\[teal:(.*?)\]/g, '<span class="color-teal">$1</span>');

        // Fix spacing issues by ensuring proper word boundaries around color spans
        processedText = processedText.replace(/(\S)<span class="color-/g, '$1 <span class="color-');
        processedText = processedText.replace(/<\/span>(\S)/g, '</span> $1');

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
    }    /**
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
     * Save chat history to localStorage
     * This provides backup storage when server resets
     */
    function saveChatHistoryToLocal(gameId, chatHistory) {
        try {
            if (!gameId || !Array.isArray(chatHistory)) {
                debugLog("Invalid parameters for saveChatHistoryToLocal:", { gameId, chatHistory });
                return false;
            }

            const chatData = {
                gameId: gameId,
                timestamp: Date.now(),
                history: chatHistory,
                version: "1.0"
            };

            // Save individual game history
            localStorage.setItem(`chatHistory_${gameId}`, JSON.stringify(chatData));
            
            // Also maintain a list of all saved game IDs
            const savedGames = getSavedGamesList();
            if (!savedGames.includes(gameId)) {
                savedGames.push(gameId);
                // Keep only the 10 most recent games to avoid localStorage bloat
                const recentGames = savedGames.slice(-10);
                localStorage.setItem('savedGamesList', JSON.stringify(recentGames));
            }

            debugLog(`Chat history saved to localStorage for game ${gameId}:`, chatHistory.length, "messages");
            return true;
        } catch (e) {
            debugLog("Error saving chat history to localStorage:", e);
            return false;
        }
    }

    /**
     * Load chat history from localStorage
     */
    function loadChatHistoryFromLocal(gameId) {
        try {
            if (!gameId) {
                debugLog("No gameId provided for loadChatHistoryFromLocal");
                return null;
            }

            const saved = localStorage.getItem(`chatHistory_${gameId}`);
            if (saved) {
                const chatData = JSON.parse(saved);
                if (chatData && chatData.history && Array.isArray(chatData.history)) {
                    debugLog(`Loaded chat history from localStorage for game ${gameId}:`, chatData.history.length, "messages");
                    return chatData.history;
                }
            }
            
            debugLog(`No chat history found in localStorage for game ${gameId}`);
            return null;
        } catch (e) {
            debugLog("Error loading chat history from localStorage:", e);
            return null;
        }
    }

    /**
     * Get list of saved game IDs
     */
    function getSavedGamesList() {
        try {
            const saved = localStorage.getItem('savedGamesList');
            if (saved) {
                const gamesList = JSON.parse(saved);
                return Array.isArray(gamesList) ? gamesList : [];
            }
        } catch (e) {
            debugLog("Error loading saved games list:", e);
        }
        return [];
    }

    /**
     * Get all saved chat histories for backup/restore purposes
     */
    function getAllSavedChatHistories() {
        const savedGames = getSavedGamesList();
        const allHistories = {};
        
        savedGames.forEach(gameId => {
            const history = loadChatHistoryFromLocal(gameId);
            if (history) {
                allHistories[gameId] = history;
            }
        });
        
        return allHistories;
    }

    /**
     * Clean up old chat histories from localStorage
     */
    function cleanupOldChatHistories(keepCount = 5) {
        try {
            const savedGames = getSavedGamesList();
            if (savedGames.length <= keepCount) {
                return; // Nothing to clean up
            }

            // Sort by timestamp (assuming gameId contains timestamp) and keep the most recent
            const gamesToDelete = savedGames.slice(0, -keepCount);
            
            gamesToDelete.forEach(gameId => {
                localStorage.removeItem(`chatHistory_${gameId}`);
                debugLog(`Cleaned up old chat history for game ${gameId}`);
            });

            // Update the saved games list
            const recentGames = savedGames.slice(-keepCount);
            localStorage.setItem('savedGamesList', JSON.stringify(recentGames));
            
            debugLog(`Cleaned up ${gamesToDelete.length} old chat histories, kept ${keepCount} most recent`);
        } catch (e) {
            debugLog("Error cleaning up old chat histories:", e);
        }
    }

    /**
     * Convert chat messages from DOM to a format suitable for storage
     */
    function convertDOMMessagesToStorageFormat(chatWindow) {
        try {
            const messages = Array.from(chatWindow.querySelectorAll('.message:not(.temporary-message)'))
                .map(msg => {
                    const senderEl = msg.querySelector('.message-sender');
                    const contentEl = msg.querySelector('.message-content');
                    if (!senderEl || !contentEl) return null;
                    const sender = senderEl.textContent.replace(':', '').trim();
                    const content = contentEl.textContent.trim();
                    const contentHTML = contentEl.innerHTML.trim();
                    if (!content) return null;
                    // Determine message role/type
                    let role = 'user';
                    let type = 'player';
                    // Robust DM detection: class or sender name (case-insensitive)
                    if (msg.classList.contains('system-message')) {
                        role = 'system';
                        type = 'system';
                    } else if (msg.classList.contains('dm-message') || 
                               sender.toLowerCase() === 'dm' || 
                               sender.toLowerCase() === (window.dmName ? window.dmName.toLowerCase() : 'dm') ||
                               sender === window.dmName) {
                        role = 'assistant';
                        type = 'dm';
                    }
                    return {
                        role: role,
                        type: type,
                        sender: sender,
                        content: content,
                        contentHTML: contentHTML,
                        timestamp: Date.now()
                    };
                })
                .filter(msg => msg !== null);
            return messages;
        } catch (e) {
            debugLog("Error converting DOM messages to storage format:", e);
            return [];
        }
    }    // Expose public methods
    return {
        processFormattedText,
        extractName,
        isLikelyName,
        savePlayerNames,
        loadPlayerNames,
        savePlayerState,
        loadPlayerState,
        messageExists,
        saveChatHistoryToLocal,
        loadChatHistoryFromLocal,
        getSavedGamesList,
        getAllSavedChatHistories,
        cleanupOldChatHistories,
        convertDOMMessagesToStorageFormat,
        debugLog
    };
})();

// Make Utils available globally
window.Utils = Utils;
