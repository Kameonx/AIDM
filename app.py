from flask import Flask, render_template, request, jsonify, Response, stream_with_context, session, make_response, redirect, url_for
import os
import requests
import time
import json
import uuid
import re

app = Flask(__name__)
app.secret_key = os.urandom(24)  # Required for session

# Create a directory to store user chat histories
CHAT_DIR = 'chat_histories'
if not os.path.exists(CHAT_DIR):
    os.makedirs(CHAT_DIR)

# Venice AI Configuration
VENICE_API_KEY = os.getenv("VENICE_API_KEY", "-Y3up9vlEXoVFf1ZsrXhB4rbPXd8V6ywgiSZziI3bR")
MODEL_ID = "llama-3.3-70b"
VENICE_URL = "https://api.venice.ai/api/v1/chat/completions"

def get_user_id():
    """Get or create a unique user ID for the current session"""
    user_id = request.cookies.get('user_id')
    if not user_id:
        user_id = str(uuid.uuid4())
        session['user_id'] = user_id
    return user_id

def get_chat_file_path(user_id):
    """Get the file path for a specific user's chat history"""
    return os.path.join(CHAT_DIR, f"chat_history_{user_id}.json")

def load_chat_history(user_id):
    """Load chat history for a specific user"""
    file_path = get_chat_file_path(user_id)
    if os.path.exists(file_path):
        with open(file_path, 'r') as file:
            return json.load(file)
    return []

def save_chat_history(user_id, chat_history):
    """Save chat history for a specific user"""
    file_path = get_chat_file_path(user_id)
    with open(file_path, 'w') as file:
        json.dump(chat_history, file)

def extract_player_name(chat_history, player_num):
    """Return the name for a player from chat history, defaulting if not found."""
    for msg in chat_history:
        if msg.get("role") == "assistant":
            m = re.search(rf"(?:So your name is|Player {player_num} is now named) ([A-Za-z]+)", msg.get("content", ""))
            if m:
                return m.group(1)
    return f"Player {player_num}"

@app.route('/', methods=['GET', 'POST'])
def chat():
    # Get the user ID from session
    user_id = get_user_id()
    
    # Load chat history for this specific user
    chat_history = load_chat_history(user_id)
    
    if request.method == 'POST':
        user_input = request.form['user_query']
        player_number = request.form.get('player_number', '1')  # Default to player 1 if not specified
        
        # If this is a streaming request
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            # Add user message to history with player info
            chat_history.append({
                "role": "user", 
                "content": user_input,
                "player": f"player{player_number}"
            })
            save_chat_history(user_id, chat_history)
            
            # Return the message ID for streaming
            return jsonify({
                "message_id": len(chat_history), 
                "streaming": True,
                "player_number": player_number
            })
        
        # For non-AJAX requests, handle traditionally
        # Add user message to history
        chat_history.append({
            "role": "user", 
            "content": user_input,
            "player": f"player{player_number}"
        })
        
        # Process response and add to history (traditional way)
        response_text = get_bot_response(chat_history)
        chat_history.append({"role": "assistant", "content": response_text})
        save_chat_history(user_id, chat_history)
    
    # If empty history, create welcome message
    if not chat_history:
        dm_welcome = "Hello adventurer! Let's begin your quest. What is your name?"
        chat_history.append({"role": "assistant", "content": dm_welcome})
        save_chat_history(user_id, chat_history)
    
    player1_name = extract_player_name(chat_history, 1)
    response = make_response(render_template('index.html', chat_history=chat_history, player1_name=player1_name))
    response.set_cookie('user_id', user_id, max_age=60*60*24*365)  # Set cookie to expire in 1 year
    return response

@app.route('/stream', methods=['POST'])
def stream_response():
    # Get the user ID from session
    user_id = get_user_id()
    
    data = json.loads(request.data)
    message_id = data.get('message_id')
    player_number = data.get('player_number', '1')  # Default to player 1 if not specified
    player_action = data.get('action_type', '')  # Get action type (joined/left) if provided
    
    # Load chat history for this specific user
    chat_history = load_chat_history(user_id)

    def generate():
        # Check for player names in the chat history to determine if multiplayer
        player_counts = {}
        player_names = {}
        
        # Look for player identifiers in chat history
        for msg in chat_history:
            if msg.get("role") == "user" and msg.get("player"):
                player = msg.get("player")
                player_counts[player] = player_counts.get(player, 0) + 1
                
                # Try to extract player names from responses
                player_name_match = re.search(f"Player (\\d+) is now named ([\\w]+)", msg.get("content", ""))
                if player_name_match:
                    player_num = player_name_match.group(1)
                    name = player_name_match.group(2)
                    player_names[f"player{player_num}"] = name
        
        # Check if multiple players are active
        is_multiplayer = len(player_counts) > 1
        
        system_prompt = (
            "Act as a friendly D&D 5e Dungeon Master. Keep responses brief and conversational. "
            "Include appropriate emojis in your responses to make the game more engaging. "
            "For example: use 🗡️ for combat, 🧙 for magic, 🏰 for locations, 😊 for emotions, etc. "
        )
        
        # Add multiplayer context if needed
        if is_multiplayer:
            system_prompt += (
                "You are running a multiplayer game with multiple players. "
                "When a new player joins, welcome them warmly and ask for their name and character details. "
                "Describe how their arrival affects the current story and environment. "
                "Include all players in the adventure and give each player opportunities to contribute. "
                "When a player tells you their name, acknowledge with 'Player X is now named [NAME]'. "
                "Treat each player as an independent character in the story. "
                "When a player leaves the game, acknowledge their departure in the narrative. "
            )
        else:
            system_prompt += (
                "When the player tells you their name, acknowledge with 'So your name is [NAME]'. "
            )
        
        system_prompt += (
            "When asking for stats (STR, DEX, CON, INT, WIS, CHA), offer to generate random stats. "
            "After gathering character info, ask if they're ready to begin an adventure "
            "and offer to create a story or let them choose the type of adventure. "
            "Automatically apply modifiers to any dice rolls. Respond succinctly like a human DM would."
        )
        
        # If this is a player joining/leaving event, add special instructions
        if player_action == 'joined':
            # Much stronger and more explicit instructions for player joining
            system_prompt = (
                "IMPORTANT INSTRUCTION: A new player has just joined the game. "
                "Your next response MUST focus ENTIRELY on welcoming this new player to the game. "
                "STOP whatever storyline you were following, and describe how a new adventurer appears. "
                "Ask them directly for their name and details about their character. "
                "Use phrases like 'As you were [previous activity], a new adventurer approaches...' "
                "Include emojis like 👋 or ✨ to welcome them. "
                "Do NOT continue the main story until this new player has been properly introduced. "
                "This is a hard requirement - the new player must be welcomed immediately."
            )
        elif player_action == 'left':
            system_prompt += (
                " The most recent message indicates a player has just left the game. "
                "Acknowledge their departure in the narrative and explain how the story continues without them. "
                "Perhaps they wandered off, were called away on urgent business, or disappeared mysteriously. "
                "Use emojis like 👋 or 🚶 to mark their departure."
            )
        
        # Prepare messages for the API
        api_messages = [
            {"role": "system", "content": system_prompt}
        ]
        
        # Include conversation history with proper player formatting for multiplayer
        for msg in chat_history:
            if msg.get("role") == "system" and msg.get("is_system", False):
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
                    name = player_names.get(msg.get("player"), f"Player {player_num}")
                    prefix = f"{name}: "
                
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
                
                # Check if the API supports streaming
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
                                except json.JSONDecodeError:
                                    continue
                else:
                    # Fallback to non-streaming API
                    response_data = response.json()
                    content = response_data['choices'][0]['message']['content']
                    full_response = content
                    yield f"data: {json.dumps({'content': content, 'full': full_response})}\n\n"
                
                # Store the complete response in the user's chat history
                if full_response:
                    chat_history.append({"role": "assistant", "content": full_response})
                    save_chat_history(user_id, chat_history)
                    
        except Exception as e:
            error_msg = f"I'm having trouble connecting to my brain right now. Please try again in a few moments. Error: {str(e)}"
            yield f"data: {json.dumps({'content': error_msg, 'full': error_msg, 'error': True})}\n\n"
            # Add error response to history
            chat_history.append({"role": "assistant", "content": error_msg})
            save_chat_history(user_id, chat_history)

    return Response(stream_with_context(generate()), mimetype='text/event-stream')

@app.route('/add_player', methods=['POST'])
def add_player():
    # Get the user ID from session
    user_id = get_user_id()
    
    data = request.get_json()
    player_number = data.get('player_number', '2')  # Default to player 2 if not specified
    
    # Load chat history
    chat_history = load_chat_history(user_id)
    
    # Add explicit system message about new player joining to be included in API context
    system_message = f"NEW PLAYER JOINING: Player {player_number} has just joined the game and needs to be welcomed."
    chat_history.append({
        "role": "system", 
        "content": system_message,
        "is_system": True
    })
    
    save_chat_history(user_id, chat_history)
    
    return jsonify({
        "success": True, 
        "message": f"Player {player_number} joined the game",
        "player_number": player_number
    })

@app.route('/remove_player', methods=['POST'])
def remove_player():
    # Get the user ID from session
    user_id = get_user_id()
    
    data = request.get_json()
    player_number = data.get('player_number')
    
    if not player_number:
        return jsonify({"success": False, "error": "Player number required"})
    
    # Load chat history
    chat_history = load_chat_history(user_id)
    
    # Add system message about player leaving
    system_message = f"Player {player_number} has left the game."
    chat_history.append({
        "role": "system", 
        "content": system_message,
        "is_system": True
    })
    
    save_chat_history(user_id, chat_history)
    
    return jsonify({
        "success": True, 
        "message": f"Player {player_number} left the game"
    })

def get_bot_response(chat_history):
    """Get a response from the bot without streaming (for non-AJAX requests)"""
    # Check for multiple players
    player_counts = {}
    for msg in chat_history:
        if msg.get("role") == "user" and msg.get("player"):
            player = msg.get("player")
            player_counts[player] = player_counts.get(player, 0) + 1
    
    is_multiplayer = len(player_counts) > 1
    
    system_prompt = (
        "Act as a friendly D&D 5e Dungeon Master. Keep responses brief and conversational. "
        "Include appropriate emojis in your responses to make the game more engaging. "
        "For example: use 🗡️ for combat, 🧙 for magic, 🏰 for locations, 😊 for emotions, etc. "
    )
    
    # Add multiplayer context if needed
    if is_multiplayer:
        system_prompt += (
            "You are running a multiplayer game with multiple players. "
            "When a new player joins, welcome them warmly and ask for their name and character details. "
            "Include all players in the adventure and give each player opportunities to contribute. "
            "When a player tells you their name, acknowledge with 'Player X is now named [NAME]'. "
            "Treat each player as an independent character in the story. "
        )
    else:
        system_prompt += (
            "When the player tells you their name, acknowledge with 'So your name is [NAME]'. "
        )
    
    system_prompt += (
        "When asking for stats (STR, DEX, CON, INT, WIS, CHA), offer to generate random stats. "
        "After gathering character info, ask if they're ready to begin an adventure "
        "and offer to create a story or let them choose the type of adventure. "
        "Automatically apply modifiers to any dice rolls. Respond succinctly like a human DM would."
    )
    
    payload = {
        "venice_parameters": {"include_venice_system_prompt": True},
        "model": MODEL_ID,
        "messages": [
            {"role": "system", "content": system_prompt},
            # Include entire conversation history for context
            *[{"role": msg["role"], "content": msg["content"]} for msg in chat_history]
        ],
        "temperature": 1,
        "top_p": 1,
        "n": 1,
        "presence_penalty": 0,
        "frequency_penalty": 0,
        "parallel_tool_calls": True
    }

    headers = {
        "Authorization": f"Bearer {VENICE_API_KEY}",
        "Content-Type": "application/json"
    }

    try:
        response = requests.post(
            VENICE_URL,
            json=payload,
            headers=headers,
            timeout=30
        )
        response_data = response.json()
        response_text = response_data['choices'][0]['message']['content']
        return response_text
    except Exception as e:
        return f"Error: {str(e)}"

@app.route('/clear', methods=['POST'])
def clear_history():
    # Get the user ID from session
    user_id = get_user_id()
    
    # Delete only this user's chat history file
    file_path = get_chat_file_path(user_id)
    if os.path.exists(file_path):
        os.remove(file_path)
    
    return redirect(url_for('chat'))

if __name__ == '__main__':
    app.run(debug=True)
