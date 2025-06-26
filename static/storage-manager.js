/**
 * Storage Manager - Handles client-only and hybrid storage modes
 * Provides localStorage management with compression and privacy controls
 */

class StorageManager {
    constructor() {
        this.storageMode = 'client-only'; // Always client-only for maximum privacy
        this.maxStorageSize = 5 * 1024 * 1024; // 5MB limit
        this.compressionQuality = 70; // Image compression quality
        this.init();
    }

    async init() {
        // Force client-only mode for maximum privacy
        this.storageMode = 'client-only';
        
        // Set client-only mode on server
        try {
            await this.setStorageMode('client-only');
            console.log(`Storage mode: ${this.storageMode} (forced client-only)`);
        } catch (error) {
            console.warn('Could not set client-only mode on server:', error);
            // Continue with client-only anyway
        }
    }

    // Switch storage mode
    async setStorageMode(mode) {
        try {
            const response = await fetch('/set_storage_mode', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ storage_mode: mode })
            });
            
            const data = await response.json();
            if (data.success) {
                this.storageMode = mode;
                this.showNotification(data.message);
                
                if (mode === 'client-only') {
                    this.showPrivacyNotification();
                }
                return true;
            } else {
                console.error('Failed to set storage mode:', data.error);
                return false;
            }
        } catch (error) {
            console.error('Error setting storage mode:', error);
            return false;
        }
    }

    // Save chat history (respects storage mode)
    saveChatHistory(gameId, chatHistory) {
        if (this.storageMode === 'client-only') {
            return this.saveToLocalStorage(gameId, chatHistory);
        } else {
            // Hybrid mode - save to both
            this.saveToLocalStorage(gameId, chatHistory);
            // Server-side saving is handled by backend endpoints
        }
    }

    // Load chat history (respects storage mode)
    loadChatHistory(gameId) {
        if (this.storageMode === 'client-only') {
            return this.loadFromLocalStorage(gameId);
        } else {
            // Hybrid mode - try localStorage first, then server
            const localData = this.loadFromLocalStorage(gameId);
            if (localData && localData.length > 0) {
                return localData;
            }
            // Server loading handled by backend endpoints
            return [];
        }
    }

    // Save to localStorage with compression
    saveToLocalStorage(gameId, chatHistory) {
        try {
            // Compress images in chat history before saving
            const compressedHistory = this.compressImagesInHistory(chatHistory);
            
            const dataToSave = {
                gameId: gameId,
                chatHistory: compressedHistory,
                timestamp: Date.now(),
                storageMode: this.storageMode
            };

            const dataString = JSON.stringify(dataToSave);
            const dataSize = new Blob([dataString]).size;

            // Check storage limit
            if (dataSize > this.maxStorageSize) {
                this.handleStorageOverflow(gameId, compressedHistory);
                return;
            }

            localStorage.setItem(`chat_${gameId}`, dataString);
            localStorage.setItem('current_game_id', gameId);
            
            console.log(`Saved to localStorage: ${dataSize} bytes`);
            
        } catch (error) {
            if (error.name === 'QuotaExceededError') {
                this.handleStorageQuotaExceeded(gameId, chatHistory);
            } else {
                console.error('Error saving to localStorage:', error);
            }
        }
    }

    // Load from localStorage
    loadFromLocalStorage(gameId) {
        try {
            const dataString = localStorage.getItem(`chat_${gameId}`);
            if (!dataString) return [];

            const data = JSON.parse(dataString);
            return data.chatHistory || [];
            
        } catch (error) {
            console.error('Error loading from localStorage:', error);
            return [];
        }
    }

    // Compress images in chat history
    compressImagesInHistory(chatHistory) {
        return chatHistory.map(message => {
            if (message.message_type === 'image' && message.image_url) {
                // Create reference instead of storing full base64
                const imageId = this.generateImageId(message.image_url);
                return {
                    ...message,
                    image_reference: imageId,
                    image_url: message.image_url, // Keep original for now
                    storage_optimized: true
                };
            }
            return message;
        });
    }

    // Generate unique image ID
    generateImageId(imageUrl) {
        const hash = this.simpleHash(imageUrl);
        return hash.substr(0, 12);
    }

    // Simple hash function
    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(36);
    }

    // Handle storage overflow
    handleStorageOverflow(gameId, chatHistory) {
        this.showNotification('Chat history too large. Cleaning up old messages...', 'warning');
        
        // Keep only recent messages
        const recentHistory = chatHistory.slice(-50); // Keep last 50 messages
        
        try {
            const dataToSave = {
                gameId: gameId,
                chatHistory: recentHistory,
                timestamp: Date.now(),
                storageMode: this.storageMode,
                cleaned: true
            };

            localStorage.setItem(`chat_${gameId}`, JSON.stringify(dataToSave));
            this.showNotification('Cleaned up old messages to save space.', 'info');
            
        } catch (error) {
            console.error('Failed to save even after cleanup:', error);
            this.showNotification('Storage full. Consider switching to hybrid mode.', 'error');
        }
    }

    // Handle quota exceeded
    handleStorageQuotaExceeded(gameId, chatHistory) {
        this.showNotification('Browser storage limit reached!', 'error');
        
        // Offer solutions
        this.showStorageOptions(gameId, chatHistory);
    }

    // Show storage options dialog
    showStorageOptions(gameId, chatHistory) {
        const options = `
            <div id="storage-options" style="
                position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
                background: rgba(20,20,20,0.95); padding: 24px; border-radius: 12px;
                color: white; max-width: 400px; z-index: 10000;
                box-shadow: 0 4px 20px rgba(0,0,0,0.5);
            ">
                <h3>Storage Limit Reached</h3>
                <p>Your chat history is too large for browser storage. Choose an option:</p>
                <div style="margin: 16px 0;">
                    <button onclick="storageManager.cleanupAndSave('${gameId}')" 
                            style="display: block; width: 100%; margin: 8px 0; padding: 10px; background: #4CAF50; color: white; border: none; border-radius: 6px; cursor: pointer;">
                        Clean Up Old Messages
                    </button>
                    <button onclick="storageManager.switchToHybridMode()" 
                            style="display: block; width: 100%; margin: 8px 0; padding: 10px; background: #2196F3; color: white; border: none; border-radius: 6px; cursor: pointer;">
                        Switch to Hybrid Mode
                    </button>
                    <button onclick="storageManager.downloadBackup('${gameId}')" 
                            style="display: block; width: 100%; margin: 8px 0; padding: 10px; background: #FF9800; color: white; border: none; border-radius: 6px; cursor: pointer;">
                        Download Backup
                    </button>
                    <button onclick="document.getElementById('storage-options').remove()" 
                            style="display: block; width: 100%; margin: 8px 0; padding: 10px; background: #666; color: white; border: none; border-radius: 6px; cursor: pointer;">
                        Cancel
                    </button>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', options);
    }

    // Clean up and save
    cleanupAndSave(gameId) {
        const chatHistory = this.loadFromLocalStorage(gameId);
        this.handleStorageOverflow(gameId, chatHistory);
        document.getElementById('storage-options')?.remove();
    }

    // Switch to hybrid mode
    async switchToHybridMode() {
        await this.setStorageMode('hybrid');
        document.getElementById('storage-options')?.remove();
    }

    // Download backup
    downloadBackup(gameId) {
        const chatHistory = this.loadFromLocalStorage(gameId);
        const dataStr = JSON.stringify(chatHistory, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `chat-backup-${gameId}-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
        document.getElementById('storage-options')?.remove();
        
        this.showNotification('Chat history downloaded successfully!', 'success');
    }

    // Clear all data (for new game in client-only mode)
    clearAllData() {
        if (this.storageMode === 'client-only') {
            // Clear all chat-related localStorage
            const keys = Object.keys(localStorage);
            keys.forEach(key => {
                if (key.startsWith('chat_') || key === 'current_game_id') {
                    localStorage.removeItem(key);
                }
            });
            
            this.showNotification('All chat data cleared for privacy.', 'success');
        }
    }

    // Get storage usage info
    getStorageInfo() {
        const keys = Object.keys(localStorage);
        let totalSize = 0;
        let chatDataSize = 0;
        let chatFiles = 0;

        keys.forEach(key => {
            const value = localStorage.getItem(key);
            const size = new Blob([value]).size;
            totalSize += size;
            
            if (key.startsWith('chat_')) {
                chatDataSize += size;
                chatFiles++;
            }
        });

        return {
            totalSize: totalSize,
            chatDataSize: chatDataSize,
            chatFiles: chatFiles,
            totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
            chatDataSizeMB: (chatDataSize / (1024 * 1024)).toFixed(2),
            percentUsed: ((totalSize / this.maxStorageSize) * 100).toFixed(1)
        };
    }

    // Show storage info
    showStorageInfo() {
        const info = this.getStorageInfo();
        console.log('Storage Info:', info);
        
        this.showNotification(`
            Storage: ${info.totalSizeMB}MB used (${info.percentUsed}%)
            Chat data: ${info.chatDataSizeMB}MB in ${info.chatFiles} files
            Mode: ${this.storageMode}
        `, 'info');
    }

    // Show notification
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed; top: 20px; right: 20px; z-index: 9999;
            background: ${this.getNotificationColor(type)};
            color: white; padding: 12px 20px; border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            max-width: 300px; word-wrap: break-word;
            transition: opacity 0.3s;
        `;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    // Show privacy notification for client-only mode
    showPrivacyNotification() {
        this.showNotification(
            '🔒 Maximum Privacy Mode Active: All data stays in your browser only. ' +
            'No server storage, complete privacy.', 
            'success'
        );
    }

    // Get notification color
    getNotificationColor(type) {
        const colors = {
            info: '#2196F3',
            success: '#4CAF50',
            warning: '#FF9800',
            error: '#f44336'
        };
        return colors[type] || colors.info;
    }
}

// Initialize storage manager
const storageManager = new StorageManager();

// Export for use in other scripts
window.storageManager = storageManager;
