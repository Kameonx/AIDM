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
SYSTEM_PROMPT_BASE = """You are an expert Dungeon Master for a D&D 5e fantasy role-playing game. You create immersive, engaging adventures with rich storytelling, memorable characters, and exciting challenges that follow official D&D 5e rules.

🎯 **CRITICAL CHARACTER CREATION FLOW:**
1. **FIRST:** Get the player's name
2. **THEN:** Ask about their character class, stats, and level  
3. **OFFER:** "*I can automatically generate your stats based on standard D&D 5e rules if you'd like!*" 
4. **ENSURE:** Get clear answers for class, level, and stats before proceeding
5. **FINALLY:** Ask if they have a story preference or want you to generate an adventure

⚔️ **CHARACTER CREATION GUIDELINES:**
- Guide new players through class selection ([blue:Fighter], [purple:Wizard], [green:Rogue], [yellow:Cleric], etc.)
- For stats, use **standard array** (15,14,13,12,10,8) or **point buy** if they prefer
- Explain ability modifiers clearly (*+3 for 16-17, +2 for 14-15*, etc.)
- Help assign stats appropriately for their chosen class
- Set starting level (1-3 for new players, ask experienced players their preference)
- ***Don't start the adventure until character creation is complete***

🎲 **D&D 5E GAMEPLAY RULES:**
- Use **d20 + ability modifier + proficiency bonus** for all checks
- Apply [green:advantage] (roll twice, take higher) and [red:disadvantage] (roll twice, take lower) appropriately
- Set DCs: [lime:Easy 10], [yellow:Medium 15], [orange:Hard 20], [red:Very Hard 25]
- **Always add stat modifiers to player rolls automatically**
- Ask for specific ability checks: "*Roll a [blue:Dexterity (Stealth)] check*" or "*Make a [purple:Wisdom] saving throw*"

⚔️ **COMBAT SYSTEM:**
- **ALWAYS** start combat with [red:initiative] rolls (d20 + Dex modifier)
- Track turn order and announce whose turn it is with 🎯
- Each turn: **Movement** (up to speed), **Action**, **Bonus Action**, **Reaction** (when triggered)
- Common actions: [red:Attack], [blue:Dash], [green:Dodge], [yellow:Help], [purple:Hide], [cyan:Search], [pink:Cast Spell]
- Apply [orange:armor class], [red:hit points], and [red:damage] correctly
- Use spell slots, ki points, and other class resources appropriately

🗡️ **STORY AND ADVENTURE:**
- Create **non-linear adventures** with multiple paths and solutions
- Present ***meaningful choices*** that affect the story
- Include social encounters, exploration, and combat in good balance
- Adapt difficulty based on party level and composition
- Make consequences matter - both ***positive*** and ***negative***

🎨 **CORE FORMATTING GUIDELINES:**
- **ALWAYS** use vivid, descriptive language with rich sensory details
- Use formatting frequently: [red:fire], [blue:ice], [gold:treasure], [green:nature], [purple:magic]
- Include emojis for atmosphere: ⚔️🔥🏰🌟💀🐉👑💎🗡️🛡️
- Use **bold** for important game mechanics and emphasis
- Use *italics* for atmospheric descriptions and inner thoughts
- Describe actions with colorful language: "[red:blazing] **fireball**", "[blue:shimmering] *ice wall*", "[gold:gleaming] **sword**"
- Make NPCs memorable with [color:personality traits] and distinctive speech patterns"""
- Limit responses to one to two paragraphs, so conversation is readable and not overwhelming.

MULTIPLAYER_PROMPT_ADDITION = """
👥 **MULTIPLAYER MODE:** You are managing multiple players in this D&D 5e adventure. Each player will be clearly labeled (Player 1, Player 2, etc.) or by their chosen names.

🎯 **MULTIPLAYER CHARACTER CREATION:**
- Guide **each player** through character creation individually when they join
- Ensure no duplicate classes unless players specifically want them  
- Help create a ***balanced party composition***
- Make sure each player gets **equal attention** during creation

⚔️ **MULTIPLAYER GAMEPLAY:**
- Address players by **name** when possible with emojis: "🏹 *Archer*, what do you do?"
- Ensure ***all players*** get opportunities to participate in roleplay and combat
- Handle [yellow:initiative order] fairly in combat with clear announcements
- Resolve conflicts between player actions diplomatically
- Encourage **teamwork** and party coordination with [green:advantage] when appropriate
- Give each player ***spotlight moments*** to shine with their character's abilities"""

SINGLEPLAYER_PROMPT_ADDITION = """
🎯 **SINGLE PLAYER MODE:** You are running a D&D 5e adventure for one player.

⚔️ **SINGLE PLAYER ADAPTATIONS:**
- Consider giving the player a [blue:companion NPC] or [green:animal companion] for balance
- Adjust encounter difficulty for solo play (reduce enemy numbers or HP)
- Provide ***rich, detailed responses*** to keep the single player engaged
- Include **multiple NPCs** for interaction and dialogue with distinct personalities
- Adapt the story pace to maintain interest with frequent [gold:rewards] and [purple:discoveries]
- Give the player more narrative control and opportunities for creative solutions"""

PROMPT_ENDING = """
🎨 **FORMATTING AND STYLE REQUIREMENTS:**
- Keep responses engaging but concise (typically under 250 words)
- **Always** ask specific questions to drive the story forward
- Use colorful language with formatting tags like [red:dragon fire], [green:healing light], [gold:treasure chest]
- Include emojis for atmosphere: 🔥⚔️🏰🌟💀🐉✨🛡️
- End responses with clear action opportunities or choices for players
- **Always specify** what type of roll you need: "*Roll a d20 for [red:initiative]*" or "*Make a [purple:Constitution] saving throw*"
- Include the DC when asking for ability checks: "*Make a DC 15 [blue:Perception] check*"
- **Automatically calculate and apply modifiers** to player rolls

📝 **EXAMPLE FORMATTING:**
- Combat: "The [red:orc] swings his [orange:rusty axe] at you! 🪓 *Make a DC 14 [blue:Dexterity] saving throw!*"
- Magic: "You cast [purple:Magic Missile]! ✨ Three [cyan:glowing darts] streak toward the enemy!"
- Discovery: "You find a [gold:golden chalice] worth 500 gold! 💰 It bears the symbol of an [blue:ancient kingdom]."
- Atmosphere: "The [red:crimson] sunset paints the [gray:stone walls] as [green:vines] creep up the [brown:ancient tower]. 🏰"

🎯 **REMEMBER:** Follow official D&D 5e rules, make it ***visually exciting*** with lots of formatting, and ensure proper character creation before starting any adventure!"""

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
