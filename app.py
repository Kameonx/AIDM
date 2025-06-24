import os
import sys
import json
import uuid
import time
import requests
import re
from flask import Flask, render_template, request, jsonify, Response, stream_with_context, session, make_response, send_from_directory

# Import configuration
from config import (
    VENICE_API_KEY, VENICE_URL, VENICE_IMAGE_URL, DEFAULT_MODEL_ID, DEFAULT_IMAGE_MODEL_ID, 
    CHAT_DIR, MAX_HISTORY_SIZE, AVAILABLE_MODELS, AVAILABLE_IMAGE_MODELS,
    SYSTEM_PROMPT_BASE, MULTIPLAYER_PROMPT_ADDITION, SINGLEPLAYER_PROMPT_ADDITION, PROMPT_ENDING
)

app = Flask(__name__, static_folder='static')
app.secret_key = os.urandom(24)  # Required for session

# Create a directory to store user chat histories
if not os.path.exists(CHAT_DIR):
    os.makedirs(CHAT_DIR)

# Validate API key
if not VENICE_API_KEY:
    print("ERROR: VENICE_API_KEY not found in environment. Please check your .env file.", file=sys.stderr)

def get_user_id():
    """Get or create a unique user ID for the current session"""
    user_id = request.cookies.get('user_id')
    if not user_id:
        user_id = str(uuid.uuid4())
        session['user_id'] = user_id
    return user_id

def get_chat_file_path(user_id, game_id=None):
    """Get the file path for a specific user's chat history"""
    if game_id:
        return os.path.join(CHAT_DIR, f"chat_history_{user_id}_{game_id}.json")
    return os.path.join(CHAT_DIR, f"chat_history_{user_id}_current.json")

def load_chat_history(user_id, game_id=None):
    """Load chat history for a specific user and game"""
    file_path = get_chat_file_path(user_id, game_id)
    if os.path.exists(file_path):
        with open(file_path, 'r') as file:
            return json.load(file)
    return []

def save_chat_history(user_id, chat_history, game_id=None):
    """Save chat history for a specific user and game"""
    file_path = get_chat_file_path(user_id, game_id)
    with open(file_path, 'w') as file:
        json.dump(chat_history, file)

def format_message_content(content):
    """Format AI responses with markdown-like syntax for the frontend"""
    if not content:
        return content
    
    # Don't re-format if content already has HTML formatting tags
    if re.search(r'<span class="(red|green|blue|yellow|purple|orange|pink|cyan|lime|teal|brown|silver|wood)">', content):
        return content
    
    # Don't re-format if content already has new color formatting tags
    if re.search(r'\[(red|green|blue|yellow|purple|orange|pink|cyan|lime|teal|brown|silver|wood):', content):
        return content
    
    # Apply color formatting for common D&D terms - EXPANDED MAPPINGS
    color_mappings = {
        "red": ["fire", "flame", "burn", "burning", "hot", "dragon", "blood", "bloody", "anger", "rage", "demon", "devil", "heat", "scorch", "blaze", "inferno", "crimson", "damage", "hurt", "wound", "injured", "pain", "strike", "attack", "weapon", "sword", "axe", "combat", "battle", "war", "fight", "aggressive", "fierce", "danger", "dangerous", "threat", "enemy", "foe", "evil", "sinister", "wrath"],
        "blue": ["ice", "cold", "frost", "freeze", "freezing", "water", "ocean", "sea", "calm", "peace", "peaceful", "sad", "tears", "chill", "chilly", "frozen", "snow", "winter", "arctic", "crystal", "clear", "serene", "tranquil", "cool", "cooling", "wisdom", "knowledge", "intelligent", "smart", "mind", "thought", "think"],
        "yellow": ["lightning", "light", "bright", "gold", "golden", "divine", "holy", "sacred", "sun", "solar", "electric", "shock", "thunder", "brilliant", "shining", "glow", "glowing", "radiant", "luminous", "dazzling", "gleaming", "sparkling", "energy", "power", "charged", "blessed", "celestial", "heavenly"],
        "green": ["poison", "venom", "venomous", "toxic", "nature", "forest", "plant", "tree", "sick", "disease", "goblin", "orc", "natural", "wild", "wilderness", "grove", "jungle", "growth", "alive", "living", "life", "heal", "healthy", "cure", "remedy", "herb", "potion", "earth", "ground", "grass", "leaf", "branch"],
        "purple": ["magic", "magical", "mystic", "mysterious", "enchant", "enchanted", "spell", "arcane", "psychic", "royal", "noble", "regal", "majestic", "power", "powerful", "ancient", "mystical", "sorcery", "wizard", "mage", "witch", "curse", "cursed", "forbidden", "secret", "hidden", "prophecy", "fate", "destiny", "test", "challenge", "steps", "fulfill", "other", "challenges", "tests", "undertake", "accompany", "patrols", "learn", "defenses", "next"],
        "orange": ["explosion", "explode", "exploding", "adventure", "treasure", "excitement", "energy", "enthusiastic", "warm", "warming", "bright", "vibrant", "lively", "bold", "confident", "brave", "courage", "heroic", "quest", "journey", "explore", "discovery", "find", "search", "hunt", "seek"],
        "pink": ["charm", "charming", "love", "beauty", "beautiful", "fairy", "gentle", "kind", "sweet", "romance", "affection", "care", "caring", "tender", "soft", "delicate", "graceful", "elegant", "pretty", "lovely", "attractive", "enchanting"],
        "cyan": ["heal", "healing", "cure", "curing", "bless", "blessing", "divine", "restoration", "recovery", "mend", "mending", "repair", "restore", "health", "healthy", "medicine", "remedy", "salvation", "pure", "clean", "cleanse", "purify"],
        "lime": ["life", "growth", "renewal", "nature", "alive", "vibrant", "fresh", "spring", "new", "young", "vitality", "vigor", "strength", "strong", "robust", "flourish", "thrive", "bloom", "blossom"],
        "teal": ["special", "unique", "rare", "unusual", "extraordinary", "magic", "ability", "power", "skill", "talent", "gift", "blessing", "wonder", "marvel", "amazing", "incredible", "remarkable", "exceptional"],
        "brown": ["earth", "dirt", "mud", "leather", "wood", "wooden", "bark", "soil", "rustle", "branch", "trunk", "stone", "rock", "cave", "mountain", "ground", "dusty", "rough", "rugged", "natural", "organic"],
        "silver": ["metal", "metallic", "shiny", "gleaming", "moon", "moonlight", "pendant", "coin", "armor", "shield", "blade", "steel", "iron", "chrome", "reflective", "mirror", "bright", "polished", "jewelry", "ring", "necklace"],
        "wood": ["wooden", "timber", "oak", "pine", "maple", "carved", "grain", "plank", "beam", "log", "staff", "wand", "bow", "club", "handle", "furniture", "table", "chair", "door", "box", "chest"]
    }
    
    # Apply color formatting to relevant words - IMPROVED PATTERN MATCHING
    for color, keywords in color_mappings.items():
        for keyword in keywords:
            # Use more flexible word boundaries and case-insensitive matching
            # Include common word endings and variations
            pattern = r'\b(' + re.escape(keyword) + r'(?:s|es|ing|ed|er|est|ly|tion|ness|ment|al|ive|ous|able|ful)?)\b'
            replacement = f'[{color}:\\1]'
            content = re.sub(pattern, replacement, content, flags=re.IGNORECASE)
    
    # Additional patterns for common D&D phrases and actions
    additional_patterns = {
        "purple": [
            r'\b(saving throw(?:s)?)\b',
            r'\b(constitution (?:modifier|score))\b',
            r'\b(total result)\b',
            r'\b(passes? (?:the )?test)\b',
            r'\b(guardian of (?:the )?forest)\b',
            r'\b(voice steady)\b',
            r'\b(stands firm)\b',
            r'\b(beam of energy)\b'
        ],
        "yellow": [
            r'\b(rolled? (?:a )?(?:\d+))\b',
            r'\b(modifier)\b',
            r'\b(outcome)\b'
        ],
        "green": [
            r'\b(grimaces?)\b',
            r'\b(strikes? (?:it|him|her))\b',
            r'\b(forest)\b'
        ],
        "cyan": [
            r'\b(forgiveness?)\b',
            r'\b(apologize)\b'
        ]
    }
    
    # Apply additional patterns
    for color, patterns in additional_patterns.items():
        for pattern in patterns:
            replacement = f'[{color}:\\1]'
            content = re.sub(pattern, replacement, content, flags=re.IGNORECASE)
    
    return content

def build_system_prompt(is_multiplayer):
    """Build the complete system prompt based on game type"""
    prompt = SYSTEM_PROMPT_BASE
    
    if is_multiplayer:
        prompt += MULTIPLAYER_PROMPT_ADDITION
    else:
        prompt += SINGLEPLAYER_PROMPT_ADDITION
    
    prompt += PROMPT_ENDING
    return prompt

def load_or_create_game_id(user_id):
    """Get existing game ID or create a new one"""
    try:
        # Try to get an existing game ID from the chat directory
        chat_files = os.listdir(CHAT_DIR)
        user_files = [f for f in chat_files if f.startswith(f"chat_history_{user_id}_") and f.endswith(".json")]
        
        if user_files:
            # Use the most recent game ID
            latest_file = max(user_files, key=lambda f: os.path.getctime(os.path.join(CHAT_DIR, f)))
            game_id = latest_file.replace(f"chat_history_{user_id}_", "").replace(".json", "")
            return game_id
        else:
            # Create a new game ID
            return str(uuid.uuid4())
    except Exception as e:
        app.logger.error(f"Error loading/creating game ID: {str(e)}")
        return str(uuid.uuid4())

def process_image_requests(text):
    """Process [IMAGE: description] tags in text and return cleaned text and image prompts"""
    import re
    
    # First, check for incorrect "Generated image:" patterns and convert them to proper [IMAGE:] tags
    # This is a safety net for when the AI doesn't follow instructions properly
    generated_image_pattern = r'Generated image:\s*([^.\n]+)'
    matches = re.findall(generated_image_pattern, text, re.IGNORECASE)
    
    if matches:
        app.logger.warning(f"Found improper 'Generated image:' usage, converting to [IMAGE:] tags: {matches}")
        for match in matches:
            # Convert "Generated image: description" to "[IMAGE: Studio Ghibli anime style, D&D fantasy art, cartoon illustration, description]"
            proper_tag = f"[IMAGE: Studio Ghibli anime style, D&D fantasy art, cartoon illustration, {match.strip()}]"
            text = re.sub(r'Generated image:\s*' + re.escape(match), proper_tag, text, flags=re.IGNORECASE)
    
    # Also check for other improper patterns
    improper_patterns = [
        (r'Image:\s*([^.\n\[]+)', r'[IMAGE: Studio Ghibli anime style, D&D fantasy art, cartoon illustration, \1]'),
        (r'\*shows image of ([^*]+)\*', r'[IMAGE: Studio Ghibli anime style, D&D fantasy art, cartoon illustration, \1]'),
        (r'You see (?:a detailed )?image of ([^.\n]+)', r'[IMAGE: Studio Ghibli anime style, D&D fantasy art, cartoon illustration, \1]')
    ]
    
    for pattern, replacement in improper_patterns:
        if re.search(pattern, text, re.IGNORECASE):
            app.logger.warning(f"Found improper image description pattern, converting to [IMAGE:] tag")
            text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
    
    # Find all [IMAGE: description] tags
    image_pattern = r'\[IMAGE:\s*(.*?)\]'
    image_matches = re.findall(image_pattern, text, re.IGNORECASE | re.DOTALL)
    
    # Remove [IMAGE:] tags from the text
    cleaned_text = re.sub(image_pattern, '', text, flags=re.IGNORECASE | re.DOTALL)
    
    # Clean up any extra whitespace left behind
    cleaned_text = re.sub(r'\s+', ' ', cleaned_text).strip()
    
    # Return cleaned text and list of image prompts
    image_prompts = [prompt.strip() for prompt in image_matches if prompt.strip()]
    
    return cleaned_text, image_prompts

def generate_and_save_image(prompt, user_id, game_id):
    """Generate an image and save it to chat history"""
    try:
        # Get selected image model from session or use default
        selected_model = session.get('selected_image_model', DEFAULT_IMAGE_MODEL_ID)
        
        # Prepare the image generation request
        headers = {
            "Authorization": f"Bearer {VENICE_API_KEY}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": selected_model,
            "prompt": prompt,
            "width": 1024,
            "height": 1024,            "format": "png",
            "steps": 20,
            "cfg_scale": 7.5,
            "safe_mode": False,
            "return_binary": False,
            "embed_exif_metadata": False,
            "hide_watermark": True,
            "seed": 0
        }
        
        # Make request to Venice AI
        response = requests.post(VENICE_IMAGE_URL, json=payload, headers=headers, timeout=60)
        
        if response.status_code != 200:
            app.logger.error(f"Venice AI image generation failed: {response.status_code} - {response.text}")
            raise Exception(f"Image generation failed: {response.text}")
        
        # Log the raw response for debugging
        app.logger.debug(f"Raw response text (first 500 chars): {response.text[:500]}")
        
        try:
            result = response.json()
        except Exception as json_error:
            app.logger.error(f"Failed to parse JSON response: {json_error}")
            app.logger.error(f"Raw response: {response.text}")
            raise Exception("Invalid JSON response from image API")
        app.logger.debug(f"Venice AI full response: {result}")
        app.logger.debug(f"Venice AI response keys: {list(result.keys()) if isinstance(result, dict) else 'Not a dict'}")
          # Check if we have the expected data structure
        if not result:
            app.logger.error(f"Empty response from Venice AI")
            raise Exception("Empty response from image API")
            
        if not isinstance(result, dict):
            app.logger.error(f"Response is not a dictionary: {type(result)}")
            raise Exception("Invalid response format from image API")
            
        # Venice AI returns images in 'images' field, not 'data'
        if 'images' not in result:
            app.logger.error(f"Missing 'images' field in response. Available keys: {list(result.keys())}")
            raise Exception("Invalid response from image API - missing images field")
            
        if not result['images']:
            app.logger.error(f"Empty 'images' field in response: {result['images']}")
            raise Exception("Invalid response from image API - empty images field")

        # Extract the base64 image data from the 'images' field
        images_field = result['images']
        app.logger.debug(f"Images field type: {type(images_field)}, is_list: {isinstance(images_field, list)}")
        
        if isinstance(images_field, list) and len(images_field) > 0:
            # Venice AI returns a list with base64 string as first element
            image_data = images_field[0]
            app.logger.debug(f"Extracted image data from list, length: {len(image_data) if isinstance(image_data, str) else 'Not a string'}")
        elif isinstance(images_field, str):
            # Sometimes might return directly as string
            image_data = images_field
            app.logger.debug(f"Using direct string data, length: {len(image_data)}")
        else:
            app.logger.error(f"Unexpected images format. Type: {type(images_field)}, Value preview: {str(images_field)[:100]}")
            raise Exception("Invalid response from image API")
        
        # Validate the base64 data
        if not isinstance(image_data, str) or len(image_data) < 100:
            app.logger.error(f"Invalid base64 data. Type: {type(image_data)}, Length: {len(image_data) if hasattr(image_data, '__len__') else 'N/A'}")
            raise Exception("Invalid response from image API")
          # Create data URL from base64 image data
        image_url = f"data:image/png;base64,{image_data}"
        app.logger.debug(f"Created image URL with length: {len(image_url)}")
        
        # Load chat history and add image message
        chat_history = load_chat_history(user_id, game_id)
        
        # Add image message to history
        image_message = {
            "role": "assistant",
            "content": f'<div class="image-message"><img src="{image_url}" alt="{prompt}" style="max-width: 100%; border-radius: 8px; margin: 10px 0;"><div class="image-caption"><em>Generated image: {prompt}</em></div></div>',
            "timestamp": time.time(),
            "message_type": "image",
            "image_url": image_url,
            "image_prompt": prompt,
            "image_model": selected_model
        }
        
        chat_history.append(image_message)
        save_chat_history(user_id, chat_history, game_id)
        
        app.logger.debug(f"Generated and saved image for prompt: {prompt[:50]}...")
        
    except Exception as e:
        app.logger.error(f"Error in generate_and_save_image: {str(e)}")
        raise

# Add route to serve static files
@app.route('/static/<path:path>')
def send_static(path):
    return send_from_directory('static', path)

# Route to serve the HTML page
@app.route('/')
def index():
    user_id = get_user_id()
    game_id = request.cookies.get('game_id')
    
    if not game_id:
        # Generate a new game id if none is stored
        game_id = load_or_create_game_id(user_id)
        chat_history = load_chat_history(user_id, game_id)
        if not chat_history:
            # Always include a welcome message
            chat_history = [{"role": "assistant", "content": "Hello adventurer! Let's begin your quest. What is your name?"}]
            save_chat_history(user_id, chat_history, game_id)
    else:
        chat_history = load_chat_history(user_id, game_id)
        # Even if we have a chat history, make sure it has at least one message
        if not chat_history:
            chat_history = [{"role": "assistant", "content": "Hello adventurer! Let's begin your quest. What is your name?"}]
            save_chat_history(user_id, chat_history, game_id)
    
    # Pass the chat history to the template to display immediately on load
    response = make_response(render_template('index.html', chat_history=chat_history))
    response.set_cookie('user_id', user_id, max_age=60*60*24*365)  # Expire in 1 year
    response.set_cookie('game_id', game_id, max_age=60*60*24*365)
    return response

@app.route('/chat', methods=['POST'])
def chat():
    try:
        user_id = get_user_id()
        data = request.json
        if data is None or 'message' not in data:
            return jsonify({"response": "No message provided.", "error": True}), 400
        
        user_input = data['message']
        game_id = data.get('game_id')
        player_number = data.get('player_number', 1)  # Default to player 1
        is_system = data.get('is_system', False)
        invisible_to_players = data.get('invisible_to_players', False)  # New flag
        
        # Load chat history
        chat_history = load_chat_history(user_id, game_id)
        
        # Add user message to history with player number
        message_entry = {
            "role": "user" if not is_system else "system",
            "content": user_input,
            "player": f"player{player_number}" if not is_system else "system"
        }
        
        # Mark invisible messages so they don't show in chat
        if invisible_to_players:
            message_entry["invisible"] = True
        
        chat_history.append(message_entry)
        
        # Save chat history
        save_chat_history(user_id, chat_history, game_id)
        
        # Return message ID for streaming
        return jsonify({
            "message_id": len(chat_history),
            "streaming": True,
            "player_number": player_number,
            "invisible": invisible_to_players  # Let client know this is invisible
        })
        
    except Exception as e:
        app.logger.error("Error in /chat endpoint: %s", str(e))
        return jsonify({"response": "Internal server error.", "error": True}), 500

def get_valid_model(model_id):
    valid_models = [model['id'] for model in AVAILABLE_MODELS]
    if model_id in valid_models:
        return model_id
    return DEFAULT_MODEL_ID

def get_model_capabilities(model_id):
    """Get model capabilities from config"""
    for model in AVAILABLE_MODELS:
        if model['id'] == model_id:
            return {
                'supportsFunctionCalling': model.get('supportsFunctionCalling', False),
                'supportsParallelToolCalls': model.get('supportsParallelToolCalls', False)
            }
    # Default capabilities for unknown models
    return {
        'supportsFunctionCalling': False,
        'supportsParallelToolCalls': False
    }

@app.route('/stream', methods=['POST', 'GET'])
def stream_response():
    """Stream response for AI messages"""
    # Get the user ID from session
    user_id = get_user_id()
    
    # For GET requests (EventSource uses GET by default)
    if request.method == 'GET':
        game_id = request.args.get('game_id')
        message_id = request.args.get('message_id')
        # Accept model_id as a query param for SSE fallback
        model_id = request.args.get('model_id')
        if model_id:
            session['selected_model'] = get_valid_model(model_id)
    else:
        # For POST requests from fetch API
        data = json.loads(request.data)
        game_id = data.get('game_id')
        message_id = data.get('message_id')
        model_id = data.get('model_id')
        if model_id:
            session['selected_model'] = get_valid_model(model_id)

    # Load chat history for this specific user
    chat_history = load_chat_history(user_id, game_id)    # Print debug info
    app.logger.debug(f"Starting stream: game_id={game_id}, msg_id={message_id}, model={session.get('selected_model')}")

    def generate():
        try:
            app.logger.debug("Starting generate() function")
            
            # Check if there are multiple players in the session and gather names
            player_counts = {}
            
            # Look for player names in the chat history
            for msg in chat_history:
                if msg.get("role") == "user" and msg.get("player"):
                    player = msg.get("player")
                    player_counts[player] = player_counts.get(player, 0) + 1
            
            # Check if multiple players are active
            is_multiplayer = len(player_counts) > 1
            app.logger.debug(f"Is multiplayer: {is_multiplayer}, Player counts: {player_counts}")
            
            # Build the full system prompt based on game type
            system_prompt = build_system_prompt(is_multiplayer)
            app.logger.debug(f"System prompt built, length: {len(system_prompt)} characters")
            
            # Truncate chat history to prevent token limit issues
            truncated_history = truncate_chat_history(chat_history, system_prompt)
            app.logger.debug(f"Chat history truncated from {len(chat_history)} to {len(truncated_history)} messages")
        except Exception as setup_error:
            error_details = f"Setup error: {str(setup_error)} (Type: {type(setup_error).__name__})"
            app.logger.error(f"Error in generate() setup: {error_details}")
            yield f"data: {json.dumps({'content': '🚨 Error preparing request. Please try again.', 'full': '🚨 Error preparing request. Please try again.', 'error': True, 'debug': error_details})}\n\n"
            yield f"event: done\ndata: {{}}\n\n"
            return
          # Prepare messages for the API using full prompt
        api_messages = [
            {"role": "system", "content": system_prompt}
        ]
        app.logger.debug("Adding system message to API messages")
        
        # Include conversation history but format it properly for the API
        for msg in truncated_history:
            if msg.get("role") == "system" and msg.get("player") == "system":
                # This is a system notification (like player joining)
                api_messages.append({
                    "role": "system", 
                    "content": msg["content"]
                })
            elif msg.get("role") == "user":
                # Format user messages with player labels if in multiplayer
                prefix = ""
                if is_multiplayer and msg.get("player"):
                    player_num = msg.get("player").replace("player", "")
                    prefix = f"Player {player_num}: "
                
                # Strip HTML from user content before sending to API
                clean_content = strip_html_tags(msg["content"])
                api_messages.append({
                    "role": "user", 
                    "content": prefix + clean_content
                })
            else:
                # Assistant (DM) messages - strip HTML from content
                clean_content = strip_html_tags(msg.get("content", ""))
                api_messages.append({
                    "role": msg.get("role", "assistant"),
                    "content": clean_content
                })
        
        # Log token usage for debugging
        total_tokens = sum(estimate_tokens(msg.get("content", "")) for msg in api_messages)
        app.logger.debug(f"Total estimated tokens being sent to API: {total_tokens}")
        app.logger.debug(f"Number of messages being sent: {len(api_messages)}")
        app.logger.debug(f"Full system prompt length: {len(system_prompt)} chars")
        
        # Final safety check - if still too many tokens, further truncate
        if total_tokens > 45000:  # Increased from 30000 to 45000 to preserve more context
            app.logger.warning(f"Token count still high ({total_tokens}), applying emergency truncation")
            # Keep system prompt and only the last few messages, but be less aggressive
            emergency_history = truncated_history[-15:] if len(truncated_history) > 15 else truncated_history
            api_messages = [
                {"role": "system", "content": system_prompt}
            ]
            for msg in emergency_history:
                if msg.get("role") == "system" and msg.get("player") == "system":
                    api_messages.append({
                        "role": "system", 
                        "content": msg["content"]
                    })
                elif msg.get("role") == "user":
                    prefix = ""
                    if is_multiplayer and msg.get("player"):
                        player_num = msg.get("player").replace("player", "")
                        prefix = f"Player {player_num}: "
                    
                    api_messages.append({
                        "role": "user", 
                        "content": prefix + msg["content"]
                    })
                else:
                    api_messages.append({
                        "role": msg.get("role", "assistant"),
                        "content": msg.get("content", "")
                    })
            
            final_tokens = sum(estimate_tokens(msg.get("content", "")) for msg in api_messages)
            app.logger.debug(f"After emergency truncation: {final_tokens} tokens, {len(api_messages)} messages")
        
        # Get selected model from session, default to DEFAULT_MODEL_ID
        selected_model = get_valid_model(session.get('selected_model', DEFAULT_MODEL_ID))
        app.logger.debug(f"Using Venice model: {selected_model}")
        
        # Get model capabilities to determine which parameters to include
        capabilities = get_model_capabilities(selected_model)
        app.logger.debug(f"Model capabilities: {capabilities}")        # Create structured payload for API
        payload = create_structured_api_payload(api_messages, selected_model, capabilities)
        app.logger.debug(f"API payload created, size: {len(json.dumps(payload))} bytes")
        
        headers = {
            "Authorization": f"Bearer {VENICE_API_KEY}",
            "Content-Type": "application/json"
        }
        
        app.logger.debug(f"About to make API request to {VENICE_URL}")
        
        try:
            with requests.post(
                VENICE_URL,
                json=payload,
                headers=headers,
                stream=True,
                timeout=60,
                verify=True  # Re-enable SSL verification
            ) as response:
                full_response = ""
                app.logger.debug(f"Venice API response status: {response.status_code}")
                app.logger.debug(f"Venice API response headers: {response.headers}")
                
                # Check if the response is successful
                if response.status_code != 200:
                    app.logger.error(f"Venice API error: {response.status_code} - {response.text}")
                    yield f"data: {json.dumps({'content': f'API Error: {response.status_code}', 'full': f'API Error: {response.status_code}', 'error': True})}\n\n"
                    yield f"event: done\ndata: {{}}\n\n"
                    return
                
                # Check content type to determine if streaming or not
                content_type = response.headers.get('content-type', '').lower()
                app.logger.debug(f"Content-Type: {content_type}")
                
                if 'text/event-stream' in content_type:
                    # Handle streaming response
                    app.logger.debug("Processing as streaming response")
                    for line in response.iter_lines():
                        if line:
                            line = line.decode('utf-8')
                            if line.startswith('data: '):
                                try:
                                    data_json = line[6:]
                                    if data_json.strip() == '[DONE]':
                                        break
                                    data = json.loads(data_json)
                                    if 'choices' in data and len(data['choices']) > 0:
                                        delta = data['choices'][0].get('delta', {})
                                        content = delta.get('content', '')
                                        if content:
                                            full_response += content
                                            yield f"data: {json.dumps({'content': content, 'full': full_response})}\n\n"
                                except Exception as e:
                                    app.logger.error(f"Error parsing Venice SSE: {e}")
                                    continue
                else:
                    # Handle non-streaming JSON response
                    app.logger.debug("Processing as non-streaming JSON response")
                    try:
                        response_data = response.json()
                        app.logger.debug(f"Non-streaming response data: {response_data}")
                        
                        if 'choices' in response_data and len(response_data['choices']) > 0:
                            choice = response_data['choices'][0]
                            if 'message' in choice and 'content' in choice['message']:
                                full_response = choice['message']['content']
                                app.logger.debug(f"Extracted content length: {len(full_response)}")                                # Send the full response at once
                                yield f"data: {json.dumps({'content': full_response, 'full': full_response})}\n\n"
                            else:
                                app.logger.error(f"Unexpected response structure: {choice}")
                                yield f"data: {json.dumps({'content': 'Invalid response structure from AI', 'full': 'Invalid response structure from AI', 'error': True})}\n\n"
                        elif 'error' in response_data:
                            error_msg = response_data.get('error', {}).get('message', 'Unknown API error')
                            app.logger.error(f"API returned error: {error_msg}")
                            yield f"data: {json.dumps({'content': f'API Error: {error_msg}', 'full': f'API Error: {error_msg}', 'error': True})}\n\n"
                        else:
                            app.logger.error(f"No choices in response: {response_data}")
                            yield f"data: {json.dumps({'content': 'No response from AI', 'full': 'No response from AI', 'error': True})}\n\n"
                    except Exception as e:
                        app.logger.error(f"Error parsing JSON response: {e}")
                        app.logger.error(f"Raw response: {response.text}")
                        yield f"data: {json.dumps({'content': 'Error parsing AI response', 'full': 'Error parsing AI response', 'error': True})}\n\n"
                
                # Store the complete response in chat history
                if full_response:
                    # Process image generation requests first
                    processed_response, image_requests = process_image_requests(full_response)
                    
                    # Always format the content before storing
                    formatted_content = format_message_content(processed_response)
                    chat_history.append({"role": "assistant", "content": formatted_content})
                    save_chat_history(user_id, chat_history, game_id)
                    app.logger.debug(f"Saved formatted response to chat history, length: {len(formatted_content)}")                    # Generate images if requested and yield them to the client
                    if image_requests:
                        app.logger.debug(f"Found {len(image_requests)} image requests to generate")
                        for i, prompt in enumerate(image_requests):
                            app.logger.debug(f"Generating image {i+1}/{len(image_requests)}: {prompt[:50]}...")
                            try:
                                # Generate the image and get the data
                                selected_model = session.get('selected_image_model', DEFAULT_IMAGE_MODEL_ID)
                                
                                headers = {
                                    "Authorization": f"Bearer {VENICE_API_KEY}",
                                    "Content-Type": "application/json"
                                }
                                
                                payload = {
                                    "model": selected_model,
                                    "prompt": prompt,
                                    "width": 1024,
                                    "height": 1024,
                                    "format": "png",
                                    "steps": 20,
                                    "cfg_scale": 7.5,
                                    "safe_mode": False,
                                    "return_binary": False,
                                    "embed_exif_metadata": False,
                                    "hide_watermark": True,
                                    "seed": 0                                }
                                
                                response = requests.post(VENICE_IMAGE_URL, json=payload, headers=headers, timeout=60)
                                
                                if response.status_code == 200:
                                    result = response.json()
                                    if 'images' in result and result['images']:
                                        image_data = result['images'][0] if isinstance(result['images'], list) else result['images']
                                        
                                        # Validate the image data
                                        if not isinstance(image_data, str) or len(image_data) < 100:
                                            app.logger.error(f"Invalid image data received for prompt '{prompt}': length={len(image_data) if hasattr(image_data, '__len__') else 'N/A'}")
                                            continue
                                        
                                        image_url = f"data:image/png;base64,{image_data}"
                                        app.logger.debug(f"Generated image URL length: {len(image_url)} for prompt: {prompt[:30]}...")
                                          # Create image message with better formatting - ensure compatibility with frontend localStorage format
                                        image_message = {
                                            "role": "assistant",
                                            "content": f'<div class="image-message"><img src="{image_url}" alt="{prompt}" style="max-width: 100%; border-radius: 8px; margin: 10px 0; display: block;"><div class="image-caption"><em>Generated image: {prompt}</em></div></div>',
                                            "text": prompt,  # Add text field for compatibility
                                            "timestamp": time.time(),
                                            "message_type": "image",
                                            "image_url": image_url,
                                            "image_prompt": prompt,
                                            "image_model": selected_model,
                                            "sender": "assistant",  # Changed from "DM" to "assistant" for consistency
                                            "type": "dm",
                                            "images": [image_url]  # Add images array for localStorage compatibility
                                        }
                                        
                                        # Add to chat history
                                        chat_history.append(image_message)
                                        save_chat_history(user_id, chat_history, game_id)
                                        
                                        # Send the image data to the client via the stream
                                        yield f"data: {json.dumps({'image_generated': True, 'image_message': image_message})}\n\n"
                                        
                                        app.logger.debug(f"Successfully generated and streamed image for prompt: {prompt[:50]}...")
                                else:
                                    app.logger.error(f"Image generation failed for prompt '{prompt}': {response.status_code}")
                                    
                            except Exception as e:
                                app.logger.error(f"Error generating image for prompt '{prompt}': {str(e)}")
                                # Add error message to chat
                                error_msg = {"role": "assistant", "content": f"<div class='system-message'><em>Error generating image: {prompt[:50]}...</em></div>", "message_type": "system"}
                                chat_history.append(error_msg)
                                save_chat_history(user_id, chat_history, game_id)
                    else:
                        app.logger.debug("No image requests found in response")
                  
                # Send done event to signal completion
                yield f"event: done\ndata: {{}}\n\n"
        except requests.exceptions.SSLError as ssl_error:
            error_details = f"SSL Error: {str(ssl_error)}"
            app.logger.error(f"SSL Error connecting to Venice AI: {error_details}")
            yield f"data: {json.dumps({'content': '🚨 Connection error with AI service. Please try again in a moment.', 'full': '🚨 Connection error with AI service. Please try again in a moment.', 'error': True, 'debug': error_details})}\n\n"
            yield f"event: done\ndata: {{}}\n\n"
        except requests.exceptions.ConnectionError as conn_error:
            error_details = f"Connection Error: {str(conn_error)}"
            app.logger.error(f"Connection Error to Venice AI: {error_details}")
            yield f"data: {json.dumps({'content': '🚨 Unable to connect to AI service. Please check your internet connection and try again.', 'full': '🚨 Unable to connect to AI service. Please check your internet connection and try again.', 'error': True, 'debug': error_details})}\n\n"
            yield f"event: done\ndata: {{}}\n\n"
        except requests.exceptions.Timeout as timeout_error:
            error_details = f"Timeout Error: {str(timeout_error)}"
            app.logger.error(f"Timeout Error connecting to Venice AI: {error_details}")
            yield f"data: {json.dumps({'content': '🚨 Request timed out. Please try again.', 'full': '🚨 Request timed out. Please try again.', 'error': True, 'debug': error_details})}\n\n"
            yield f"event: done\ndata: {{}}\n\n"
        except Exception as e:
            error_details = f"Unexpected error: {str(e)} (Type: {type(e).__name__})"
            app.logger.error(f"Error in API request: {error_details}")
            yield f"data: {json.dumps({'content': f'🚨 Unexpected error: Please try again.', 'full': f'🚨 Unexpected error: Please try again.', 'error': True, 'debug': error_details})}\n\n"
            yield f"event: done\ndata: {{}}\n\n"
    
    return Response(stream_with_context(generate()), mimetype='text/event-stream')

@app.route('/new_game', methods=['POST'])
def new_game():
    user_id = get_user_id()
    game_id = f"{int(time.time())}_{uuid.uuid4().hex[:8]}"
    chat_history = []
    # Only add the welcome message once
    chat_history.append({"role": "assistant", "content": "Hello adventurer! Let's begin your quest. What is your name?"})
    save_chat_history(user_id, chat_history, game_id)
    response_data = {"game_id": game_id, "success": True}
    return jsonify(response_data)

@app.route('/load_history', methods=['POST'])
def load_history():
    """Load the chat history for display on the frontend"""
    user_id = get_user_id()
    data = request.get_json()
    game_id = data.get('game_id')
    
    # Load chat history
    chat_history = load_chat_history(user_id, game_id)
    
    # Process each message to ensure formatting is preserved
    processed_history = []
    for msg in chat_history:
        processed_msg = msg.copy()
        # Ensure all assistant messages are properly formatted
        if msg.get('role') == 'assistant' and msg.get('content'):
            # Re-apply formatting to ensure colors and effects show up
            processed_msg['content'] = format_message_content(msg['content'])
        processed_history.append(processed_msg)
    
    # Return the processed chat history
    return jsonify({"history": processed_history})

@app.route('/get_updates', methods=['POST'])
def get_updates():
    """Get updates to chat history since last timestamp"""
    user_id = get_user_id()
    data = request.get_json()
    game_id = data.get('game_id')
    last_message_count = int(data.get('last_message_count', 0))
    
    if not game_id:
        return jsonify({"success": False, "error": "No game ID provided"})
    
    # Get the chat file path for this user and game
    file_path = get_chat_file_path(user_id, game_id)
    
    if not os.path.exists(file_path):
        app.logger.error(f"Game session file not found: {file_path}")
        return jsonify({
            "success": False, 
            "error": "Game session file not found"
        })
    
    try:
        # Read the full chat history
        with open(file_path, 'r') as file:
            chat_history = json.load(file)
        
        result = {
            "success": True,
            "message_count": len(chat_history)
        }
          # Check if there are new messages
        if len(chat_history) > last_message_count:
            # Return only the new messages
            new_messages = chat_history[last_message_count:]
            result["has_updates"] = True
            result["new_messages"] = new_messages
            app.logger.debug(f"get_updates: Found {len(new_messages)} new messages for game {game_id}")
            
            # Log message types for debugging
            for i, msg in enumerate(new_messages):
                msg_type = msg.get('message_type', 'text')
                app.logger.debug(f"get_updates: Message {i}: type={msg_type}, role={msg.get('role', 'unknown')}")
        else:
            result["has_updates"] = False
            result["new_messages"] = []
            app.logger.debug(f"get_updates: No new messages for game {game_id}, server has {len(chat_history)}, client has {last_message_count}")
        
        return jsonify(result)
            
    except Exception as e:
        app.logger.error(f"Error checking for updates: {str(e)}")
        return jsonify({"success": False, "error": str(e)})

@app.route('/set_player_name', methods=['POST'])
def set_player_name():
    try:
        data = request.get_json()
        user_id = get_user_id()
        game_id = data.get('game_id')
        player_number = data.get('player_number', 1)
        new_name = data.get('new_name')

        if not (game_id and new_name):
            return jsonify({"success": False, "error": "Missing game_id or new_name"}), 400

        # Load the chat history for the specified game
        chat_history = load_chat_history(user_id, game_id)
        # Update every message from this player with the new name
        for msg in chat_history:
            if msg.get("role") == "user" and msg.get("player") == f"player{player_number}":
                msg["player"] = new_name
        # Save the updated chat history
        save_chat_history(user_id, chat_history, game_id)
        return jsonify({"success": True})
    except Exception as e:
        app.logger.error(f"Error in /set_player_name: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/get_models', methods=['GET'])
def get_models():
    """Get available AI models"""
    return jsonify({"models": AVAILABLE_MODELS})

@app.route('/set_model', methods=['POST'])
def set_model():
    """Set the current AI model for the session"""
    data = request.get_json()
    model_id = data.get('model_id')
    
    if not model_id:
        return jsonify({"success": False, "error": "Missing model_id"}), 400
    
    # Validate model exists
    valid_models = [model['id'] for model in AVAILABLE_MODELS]
    if model_id not in valid_models:
        return jsonify({"success": False, "error": "Invalid model_id"}), 400
    
    # Store in session (you could also store in database if needed)
    session['selected_model'] = model_id
    
    return jsonify({"success": True, "model_id": model_id})

@app.route('/get_image_models', methods=['GET'])
def get_image_models():
    """Get available image generation models"""
    return jsonify({"models": AVAILABLE_IMAGE_MODELS})

@app.route('/set_image_model', methods=['POST'])
def set_image_model():
    """Set the current image model for the session"""
    data = request.get_json()
    model_id = data.get('model_id')
    
    if not model_id:
        return jsonify({"success": False, "error": "Missing model_id"}), 400
    
    # Validate model exists
    valid_models = [model['id'] for model in AVAILABLE_IMAGE_MODELS]
    if model_id not in valid_models:
        return jsonify({"success": False, "error": "Invalid model_id"}), 400
    
    # Store in session
    session['selected_image_model'] = model_id
    
    return jsonify({"success": True, "model_id": model_id})

@app.route('/generate_image', methods=['POST'])
def generate_image():
    """Generate an image using Venice AI"""
    try:
        user_id = get_user_id()
        data = request.get_json()
        
        prompt = data.get('prompt')
        game_id = data.get('game_id')
        
        if not prompt:
            return jsonify({"success": False, "error": "Missing prompt"}), 400
        
        if not game_id:
            return jsonify({"success": False, "error": "Missing game_id"}), 400
        
        # Get selected image model from session or use default
        selected_model = session.get('selected_image_model', DEFAULT_IMAGE_MODEL_ID)
        
        # Prepare the image generation request
        headers = {
            "Authorization": f"Bearer {VENICE_API_KEY}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": selected_model,
            "prompt": prompt,
            "width": 1024,
            "height": 1024,
            "format": "webp",
            "steps": 20,
            "cfg_scale": 7.5,
            "safe_mode": False,
            "return_binary": False,
            "embed_exif_metadata": False,
            "hide_watermark": True
        }
        
        # Make request to Venice AI
        response = requests.post(VENICE_IMAGE_URL, json=payload, headers=headers, timeout=60)
        
        if response.status_code != 200:
            app.logger.error(f"Venice AI image generation failed: {response.status_code} - {response.text}")
            return jsonify({"success": False, "error": f"Image generation failed: {response.text}"}), 500
        
        result = response.json()
        
        if 'data' not in result or not result['data'] or not result['data'][0].get('url'):
            app.logger.error(f"Invalid response from Venice AI: {result}")
            return jsonify({"success": False, "error": "Invalid response from image API"}), 500
        
        image_url = result['data'][0]['url']
        
        # Save the image message to chat history
        chat_history = load_chat_history(user_id, game_id)
        
        # Add image message to history
        image_message = {
            "role": "assistant",
            "content": f'<div class="image-message"><img src="{image_url}" alt="{prompt}" style="max-width: 100%; border-radius: 8px; margin: 10px 0;"><div class="image-caption"><em>Generated image: {prompt}</em></div></div>',
            "timestamp": time.time(),
            "message_type": "image",
            "image_url": image_url,
            "image_prompt": prompt,
            "image_model": selected_model
        }
        
        chat_history.append(image_message)
        save_chat_history(user_id, chat_history, game_id)
        
        return jsonify({
            "success": True,
            "image_url": image_url,
            "prompt": prompt,
            "model": selected_model,
            "message": image_message
        })
        
    except requests.exceptions.Timeout:
        return jsonify({"success": False, "error": "Image generation timed out"}), 504
    except Exception as e:
        app.logger.error(f"Error in /generate_image: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/undo_messages', methods=['POST'])
def undo_messages():
    """Remove the last user message and its following DM response from server history, and return updated chat history."""
    try:
        user_id = get_user_id()
        data = request.get_json()
        game_id = data.get('game_id')

        if not game_id:
            return jsonify({"success": False, "error": "No game ID provided"})

        # Load current chat history
        chat_history = load_chat_history(user_id, game_id)

        if len(chat_history) <= 1:  # Don't undo if only welcome message exists
            return jsonify({"success": False, "error": "Nothing to undo"})

        # Work backwards to find the last user message
        last_user_idx = None
        for i in range(len(chat_history) - 1, -1, -1):
            message = chat_history[i]
            if message.get("role") == "user" and not message.get("is_system", False):
                last_user_idx = i
                break

        if last_user_idx is None:
            return jsonify({"success": False, "error": "No user message to undo"})

        undone_messages = [chat_history[last_user_idx]]
        # Remove the user message
        del chat_history[last_user_idx]

        # If the next message (at the same index, since we just deleted) is an assistant, remove it too
        if last_user_idx < len(chat_history):
            next_msg = chat_history[last_user_idx]
            if next_msg.get("role") == "assistant":
                undone_messages.append(next_msg)
                del chat_history[last_user_idx]

        # Save the updated chat history
        save_chat_history(user_id, chat_history, game_id)

        app.logger.debug(f"Undo operation: Removed {len(undone_messages)} messages from server history")

        # Return the updated chat history and the undone user message for client to restore in input
        last_undone_user_message = undone_messages[0]["content"] if undone_messages else None
        return jsonify({
            "success": True,
            "messages_removed": len(undone_messages),
            "undone_messages": undone_messages,
            "new_history_length": len(chat_history),
            "updated_history": chat_history,
            "last_undone_user_message": last_undone_user_message
        })
    except Exception as e:
        app.logger.error(f"Error in /undo_messages: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500

def estimate_tokens(text):
    """Rough token estimation (approximately 4 characters per token for English text)"""
    if not text:
        return 0
    return max(1, len(text) // 4)

def truncate_chat_history(chat_history, system_prompt, max_tokens=45000):  # Increased from 35000
    """
    Truncate chat history to stay within token limits while preserving recent context.
    Keeps the most recent messages and important system messages.
    """
    if not chat_history:
        return []
    
    # Estimate system prompt tokens
    system_tokens = estimate_tokens(system_prompt)
    available_tokens = max_tokens - system_tokens - 3000  # Reserve 3000 tokens for response (increased buffer)
    
    # If the system prompt itself is too large, allow more tokens for history
    if system_tokens > 20000:
        available_tokens = max_tokens - system_tokens - 2000  # Use less buffer for huge prompts
        app.logger.warning(f"System prompt is very large ({system_tokens} tokens), reducing buffer")
    
    # Start from the end and work backwards
    truncated_history = []
    current_tokens = 0
    
    # Always keep at least the last 15 messages to maintain conversation context (increased from 10)
    min_messages_to_keep = min(15, len(chat_history))
    
    # Reverse iteration to prioritize recent messages
    for i, msg in enumerate(reversed(chat_history)):
        msg_content = msg.get("content", "")
        msg_tokens = estimate_tokens(msg_content)
        
        # Force inclusion of the last few messages regardless of token count
        if i < min_messages_to_keep:
            truncated_history.insert(0, msg)
            current_tokens += msg_tokens
        # Always include very short messages or important system messages
        elif msg_tokens < 50 or (msg.get("role") == "system" and msg.get("player") == "system"):
            truncated_history.insert(0, msg)
            current_tokens += msg_tokens
        elif current_tokens + msg_tokens <= available_tokens:
            truncated_history.insert(0, msg)
            current_tokens += msg_tokens
        else:
            # Stop adding messages if we would exceed the limit
            break
    
    # Ensure we don't have more than MAX_HISTORY_SIZE messages
    if len(truncated_history) > MAX_HISTORY_SIZE:
        truncated_history = truncated_history[-MAX_HISTORY_SIZE:]
    
    app.logger.debug(f"Truncated chat history from {len(chat_history)} to {len(truncated_history)} messages")
    app.logger.debug(f"Estimated tokens: system={system_tokens}, history={current_tokens}, total={system_tokens + current_tokens}")
    
    return truncated_history

def create_structured_api_payload(api_messages, selected_model, capabilities):
    """Create a structured API payload that's more efficient for the Venice AI API"""
    
    # Find the system message
    system_content = None
    message_list = []
    
    for msg in api_messages:
        if msg["role"] == "system":
            system_content = msg["content"]
        else:
            message_list.append(msg)
    
    # Create a more structured payload
    payload = {
        "venice_parameters": {"include_venice_system_prompt": False},
        "model": selected_model,
        "messages": [
            {"role": "system", "content": system_content}
        ] + message_list,
        "temperature": 1.0,
        "top_p": 0.95,
        "n": 1,
        "stream": True,
        "presence_penalty": 0.2,
        "frequency_penalty": 0.1
    }
    
    # Only add parallel_tool_calls if the model supports it
    if capabilities['supportsParallelToolCalls']:
        payload["parallel_tool_calls"] = True
    
    return payload

def strip_html_tags(text):
    """Remove HTML tags from text content"""
    if not text:
        return text
    # Remove HTML tags
    clean = re.sub('<.*?>', '', text)
    # Convert HTML entities
    clean = clean.replace('&lt;', '<').replace('&gt;', '>').replace('&amp;', '&')
    return clean

@app.route('/debug/env', methods=['GET'])
def debug_env():
    """Debug endpoint to check environment variables"""
    try:
        return jsonify({
            'venice_api_key_present': bool(VENICE_API_KEY),
            'venice_api_key_length': len(VENICE_API_KEY) if VENICE_API_KEY else 0,
            'venice_url': VENICE_URL,
            'default_model': DEFAULT_MODEL_ID,
            'debug': True
        })
    except Exception as e:
        return jsonify({'error': str(e)})

@app.route('/debug/venice', methods=['GET'])
def debug_venice():
    """Debug endpoint to test Venice API directly"""
    try:
        headers = {
            "Authorization": f"Bearer {VENICE_API_KEY}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "venice_parameters": {"include_venice_system_prompt": False},
            "model": "venice-uncensored",
            "messages": [
                {"role": "system", "content": "You are a helpful assistant."},
                {"role": "user", "content": "Say hello"}
            ],
            "temperature": 1.0,
            "stream": False,
            "max_tokens": 50
        }
        
        app.logger.debug(f"Making test API call to {VENICE_URL}")
        response = requests.post(VENICE_URL, json=payload, headers=headers, timeout=30)
        
        return jsonify({
            'status_code': response.status_code,
            'headers': dict(response.headers),
            'success': response.status_code == 200,
            'response_preview': response.text[:500] if response.text else None,
            'debug': True
        })
        
    except Exception as e:
        app.logger.error(f"Debug Venice API test failed: {str(e)}")
        return jsonify({'error': str(e), 'error_type': type(e).__name__})

# Utility function removed - using full prompt only

if __name__ == '__main__':
    app.run(debug=True)
