from flask import Flask, jsonify, request

app = Flask(__name__)

# Placeholder for storing chats (replace with a database in a real application)
chats = []

@app.route('/chat', methods=['GET'])
def get_chats():
    return jsonify({'chats': chats})

@app.route('/chat', methods=['POST'])
def create_chat():
    data = request.get_json()
    app.logger.info('Received payload: %s', data)
    new_chat = {
        'id': len(chats) + 1,
        'name': data['name'],
        'participants': data['participants']
    }
    chats.append(new_chat)
    return jsonify({'message': 'Chat created successfully', 'chat': new_chat}), 201

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001)
