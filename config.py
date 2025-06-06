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

# Chat configuration
CHAT_DIR = 'chat_histories'
MAX_HISTORY_SIZE = 50

# System prompts
SYSTEM_PROMPT_BASE = """You are an expert Dungeon Master for a fantasy role-playing game. You create immersive, engaging adventures with rich storytelling, memorable characters, and exciting challenges.

Core Guidelines:
- Create vivid, descriptive scenes that engage all the senses
- Respond to player actions dynamically and creatively
- Maintain narrative consistency and world-building
- Encourage player creativity and collaboration
- Use appropriate difficulty scaling for encounters
- Include colorful descriptions using formatting like [red:fire], [blue:ice], etc."""

MULTIPLAYER_PROMPT_ADDITION = """
MULTIPLAYER MODE: You are managing multiple players in this adventure. Each player will be clearly labeled (Player 1, Player 2, etc.) or by their chosen names. 
- Address players by name when possible
- Ensure all players get opportunities to participate
- Handle turn-based scenarios fairly
- Resolve conflicts between player actions diplomatically"""

SINGLEPLAYER_PROMPT_ADDITION = """
SINGLE PLAYER MODE: You are running an adventure for one player.
- Provide rich, detailed responses to keep the single player engaged
- Include NPCs for interaction and dialogue
- Adapt the story pace to maintain interest"""

PROMPT_ENDING = """
Remember to:
- Keep responses engaging and under 200 words typically
- Ask questions to drive the story forward
- Use colorful language with formatting tags like [red:dragon fire] or [green:healing light]
- End responses with clear action opportunities for players"""

# Available AI models from Venice - Updated with actual capabilities
AVAILABLE_MODELS = [
    {
        "id": "venice-uncensored",
        "name": "Venice Uncensored",
        "description": "Uncensored model (Dolphin-Mistral-24B-Venice-Edition)",
        "traits": [],
        "pricing": {"input": 0.5, "output": 2},
        "supportsFunctionCalling": False,
        "supportsParallelToolCalls": False
    },
    {
        "id": "qwen-2.5-qwq-32b",
        "name": "Qwen-2.5-QwQ-32B",
        "description": "Reasoning specialist (Qwen/QwQ-32B)",
        "traits": [],
        "pricing": {"input": 0.5, "output": 2},
        "supportsFunctionCalling": False,
        "supportsParallelToolCalls": False
    },
    {
        "id": "qwen3-4b",
        "name": "Qwen3-4B",
        "description": "Fast, small, supports function calling (Qwen/Qwen3-4B)",
        "traits": [],
        "pricing": {"input": 0.15, "output": 0.6},
        "supportsFunctionCalling": True,
        "supportsParallelToolCalls": True
    },
    {
        "id": "mistral-31-24b",
        "name": "Mistral-3.1-24B",
        "description": "Vision-capable (Mistral-Small-3.1-24B-Instruct-2503)",
        "traits": ["default_vision"],
        "pricing": {"input": 0.5, "output": 2},
        "supportsFunctionCalling": True,
        "supportsParallelToolCalls": True
    },
    {
        "id": "qwen3-235b",
        "name": "Qwen3-235B",
        "description": "Large, supports function calling (Qwen/Qwen3-235B-A22B)",
        "traits": [],
        "pricing": {"input": 1.5, "output": 6},
        "supportsFunctionCalling": True,
        "supportsParallelToolCalls": True
    },
    {
        "id": "llama-3.2-3b",
        "name": "Llama-3.2-3B",
        "description": "Fastest model (Llama-3.2-3B)",
        "traits": ["fastest"],
        "pricing": {"input": 0.15, "output": 0.6},
        "supportsFunctionCalling": True,
        "supportsParallelToolCalls": True
    },
    {
        "id": "llama-3.3-70b",
        "name": "Llama-3.3-70B",
        "description": "Default D&D model (Llama-3.3-70B-Instruct)",
        "traits": ["function_calling_default", "default"],
        "pricing": {"input": 0.7, "output": 2.8},
        "supportsFunctionCalling": True,
        "supportsParallelToolCalls": True
    },
    {
        "id": "llama-3.1-405b",
        "name": "Llama-3.1-405B",
        "description": "Most intelligent model (Meta-Llama-3.1-405B-Instruct)",
        "traits": ["most_intelligent"],
        "pricing": {"input": 1.5, "output": 6},
        "supportsFunctionCalling": False,
        "supportsParallelToolCalls": False
    },
    {
        "id": "dolphin-2.9.2-qwen2-72b",
        "name": "Dolphin-2.9.2-Qwen2-72B",
        "description": "Most uncensored (dolphin-2.9.2-qwen2-72b)",
        "traits": ["most_uncensored"],
        "pricing": {"input": 0.7, "output": 2.8},
        "supportsFunctionCalling": False,
        "supportsParallelToolCalls": False
    },
    {
        "id": "qwen-2.5-vl",
        "name": "Qwen-2.5-VL",
        "description": "Vision-capable (Qwen2.5-VL-72B-Instruct)",
        "traits": [],
        "pricing": {"input": 0.7, "output": 2.8},
        "supportsFunctionCalling": False,
        "supportsParallelToolCalls": False
    },
    {
        "id": "qwen-2.5-coder-32b",
        "name": "Qwen-2.5-Coder-32B",
        "description": "Code-optimized (Qwen2.5-Coder-32B-Instruct-GGUF)",
        "traits": ["default_code"],
        "pricing": {"input": 0.5, "output": 2},
        "supportsFunctionCalling": False,
        "supportsParallelToolCalls": False
    },
    {
        "id": "deepseek-r1-671b",
        "name": "DeepSeek-R1-671B",
        "description": "Best reasoning model (DeepSeek-R1)",
        "traits": ["default_reasoning"],
        "pricing": {"input": 3.5, "output": 14},
        "supportsFunctionCalling": False,
        "supportsParallelToolCalls": False
    },
    {
        "id": "deepseek-coder-v2-lite",
        "name": "DeepSeek-Coder-v2-Lite",
        "description": "Lite code model (deepseek-coder-v2-lite-Instruct)",
        "traits": [],
        "pricing": {"input": 0.5, "output": 2},
        "supportsFunctionCalling": False,
        "supportsParallelToolCalls": False
    }
]
