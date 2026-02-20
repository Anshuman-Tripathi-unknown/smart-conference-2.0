import React, { useEffect, useRef, useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import SimplePeer from 'simple-peer';
import { loadModel, detectAttention } from '../utils/attention';

const Room = () => {
    const { roomId } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const isHost = location.state?.isHost;
    const username = localStorage.getItem('username');

    const [peers, setPeers] = useState([]); // [{ peerId, peer, stream }]
    const [hostStream, setHostStream] = useState(null); // For peers to see host
    const [alert, setAlert] = useState('');

    const socketRef = useRef();
    const userVideo = useRef();
    const peersRef = useRef([]); // To keep track of peer instances
    const streamRef = useRef();

    useEffect(() => {
        let isMounted = true;
        const init = async () => {
            // Load AI Model
            await loadModel();

            // Get Media
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

                if (!isMounted) {
                    stream.getTracks().forEach(track => track.stop());
                    return;
                }

                streamRef.current = stream;
                if (userVideo.current) {
                    userVideo.current.srcObject = stream;
                }

                // Connect Socket
                // Use a fallback or environment variable if you plan to make it dynamic
                socketRef.current = io('http://localhost:5000');
                socketRef.current.emit('join-room', { roomId, username, isHost });

                // Socket Listeners
                socketRef.current.on('peer-joined', ({ peerId, username: peerUsername }) => {
                    if (isHost) {
                        const peer = createPeer(peerId, socketRef.current.id, stream);
                        // Add to ref immediately
                        peersRef.current.push({ peerId, peer, username: peerUsername });
                        // Update state to render
                        setPeers(prev => [...prev, { peerId, peer, username: peerUsername, stream: null }]);
                    }
                });

                socketRef.current.on('offer', ({ offer, from }) => {
                    if (!isHost) {
                        const peer = addPeer(offer, from, stream);
                        peersRef.current.push({ peerId: from, peer });
                    }
                });

                socketRef.current.on('answer', ({ answer, from }) => {
                    const peerObj = peersRef.current.find(p => p.peerId === from);
                    if (peerObj) peerObj.peer.signal(answer);
                });

                socketRef.current.on('ice-candidate', ({ candidate, from }) => {
                    const peerObj = peersRef.current.find(p => p.peerId === from);
                    if (peerObj) peerObj.peer.signal(candidate);
                });

                socketRef.current.on('student-inattentive', ({ username: inattentiveUser }) => {
                    if (isHost) {
                        setAlert(`Student ${inattentiveUser} is inattentive!`);
                        setTimeout(() => setAlert(''), 5000);
                    }
                });

                socketRef.current.on('peer-left', ({ peerId }) => {
                    const peerObj = peersRef.current.find(p => p.peerId === peerId);
                    if (peerObj) peerObj.peer.destroy();
                    peersRef.current = peersRef.current.filter(p => p.peerId !== peerId);
                    setPeers(prev => prev.filter(p => p.peerId !== peerId));
                });

                socketRef.current.on('host-left', () => {
                    if (!isHost) {
                        setHostStream(null);
                        setAlert("Host has ended the session.");
                        setTimeout(() => navigate('/dashboard'), 3000);
                    }
                });

            } catch (err) {
                console.error("Error accessing media or connecting:", err);
                alert("Could not access camera/microphone.");
            }
        };

        const detectLoop = setInterval(async () => {
            if (userVideo.current && !isHost && streamRef.current) {
                const videoEl = userVideo.current;

                // Ensure video has enough data to be analyzed (readyState >= 2)
                if (videoEl.readyState < 2) {
                    console.log("Video not ready yet, skipping detection");
                    return;
                }

                try {
                    const attentive = await detectAttention(videoEl);
                    console.log("Attention status:", attentive); // Debugging output

                    if (attentive === false && isMounted) {
                        socketRef.current?.emit('attention-alert', { roomId, username });
                        setAlert("Please pay attention!");
                        setTimeout(() => { if (isMounted) setAlert(''); }, 3000);
                    }
                } catch (e) {
                    console.error("Error during attention detection loop:", e);
                }
            }
        }, 5000);

        init();

        return () => {
            isMounted = false;
            clearInterval(detectLoop);
            if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
            if (socketRef.current) socketRef.current.disconnect();
            peersRef.current.forEach(p => p.peer.destroy());
        };
    }, [roomId, isHost, username, navigate]);

    function createPeer(userToSignal, callerID, stream) {
        const peer = new SimplePeer({
            initiator: true,
            trickle: false,
            stream,
        });

        peer.on('signal', signal => {
            socketRef.current.emit('offer', { offer: signal, to: userToSignal });
        });

        peer.on('stream', peerStream => {
            console.log("Got stream from peer:", userToSignal);
            setPeers(prev => prev.map(p => p.peerId === userToSignal ? { ...p, stream: peerStream } : p));
        });

        peer.on('close', () => {
            peersRef.current = peersRef.current.filter(p => p.peerId !== userToSignal);
            setPeers(prev => prev.filter(p => p.peerId !== userToSignal));
        });

        peer.on('error', err => {
            console.error('Peer error:', err);
        });

        return peer;
    }

    function addPeer(incomingSignal, callerID, stream) {
        const peer = new SimplePeer({
            initiator: false,
            trickle: false,
            stream,
        });

        peer.on('signal', signal => {
            socketRef.current.emit('answer', { answer: signal, to: callerID });
        });

        peer.on('stream', hostStream => {
            setHostStream(hostStream);
        });

        peer.on('close', () => {
            if (!isHost) {
                setHostStream(null);
            }
        });

        peer.on('error', err => {
            console.error('Peer error:', err);
        });

        peer.signal(incomingSignal);
        return peer;
    }

    return (
        <div className="flex flex-col h-screen p-4 text-white overflow-hidden">
            <div className="flex justify-between items-center mb-4 z-10 w-full px-6 py-4 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)]">
                <div className="flex items-center gap-4">
                    <h1 className="text-xl font-bold tracking-wide">
                        Room: <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-green-400">{roomId}</span>
                    </h1>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${isHost ? 'bg-gradient-to-r from-green-600 to-emerald-600' : 'bg-gradient-to-r from-blue-600 to-indigo-600'} shadow-lg border border-white/20`}>
                        {isHost ? 'Host' : 'Student'}
                    </span>
                </div>
                {alert && (
                    <div className="bg-red-500/80 backdrop-blur-md text-white px-6 py-2 rounded-full font-bold animate-pulse shadow-[0_0_20px_rgba(239,68,68,0.6)] border border-red-400/50">
                        {alert}
                    </div>
                )}
                <button
                    onClick={() => navigate('/dashboard')}
                    className="bg-white/10 hover:bg-red-500/80 text-white font-semibold px-6 py-2 rounded-xl backdrop-blur-md border border-white/20 transition-all duration-300 shadow-lg hover:shadow-[0_0_15px_rgba(239,68,68,0.5)] flex items-center gap-2"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                    Leave
                </button>
            </div>

            <div className="flex-1 flex gap-4 overflow-hidden z-10">
                {/* Main View */}
                <div className="flex-1 rounded-3xl overflow-hidden relative shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] bg-black/40 backdrop-blur-sm border border-white/10 flex flex-col group">
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5 pointer-events-none"></div>

                    {isHost ? (
                        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4 overflow-y-auto w-full h-full relative z-10 custom-scrollbar">
                            {/* Host sees all peers */}
                            {peers.length === 0 && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
                                    <div className="w-16 h-16 border-4 border-white/10 border-t-blue-500 rounded-full animate-spin mb-4"></div>
                                    <p className="text-lg font-medium animate-pulse">Waiting for students...</p>
                                </div>
                            )}
                            {peers.map(peer => (
                                <VideoCard key={peer.peerId} stream={peer.stream} username={peer.username} />
                            ))}
                        </div>
                    ) : (
                        /* Peer sees Host */
                        <div className="flex-1 flex w-full h-full p-4 relative z-10">
                            {hostStream ? (
                                <VideoCard stream={hostStream} username="Host" isMain />
                            ) : (
                                <div className="w-full flex flex-col items-center justify-center text-gray-400 rounded-2xl bg-white/5 border border-white/5 shadow-inner">
                                    <svg className="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                                    <p className="text-lg font-medium animate-pulse">Waiting for host video...</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Sidebar / Self View */}
                <div className="w-80 flex flex-col gap-4">
                    <div className="bg-white/5 p-4 rounded-3xl shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] backdrop-blur-xl border border-white/10 flex flex-col flex-1 max-h-72 relative">
                        {/* Decorative glow */}
                        <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500 rounded-full mix-blend-screen filter blur-[50px] opacity-20 pointer-events-none"></div>

                        <div className="flex items-center justify-between mb-3 z-10">
                            <p className="text-white font-medium text-sm flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                                Your Video
                            </p>
                        </div>

                        <div className="relative rounded-2xl overflow-hidden bg-black/60 border border-white/5 shadow-inner aspect-video flex-grow z-10">
                            <video ref={userVideo} autoPlay muted playsInline className="absolute inset-0 w-full h-full object-cover transform scale-x-[-1]" />
                            <div className="absolute bottom-2 left-2 bg-black/50 backdrop-blur-md px-2 py-1 rounded text-xs text-white/80 border border-white/10">
                                You
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const VideoCard = ({ stream, username, isMain }) => {
    const ref = useRef();

    useEffect(() => {
        if (stream && ref.current) ref.current.srcObject = stream;
    }, [stream]);

    return (
        <div className={`relative ${isMain ? 'w-full h-full' : 'w-full aspect-video'} bg-black/80 rounded-2xl overflow-hidden shadow-lg border border-white/10 group transition-all duration-300 hover:shadow-[0_0_20px_rgba(59,130,246,0.2)] hover:border-white/20`}>
            {stream ? (
                <video ref={ref} autoPlay playsInline className={`w-full h-full object-cover ${isMain ? '' : 'transform scale-x-[-1]'}`} />
            ) : (
                <div className="w-full h-full flex items-center justify-center">
                    <div className="w-10 h-10 border-3 border-white/20 border-t-gray-400 rounded-full animate-spin"></div>
                </div>
            )}

            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-3 pt-8 transform translate-y-0 transition-transform duration-300">
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-xs font-bold shadow-md border border-white/20">
                        {username ? username.charAt(0).toUpperCase() : '?'}
                    </div>
                    <span className="text-white font-medium text-sm drop-shadow-md truncate">{username || 'Unknown'}</span>
                </div>
            </div>

            {/* Outline highlight effect on hover */}
            <div className="absolute inset-0 border-2 border-transparent group-hover:border-blue-500/30 rounded-2xl transition-colors duration-300 pointer-events-none"></div>
        </div>
    );
};

export default Room;
