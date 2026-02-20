import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const Dashboard = () => {
    const [roomId, setRoomId] = useState('');
    const navigate = useNavigate();
    const username = localStorage.getItem('username');

    const createRoom = () => {
        let id = roomId.trim();
        if (!id) {
            id = Math.random().toString(36).substring(7); // fallback random
        }
        // Navigate with state indicating host
        navigate(`/room/${id}`, { state: { isHost: true } });
    };

    const joinRoom = () => {
        if (!roomId) return;
        navigate(`/room/${roomId}`, { state: { isHost: false } });
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen text-white p-4">
            <div className="relative w-full max-w-md p-10 rounded-3xl overflow-hidden shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] bg-white/5 backdrop-blur-2xl border border-white/10 transition-all duration-300">
                {/* Decorative blob */}
                <div className="absolute top-[-50px] right-[-50px] w-40 h-40 bg-green-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
                <div className="absolute bottom-[-50px] left-[-50px] w-40 h-40 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse" style={{ animationDelay: '1.5s' }}></div>

                <div className="relative z-10 text-center">
                    <h1 className="text-4xl font-black mb-2 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-green-400">
                        Hello, {username}!
                    </h1>
                    <p className="text-gray-300 mb-8 font-light">Join or create a session below</p>

                    <div className="space-y-6">
                        <div className="relative group text-left">
                            <label className="text-sm font-medium text-gray-400 ml-1">Room ID (Optional for Host)</label>
                            <input
                                type="text"
                                placeholder="Enter custom room name..."
                                className="w-full mt-1 px-4 py-3 bg-white/5 rounded-xl border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500 transition-all duration-300 hover:bg-white/10"
                                value={roomId}
                                onChange={(e) => setRoomId(e.target.value)}
                            />
                        </div>

                        <div className="flex flex-col gap-4">
                            <button
                                onClick={createRoom}
                                className="w-full font-bold text-lg text-white py-3 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 transform hover:-translate-y-1 transition-all duration-300 shadow-[0_0_15px_rgba(16,185,129,0.4)] hover:shadow-[0_0_25px_rgba(16,185,129,0.6)]"
                            >
                                Create as Host
                            </button>
                            <div className="relative flex items-center py-2">
                                <div className="flex-grow border-t border-white/10"></div>
                                <span className="flex-shrink-0 mx-4 text-gray-500 text-sm">OR</span>
                                <div className="flex-grow border-t border-white/10"></div>
                            </div>
                            <button
                                onClick={joinRoom}
                                className={`w-full font-bold text-lg text-white py-3 rounded-xl transform transition-all duration-300 ${!roomId ? 'bg-gray-700 opacity-50 cursor-not-allowed' : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 hover:-translate-y-1 shadow-[0_0_15px_rgba(59,130,246,0.4)] hover:shadow-[0_0_25px_rgba(59,130,246,0.6)]'}`}
                                disabled={!roomId}
                            >
                                Join as Student
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
