import React, {useState, useEffect} from 'react';
import type {PlayerPublic, RoomStatePublic} from '../types';

interface Props {
    room: RoomStatePublic;
    youId?: string;
}

export const PlayerList: React.FC<Props> = ({room, youId}) => {
    const players = [...room.players].sort((a, b) => a.seat - b.seat);

    return (
        <div className="player-list">
            {players.map(p => {
                const isTurn = room.turnPlayerId === p.id;
                const isYou = youId === p.id;
                return (
                    <div key={p.id} className={`player ${p.alive ? '' : 'dead'}`}>
                        {p.avatar && (
                            <div
                                className={`player-avatar-wrapper`}
                                tabIndex={0}
                                role="button"
                                aria-label={`头像 ${p.nickname}`}
                            >
                                <img className="player-avatar" src={p.avatar} alt={p.nickname}/>
                            </div>
                        )}
                        <div className="player-head">
                            <span className="seat">#{p.seat}</span>

                            <span className={`nick ${isYou ? 'you' : ''}`}>{p.nickname}{isYou && ' (你)'}</span>
                            {isTurn && <span className="turn-indicator">▶</span>}
                        </div>
                        <div className="player-meta">
                            <span>手牌: {p.handSize}</span>
                            {!p.alive && <span className="out-tag">出局</span>}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
