import React, {useCallback, useEffect, useState} from 'react';
import {getSocket} from '../socket';
import type {RoomStatePublic, Card} from '../types';
import {Lobby} from './Lobby';
import {RoomView} from './Room';

export const App: React.FC = () => {
    const [connected, setConnected] = useState(false);
    const [room, setRoom] = useState<RoomStatePublic | null>(null);
    const [hand, setHand] = useState<Card[]>([]);
    const [you, setYou] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const [seeFuture, setSeeFuture] = useState<{ cards: Card[]; alterable: boolean } | null>(null);
    const [defuseBomb, setDefuseBomb] = useState<Card | null>(null);
    const [defusePos, setDefusePos] = useState<number>(0);

    useEffect(() => {
        const socket = getSocket();
        const onConnect = () => setConnected(true);
        const onDisconnect = () => setConnected(false);
        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);
        socket.on('room:update', r => setRoom(r));
        socket.on('room:joined', (r, player) => {
            setRoom(r);
            setYou(player);
        });
        socket.on('room:error', m => setError(m));
        socket.on('game:yourHand', h => setHand(h));
        socket.on('game:seeFuture', (cards, alterable) => setSeeFuture({cards, alterable}));
        socket.on('game:defuse', (bomb) => {
            setDefuseBomb(bomb);
            setDefusePos(0);
        });
        return () => {
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
            socket.off('room:update');
            socket.off('room:joined');
            socket.off('room:error');
            socket.off('game:yourHand');
            socket.off('game:seeFuture');
            socket.off('game:defuse');
        };
    }, []);

    const createRoom = useCallback((nickname: string) => {
        const socket = getSocket();
        socket.emit('room:create', {nickname}, (res: any) => {
            if (!res.ok) setError(res.error || 'create failed');
        });
    }, []);

    const joinRoom = useCallback((roomId: string, nickname: string) => {
        const socket = getSocket();
        socket.emit('room:join', {roomId, nickname}, (res: any) => {
            if (!res.ok) setError(res.error || 'join failed');
        });
    }, []);

    const startGame = useCallback(() => {
        if (!room) return;
        getSocket().emit('room:start');
    }, [room]);

    const drawCard = useCallback(() => {
        getSocket().emit('game:draw');
    }, []);
    const playCard = useCallback((cardId: string) => {
        getSocket().emit('game:playCard', {cardId});
    }, []);
    const placeDefuse = useCallback(() => {
        if (!defuseBomb || !room) return;
        const pos = Math.max(0, Math.min(defusePos, room.deckCount));
        getSocket().emit('game:defuse', defuseBomb.id, pos);
        setDefuseBomb(null);
    }, [defuseBomb, defusePos, room]);
    const winner = room ? room.winnerId && room.players.find(p => p.id === room.winnerId) : null;

    return (
        <div className="app-shell">
            <header className="app-header">
                {!room && (
                    <>
                        <h1 className="gradient-text">炸弹猫 (Bomb Squad)</h1>
                        <div className="status">Conn: {connected ? '✅' : '❌'}</div>
                    </>
                )}
                {room && (
                    <>
                        <h2>房间：{room && <span>{room.roomId}</span>} Conn: {connected ? '✅' : '❌'}</h2>
                        <div className="header-info">
                            <div className="room-info">
                                <div>牌堆剩余: {room.deckCount}</div>
                                <div>方向: {room.direction === 1 ? '顺时针' : '逆时针'}</div>
                                {room.turnPlayerId && !winner &&
                                    <div>当前回合: {room.players.find(p => p.id === room.turnPlayerId)?.nickname}</div>}
                                {winner && <div className="winner-banner">胜利者: {winner.nickname}</div>}
                            </div>
                        </div>
                    </>
                )}
            </header>
            {error &&
                <div className="error-banner">{error}
                </div>
            }
            {
                !room && <Lobby onCreate={createRoom} onJoin={joinRoom}/>
            }
            {
                room &&
                <RoomView room={room} you={you} hand={hand} onStart={startGame} onDraw={drawCard} onPlay={playCard}/>
            }
            {
                seeFuture && (
                    <div className="overlay">
                        <div className="overlay-content">
                            <h3>{seeFuture.alterable ? '改变未来 (可调整顺序 - 未实现)' : '预言'}</h3>
                            <ol className="future-cards">
                                {seeFuture.cards.map((c, i) => (
                                    <li key={c.id} className="future-card">#{i + 1} {c.type}</li>
                                ))}
                            </ol>
                            <div className="actions-row">
                                <button onClick={() => setSeeFuture(null)}>关闭</button>
                            </div>
                        </div>
                    </div>
                )
            }
            {
                defuseBomb && room && (
                    <div className="overlay">
                        <div className="overlay-content">
                            <h3>放置炸弹 (拆除成功)</h3>
                            <p>选择炸弹重新插回牌堆的位置 (0=底部, {room.deckCount}=顶):</p>
                            <input type="range" min={0} max={room.deckCount} value={defusePos}
                                   onChange={e => setDefusePos(Number(e.target.value))}/>
                            <div className="range-value">位置: {defusePos}</div>
                            <div className="actions-row wrap">
                                <button onClick={() => setDefusePos(0)}>底部</button>
                                <button onClick={() => setDefusePos(Math.floor(room.deckCount / 2))}>中间</button>
                                <button onClick={() => setDefusePos(room.deckCount)}>顶部</button>
                                <button onClick={() => setDefusePos(Math.floor(Math.random() * (room.deckCount + 1)))}>随机
                                </button>
                            </div>
                            <div className="actions-row">
                                <button className="primary" onClick={placeDefuse}>放置</button>
                                <button onClick={() => setDefuseBomb(null)}>取消(默认不放置)</button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div>
    );
};
