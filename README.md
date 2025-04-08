# Chat-Me-App

A real-time chat application built with Node.js, Express.js, MongoDB, Socket.io, and PugJS. The app allows users to register, log in, join chat rooms, and exchange messages in real-time.

## Features

- **Real-Time Messaging:** Powered by Socket.io for live chat experience.
- **User Authentication:** Built-in registration and login system.
- **Message Persistence:** Messages are stored in MongoDB for later retrieval.
- **User-Specific Rooms:** Users can join specific rooms and chat with others in real-time.
- **Message History:** View the last 50 messages from each room, sorted by timestamp.

## Technologies Used

- **Node.js** for the backend server.
- **Express.js** for the server framework.
- **Socket.io** for real-time web socket communication.
- **MongoDB** for message persistence.
- **Mongoose** for modeling MongoDB data.
- **Handlebars.js** for the frontend templating engine.

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/)
- [MongoDB](https://www.mongodb.com/try/download/community) or a MongoDB Atlas account.

### Steps to Install and Run Locally
1. **Install dependencies**:
    Navigate to the project folder and install dependencies:
    ```bash
    cd chat-notes-app
    npm install
    ```

2. **Set up MongoDB**:
    - If you're using MongoDB locally, make sure MongoDB is running on your machine.
    - If you're using MongoDB Atlas, create a `.env` file at the root of the project and add the MongoDB URI like so:
    ```env
    MONGO_URI=your-mongodb-uri
    ```

3. **Start the server**:
    ```bash
    npm start
    ```
    The server will start on `http://localhost:3000`.

## Usage

1. Open `http://localhost:3000` in your browser.
2. Register a new account or log in with an existing one.
3. Join a chat room and start sending messages!



