const users = {}; // socketId -> { roomId, username, isHost }
const rooms = {}; // roomId -> { host: socketId, peers: [socketId] }

module.exports = (io) => {
    io.on('connection', (socket) => {
        console.log('User connected:', socket.id);

        // Join Room
        socket.on('join-room', ({ roomId, username, isHost }) => {
            socket.join(roomId);
            users[socket.id] = { roomId, username, isHost };

            if (!rooms[roomId]) rooms[roomId] = { host: null, peers: [] };

            if (isHost) {
                // If room has host, maybe reject or replace? Ideally one host per room.
                // For simplicity, overwrite host logic or just assign.
                rooms[roomId].host = socket.id;
                console.log(`Host ${username} joined room ${roomId}`);
            } else {
                rooms[roomId].peers.push(socket.id);
                console.log(`Peer ${username} joined room ${roomId}`);

                // Notify host that a peer joined so host can initiate connection
                if (rooms[roomId].host) {
                    io.to(rooms[roomId].host).emit('peer-joined', { peerId: socket.id, username });
                }
            }

            // Notify everyone in room (for chat or list)
            io.to(roomId).emit('user-connected', username);
        });

        // WebRTC Signaling
        socket.on('offer', ({ offer, to }) => {
            io.to(to).emit('offer', { offer, from: socket.id });
        });

        socket.on('answer', ({ answer, to }) => {
            io.to(to).emit('answer', { answer, from: socket.id });
        });

        socket.on('ice-candidate', ({ candidate, to }) => {
            io.to(to).emit('ice-candidate', { candidate, from: socket.id });
        });

        // Attention Alert
        socket.on('attention-alert', ({ roomId, username }) => {
            console.log(`Attention alert for ${username} in room ${roomId}`);
            // Notify host specifically
            if (rooms[roomId] && rooms[roomId].host) {
                io.to(rooms[roomId].host).emit('student-inattentive', { username });
            }
        });

        // Disconnect
        socket.on('disconnect', () => {
            const user = users[socket.id];
            if (user) {
                const { roomId, isHost } = user;
                if (rooms[roomId]) {
                    if (isHost) {
                        rooms[roomId].host = null;
                        // Notify peers host left?
                        io.to(roomId).emit('host-left');
                    } else {
                        rooms[roomId].peers = rooms[roomId].peers.filter(id => id !== socket.id);
                        // Notify host peer left
                        if (rooms[roomId].host) {
                            io.to(rooms[roomId].host).emit('peer-left', { peerId: socket.id });
                        }
                    }
                }
                io.to(roomId).emit('user-disconnected', user.username);
                delete users[socket.id];
            }
            console.log('User disconnected:', socket.id);
        });
    });
};
