from dotenv import load_dotenv
import os
import sys

# Load environment variables
load_dotenv(override=True)

# Venice AI Configuration
VENICE_API_KEY = os.getenv("VENICE_API_KEY")
VENICE_URL = "https://api.venice.ai/api/v1/chat/completions"
DEFAULT_MODEL_ID = "llama-3.1-70b-instruct"  # Changed to uncensored model

# Validate API key
if not VENICE_API_KEY:
    print("ERROR: VENICE_API_KEY not found in environment. Please check your .env file.", file=sys.stderr)

# Chat configuration
CHAT_DIR = 'chat_histories'
MAX_HISTORY_SIZE = 50

# Available AI models from Venice - Updated with actual capabilities
AVAILABLE_MODELS = [
    {
        "id": "llama-3.1-70b-instruct",
        "name": "Llama-3.1-70B-Instruct (Uncensored)",
        "description": "Most uncensored and capable model for creative and unrestricted conversations",
        "traits": ["most_uncensored", "most_intelligent"],
        "supportsFunctionCalling": False,
        "supportsParallelToolCalls": False
    },
    {
        "id": "llama-3.3-70b",
        "name": "Llama-3.3-70B",
        "description": "Latest and most intelligent model with enhanced reasoning capabilities",
        "traits": ["default", "most_intelligent"],
        "supportsFunctionCalling": True,
        "supportsParallelToolCalls": True
    },
    {
        "id": "llama-3.1-8b-instruct",
        "name": "Llama-3.1-8B-Instruct",
        "description": "Faster model for quick responses",
        "traits": ["fastest"],
        "supportsFunctionCalling": False,
        "supportsParallelToolCalls": False
    }
]

# System prompts
SYSTEM_PROMPT_BASE = """You are an expert Dungeon Master for a tabletop RPG adventure. You create immersive, engaging stories with rich descriptions, memorable NPCs, and exciting challenges."""

MULTIPLAYER_PROMPT_ADDITION = """

MULTIPLAYER MODE: You are managing a party with multiple players. Address each player by their chosen name when they interact. Keep track of each player's actions and ensure everyone gets opportunities to participate."""

SINGLEPLAYER_PROMPT_ADDITION = """

SINGLEPLAYER MODE: You are guiding a single adventurer through their personal quest. Create a more intimate, focused narrative tailored to their choices and character."""

PROMPT_ENDING = """

Always respond in character as the DM. Be creative, fair, and entertaining. Use vivid descriptions and maintain consistent world-building."""
