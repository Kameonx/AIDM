from flask import Flask, render_template, request, jsonify, Response, stream_with_context, session, make_response, send_from_directory
import os
import sys
import time
import uuid
import json
import base64
import re
import requests
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

try:
    from config import (
        VENICE_API_KEY, VENICE_URL, DEFAULT_MODEL_ID, AVAILABLE_MODELS,
        SYSTEM_PROMPT_BASE, MULTIPLAYER_PROMPT_ADDITION, SINGLEPLAYER_PROMPT_ADDITION, PROMPT_ENDING
    )
except ImportError as e:
    print(f"ERROR: Failed to import configuration: {e}", file=sys.stderr)
    print("Please ensure config.py has all required variables defined.", file=sys.stderr)
    sys.exit(1)

app = Flask(__name__, static_folder='static')
app.secret_key = os.urandom(24)

if not VENICE_API_KEY or VENICE_API_KEY == "YOUR_API_KEY_HERE":
    print("ERROR: VENICE_API_KEY not properly configured. Please set it in your .env file.", file=sys.stderr)
    print("Example: VENICE_API_KEY=your_actual_api_key_here", file=sys.stderr)

def get_user_id():
    """Get or create a unique user ID for the current session"""
    user_id = request.cookies.get('user_id')
    if not user_id:
        user_id = str(uuid.uuid4())
        session['user_id'] = user_id
    return user_id

def format_message_content(content):
    """Format AI responses with markdown-like syntax for the frontend"""
    if not content:
        return content
    
    if re.search(r'<span class="(red|green|blue|yellow|purple|orange|pink|cyan|lime|teal)">', content):
        return content
    
    if re.search(r'\[(red|green|blue|yellow|purple|orange|pink|cyan|lime|teal):', content):
        return content
    
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
    
    for color, keywords in color_mappings.items():
        for keyword in keywords:
            pattern = r'\b' + re.escape(keyword) + r'\b'
            replacement = f'[{color}:{keyword}]'
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

@app.route('/static/<path:path>')
def send_static(path):
    return send_from_directory('static', path)

@app.route('/')
def index():
    user_id = get_user_id()
    
    try:
        response = make_response(render_template('index.html'))
        if 'user_id' not in request.cookies:
            response.set_cookie('user_id', user_id, max_age=30*24*60*60)  # 30 days
        return response
    except Exception as e:
        app.logger.error(f"Error rendering index: {e}")
        return f"Error loading page: {e}", 500

@app.route('/chat', methods=['POST'])
def chat():
    """Handle chat messages - no server-side storage"""
    try:
        data = request.get_json()
        message = data.get('message', '')
        game_id = data.get('game_id')
        player_number = data.get('player_number', 1)
        is_system = data.get('is_system', False)
        invisible_to_players = data.get('invisible_to_players', False)
        
        if not message.strip():
            return jsonify({"success": False, "error": "Empty message"}), 400
            
        # Validate API key
        if not VENICE_API_KEY or VENICE_API_KEY == "YOUR_API_KEY_HERE":
            return jsonify({"success": False, "error": "Venice API key not configured"}), 500
            
        # Generate a unique message ID for streaming
        message_id = str(int(time.time() * 1000))
        
        # Log system messages for debugging
        if is_system:
            app.logger.debug(f"System message received: {message[:100]}... (invisible: {invisible_to_players})")
        
        return jsonify({
            "success": True,
            "message_id": message_id,
            "game_id": game_id,
            "is_system": is_system,
            "invisible_to_players": invisible_to_players
        })
        
    except Exception as e:
        app.logger.error(f"Error in chat endpoint: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

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
    """Stream response for AI messages - uses client-provided chat history"""
    user_id = get_user_id()
    
    # Get parameters from request
    if request.method == 'GET':
        game_id = request.args.get('game_id', '')
        message_id = request.args.get('message_id', '')
        model_id = request.args.get('model_id', DEFAULT_MODEL_ID)
        chat_history_param = request.args.get('chat_history', '')
    else:
        data = request.get_json()
        game_id = data.get('game_id', '')
        message_id = data.get('message_id', '')
        model_id = data.get('model_id', DEFAULT_MODEL_ID)
        chat_history_param = data.get('chat_history', '')    # Parse chat history from client
    chat_history = []
    if chat_history_param:
        try:
            import base64
            decoded_history = base64.b64decode(chat_history_param).decode('utf-8')
            chat_history = json.loads(decoded_history)
            app.logger.debug(f"Decoded chat history: {len(chat_history)} messages")
            # Log first few messages for debugging
            for i, msg in enumerate(chat_history[:3]):
                app.logger.debug(f"Message {i}: role={msg.get('role')}, type={msg.get('type')}, sender={msg.get('sender')}, content={msg.get('content', '')[:50]}...")
        except Exception as e:
            app.logger.error(f"Error decoding chat history: {e}")
            app.logger.error(f"Chat history param length: {len(chat_history_param) if chat_history_param else 0}")
            chat_history = []
    else:
        app.logger.debug("No chat history parameter provided")
      # Print debug info
    app.logger.debug(f"Starting stream: game_id={game_id}, msg_id={message_id}, model={model_id}")
    
    def generate():
        try:
            # Get selected model from session or use provided model_id
            selected_model = session.get('selected_model', model_id)
            
            # Validate model
            valid_model = get_valid_model(selected_model)            # Check if this is a context refresh message
            is_context_refresh = False
            if chat_history:
                # Look for context refresh indicators in the last few messages
                last_messages = chat_history[-5:]  # Check last 5 messages to be thorough
                for msg in last_messages:
                    content = msg.get('content', '')
                    # Check for context refresh in any message type (system, user, assistant)
                    if ('[Context Refresh]' in content or 
                        'context refresh' in content.lower() or
                        msg.get('is_system') == True and 'restored' in content.lower()):
                        is_context_refresh = True
                        app.logger.debug(f"🔄 CONTEXT REFRESH DETECTED! Message: {content[:100]}...")
                        app.logger.debug(f"🔄 Message role: {msg.get('role')}, type: {msg.get('type')}")
                        app.logger.debug(f"🔄 Full chat history length: {len(chat_history)}")
                        break
                
                if not is_context_refresh:
                    app.logger.debug("❌ No context refresh detected in recent messages")
                    # Debug: Log the last few messages to see what we're missing
                    app.logger.debug("Recent messages content:")
                    for i, msg in enumerate(last_messages):
                        app.logger.debug(f"  {i}: role={msg.get('role')}, content={msg.get('content', '')[:50]}...")
            
            # Build messages for API
            messages = []
            # Add system prompt
            is_multiplayer = len([p for p in chat_history if p.get('role') == 'user']) > 1
            system_prompt = build_system_prompt(is_multiplayer)            # For context refresh, add a special instruction
            if is_context_refresh:
                system_prompt += f"\n\n🔄 CRITICAL CONTEXT REFRESH INSTRUCTION: The conversation history above has been restored after a page refresh. You have full access to all {len(chat_history)} previous messages in this conversation. You should:\n1. REMEMBER and acknowledge the previous conversation context\n2. Continue the story naturally from where it left off\n3. DO NOT restart the story or ask for player names again if already provided\n4. Reference previous events, character details, and story elements as appropriate\n5. Maintain narrative continuity with established tone and style\n\nPlease respond as if you remember everything that happened before, because you do have access to the full conversation history."
                app.logger.debug("🔄 Enhanced system prompt with comprehensive context refresh instructions")
            
            messages.append({"role": "system", "content": system_prompt})
            # Add chat history - include all message types for context
            for msg in chat_history:  # Send full chat history for context
                if msg.get('role') in ['user', 'assistant', 'system'] and msg.get('content'):
                    # Skip the context refresh message itself when sending to API
                    if '[Context Refresh]' in msg.get('content', ''):
                        continue
                    # Skip duplicate system messages (we already added one above)
                    if msg.get('role') == 'system' and any(m.get('role') == 'system' for m in messages):
                        continue
                    messages.append({
                        "role": msg['role'],
                        "content": msg['content']
                    })
                    app.logger.debug(f"Added to API: role={msg['role']}, sender={msg.get('sender', 'N/A')}, content={msg['content'][:50]}...")
            
            app.logger.debug(f"Final messages for API: {len(messages)} total messages")
            # Log the final message sequence for debugging
            for i, msg in enumerate(messages):
                app.logger.debug(f"API Message {i}: role={msg['role']}, content={msg['content'][:100]}...")
            
            # Prepare request payload according to Venice API spec
            payload = {
                "model": valid_model,
                "messages": messages,
                "stream": True,
                "max_tokens": 2000,
                "temperature": 0.8,
                "top_p": 0.9
            }
            
            headers = {
                'Authorization': f'Bearer {VENICE_API_KEY}',
                'Content-Type': 'application/json'
            }
            
            app.logger.debug(f"Sending request to Venice API with model: {valid_model}")
            
            # Make the streaming request to Venice API
            response = requests.post(
                VENICE_URL,
                headers=headers,
                json=payload,
                stream=True,
                timeout=30
            )
            
            if response.status_code != 200:
                error_text = response.text
                app.logger.error(f"Venice API error: {response.status_code} - {error_text}")
                yield f"data: {json.dumps({'content': f'API Error {response.status_code}: {error_text}', 'error': True})}\n\n"
                yield "event: done\ndata: {}\n\n"
                return
            
            # Process streaming response
            accumulated_content = ""
            for line in response.iter_lines():
                if line:
                    line = line.decode('utf-8')
                    if line.startswith('data: '):
                        try:
                            data_str = line[6:]  # Remove 'data: ' prefix
                            if data_str.strip() == '[DONE]':
                                break
                            
                            data = json.loads(data_str)
                            if 'choices' in data and len(data['choices']) > 0:
                                choice = data['choices'][0]
                                delta = choice.get('delta', {})
                                if 'content' in delta:
                                    content_chunk = delta['content']
                                    accumulated_content += content_chunk
                                    yield f"data: {json.dumps({'content': content_chunk})}\n\n"
                        except json.JSONDecodeError as e:
                            app.logger.error(f"JSON decode error: {e} - Line: {line}")
                            continue
                        except Exception as e:
                            app.logger.error(f"Error processing chunk: {e}")
                            continue
            
            yield "event: done\ndata: {}\n\n"
            
        except requests.exceptions.RequestException as e:
            app.logger.error(f"Request error in stream: {e}")
            yield f"data: {json.dumps({'content': f'Network Error: {str(e)}', 'error': True})}\n\n"
            yield "event: done\ndata: {}\n\n"
        except Exception as e:
            app.logger.error(f"Error in stream generate function: {e}")
            yield f"data: {json.dumps({'content': f'Error: {str(e)}', 'error': True})}\n\n"
            yield "event: done\ndata: {}\n\n"
    
    return Response(stream_with_context(generate()), mimetype='text/event-stream')

@app.route('/new_game', methods=['POST'])
def new_game():
    """Generate a new game ID - purely client-side operation"""
    user_id = get_user_id()
    game_id = f"{int(time.time())}_{uuid.uuid4().hex[:8]}"
    response_data = {"game_id": game_id, "success": True}
    return jsonify(response_data)

@app.route('/load_history', methods=['POST'])
def load_history():
    """Load history endpoint - now returns empty (client-side only)"""
    return jsonify({"history": [], "message": "Chat history is now stored client-side only"})

@app.route('/get_updates', methods=['POST'])
def get_updates():
    """Get updates - disabled for client-side only mode"""
    return jsonify({"success": False, "error": "Updates disabled - client-side only mode"})

@app.route('/set_player_name', methods=['POST'])
def set_player_name():
    """Set player name - client-side only operation"""
    return jsonify({"success": True, "message": "Player names are now managed client-side only"})

@app.route('/get_models', methods=['GET'])
def get_models():
    """Get available AI models from Venice API"""
    try:
        headers = {
            'Authorization': f'Bearer {VENICE_API_KEY}',
            'Content-Type': 'application/json'
        }
        
        # Call Venice API to get text models
        models_url = VENICE_URL.replace('/chat/completions', '/models')
        response = requests.get(
            f"{models_url}?type=text",
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            
            # Transform Venice API response to our format
            models = []
            if 'data' in data:
                for model in data['data']:
                    # Extract capabilities from model_spec
                    capabilities = model.get('model_spec', {}).get('capabilities', {})
                    traits = model.get('model_spec', {}).get('traits', [])
                    
                    model_info = {
                        'id': model.get('id', ''),
                        'name': model.get('id', '').replace('-', ' ').title(),
                        'description': f"Venice AI model: {model.get('id', '')}",
                        'type': model.get('type', 'text'),
                        'traits': traits,
                        'supportsFunctionCalling': capabilities.get('supportsFunctionCalling', False),
                        'supportsParallelToolCalls': False,  # Venice doesn't specify this
                        'supportsReasoning': capabilities.get('supportsReasoning', False),
                        'supportsVision': capabilities.get('supportsVision', False)
                    }
                    models.append(model_info)
            
            return jsonify({"success": True, "models": models})
            
        else:
            # Fallback to local model list if API fails
            app.logger.warning(f"Venice API returned {response.status_code}, using fallback models")
            return jsonify({"success": True, "models": AVAILABLE_MODELS})
            
    except Exception as e:
        app.logger.error(f"Error fetching models from Venice API: {e}")
        # Return fallback models from config
        return jsonify({"success": True, "models": AVAILABLE_MODELS})

@app.route('/set_model', methods=['POST'])
def set_model():
    """Set the selected AI model"""
    try:
        data = request.get_json()
        model_id = data.get('model_id')
        
        if not model_id:
            return jsonify({"error": "No model_id provided", "success": False}), 400
        
        # Validate model exists
        valid_model = get_valid_model(model_id)
        session['selected_model'] = valid_model
        
        return jsonify({
            "success": True, 
            "model": valid_model,
            "message": f"Model set to {valid_model}"
        })
    except Exception as e:
        app.logger.error(f"Error setting model: {e}")
        return jsonify({"error": str(e), "success": False}), 500

if __name__ == '__main__':
    app.run(debug=True)
