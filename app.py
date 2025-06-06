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
            return jsonify({"success": False, "error": "Empty message"}), 400
            
        # Validate API key
        if not VENICE_API_KEY or VENICE_API_KEY == "YOUR_API_KEY_HERE":
            return jsonify({"success": False, "error": "Venice API key not configured"}), 500
            
        # Generate a unique message ID for streaming
        message_id = str(int(time.time() * 1000))
        
        return jsonify({
            "success": True,
            "message_id": message_id,
            "game_id": game_id
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
        chat_history_param = data.get('chat_history', '')

    # Parse chat history from client
    chat_history = []
    if chat_history_param:
        try:
            import base64
            decoded_history = base64.b64decode(chat_history_param).decode('utf-8')
            chat_history = json.loads(decoded_history)
        except Exception as e:
            app.logger.error(f"Error decoding chat history: {e}")
            chat_history = []
    
    # Print debug info
    app.logger.debug(f"Starting stream: game_id={game_id}, msg_id={message_id}, model={model_id}")

    def generate():
        try:
            # Get selected model from session or use provided model_id
            selected_model = session.get('selected_model', model_id)
            
            # Validate model
            valid_model = get_valid_model(selected_model)
            
            # Build messages for API
            messages = []
            
            # Add system prompt
            is_multiplayer = len([p for p in chat_history if p.get('role') == 'user']) > 1
            system_prompt = build_system_prompt(is_multiplayer)
            messages.append({"role": "system", "content": system_prompt})
            
            # Add chat history
            for msg in chat_history[-20:]:  # Limit to last 20 messages
                if msg.get('role') in ['user', 'assistant'] and msg.get('content'):
                    messages.append({
                        "role": msg['role'],
                        "content": msg['content']
                    })
            
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
                    
                    # Add special trait mappings
                    if 'most_uncensored' in traits:
                        if 'most_uncensored' not in model_info['traits']:
                            model_info['traits'].append('most_uncensored')
                    if 'most_intelligent' in traits:
                        if 'most_intelligent' not in model_info['traits']:
                            model_info['traits'].append('most_intelligent')
                    if 'default' in traits:
                        if 'default' not in model_info['traits']:
                            model_info['traits'].append('default')
                    if 'fastest' in traits:
                        if 'fastest' not in model_info['traits']:
                            model_info['traits'].append('fastest')
                    
                    models.append(model_info)
            
            # If no models found, add default
            if not models:
                models.append({
                    'id': 'venice-uncensored',
                    'name': 'Venice Uncensored',
                    'description': 'Default Venice AI model',
                    'type': 'text',
                    'traits': ['default', 'most_uncensored'],
                    'supportsFunctionCalling': False,
                    'supportsParallelToolCalls': False
                })
            
            return jsonify({"models": models, "success": True})
        else:
            app.logger.error(f"Venice API error: {response.status_code} - {response.text}")
            # Return fallback models
            fallback_models = [{
                'id': 'venice-uncensored',
                'name': 'Venice Uncensored (Fallback)',
                'description': 'Default Venice AI model (API unavailable)',
                'type': 'text',
                'traits': ['default'],
                'supportsFunctionCalling': False,
                'supportsParallelToolCalls': False
            }]
            return jsonify({"models": fallback_models, "success": True})
            
    except Exception as e:
        app.logger.error(f"Error fetching models: {e}")
        # Return fallback models on error
        fallback_models = [{
            'id': 'venice-uncensored',
            'name': 'Venice Uncensored (Error Fallback)',
            'description': 'Default Venice AI model (error occurred)',
            'type': 'text',
            'traits': ['default'],
            'supportsFunctionCalling': False,
            'supportsParallelToolCalls': False
        }]
        return jsonify({"models": fallback_models, "success": True})

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
