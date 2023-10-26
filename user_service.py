from flask import Flask, jsonify, request
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import create_engine

app = Flask(__name__)

database_uri = 'sqlite:///users.db'
engine = create_engine(database_uri)
engine.connect()

app.config['SQLALCHEMY_DATABASE_URI'] = database_uri
db = SQLAlchemy(app)

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)

@app.route('/user', methods=['GET'])
def get_users():
    users = User.query.all()
    user_data = [{'id': user.id, 'username': user.username, 'email': user.email} for user in users]
    return jsonify({'users': user_data})

@app.route('/user/<int:user_id>', methods=['GET'])
def get_user(user_id):
    user = User.query.get(user_id)
    if user:
        user_data = {'id': user.id, 'username': user.username, 'email': user.email}
        return jsonify(user_data)
    return jsonify({'error': 'User not found'}), 404

@app.route('/user', methods=['POST'])
def create_user():
    data = request.get_json()
    existing_user = User.query.filter_by(username=data['username']).first()
    if existing_user:
        return jsonify({'error': 'Username already exists'}), 400

    new_user = User(username=data['username'], email=data['email'])
    db.session.add(new_user)
    db.session.commit()
    
    user_data = {'id': new_user.id, 'username': new_user.username, 'email': new_user.email}
    return jsonify({'message': 'User created successfully', 'user': user_data}), 201

@app.route('/user/<int:user_id>', methods=['PUT'])
def update_user(user_id):
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404
    data = request.get_json()
    user.username = data['username']
    user.email = data['email']
    db.session.commit()
    user_data = {'id': user.id, 'username': user.username, 'email': user.email}
    return jsonify({'message': 'User updated successfully', 'user': user_data})

@app.route('/user/<int:user_id>', methods=['DELETE'])
def delete_user(user_id):
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404
    db.session.delete(user)
    db.session.commit()
    return jsonify({'message': 'User deleted successfully'})

if __name__ == '__main__':
    with app.app_context(): 
        db.create_all() 
    app.run(host='0.0.0.0', port=5002)
