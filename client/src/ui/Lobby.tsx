import React, { useState, useEffect } from 'react';

// 使用 public/images 下的静态资源 (Vite 会直接以根路径 / 提供)
const avatarOptions = [
    { id: 'cat', src: '/images/cat.svg' },
    { id: 'dog', src: '/images/dog.svg' },
    { id: 'fox', src: '/images/fox.svg' },
];

const STORAGE_NICK = 'bomb:lastNickname';
const STORAGE_AVATAR = 'bomb:lastAvatar';

export const Lobby: React.FC<{ onCreate: (nickname: string, avatar: string) => void; onJoin: (roomId: string, nickname: string, avatar: string) => void; }> = ({ onCreate, onJoin }) => {
    // 初始化时尝试读取 localStorage
    const [nickname, setNickname] = useState<string>(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem(STORAGE_NICK) || '';
        }
        return '';
    });
    const [roomId, setRoomId] = useState('');
    const [avatar, setAvatar] = useState<string>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem(STORAGE_AVATAR);
            if (saved && avatarOptions.some(a => a.src === saved)) return saved;
            // 没有存储或存储失效 => 随机初始化一个头像
            const rand = avatarOptions[Math.floor(Math.random() * avatarOptions.length)].src;
            try { localStorage.setItem(STORAGE_AVATAR, rand); } catch {}
            return rand;
        }
        return avatarOptions[0].src;
    });

    // 当昵称变化时保存
    useEffect(() => {
        if (!nickname) return; // 空昵称不保存，避免污染
        try { localStorage.setItem(STORAGE_NICK, nickname); } catch {}
    }, [nickname]);

    // 当头像变化时保存
    useEffect(() => {
        if (!avatar) return;
        try { localStorage.setItem(STORAGE_AVATAR, avatar); } catch {}
    }, [avatar]);

    return (
        <div className="lobby panel">
            <h2>进入游戏</h2>
            <div className="field">
                <label>昵称</label>
                <input value={nickname} maxLength={16} placeholder="输入昵称" onChange={e => setNickname(e.target.value)} />
            </div>
            <div className="field">
                <label>头像 (点击选择)</label>
                <div className="avatar-choices">
                    {avatarOptions.map(a => {
                        const selected = avatar === a.src;
                        return (
                            <button
                                key={a.id}
                                type="button"
                                className={`avatar-choice ${selected ? 'selected' : ''}`}
                                onClick={() => setAvatar(a.src)}
                                aria-label={a.id}
                            >
                                <img src={a.src} alt={a.id} />
                            </button>
                        );
                    })}
                </div>
            </div>
            <div className="actions-row" style={{ marginTop: 8 }}>
                <button className="primary" onClick={() => onCreate(nickname.trim(), avatar)} disabled={!nickname.trim()}>创建房间</button>
            </div>
            <div className="divider" />
            <div className="field">
                <label>加入房间</label>
                <input placeholder="房间ID" value={roomId} onChange={e => setRoomId(e.target.value.trim())} />
            </div>
            <div className="actions-row">
                <button onClick={() => onJoin(roomId, nickname.trim(), avatar)} disabled={!roomId || !nickname.trim()}>加入</button>
            </div>
        </div>
    );
};