import json
from flask import Flask, jsonify, request
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import create_engine
import requests

app = Flask(__name__)

database_uri = 'sqlite:///chats.db'
user_service_url = 'http://user-service:5002/user'
engine = create_engine(database_uri)
engine.connect()

app.config['SQLALCHEMY_DATABASE_URI'] = database_uri
db = SQLAlchemy(app)

class Chat(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    participants = db.Column(db.String(255), nullable=False)

class Message(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    text = db.Column(db.String(255), nullable=False)
    chat_id = db.Column(db.Integer, db.ForeignKey('chat.id'), nullable=False)

@app.route('/chat', methods=['GET'])
def get_chats():
    chats = Chat.query.all()
    chat_data = []

    for chat in chats:
        chat_messages = Message.query.filter_by(chat_id=chat.id).all()
        messages = [{'id': message.id, 'text': message.text} for message in chat_messages]

        chat_info = {
            'id': chat.id,
            'name': chat.name,
            'participants': json.loads(chat.participants),
            'messages': messages
        }

        chat_data.append(chat_info)

    return jsonify({'chats': chat_data})

@app.route('/chat/<int:chat_id>', methods=['GET'])
def get_chat(chat_id):
    chat = Chat.query.get(chat_id)
    if chat:
        chat_data = {'id': chat.id, 'name': chat.name, 'participants': json.loads(chat.participants)}
        return jsonify(chat_data)
    return jsonify({'error': 'Chat not found'}), 404

@app.route('/chat', methods=['POST'])
def create_chat():
    data = request.get_json()
    app.logger.info('Received payload: %s', data)

    participants = data['participants']

    # Validate user IDs
    for user_id in participants:
        response = requests.get(f'{user_service_url}/{user_id}')
        if response.status_code != 200:
            return jsonify({'error': 'Invalid user ID'}), 400

    new_chat = Chat(
        name=data['name'],
        participants=json.dumps(participants)  # Store the participants as a JSON string
    )
    db.session.add(new_chat)
    db.session.commit()
    return jsonify({'message': 'Chat created successfully', 'chat': new_chat.id}), 201

@app.route('/chat/<int:chat_id>/message', methods=['POST'])
def create_message(chat_id):
    chat = Chat.query.get(chat_id)
    if not chat:
        return jsonify({'error': 'Chat not found'}), 404

    data = request.get_json()
    message_text = data.get('text', '')

    new_message = Message(text=message_text, chat_id=chat.id)
    db.session.add(new_message)
    db.session.commit()

    return jsonify({'message': 'Message created successfully', 'message_id': new_message.id}), 201

@app.route('/chat/<int:chat_id>', methods=['PUT'])
def update_chat(chat_id):
    chat = Chat.query.get(chat_id)
    if not chat:
        return jsonify({'error': 'Chat not found'}), 404
    data = request.get_json()
    chat.name = data['name']
    chat.participants = json.dumps(data['participants'])
    db.session.commit()
    chat_data = {'id': chat.id, 'name': chat.name, 'participants': json.loads(chat.participants)}
    return jsonify({'message': 'Chat updated successfully', 'chat': chat_data})

@app.route('/chat/<int:chat_id>', methods=['DELETE'])
def delete_chat(chat_id):
    chat = Chat.query.get(chat_id)
    if not chat:
        return jsonify({'error': 'Chat not found'}), 404
    db.session.delete(chat)
    db.session.commit()
    return jsonify({'message': 'Chat deleted successfully'})

if __name__ == '__main__':
    with app.app_context(): 
        db.create_all() 
    app.run(host='0.0.0.0', port=5001)
