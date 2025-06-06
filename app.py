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
    VENICE_API_KEY, VENICE_URL, DEFAULT_MODEL_ID, CHAT_DIR, AVAILABLE_MODELS,
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
    if re.search(r'<span class="(red|green|blue|yellow|purple|orange|pink|cyan|lime|teal)">', content):
        return content
    
    # Don't re-format if content already has new color formatting tags
    if re.search(r'\[(red|green|blue|yellow|purple|orange|pink|cyan|lime|teal):', content):
        return content
    
    # Apply color formatting for common D&D terms
    color_mappings = {
        "red": ["fire", "flame", "burn", "hot", "dragon", "blood", "anger", "rage", "demon", "devil", "heat", "scorch", "blaze", "inferno"],
        "blue": ["ice", "cold", "frost", "freeze", "water", "ocean", "sea", "calm", "peace", "sad", "tears", "chill"],
        "yellow": ["lightning", "light", "bright", "gold", "golden", "divine", "holy", "sacred", "sun", "solar", "electric", "shock"],
        "green": ["poison", "venom", "toxic", "nature", "forest", "plant", "tree", "sick", "disease", "goblin", "orc"],
        "purple": ["magic", "magical", "mystic", "mysterious", "enchant", "spell", "arcane", "psychic", "royal", "noble"],
        "orange": ["explosion", "explode", "adventure", "treasure", "excitement", "energy", "enthusiastic", "warm"],
        "pink": ["charm", "love", "beauty", "fairy", "gentle", "kind", "sweet", "romance", "affection"],
        "cyan": ["heal", "healing", "cure", "bless", "blessing", "divine", "restoration", "recovery", "mend"],
        "lime": ["life", "growth", "renewal", "nature", "alive", "vibrant", "fresh", "spring"],
        "teal": ["special", "unique", "rare", "unusual", "extraordinary", "magic", "ability", "power"]
    }
    
    # Apply color formatting to relevant words
    for color, keywords in color_mappings.items():
        for keyword in keywords:
            # Use word boundaries and case-insensitive matching
            pattern = r'\b(' + re.escape(keyword) + r'(?:s|ing|ed|er|est)?)\b'
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
        # Check for existing games for this user
        user_games = []
        for filename in os.listdir(CHAT_DIR):
            if f"chat_history_{user_id}_" in filename and not filename.endswith("_current.json"):
                game_id = filename.replace(f"chat_history_{user_id}_", "").replace(".json", "")
                user_games.append(game_id)
        
        # Use most recent game or create new one
        if user_games:
            # Sort by timestamp (assuming game_id starts with timestamp)
            user_games.sort(reverse=True)
            return user_games[0]
        else:
            # Create new game ID
            return f"{int(time.time())}_{uuid.uuid4().hex[:8]}"
    except Exception as e:
        app.logger.error(f"Error in load_or_create_game_id: {e}")
        # Fallback to creating new game ID
        return f"{int(time.time())}_{uuid.uuid4().hex[:8]}"

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
    chat_history = load_chat_history(user_id, game_id)
    
    # Print debug info
    app.logger.debug(f"Starting stream: game_id={game_id}, msg_id={message_id}, model={session.get('selected_model')}")

    def generate():
        # Check if there are multiple players in the session and gather names
        player_counts = {}
        
        # Look for player names in the chat history
        for msg in chat_history:
            if msg.get("role") == "user" and msg.get("player"):
                player = msg.get("player")
                player_counts[player] = player_counts.get(player, 0) + 1
        
        # Check if multiple players are active
        is_multiplayer = len(player_counts) > 1
        
        # Build system prompt based on multiplayer status
        system_prompt = build_system_prompt(is_multiplayer)
        
        # Prepare messages for the API
        api_messages = [
            {"role": "system", "content": system_prompt}
        ]
        
        # Include conversation history but format it properly for the API
        for msg in chat_history:
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
                
                api_messages.append({
                    "role": "user", 
                    "content": prefix + msg["content"]
                })
            else:
                # Assistant (DM) messages
                api_messages.append({
                    "role": msg.get("role", "assistant"),
                    "content": msg.get("content", "")
                })
        
        # Get selected model from session, default to DEFAULT_MODEL_ID
        selected_model = get_valid_model(session.get('selected_model', DEFAULT_MODEL_ID))
        app.logger.debug(f"Using Venice model: {selected_model}")
        
        # Get model capabilities to determine which parameters to include
        capabilities = get_model_capabilities(selected_model)
        app.logger.debug(f"Model capabilities: {capabilities}")

        payload = {
            "venice_parameters": {"include_venice_system_prompt": True},
            "model": selected_model,
            "messages": api_messages,
            "temperature": 1,
            "top_p": 1,
            "n": 1,
            "stream": True,
            "presence_penalty": 0,
            "frequency_penalty": 0
        }
        
        # Only add parallel_tool_calls if the model supports it
        if capabilities['supportsParallelToolCalls']:
            payload["parallel_tool_calls"] = True
            app.logger.debug("Added parallel_tool_calls to payload")
        else:
            app.logger.debug("Skipped parallel_tool_calls - not supported by this model")

        headers = {
            "Authorization": f"Bearer {VENICE_API_KEY}",
            "Content-Type": "application/json"
        }
        try:
            with requests.post(
                VENICE_URL,
                json=payload,
                headers=headers,
                stream=True,
                timeout=60
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
                                app.logger.debug(f"Extracted content length: {len(full_response)}")
                                # Send the full response at once
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
                    # Always format the content before storing
                    formatted_content = format_message_content(full_response)
                    chat_history.append({"role": "assistant", "content": formatted_content})
                    save_chat_history(user_id, chat_history, game_id)
                    app.logger.debug(f"Saved formatted response to chat history, length: {len(formatted_content)}")
        except Exception as e:
            app.logger.error(f"Error in API request: {str(e)}")
            yield f"data: {json.dumps({'content': f'Error: {str(e)}', 'full': f'Error: {str(e)}', 'error': True})}\n\n"
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
            result["updates"] = new_messages
        else:
            result["has_updates"] = False
        
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

if __name__ == '__main__':
    app.run(debug=True)
