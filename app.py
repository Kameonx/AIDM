from flask import Flask, render_template, request, jsonify, Response, stream_with_context, session, make_response, redirect, url_for
import os
import requests
import time
import json
import uuid
import re  # Add this import at the top with the other imports
from dotenv import load_dotenv  # Add this import

load_dotenv(override=True)  # Ensure .env is loaded and overrides any existing env vars

app = Flask(__name__)
app.secret_key = os.urandom(24)  # Required for session

# Create a directory to store user chat histories
CHAT_DIR = 'chat_histories'
if not os.path.exists(CHAT_DIR):
    os.makedirs(CHAT_DIR)

# Venice AI Configuration
VENICE_API_KEY = os.getenv("VENICE_API_KEY")
if not VENICE_API_KEY:
    import sys
    print("ERROR: VENICE_API_KEY not found in environment. Please check your .env file.", file=sys.stderr)
MODEL_ID = "llama-3.3-70b"
VENICE_URL = "https://api.venice.ai/api/v1/chat/completions"

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

# Route to serve the HTML page
@app.route('/')
def index():
    user_id = get_user_id()
    game_id = request.cookies.get('game_id')
    dm_welcome = "Hello adventurer! Let's begin your quest. What is your name?"
    if not game_id:
        # Generate a new game id if none is stored
        import uuid, time
        game_id = f"{int(time.time())}_{uuid.uuid4().hex[:8]}"
        chat_history = load_chat_history(user_id, game_id)
        if not chat_history:
            chat_history = [{"role": "assistant", "content": dm_welcome}]
            save_chat_history(user_id, chat_history, game_id)
    else:
        chat_history = load_chat_history(user_id, game_id)
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
            return jsonify({"response": "Invalid request: missing message data.", "error": True}), 400
        user_input = data['message']
        game_id = data.get('game_id')
        player_number = data.get('player_number', 1)  # Default to player 1
        is_system = data.get('is_system', False)
        
        # Load chat history
        chat_history = load_chat_history(user_id, game_id)
        
        # Add user message to history with player number
        chat_history.append({
            "role": "user" if not is_system else "system",
            "content": user_input,
            "player": f"player{player_number}" if not is_system else "system"
        })
        
        # Save chat history
        save_chat_history(user_id, chat_history, game_id)
        
        # Return message ID for streaming
        return jsonify({
            "message_id": len(chat_history),
            "streaming": True,
            "player_number": player_number
        })
        
    except Exception as e:
        app.logger.error("Error in /chat endpoint: %s", str(e))
        return jsonify({"response": "Internal server error.", "error": True}), 500

@app.route('/stream', methods=['POST', 'GET'])
def stream_response():
    """Stream response for AI messages"""
    # Get the user ID from session
    user_id = get_user_id()
    
    # For GET requests (EventSource uses GET by default)
    if request.method == 'GET':
        game_id = request.args.get('game_id')
        message_id = request.args.get('message_id')
    else:
        # For POST requests from fetch API
        data = json.loads(request.data)
        game_id = data.get('game_id')
        message_id = data.get('message_id')
    
    # Load chat history for this specific user
    chat_history = load_chat_history(user_id, game_id)
    
    # Print debug info
    app.logger.debug(f"Starting stream: game_id={game_id}, msg_id={message_id}")

    def generate():
        # Check for player names in the chat history
        player_names = {}
        
        # Rest of the generate function remains the same
        # Check if there are multiple players in the session and gather names
        player_counts = {}
        
        # Look for player names in the chat history
        for msg in chat_history:
            if msg.get("role") == "user" and msg.get("player"):
                player = msg.get("player")
                player_counts[player] = player_counts.get(player, 0) + 1
        
        # Check if multiple players are active
        is_multiplayer = len(player_counts) > 1
        
        system_prompt = (
            "Act as a friendly D&D 5e Dungeon Master. Keep responses brief and conversational - "
            "use just 2-3 sentences unless more detail is necessary for rules, combat or important descriptions. "
            "Use emojis frequently to emphasize emotions and actions. "
            
            "PLAYER STATS: Keep a mental record of each player's character sheet including: "
            "name, race, class, level, HP, AC, and ability scores (STR, DEX, CON, INT, WIS, CHA). "
            "When players provide their stats, acknowledge them and refer to them in relevant situations. "
            "If a player takes damage, track their HP and remind them of their current HP total. "
            
            "COMBAT RULES: When combat begins, say 'Roll for initiative!' and track the order. "
            "Always mention enemy HP and AC during combat. Describe hits, misses and damage clearly. "
            "Track damage to enemies and announce when they're bloodied (half HP) or defeated. "
            "For each player's turn, remind them they get one action, one bonus action, movement, "
            "and potentially one reaction (on other creatures' turns). Track which actions each player "
            "has used in a round. Suggest tactical options based on their character's abilities and position. "
            
            "DICE ROLLS: Calculate most damage rolls automatically (e.g., 'Your greatsword hits for 2d6+3 damage... "
            "that's 10 damage!'). Ask players to roll dice during important story moments, critical hits, "
            "death saves, and decisive actions. Apply advantage (roll twice, take higher) or disadvantage "
            "(roll twice, take lower) based on narrative circumstances and terrain. Ask for specific checks "
            "based on player actions (e.g., 'Make a Dexterity (Acrobatics) check to leap across the chasm'). "
            
            "For standard rolls, ask the player to roll (e.g., 'Roll a d20 + your Strength modifier') but also "
            "offer to roll for them (e.g., 'Or I can roll for you if you prefer.'). If the player asks you to roll, "
            "generate a random result, apply appropriate modifiers, and describe the outcome. "
            
            "Use appropriate emojis including: 🧙 for magic, ⚔️ for combat, 🐉 for monsters, "
            "🏰 for locations, 💰 for treasure, 🍺 for taverns, 🔮 for mystical elements, "
            "🎲 for dice rolls, 💥 for damage, 🛡️ for defense, ❤️ for healing, "
            "🌲 for nature, 🏆 for achievements, and ❓ for mysteries. "
            "Start most of your responses with a relevant emoji. "
        )
        
        # Add multiplayer context if needed
        if is_multiplayer:
            system_prompt += (
                "You are running a multiplayer game with multiple players. "
                "When a new player joins, welcome them warmly with a 👋 emoji and ask for their name and character details. "
                "Include all players in the adventure and give each player opportunities to contribute. "
                "When a player tells you their name, acknowledge with 'Player X is now named [NAME]'. "
                "Treat each player as an independent character in the story. "
                "Keep track of each character's stats, inventory and abilities separately. "
            )
        else:
            system_prompt += (
                "When the player tells you their name, acknowledge with 'So your name is [NAME]' and add a welcoming emoji. "
            )
        
        system_prompt += (
            "When asking for stats (STR, DEX, CON, INT, WIS, CHA), offer to generate random stats. "
            "After gathering character info, ask if they're ready to begin an adventure "
            "and offer to create a story or let them choose the type of adventure. "
            "Automatically apply modifiers to any dice rolls. Use 🎲 when describing dice rolls. "
            "Respond succinctly like a human DM would, keeping emoji use natural and appropriate."
        )
        
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
        
        payload = {
            "venice_parameters": {"include_venice_system_prompt": True},
            "model": MODEL_ID,
            "messages": api_messages,
            "temperature": 1,
            "top_p": 1,
            "n": 1,
            "stream": True,  # Enable streaming
            "presence_penalty": 0,
            "frequency_penalty": 0,
            "parallel_tool_calls": True
        }

        headers = {
            "Authorization": f"Bearer {VENICE_API_KEY}",
            "Content-Type": "application/json"
        }

        try:
            # Make a streaming request to Venice API
            with requests.post(
                VENICE_URL,
                json=payload,
                headers=headers,
                stream=True,
                timeout=60  # Increase timeout to 60 seconds for longer responses
            ) as response:
                full_response = ""
                
                # Use startswith to check for SSE streaming
                if response.headers.get('content-type', '').startswith('text/event-stream'):
                    # Process SSE stream
                    for line in response.iter_lines():
                        if line:
                            line_text = line.decode('utf-8')
                            if line_text.startswith('data: '):
                                data = line_text[6:]  # Remove 'data: ' prefix
                                if data == '[DONE]':
                                    break
                                try:
                                    json_data = json.loads(data)
                                    if 'choices' in json_data and len(json_data['choices']) > 0:
                                        delta = json_data['choices'][0].get('delta', {})
                                        if 'content' in delta:
                                            content = delta['content']
                                            full_response += content
                                            yield f"data: {json.dumps({'content': content, 'full': full_response})}\n\n"
                                            # Make sure to properly flush responses for chunked data
                                except json.JSONDecodeError:
                                    continue
                else:
                    # Fallback to non-streaming API
                    try:
                        response_data = response.json()
                    except Exception as e:
                        app.logger.error(f"Venice API returned non-JSON response: {response.text}")
                        error_msg = "The AI service is currently unavailable (bad gateway). Please try again later."
                        yield f"data: {json.dumps({'content': error_msg, 'full': error_msg, 'error': True})}\n\n"
                        return

                    if 'choices' in response_data and len(response_data['choices']) > 0:
                        content = response_data['choices'][0]['message']['content']
                        full_response = content
                        yield f"data: {json.dumps({'content': content, 'full': full_response})}\n\n"
                    else:
                        app.logger.error(f"Venice API error response: {response_data}")
                        error_msg = response_data.get("error", "The AI service is currently unavailable (bad gateway). Please try again later.")
                        full_response = error_msg
                        yield f"data: {json.dumps({'content': error_msg, 'full': error_msg, 'error': True})}\n\n"
                
                # Store the complete response in the user's chat history
                if full_response:
                    chat_history.append({"role": "assistant", "content": full_response})
                    save_chat_history(user_id, chat_history, game_id)
                    
                # When all done, send a done event
                yield f"event: done\ndata: {{}}\n\n"
                    
        except Exception as e:
            app.logger.error(f"Stream error: {str(e)}")
            error_msg = f"I'm having trouble connecting to my brain right now. Please try again in a few moments."
            yield f"data: {json.dumps({'content': error_msg, 'full': error_msg, 'error': True})}\n\n"
            # Add error response to history
            chat_history.append({"role": "assistant", "content": error_msg})
            save_chat_history(user_id, chat_history, game_id)
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
    
    # Return the chat history
    return jsonify({"history": chat_history})

# Simplify the get_updates endpoint
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

if __name__ == '__main__':
    app.run(debug=True)
