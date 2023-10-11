from flask import Flask, jsonify, request

app = Flask(__name__)

# Placeholder for storing users (replace with a database in a real application)
users = []

@app.route('/user', methods=['GET'])
def get_users():
    return jsonify({'users': users})

@app.route('/user', methods=['POST'])
def create_user():
    data = request.get_json()
    new_user = {
        'id': len(users) + 1,
        'username': data['username'],
        'email': data['email']
    }
    users.append(new_user)
    return jsonify({'message': 'User created successfully', 'user': new_user}), 201

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5002)
