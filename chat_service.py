import json
from flask import Flask, jsonify, request
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import create_engine

app = Flask(__name__)

database_uri = 'sqlite:///chats.db'
engine = create_engine(database_uri)
engine.connect()

app.config['SQLALCHEMY_DATABASE_URI'] = database_uri
db = SQLAlchemy(app)

class Chat(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    participants = db.Column(db.String(255), nullable=False)

@app.route('/chat', methods=['GET'])
def get_chats():
    chats = Chat.query.all()
    chat_data = [{'id': chat.id, 'name': chat.name, 'participants': json.loads(chat.participants)} for chat in chats]
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
    new_chat = Chat(
        name=data['name'],
        participants=json.dumps(data['participants'])  # Store the participants as a JSON string
    )
    db.session.add(new_chat)
    db.session.commit()
    return jsonify({'message': 'Chat created successfully', 'chat': new_chat.id}), 201

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
