import React, { useState } from 'react';

interface Props {
  onCreate: (nickname: string) => void;
  onJoin: (roomId: string, nickname: string) => void;
}

export const Lobby: React.FC<Props> = ({ onCreate, onJoin }) => {
  const [nickname, setNickname] = useState('');
  const [roomId, setRoomId] = useState('');
  return (
    <div className="panel">
      <h2>进入游戏</h2>
      <div className="field">
        <label>昵称</label>
        <input value={nickname} onChange={e => setNickname(e.target.value)} placeholder="你的昵称" />
      </div>
      <div className="actions-row">
        <button disabled={!nickname} onClick={() => onCreate(nickname)}>创建房间</button>
      </div>
      <div className="divider" />
      <div className="field">
        <label>房间号</label>
        <input value={roomId} onChange={e => setRoomId(e.target.value)} placeholder="输入房间ID" />
      </div>
      <div className="actions-row">
        <button disabled={!nickname || !roomId} onClick={() => onJoin(roomId, nickname)}>加入房间</button>
      </div>
    </div>
  );
};

