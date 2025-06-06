import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Venice API Configuration
VENICE_API_KEY = os.getenv('VENICE_API_KEY')
VENICE_URL = "https://api.venice.ai/api/v1/chat/completions"
VENICE_MODELS_URL = "https://api.venice.ai/api/v1/models"

# Default model configuration
DEFAULT_MODEL_ID = "venice-uncensored"

# Available models - will be populated from API
AVAILABLE_MODELS = []

# System prompt configuration
SYSTEM_PROMPT_BASE = """You are an experienced Dungeon Master running a fantasy adventure game. You create immersive, engaging stories with rich descriptions and interesting characters. You respond to player actions dynamically and keep the adventure moving forward."""

MULTIPLAYER_PROMPT_ADDITION = """

This is a multiplayer game. Keep track of all players and address them appropriately. When multiple players are present, acknowledge all their actions and maintain fair turn-based gameplay."""

SINGLEPLAYER_PROMPT_ADDITION = """

This is a single-player adventure. Focus on creating a personalized, immersive experience for the lone adventurer."""

PROMPT_ENDING = """

Use colorful, descriptive language. You can use color formatting like [red:fire] for dramatic effect. Keep responses engaging but concise."""
