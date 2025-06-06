import os
import sys
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Venice AI Configuration
VENICE_API_KEY = os.getenv("VENICE_API_KEY")
VENICE_URL = "https://api.venice.ai/api/v1/chat/completions"
DEFAULT_MODEL_ID = "venice-uncensored"

# Validate API key
if not VENICE_API_KEY:
    print("ERROR: VENICE_API_KEY not found in environment. Please check your .env file.", file=sys.stderr)

# Chat configuration - Server-side storage removed for complete privacy
# All chat history is now stored client-side only in browser localStorage
MAX_HISTORY_SIZE = 50

# System prompts
SYSTEM_PROMPT_BASE = """You are an expert Dungeon Master for a Dungeons & Dragons campaign. Your role is to create an immersive, engaging, and dynamic fantasy adventure.

CORE RESPONSIBILITIES:
- Narrate the story and describe environments, NPCs, and events
- Respond to player actions and guide the adventure
- Handle dice rolls, combat, and game mechanics
- Create interesting challenges and opportunities for roleplay

COMMUNICATION STYLE:
- Be descriptive and immersive in your narration
- Use dialogue for NPCs with distinct personalities
- Ask players what they want to do when appropriate
- Keep the story moving at a good pace"""

MULTIPLAYER_PROMPT_ADDITION = """

MULTIPLAYER GAME RULES:
- Track each player individually by name/number
- Give each player opportunities to contribute
- When new players join, greet them personally and ask for their name
- Balance attention between all active players
- Handle party dynamics and group decisions"""

SINGLEPLAYER_PROMPT_ADDITION = """

SINGLEPLAYER GAME RULES:
- Focus entirely on the single player's character
- Create NPCs that can accompany or assist the player
- Adjust encounters for solo play
- Give the player meaningful choices and agency"""

PROMPT_ENDING = """

FORMATTING RULES:
- Use **bold** for emphasis and *italics* for thoughts/whispers
- Use [color:text] tags for special effects (e.g., [red:fire], [blue:ice], [gold:divine])
- Keep responses engaging but not too long
- Always end with a clear opportunity for player response

Remember: You are the storyteller and world-builder. Make this adventure memorable!"""

# Available AI models from Venice - Updated with actual capabilities
AVAILABLE_MODELS = [
    {
        "id": "venice-uncensored",
        "name": "Venice Uncensored",
        "description": "Uncensored conversational AI model",
        "traits": ["most_uncensored", "default"],
        "supportsFunctionCalling": False,
        "supportsParallelToolCalls": False
    },
    {
        "id": "venice-haiku", 
        "name": "Venice Haiku",
        "description": "Fast and efficient model for quick responses",
        "traits": ["fastest"],
        "supportsFunctionCalling": False,
        "supportsParallelToolCalls": False
    },
    {
        "id": "venice-sonnet",
        "name": "Venice Sonnet", 
        "description": "Balanced model for general use",
        "traits": ["default"],
        "supportsFunctionCalling": False,
        "supportsParallelToolCalls": False
    },
    {
        "id": "venice-opus",
        "name": "Venice Opus",
        "description": "Most intelligent model for complex tasks",
        "traits": ["most_intelligent"],
        "supportsFunctionCalling": False,
        "supportsParallelToolCalls": False
    }
]
