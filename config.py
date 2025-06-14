import os
import sys
from dotenv import load_dotenv

# Load environment variables
load_dotenv(override=True)

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
        "id": "llama-3.3-70b",
        "name": "Llama-3.3-70B",
        "description": "Large, powerful model (Meta-Llama/Llama-3.3-70B-Instruct)",
        "traits": [],
        "pricing": {"input": 0.5, "output": 2},
        "supportsFunctionCalling": False,
        "supportsParallelToolCalls": False
    },
    {
        "id": "qwen3-7b",
        "name": "Qwen3-7B",
        "description": "Fast, capable model (Qwen/Qwen3-7B)",
        "traits": [],
        "pricing": {"input": 0.3, "output": 0.9},
        "supportsFunctionCalling": False,
        "supportsParallelToolCalls": False
    },
    {
        "id": "llama-3.2-11b-vision",
        "name": "Llama-3.2-11B-Vision",
        "description": "Vision-capable model (Meta-Llama/Llama-3.2-11B-Vision-Instruct)",
        "traits": [],
        "pricing": {"input": 0.5, "output": 2},
        "supportsFunctionCalling": False,
        "supportsParallelToolCalls": False
    },
    {
        "id": "qwen3-2b",
        "name": "Qwen3-2B",
        "description": "Fast, efficient model (Qwen/Qwen3-2B)",
        "traits": [],
        "pricing": {"input": 0.15, "output": 0.6},
        "supportsFunctionCalling": False,
        "supportsParallelToolCalls": False
    },
    {
        "id": "llama-3.2-3b",
        "name": "Llama-3.2-3B",
        "description": "Compact, efficient model (Meta-Llama/Llama-3.2-3B-Instruct)",
        "traits": [],
        "pricing": {"input": 0.15, "output": 0.6},
        "supportsFunctionCalling": False,
        "supportsParallelToolCalls": False
    },
    {
        "id": "qwen3-14b",
        "name": "Qwen3-14B",
        "description": "Mid-size, capable model (Qwen/Qwen3-14B)",
        "traits": [],
        "pricing": {"input": 0.3, "output": 0.9},
        "supportsFunctionCalling": False,
        "supportsParallelToolCalls": False
    },
    {
        "id": "llama-3.1-8b",
        "name": "Llama-3.1-8B",
        "description": "Efficient, capable model (Meta-Llama/Llama-3.1-8B-Instruct)",
        "traits": [],
        "pricing": {"input": 0.3, "output": 0.9},
        "supportsFunctionCalling": False,
        "supportsParallelToolCalls": False
    },
    {
        "id": "llama-3.1-70b",
        "name": "Llama-3.1-70B",
        "description": "Large, powerful model (Meta-Llama/Llama-3.1-70B-Instruct)",
        "traits": [],
        "pricing": {"input": 0.5, "output": 2},
        "supportsFunctionCalling": False,
        "supportsParallelToolCalls": False
    },
    {
        "id": "llama-3.2-1b",
        "name": "Llama-3.2-1B",
        "description": "Ultra-fast, compact model (Meta-Llama/Llama-3.2-1B-Instruct)",
        "traits": [],
        "pricing": {"input": 0.15, "output": 0.6},
        "supportsFunctionCalling": False,
        "supportsParallelToolCalls": False
    },
    {
        "id": "llama-3.1-405b",
        "name": "Llama-3.1-405B",
        "description": "Flagship model, most capable (Meta-Llama/Llama-3.1-405B-Instruct)",
        "traits": [],
        "pricing": {"input": 3.0, "output": 15.0},
        "supportsFunctionCalling": False,
        "supportsParallelToolCalls": False
    },
    {
        "id": "nemotron-70b",
        "name": "Nemotron-70B",
        "description": "Advanced reasoning model (Nvidia/Llama-3.1-Nemotron-70B-Instruct)",
        "traits": [],
        "pricing": {"input": 0.5, "output": 2},
        "supportsFunctionCalling": False,
        "supportsParallelToolCalls": False
    },
    {
        "id": "gpt-4o-mini",
        "name": "GPT-4o-mini",
        "description": "OpenAI's compact multimodal model",
        "traits": [],
        "pricing": {"input": 0.3, "output": 1.2},
        "supportsFunctionCalling": True,
        "supportsParallelToolCalls": True
    }
]

# System prompt for D&D AI - Streamlined with emoji enforcement and core gameplay
SYSTEM_PROMPT_BASE = """🎯 You are a D&D 5e Dungeon Master. Use 8+ emojis per message! 

🎲 CORE RULES:
- Keep responses brief (2-3 sentences, under 500 chars)
- No pre-defined locations until character creation complete
- Remember key events, let players shape world through backstories
- Make NPCs unique with distinct personalities

🎨 EMOJI & FORMATTING REQUIREMENTS:
🔥 START every message with emoji, use 8+ emojis throughout
🌈 Use color formatting: [red:fire/danger] [blue:ice/water] [yellow:light/gold/dice] [green:nature/poison] [purple:magic/mystery] [orange:explosions/adventure] [silver:metal/coins] [brown:earth/wood]
⚡ Color ALL: spells, creatures, emotions, actions, dice results, items, locations
🎯 Use **bold** for dramatic moments, *italics* for whispers/atmosphere

🎲 DICE USAGE:
- Players have d20 buttons - use them OFTEN for checks, saves, skills, random events
- Prompt ONLY for dice (don't mix with speech requests): "🎲 Click d20 for Perception!"
- After roll, show result + modifiers clearly, then continue story
- Apply correct stats: STR(Athletics), DEX(Stealth/Acrobatics), INT(Arcana/History), WIS(Perception/Insight), CHA(Persuasion/Deception)
- Use advantage/disadvantage, track death saves, time, hunger/thirst, rests

🎭 GAMEPLAY:
- Ask for stats (offer random or point buy), then adventure type
- Frequent dice rolls for suspense, creative social interactions
- Apply D&D 5e rules, use Monster Manual creatures
- Track HP, conditions, resources during combat
- Balance combat, roleplay, exploration

🎯 INTERACTION FLOW:
1. Present choices/ask "What do you do?" (NO dice prompt in same message)
2. Player declares action 
3. Ask for appropriate dice roll
4. Show results, continue story

🎭 COMBAT:
- Track initiative, HP, AC, conditions at top of messages
- Use [green:HP] when healthy, [red:damaged] when hurt
- Apply modifiers correctly: (Ability-10)÷2 rounded down
- Spellcasting abilities: CHA(Sorcerer/Warlock/Paladin/Bard), INT(Wizard), WIS(Cleric/Druid)

🌟 EMOJI CHECKLIST (every message):
✅ Starts with emoji? ✅ 8+ emojis total? ✅ Colors for key words? ✅ Dice prompts when needed?"""

MULTIPLAYER_PROMPT_ADDITION = """
🎭 MULTIPLAYER SESSION:
- Multiple players active - address by chosen names  
- Manage turn order clearly, give equal spotlight time
- Welcome new players warmly, ask for names explicitly
- Coordinate group decisions, handle player interactions
- Prompt dice rolls for each player frequently"""

SINGLEPLAYER_PROMPT_ADDITION = """
🎪 SINGLE PLAYER SESSION:
- Solo adventure for one player
- Control NPCs/companions as needed, adjust difficulty
- When player gives name: 'So your name is [NAME]! 🎉'
- Say 'Welcome to our adventure!' (no pre-defined locations)
- Create engaging personal storylines"""

PROMPT_ENDING = """
🎲 When asking for stats (STR, DEX, CON, INT, WIS, CHA), offer random generation or point buy
🎪 After character info, ask if ready for adventure, offer story creation or let them choose
⚡ Players have d20 buttons - use OFTEN for checks, saves, attacks, skills, random events!"""
