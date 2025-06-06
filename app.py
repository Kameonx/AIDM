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
        
        if not message.strip():
            return jsonify({"error": "Empty message"}), 400
            
        # Generate a unique message ID for streaming
        message_id = str(int(time.time() * 1000))
        
        return jsonify({
            "success": True,
            "message_id": message_id,
            "game_id": game_id
        })
        
    except Exception as e:
        app.logger.error(f"Error in chat endpoint: {e}")
        return jsonify({"error": str(e)}), 500

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
        chat_history_param = data.get('chat_history', '')

    # Parse chat history from client
    chat_history = []
    if chat_history_param:
        try:
            decoded_history = base64.b64decode(chat_history_param).decode('utf-8')
            chat_history = json.loads(decoded_history)
        except Exception as e:
            app.logger.error(f"Error decoding chat history: {e}")
    
    # Print debug info
    app.logger.debug(f"Starting stream: game_id={game_id}, msg_id={message_id}, model={session.get('selected_model', model_id)}")

    def generate():
        try:
            # Use session model if available, otherwise use request parameter
            selected_model = session.get('selected_model', model_id)
            selected_model = get_valid_model(selected_model)
            
            app.logger.debug(f"Using Venice model: {selected_model}")
            
            # Get model capabilities
            capabilities = get_model_capabilities(selected_model)
            app.logger.debug(f"Model capabilities: {capabilities}")
            
            # Prepare messages for Venice API
            messages = []
            
            # Add system prompt
            is_multiplayer = len([msg for msg in chat_history if msg.get('role') == 'user']) > 1
            system_prompt = build_system_prompt(is_multiplayer)
            messages.append({"role": "system", "content": system_prompt})
            
            # Add chat history
            for msg in chat_history:
                if msg.get('invisible', False):
                    continue  # Skip invisible messages in API calls
                    
                role = msg.get('role', 'user')
                content = msg.get('content', '')
                
                if content.strip():
                    messages.append({"role": role, "content": content})
            
            # Prepare Venice API request
            venice_data = {
                "model": selected_model,
                "messages": messages,
                "stream": True,
                "max_tokens": 2000,
                "temperature": 0.8
            }
            
            # Add function calling support if available
            if capabilities.get('supportsFunctionCalling', False):
                venice_data["functions"] = []  # Add your functions here if needed
            else:
                app.logger.debug("Skipped parallel_tool_calls - not supported by this model")
            
            # Make request to Venice API
            response = requests.post(
                VENICE_URL,
                headers={
                    'Authorization': f'Bearer {VENICE_API_KEY}',
                    'Content-Type': 'application/json'
                },
                json=venice_data,
                stream=True
            )
            
            app.logger.debug(f"Venice API response status: {response.status_code}")
            app.logger.debug(f"Venice API response headers: {dict(response.headers)}")
            
            if response.status_code != 200:
                error_text = response.text
                app.logger.error(f"Venice API error: {response.status_code} - {error_text}")
                yield f"data: {json.dumps({'content': f'API Error: {response.status_code}', 'error': True})}\n\n"
                return
            
            content_type = response.headers.get('content-type', '')
            app.logger.debug(f"Content-Type: {content_type}")
            
            if 'text/event-stream' in content_type:
                app.logger.debug("Processing as streaming response")
                full_content = ""
                
                for line in response.iter_lines(decode_unicode=True):
                    if line:
                        if line.startswith('data: '):
                            data_part = line[6:]  # Remove 'data: ' prefix
                            if data_part.strip() == '[DONE]':
                                break
                            try:
                                chunk_data = json.loads(data_part)
                                if 'choices' in chunk_data and len(chunk_data['choices']) > 0:
                                    delta = chunk_data['choices'][0].get('delta', {})
                                    content = delta.get('content', '')
                                    if content:
                                        full_content += content
                                        yield f"data: {json.dumps({'content': content})}\n\n"
                            except json.JSONDecodeError:
                                continue
                
                # Send final formatted content
                if full_content:
                    formatted_content = format_message_content(full_content)
                    app.logger.debug(f"Sent formatted final response, length: {len(formatted_content)}")
                
                yield f"event: done\ndata: {json.dumps({'content': '', 'complete': True})}\n\n"
            else:
                # Handle non-streaming response
                try:
                    json_response = response.json()
                    content = json_response.get('choices', [{}])[0].get('message', {}).get('content', '')
                    formatted_content = format_message_content(content)
                    yield f"data: {json.dumps({'content': formatted_content})}\n\n"
                    yield f"event: done\ndata: {json.dumps({'content': '', 'complete': True})}\n\n"
                except json.JSONDecodeError:
                    yield f"data: {json.dumps({'content': 'Error parsing response', 'error': True})}\n\n"
        
        except Exception as e:
            app.logger.error(f"Error in stream generation: {e}")
            yield f"data: {json.dumps({'content': f'Server error: {str(e)}', 'error': True})}\n\n"
    
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
    """Get available AI models"""
    try:
        return jsonify({"models": AVAILABLE_MODELS, "success": True})
    except Exception as e:
        app.logger.error(f"Error getting models: {e}")
        return jsonify({"error": str(e), "success": False}), 500

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
